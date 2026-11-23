import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { assertManageableServiceName, daemonReload } from './systemd';
import { validateWorkDir } from './templates';

const execFileAsync = promisify(execFile);

const SYSTEMD_DIR = '/etc/systemd/system';
export const BACKUP_DIR = '/var/backups/aeros-panel';
export const BACKUP_UNIT_PREFIX = 'aeros-backup-';

const BACKUP_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const ALLOWED_SCHEDULES = new Set(['hourly', 'daily', 'weekly', 'monthly']);
const TIME_SCHEDULE_PATTERN = /^(\*-\*-\*\s+)?([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const SAFE_PATH_CHAR_PATTERN = /^[a-zA-Z0-9._/@+-]+$/;

export interface BackupUnitConfig {
    name: string;
    paths: string[];
    schedule?: string;
}

export function validateBackupName(rawName: string): string {
    const name = rawName.trim().toLowerCase();
    if (!BACKUP_NAME_PATTERN.test(name)) {
        throw new Error('Invalid backup name. Use lowercase letters, numbers, hyphens, or underscores.');
    }
    assertManageableServiceName(`${BACKUP_UNIT_PREFIX}${name}`);
    return name;
}

export function getBackupUnitName(rawName: string): string {
    const name = validateBackupName(rawName);
    return `${BACKUP_UNIT_PREFIX}${name}`;
}

export function validateBackupSchedule(rawSchedule: string | undefined): string {
    const schedule = (rawSchedule || 'daily').trim().toLowerCase();
    if (ALLOWED_SCHEDULES.has(schedule)) {
        return schedule;
    }
    const timeMatch = TIME_SCHEDULE_PATTERN.exec(schedule);
    if (timeMatch) {
        const hhmm = schedule.replace(/^\*-\*-\*\s+/, '');
        return hhmm.length === 5 ? `*-*-* ${hhmm}:00` : `*-*-* ${hhmm}`;
    }
    throw new Error('Invalid schedule. Use hourly, daily, weekly, monthly, or HH:MM.');
}

export function validateBackupPaths(rawPaths: string[]): string[] {
    if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
        throw new Error('At least one file or directory path is required.');
    }
    if (rawPaths.length > 20) {
        throw new Error('At most 20 paths can be included in a single backup job.');
    }

    const normalized: string[] = [];
    for (const raw of rawPaths) {
        const cleaned = validateWorkDir(String(raw || ''));
        if (!SAFE_PATH_CHAR_PATTERN.test(cleaned)) {
            throw new Error(`Backup path "${cleaned}" contains unsupported characters.`);
        }
        if (!normalized.includes(cleaned)) {
            normalized.push(cleaned);
        }
    }

    return normalized;
}

export function generateBackupUnits(input: BackupUnitConfig): {
    name: string;
    unitName: string;
    schedule: string;
    paths: string[];
    serviceContent: string;
    timerContent: string;
} {
    const name = validateBackupName(input.name);
    const unitName = `${BACKUP_UNIT_PREFIX}${name}`;
    const schedule = validateBackupSchedule(input.schedule);
    const paths = validateBackupPaths(input.paths);

    const execStart = `/bin/sh -c 'mkdir -p ${BACKUP_DIR} && tar -czf "${BACKUP_DIR}/${name}-$(date +%%Y%%m%%d-%%H%%M%%S).tar.gz" -- "$@"' _ ${paths.join(' ')}`;

    const serviceContent = [
        '[Unit]',
        `Description=AerosPanel Backup: ${name}`,
        '',
        '[Service]',
        'Type=oneshot',
        'UMask=0077',
        `ExecStart=${execStart}`,
        ''
    ].join('\n');

    const timerContent = [
        '[Unit]',
        `Description=AerosPanel Backup Timer: ${name}`,
        '',
        '[Timer]',
        `OnCalendar=${schedule}`,
        'Persistent=true',
        '',
        '[Install]',
        'WantedBy=timers.target',
        ''
    ].join('\n');

    return { name, unitName, schedule, paths, serviceContent, timerContent };
}

export async function writeBackupUnits(input: BackupUnitConfig): Promise<{
    installed: boolean;
    unitName: string;
    schedule: string;
    paths: string[];
    warning?: string;
}> {
    const generated = generateBackupUnits(input);

    if (process.platform !== 'linux') {
        return {
            installed: false,
            unitName: generated.unitName,
            schedule: generated.schedule,
            paths: generated.paths,
            warning: 'Skipped writing systemd backup units (host OS is not Linux).'
        };
    }

    const servicePath = path.posix.join(SYSTEMD_DIR, `${generated.unitName}.service`);
    const timerPath = path.posix.join(SYSTEMD_DIR, `${generated.unitName}.timer`);

    try {
        await fs.writeFile(servicePath, generated.serviceContent, { mode: 0o644 });
        await fs.writeFile(timerPath, generated.timerContent, { mode: 0o644 });
        await daemonReload();
        return {
            installed: true,
            unitName: generated.unitName,
            schedule: generated.schedule,
            paths: generated.paths
        };
    } catch (error: any) {
        return {
            installed: false,
            unitName: generated.unitName,
            schedule: generated.schedule,
            paths: generated.paths,
            warning: `Could not install backup units: ${error.message}`
        };
    }
}

export async function setBackupTimerEnabled(rawName: string, enabled: boolean): Promise<void> {
    const unitName = getBackupUnitName(rawName);
    if (process.platform !== 'linux') return;

    const action = enabled ? 'enable' : 'disable';
    await execFileAsync('systemctl', [action, '--now', `${unitName}.timer`], { timeout: 15000 });
}

export async function runBackupNow(rawName: string): Promise<void> {
    const unitName = getBackupUnitName(rawName);
    if (process.platform !== 'linux') return;

    await execFileAsync('systemctl', ['start', `${unitName}.service`], { timeout: 60000 });
}

export async function getBackupTimerStatus(rawName: string): Promise<'active' | 'inactive'> {
    const unitName = getBackupUnitName(rawName);
    if (process.platform !== 'linux') return 'inactive';

    try {
        const { stdout } = await execFileAsync('systemctl', ['is-active', `${unitName}.timer`], { timeout: 5000 });
        return stdout.trim() === 'active' ? 'active' : 'inactive';
    } catch {
        return 'inactive';
    }
}

export async function removeBackupUnits(rawName: string): Promise<void> {
    const unitName = getBackupUnitName(rawName);
    if (process.platform !== 'linux') return;

    const servicePath = path.posix.join(SYSTEMD_DIR, `${unitName}.service`);
    const timerPath = path.posix.join(SYSTEMD_DIR, `${unitName}.timer`);

    await execFileAsync('systemctl', ['disable', '--now', `${unitName}.timer`], { timeout: 15000 }).catch(() => {});
    await fs.unlink(timerPath).catch(() => {});
    await fs.unlink(servicePath).catch(() => {});
    await daemonReload().catch(() => {});
}
