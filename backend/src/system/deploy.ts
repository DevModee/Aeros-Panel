import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { db } from '../database/db';
import { assertManageableServiceName, restartService } from './systemd';
import { validateGitBranch, validateRepositoryUrl } from './git';
import { validateWorkDir } from './templates';
import { broadcastServiceLog } from '../websockets/logs';

export interface DeployableProject {
    id: number;
    name: string;
    service_name: string;
    repository: string | null;
    branch: string | null;
    template: string | null;
    work_dir: string | null;
    build_cmd: string | null;
}

const activeDeploys = new Set<string>();
const LOCK_FILES = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'package.json',
    'requirements.txt',
    'pyproject.toml'
];

export function isDeployRunning(serviceName: string): boolean {
    return activeDeploys.has(serviceName);
}

function hashFile(filePath: string): string | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch {
        return null;
    }
}

function snapshotHashes(workDir: string): Record<string, string | null> {
    const snap: Record<string, string | null> = {};
    for (const file of LOCK_FILES) {
        snap[file] = hashFile(path.join(workDir, file));
    }
    return snap;
}

function streamCommand(
    command: string,
    args: string[],
    cwd: string,
    serviceName: string,
    useShell = false
): Promise<void> {
    return new Promise((resolve, reject) => {
        const display = args.length > 0 ? `${command} ${args.join(' ')}` : command;
        broadcastServiceLog(serviceName, `[DEPLOY] $ ${display}`);

        const child = spawn(command, args, {
            cwd,
            shell: useShell,
            env: { ...process.env, CI: 'true' }
        });

        child.stdout.on('data', (chunk) => {
            const text = chunk.toString().trimEnd();
            if (text) broadcastServiceLog(serviceName, text);
        });

        child.stderr.on('data', (chunk) => {
            const text = chunk.toString().trimEnd();
            if (text) broadcastServiceLog(serviceName, text);
        });

        child.on('error', (err) => {
            reject(err);
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command "${display}" exited with code ${code}`));
            }
        });
    });
}

function hasNodeBuildScript(workDir: string): boolean {
    const pkgPath = path.join(workDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return Boolean(pkg?.scripts && typeof pkg.scripts.build === 'string');
    } catch {
        return false;
    }
}

export async function deployProject(project: DeployableProject): Promise<void> {
    const serviceName = project.service_name;
    if (activeDeploys.has(serviceName)) {
        throw new Error('A deployment is already running for this service.');
    }

    activeDeploys.add(serviceName);
    const startedAt = Date.now();

    try {
        assertManageableServiceName(serviceName);
        const workDir = validateWorkDir(project.work_dir || `/opt/${serviceName}`);
        const branch = validateGitBranch(project.branch || 'main');

        broadcastServiceLog(serviceName, `[DEPLOY] Starting update for ${project.name} (${serviceName})...`);

        let beforeHashes: Record<string, string | null> = {};
        let freshlyCloned = false;

        if (!fs.existsSync(path.join(workDir, '.git'))) {
            if (project.repository) {
                const repository = validateRepositoryUrl(project.repository);
                const parentDir = path.dirname(workDir);
                fs.mkdirSync(parentDir, { recursive: true });
                broadcastServiceLog(serviceName, `[DEPLOY] Cloning ${repository} (branch: ${branch})...`);
                await streamCommand(
                    'git',
                    ['clone', '--branch', branch, '--', repository, workDir],
                    parentDir,
                    serviceName
                );
                freshlyCloned = true;
            } else if (!fs.existsSync(workDir)) {
                throw new Error(`Working directory "${workDir}" does not exist and no Git repository is configured.`);
            } else {
                broadcastServiceLog(serviceName, `[DEPLOY] No .git directory found in ${workDir}; skipping git pull.`);
            }
        } else {
            beforeHashes = snapshotHashes(workDir);
            await streamCommand('git', ['fetch', '--prune', 'origin', '--', branch], workDir, serviceName);
            await streamCommand('git', ['pull', '--ff-only', 'origin', '--', branch], workDir, serviceName);
        }

        const afterHashes = snapshotHashes(workDir);

        // Conditional Node.js dependency install
        if (fs.existsSync(path.join(workDir, 'package.json'))) {
            const nodeModulesMissing = !fs.existsSync(path.join(workDir, 'node_modules'));
            const nodeLockChanged =
                freshlyCloned ||
                beforeHashes['package-lock.json'] !== afterHashes['package-lock.json'] ||
                beforeHashes['pnpm-lock.yaml'] !== afterHashes['pnpm-lock.yaml'] ||
                beforeHashes['yarn.lock'] !== afterHashes['yarn.lock'] ||
                beforeHashes['package.json'] !== afterHashes['package.json'];

            if (nodeModulesMissing || nodeLockChanged) {
                broadcastServiceLog(serviceName, '[DEPLOY] Dependencies changed or missing; installing Node packages...');
                if (fs.existsSync(path.join(workDir, 'pnpm-lock.yaml'))) {
                    await streamCommand('pnpm', ['install', '--frozen-lockfile'], workDir, serviceName);
                } else if (fs.existsSync(path.join(workDir, 'yarn.lock'))) {
                    await streamCommand('yarn', ['install', '--frozen-lockfile'], workDir, serviceName);
                } else if (fs.existsSync(path.join(workDir, 'package-lock.json'))) {
                    await streamCommand('npm', ['ci'], workDir, serviceName);
                } else {
                    await streamCommand('npm', ['install'], workDir, serviceName);
                }
            } else {
                broadcastServiceLog(serviceName, '[DEPLOY] Lockfile unchanged; skipping Node dependency install.');
            }
        }

        // Conditional Python dependency install
        if (fs.existsSync(path.join(workDir, 'requirements.txt'))) {
            const venvPip = path.join(workDir, '.venv', 'bin', 'pip');
            const pyLockChanged =
                freshlyCloned ||
                beforeHashes['requirements.txt'] !== afterHashes['requirements.txt'];

            if (pyLockChanged) {
                broadcastServiceLog(serviceName, '[DEPLOY] requirements.txt changed; installing Python packages...');
                if (fs.existsSync(venvPip)) {
                    await streamCommand(venvPip, ['install', '-r', 'requirements.txt'], workDir, serviceName);
                } else {
                    await streamCommand('pip3', ['install', '-r', 'requirements.txt'], workDir, serviceName);
                }
            }
        }

        // Conditional build step
        const explicitBuild = project.build_cmd?.trim();
        if (explicitBuild) {
            broadcastServiceLog(serviceName, '[DEPLOY] Running configured build command...');
            await streamCommand(explicitBuild, [], workDir, serviceName, true);
        } else if (
            (project.template === 'node' || project.template === 'static') &&
            hasNodeBuildScript(workDir)
        ) {
            broadcastServiceLog(serviceName, '[DEPLOY] Detected build script in package.json; running npm run build...');
            await streamCommand('npm', ['run', 'build'], workDir, serviceName);
        }

        // Restart systemd service
        broadcastServiceLog(serviceName, `[DEPLOY] Restarting systemd service "${serviceName}"...`);
        await restartService(serviceName);

        await db('projects')
            .where('id', project.id)
            .update({ last_deploy_at: new Date().toISOString() });

        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        broadcastServiceLog(serviceName, `[DEPLOY] Completed in ${elapsedSec}s. Service restarted.`);
    } catch (error: any) {
        broadcastServiceLog(serviceName, `[DEPLOY] FAILED: ${error.message}`);
    } finally {
        activeDeploys.delete(serviceName);
    }
}
