import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const temporaryDir = mkdtempSync(path.join(os.tmpdir(), 'aeros-db-test-'));
process.env.AEROS_DB_PATH = path.join(temporaryDir, 'test.db');

it('validates full hexadecimal Git commit IDs', async () => {
    const { validateGitCommit } = await import('../src/system/deploy');
    for (const length of [40, 64]) {
        assert.equal(validateGitCommit('AB'.repeat(length / 2)), 'ab'.repeat(length / 2));
    }
    for (const invalid of [null, 'HEAD', '--hard', 'e'.repeat(39), 'e'.repeat(40) + '\n', 'z'.repeat(40)]) {
        assert.throws(() => validateGitCommit(invalid), /Invalid Git commit SHA/);
    }
});

it('migrates legacy projects and records only successful deploys without losing the rollback point', async (t) => {
    const repo = mkdtempSync(path.join(process.cwd(), '.deploy-test-'));
    const { db, initializeDatabase } = await import('../src/database/db');
    const { deployProject, isDeployRunning, rollbackProject } = await import('../src/system/deploy');
    t.after(async () => {
        await db.destroy();
        rmSync(repo, { recursive: true, force: true });
        rmSync(temporaryDir, { recursive: true, force: true });
    });

    const workDir = path.join(repo, 'checkout');
    const linuxWorkDir = workDir.split(path.sep).join('/').replace(/^[a-z]:/i, '');
    await db.schema.createTable('projects', (table) => {
        table.increments('id');
        table.string('name');
        table.string('service_name');
        table.string('work_dir');
    });
    const [id] = await db('projects').insert({ name: 'Example', service_name: 'example', work_dir: linuxWorkDir });
    const project = () => db('projects').where({ id }).first();
    await initializeDatabase();
    await initializeDatabase();
    assert.equal((await project()).current_commit, null);
    assert.equal((await project()).previous_commit, null);

    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.email', 'dev@example.test');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'commit.gpgsign', 'false');
    writeFileSync(path.join(repo, 'app.txt'), 'first');
    writeFileSync(path.join(repo, 'build.cjs'), "require('node:fs').copyFileSync('app.txt', 'built.txt');\n");
    git(repo, 'add', 'app.txt', 'build.cjs');
    git(repo, 'commit', '-m', 'First');
    const first = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'clone', '.', workDir);
    writeFileSync(path.join(repo, 'app.txt'), 'updated');
    git(repo, 'add', 'app.txt');
    git(repo, 'commit', '-m', 'Second');
    const second = git(repo, 'rev-parse', 'HEAD');
    const restart = async (name: string) => assert.equal(name, 'example');

    await deployProject(await project(), restart);
    const deployed = await project();
    assert.equal(deployed.current_commit, second);
    assert.equal(deployed.previous_commit, first);
    assert.ok(deployed.last_deploy_at);

    await deployProject(await project(), restart);
    assert.equal((await project()).previous_commit, first);

    git(repo, 'commit', '--allow-empty', '-m', 'Third');
    const third = git(repo, 'rev-parse', 'HEAD');
    const beforeFailedDeploy = await project();
    await deployProject(beforeFailedDeploy, async () => { throw new Error('Restart failed'); });
    assert.deepEqual(await project(), beforeFailedDeploy);
    assert.equal(git(workDir, 'rev-parse', 'HEAD'), third);

    await deployProject(await project(), restart);
    assert.equal((await project()).current_commit, third);
    assert.equal((await project()).previous_commit, second);

    writeFileSync(path.join(repo, 'app.txt'), 'latest');
    git(repo, 'commit', '-am', 'Fourth');
    const fourth = git(repo, 'rev-parse', 'HEAD');
    await db('projects').where({ id }).update({ build_cmd: 'node build.cjs' });
    await deployProject(await project(), restart);
    assert.equal(readFileSync(path.join(workDir, 'built.txt'), 'utf8'), 'latest');

    const beforeRollback = await project();
    await rollbackProject({ ...beforeRollback, previous_commit: 'HEAD' }, restart);
    assert.equal(git(workDir, 'rev-parse', 'HEAD'), fourth);

    let restartAttempts = 0;
    await rollbackProject(beforeRollback, async () => {
        if (++restartAttempts === 1) throw new Error('Rollback restart failed');
    });
    assert.equal(restartAttempts, 2);
    assert.equal(git(workDir, 'rev-parse', 'HEAD'), fourth);
    assert.equal(readFileSync(path.join(workDir, 'built.txt'), 'utf8'), 'latest');
    assert.deepEqual(await project(), beforeRollback);

    await rollbackProject(beforeRollback, async (name) => {
        await restart(name);
        assert.equal(isDeployRunning(name), true);
        await assert.rejects(deployProject(beforeRollback, restart), /already running/);
    });
    assert.equal(git(workDir, 'rev-parse', 'HEAD'), third);
    assert.equal(readFileSync(path.join(workDir, 'built.txt'), 'utf8'), 'updated');
    assert.equal((await project()).current_commit, third);
    assert.equal((await project()).previous_commit, fourth);

    await deployProject(await project(), restart);
    assert.equal(git(workDir, 'rev-parse', 'HEAD'), fourth);
    assert.equal((await project()).previous_commit, third);
});
