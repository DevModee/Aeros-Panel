import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const SYSTEMD_DIR = '/etc/systemd/system';

const RESERVED_SERVICE_NAMES = new Set([
    'aeros-panel',
    'ssh',
    'sshd',
    'systemd',
    'tailscaled',
    'cloudflared',
    'docker',
    'ufw',
    'cron',
    'dbus'
]);

export function isReservedServiceName(serviceName: string): boolean {
    const normalized = serviceName.trim().toLowerCase().replace(/\.service$/, '');
    return RESERVED_SERVICE_NAMES.has(normalized) || normalized.startsWith('systemd-');
}

export function assertValidServiceName(serviceName: string): void {
    if (!SERVICE_NAME_PATTERN.test(serviceName)) {
        throw new Error('Invalid systemd service name');
    }
}

export function assertManageableServiceName(serviceName: string): void {
    assertValidServiceName(serviceName);
    if (isReservedServiceName(serviceName)) {
        throw new Error(`Service name "${serviceName}" is reserved for system services.`);
    }
}

async function runSystemctl(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await execFileAsync('systemctl', args, { timeout: 15000 });
    return { stdout, stderr };
}

export async function startService(serviceName: string): Promise<void> {
    assertManageableServiceName(serviceName);
    await runSystemctl(['start', serviceName]);
}

export async function stopService(serviceName: string): Promise<void> {
    assertManageableServiceName(serviceName);
    await runSystemctl(['stop', serviceName]);
}

export async function restartService(serviceName: string): Promise<void> {
    assertManageableServiceName(serviceName);
    await runSystemctl(['restart', serviceName]);
}

export async function enableService(serviceName: string): Promise<void> {
    assertManageableServiceName(serviceName);
    await runSystemctl(['enable', serviceName]);
}

export async function disableService(serviceName: string): Promise<void> {
    assertManageableServiceName(serviceName);
    await runSystemctl(['disable', serviceName]);
}

export async function daemonReload(): Promise<void> {
    await runSystemctl(['daemon-reload']);
}

export async function getServiceStatus(serviceName: string): Promise<string> {
    if (!SERVICE_NAME_PATTERN.test(serviceName)) {
        return 'inactive';
    }
    try {
        const { stdout } = await runSystemctl(['is-active', serviceName]);
        return stdout.trim() || 'inactive';
    } catch {
        return 'inactive';
    }
}

interface ServiceSnapshot {
    status: string;
    metrics: { memoryBytes: number | null; cpuUsageNSec: number | null } | null;
}

function readCounter(value: string | undefined): number | null {
    if (!value || !/^\d+$/.test(value) || value === '18446744073709551615') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function parseServiceSnapshot(output: string): ServiceSnapshot {
    const properties = new Map(output.trim().split(/\r?\n/).map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
    }));
    const state = properties.get('ActiveState');
    if (state !== 'active' && state !== 'reloading' && state !== 'refreshing') {
        return { status: 'inactive', metrics: null };
    }

    const memoryBytes = readCounter(properties.get('MemoryCurrent'));
    const cpuUsageNSec = readCounter(properties.get('CPUUsageNSec'));
    return {
        status: state,
        metrics: memoryBytes === null && cpuUsageNSec === null ? null : { memoryBytes, cpuUsageNSec }
    };
}

export async function getServiceSnapshot(serviceName: string): Promise<ServiceSnapshot> {
    assertManageableServiceName(serviceName);
    if (process.platform === 'linux') {
        try {
            const { stdout } = await runSystemctl([
                'show', '--property=ActiveState,MemoryCurrent,CPUUsageNSec', '--', serviceName
            ]);
            return parseServiceSnapshot(stdout);
        } catch {
            // The service manager or unit may be unavailable.
        }
    }
    return { status: 'inactive', metrics: null };
}

export async function writeSystemdUnit(
    serviceName: string,
    unitContent: string
): Promise<{ installed: boolean; unitPath: string; warning?: string }> {
    assertManageableServiceName(serviceName);
    const unitPath = path.posix.join(SYSTEMD_DIR, `${serviceName}.service`);

    if (process.platform !== 'linux') {
        return {
            installed: false,
            unitPath,
            warning: 'Skipped writing /etc/systemd/system unit file (host OS is not Linux).'
        };
    }

    try {
        await fs.writeFile(unitPath, unitContent, { mode: 0o644 });
        await daemonReload();
        return { installed: true, unitPath };
    } catch (error: any) {
        return {
            installed: false,
            unitPath,
            warning: `Could not install systemd unit at ${unitPath}: ${error.message}`
        };
    }
}

export async function removeSystemdUnit(serviceName: string): Promise<void> {
    assertManageableServiceName(serviceName);
    if (process.platform !== 'linux') return;

    const unitPath = path.posix.join(SYSTEMD_DIR, `${serviceName}.service`);
    try {
        await stopService(serviceName).catch(() => {});
        await disableService(serviceName).catch(() => {});
        await fs.unlink(unitPath).catch(() => {});
        await daemonReload().catch(() => {});
    } catch {}
}
