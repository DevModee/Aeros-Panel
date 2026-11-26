import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
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
    current_commit: string | null;
    previous_commit: string | null;
}

const execFileAsync = promisify(execFile);
const activeDeploys = new Map<string, 'deploy' | 'rollback'>();
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

export function getDeploymentAction(serviceName: string): 'deploy' | 'rollback' | null {
    return activeDeploys.get(serviceName) ?? null;
}

export function validateGitCommit(commit: unknown): string {
    if (typeof commit !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(commit)) {
        throw new Error('Invalid Git commit SHA.');
    }
    return commit.toLowerCase();
}

async function readGitCommit(workDir: string, ref: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', '--end-of-options', ref], {
        cwd: workDir,
        timeout: 15000
    });
    return validateGitCommit(stdout.trim());
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
    log: (message: string) => void,
    useShell = false
): Promise<void> {
    return new Promise((resolve, reject) => {
        const display = useShell ? 'configured build command'
            : args[0] === 'clone' ? `${command} clone`
            : [command, ...args].join(' ');
        log(`$ ${display}`);

        const child = spawn(command, args, {
            cwd,
            shell: useShell,
            env: { ...process.env, CI: 'true' }
        });

        child.stdout.on('data', (chunk) => {
            const text = chunk.toString().trimEnd();
            if (text) log(`  ${text}`);
        });

        child.stderr.on('data', (chunk) => {
            const text = chunk.toString().trimEnd();
            if (text) log(`  ${text}`);
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

export async function deployProject(project: DeployableProject, restart = restartService): Promise<void> {
    const serviceName = project.service_name;
    if (activeDeploys.has(serviceName)) {
        throw new Error('A deployment is already running for this service.');
    }

    activeDeploys.set(serviceName, 'deploy');
    const log = (message: string) => broadcastServiceLog(serviceName, `[DEPLOY] ${message}`);
    const startedAt = Date.now();
    let result: string;
    try {
        assertManageableServiceName(serviceName);
        const workDir = validateWorkDir(project.work_dir || `/opt/${serviceName}`);
        const branch = validateGitBranch(project.branch || 'main');

        log(`Starting update for ${project.name} (${serviceName})...`);

        let beforeHashes: Record<string, string | null> = {};
        let freshlyCloned = false;
        let beforeCommit: string | null = null;

        if (!fs.existsSync(path.join(workDir, '.git'))) {
            if (project.repository) {
                const repository = validateRepositoryUrl(project.repository);
                const parentDir = path.dirname(workDir);
                fs.mkdirSync(parentDir, { recursive: true });
                log(`Cloning repository (branch: ${branch})...`);
                await streamCommand(
                    'git',
                    ['clone', '--branch', branch, '--', repository, workDir],
                    parentDir,
                    log
                );
                freshlyCloned = true;
            } else if (!fs.existsSync(workDir)) {
                throw new Error(`Working directory "${workDir}" does not exist and no Git repository is configured.`);
            } else {
                log(`No .git directory found in ${workDir}; skipping git pull.`);
            }
        } else {
            beforeCommit = await readGitCommit(workDir, 'HEAD').catch(() => null);
            beforeHashes = snapshotHashes(workDir);
            await streamCommand('git', ['fetch', '--prune', 'origin', '--', branch], workDir, log);
            await streamCommand('git', ['pull', '--ff-only', 'origin', '--', branch], workDir, log);
        }

        const retrying = Boolean(project.current_commit && project.current_commit !== beforeCommit);
        await prepareProject(project, workDir, beforeHashes, freshlyCloned || retrying, log);

        const afterCommit = fs.existsSync(path.join(workDir, '.git'))
            ? await readGitCommit(workDir, 'HEAD')
            : null;

        log(`Restarting systemd service "${serviceName}"...`);
        await restart(serviceName);

        await db('projects')
            .where('id', project.id)
            .update({
                last_deploy_at: new Date().toISOString(),
                current_commit: afterCommit,
                previous_commit: getPreviousCommit(project, beforeCommit, afterCommit)
            });

        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        result = `Completed in ${elapsedSec}s. Service restarted.`;
    } catch (error: any) {
        result = `FAILED: ${error.message}`;
    } finally {
        activeDeploys.delete(serviceName);
    }
    log(result);
}

export async function rollbackProject(project: DeployableProject, restart = restartService): Promise<void> {
    const serviceName = project.service_name;
    if (activeDeploys.has(serviceName)) {
        throw new Error('A deployment is already running for this service.');
    }

    activeDeploys.set(serviceName, 'rollback');
    const log = (message: string) => broadcastServiceLog(serviceName, `[ROLLBACK] ${message}`);
    let result: string;
    try {
        assertManageableServiceName(serviceName);
        const workDir = validateWorkDir(project.work_dir || `/opt/${serviceName}`);
        const target = validateGitCommit(project.previous_commit);
        if (!fs.existsSync(path.join(workDir, '.git'))) {
            throw new Error('The project working directory is missing its Git checkout.');
        }
        if (await readGitCommit(workDir, `${target}^{commit}`) !== target) {
            throw new Error('The rollback SHA does not identify a Git commit.');
        }
        const before = await readGitCommit(workDir, 'HEAD');
        const lastDeployed = project.current_commit ? validateGitCommit(project.current_commit) : before;
        const beforeHashes = snapshotHashes(workDir);
        let restartAttempted = false;

        log(`Rolling back ${project.name} to ${target.slice(0, 12)}...`);
        try {
            await streamCommand('git', ['reset', '--hard', target, '--'], workDir, log);
            await prepareProject(project, workDir, beforeHashes, before !== lastDeployed, log);
            if (await readGitCommit(workDir, 'HEAD') !== target) {
                throw new Error('The build changed the rollback commit.');
            }

            log(`Restarting systemd service "${serviceName}"...`);
            restartAttempted = true;
            await restart(serviceName);

            await db('projects').where('id', project.id).update({
                last_deploy_at: new Date().toISOString(),
                current_commit: target,
                previous_commit: lastDeployed === target ? null : lastDeployed
            });
        } catch (error) {
            log(`Restoring checkout ${before.slice(0, 12)} after rollback failure...`);
            try {
                const failedHashes = snapshotHashes(workDir);
                await streamCommand('git', ['reset', '--hard', before, '--'], workDir, log);
                await prepareProject(project, workDir, failedHashes, false, log);
                if (restartAttempted) await restart(serviceName);
            } catch (restoreError: any) {
                log(`Could not restore the previous checkout or service: ${restoreError.message}`);
            }
            throw error;
        }
        result = 'Completed. Service restarted.';
    } catch (error: any) {
        result = `FAILED: ${error.message}`;
    } finally {
        activeDeploys.delete(serviceName);
    }
    log(result);
}

async function prepareProject(
    project: DeployableProject,
    workDir: string,
    beforeHashes: Record<string, string | null>,
    forceInstall: boolean,
    log: (message: string) => void
): Promise<void> {
    const afterHashes = snapshotHashes(workDir);
    const run = (command: string, args: string[], useShell = false) => streamCommand(command, args, workDir, log, useShell);

    if (afterHashes['package.json'] !== null) {
        const nodeModulesMissing = !fs.existsSync(path.join(workDir, 'node_modules'));
        const nodeLockChanged = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'package.json']
            .some((file) => beforeHashes[file] !== afterHashes[file]);

        if (nodeModulesMissing || nodeLockChanged || forceInstall) {
            log('Dependencies changed or missing. Installing Node packages...');
            if (afterHashes['pnpm-lock.yaml'] !== null) {
                await run('pnpm', ['install', '--frozen-lockfile']);
            } else if (afterHashes['yarn.lock'] !== null) {
                await run('yarn', ['install', '--frozen-lockfile']);
            } else if (afterHashes['package-lock.json'] !== null) {
                await run('npm', ['ci']);
            } else {
                await run('npm', ['install']);
            }
        } else {
            log('Lockfile unchanged. Skipping Node dependency install.');
        }
    }

    if (afterHashes['requirements.txt'] !== null &&
        (forceInstall || beforeHashes['requirements.txt'] !== afterHashes['requirements.txt'])) {
        const venvPip = path.join(workDir, '.venv', 'bin', 'pip');
        log('Installing Python packages from requirements.txt...');
        await run(fs.existsSync(venvPip) ? venvPip : 'pip3', ['install', '-r', 'requirements.txt']);
    }

    const explicitBuild = project.build_cmd?.trim();
    if (explicitBuild) {
        await run(explicitBuild, [], true);
    } else if ((project.template === 'node' || project.template === 'static') && hasNodeBuildScript(workDir)) {
        await run('npm', ['run', 'build']);
    }
}

function getPreviousCommit(project: DeployableProject, before: string | null, after: string | null): string | null {
    if (!after) return null;
    if (project.current_commit === after) return project.previous_commit;
    const previous = project.current_commit ?? before;
    return previous === after ? null : previous;
}
