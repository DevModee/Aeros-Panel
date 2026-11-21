import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const SERVICE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SYSTEMD_DIR = '/etc/systemd/system';

export function assertValidServiceName(serviceName: string): void {
    if (!SERVICE_NAME_PATTERN.test(serviceName)) {
        throw new Error('Invalid systemd service name');
    }
}

async function runSystemctl(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const { stdout, stderr } = await execFileAsync('systemctl', args, { timeout: 15000 });
    return { stdout, stderr };
}

export async function startService(serviceName: string): Promise<void> {
    assertValidServiceName(serviceName);
    await runSystemctl(['start', serviceName]);
}

export async function stopService(serviceName: string): Promise<void> {
    assertValidServiceName(serviceName);
    await runSystemctl(['stop', serviceName]);
}

export async function restartService(serviceName: string): Promise<void> {
    assertValidServiceName(serviceName);
    await runSystemctl(['restart', serviceName]);
}

export async function enableService(serviceName: string): Promise<void> {
    assertValidServiceName(serviceName);
    await runSystemctl(['enable', serviceName]);
}

export async function disableService(serviceName: string): Promise<void> {
    assertValidServiceName(serviceName);
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

export async function writeSystemdUnit(
    serviceName: string,
    unitContent: string
): Promise<{ installed: boolean; unitPath: string; warning?: string }> {
    assertValidServiceName(serviceName);
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
    assertValidServiceName(serviceName);
    if (process.platform !== 'linux') return;

    const unitPath = path.posix.join(SYSTEMD_DIR, `${serviceName}.service`);
    try {
        await stopService(serviceName).catch(() => {});
        await disableService(serviceName).catch(() => {});
        await fs.unlink(unitPath).catch(() => {});
        await daemonReload().catch(() => {});
    } catch {}
}
