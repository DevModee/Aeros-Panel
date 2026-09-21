import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    try {
        const { stdout, stderr } = await execAsync(command);
        return { stdout, stderr };
    } catch (error: any) {
        throw new Error(error.message);
    }
}

export async function startService(serviceName: string): Promise<void> {
    await executeCommand(`sudo systemctl start ${serviceName}`);
}

export async function stopService(serviceName: string): Promise<void> {
    await executeCommand(`sudo systemctl stop ${serviceName}`);
}

export async function restartService(serviceName: string): Promise<void> {
    await executeCommand(`sudo systemctl restart ${serviceName}`);
}

export async function enableService(serviceName: string): Promise<void> {
    await executeCommand(`sudo systemctl enable ${serviceName}`);
}

export async function disableService(serviceName: string): Promise<void> {
    await executeCommand(`sudo systemctl disable ${serviceName}`);
}

export async function getServiceStatus(serviceName: string): Promise<string> {
    try {
        const { stdout } = await executeCommand(`systemctl is-active ${serviceName}`);
        return stdout.trim();
    } catch (e) {
        return 'inactive';
    }
}
