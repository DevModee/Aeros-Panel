import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    generateSystemdUnit,
    validateUnitConfig,
    validateWorkDir
} from '../src/system/templates';

describe('validateWorkDir', () => {
    it('accepts valid absolute Linux project paths', () => {
        assert.equal(validateWorkDir('/opt/my-app'), '/opt/my-app');
        assert.equal(validateWorkDir('/home/deploy/bot/'), '/home/deploy/bot');
        assert.equal(validateWorkDir('/srv/apps/api'), '/srv/apps/api');
    });

    it('rejects relative paths and root directory', () => {
        assert.throws(() => validateWorkDir('opt/my-app'), /absolute Linux path/);
        assert.throws(() => validateWorkDir('./app'), /absolute Linux path/);
        assert.throws(() => validateWorkDir('/'), /filesystem root/);
    });

    it('rejects system directories and traversal into them', () => {
        assert.throws(() => validateWorkDir('/etc'), /system directory/);
        assert.throws(() => validateWorkDir('/etc/systemd/system'), /system directory/);
        assert.throws(() => validateWorkDir('/usr/local/bin'), /system directory/);
        assert.throws(() => validateWorkDir('/var/lib/sqlite'), /system directory/);
        assert.throws(() => validateWorkDir('/opt/app/../../etc/cron.d'), /system directory/);
        assert.throws(() => validateWorkDir('/home/user/../../usr'), /system directory/);
    });

    it('rejects control characters and empty strings', () => {
        assert.throws(() => validateWorkDir(''), /invalid characters/);
        assert.throws(() => validateWorkDir('/opt/app\nExecStart=/bin/sh'), /invalid characters/);
        assert.throws(() => validateWorkDir('/opt/app\0'), /invalid characters/);
    });
});

describe('validateUnitConfig', () => {
    it('normalizes valid config and expands template placeholders', () => {
        const config = validateUnitConfig({
            name: 'Telegram Bot',
            serviceName: 'tg-bot',
            template: 'python',
            workDir: '/opt/tg-bot',
            runUser: 'deploy',
            memoryMax: '256m'
        });

        assert.equal(config.serviceName, 'tg-bot');
        assert.equal(config.workDir, '/opt/tg-bot');
        assert.equal(config.execStart, '/opt/tg-bot/.venv/bin/python main.py');
        assert.equal(config.runUser, 'deploy');
        assert.equal(config.memoryMax, '256M');
    });

    it('resolves relative ./ and .venv/ execStart against workDir', () => {
        const dotSlash = validateUnitConfig({
            name: 'App',
            serviceName: 'my-app',
            template: 'custom',
            workDir: '/opt/my-app',
            execStart: './start.sh'
        });
        assert.equal(dotSlash.execStart, '/opt/my-app/start.sh');

        const venv = validateUnitConfig({
            name: 'Bot',
            serviceName: 'my-bot',
            template: 'python',
            workDir: '/opt/my-bot',
            execStart: '.venv/bin/uvicorn app:app'
        });
        assert.equal(venv.execStart, '/opt/my-bot/.venv/bin/uvicorn app:app');
    });

    it('rejects reserved service names, invalid users, and invalid MemoryMax', () => {
        assert.throws(
            () => validateUnitConfig({ name: 'SSH', serviceName: 'ssh', template: 'node' }),
            /reserved/
        );
        assert.throws(
            () =>
                validateUnitConfig({
                    name: 'App',
                    serviceName: 'valid-app',
                    template: 'node',
                    runUser: 'Root User!'
                }),
            /Invalid Linux user name/
        );
        assert.throws(
            () =>
                validateUnitConfig({
                    name: 'App',
                    serviceName: 'valid-app',
                    template: 'node',
                    memoryMax: '256MB'
                }),
            /Invalid MemoryMax/
        );
    });
});

describe('generateSystemdUnit', () => {
    it('generates a complete systemd unit with optional User and MemoryMax', () => {
        const { unitContent } = generateSystemdUnit({
            name: 'API Service',
            serviceName: 'api-svc',
            template: 'node',
            workDir: '/opt/api-svc',
            execStart: '/usr/bin/node dist/index.js',
            runUser: 'www-data',
            memoryMax: '512M'
        });

        assert.match(unitContent, /Description=AerosPanel Service: API Service/);
        assert.match(unitContent, /WorkingDirectory=\/opt\/api-svc/);
        assert.match(unitContent, /EnvironmentFile=-\/opt\/api-svc\/\.env/);
        assert.match(unitContent, /ExecStart=\/usr\/bin\/node dist\/index\.js/);
        assert.match(unitContent, /User=www-data/);
        assert.match(unitContent, /MemoryMax=512M/);
        assert.match(unitContent, /SyslogIdentifier=api-svc/);
        assert.match(unitContent, /WantedBy=multi-user\.target/);
    });

    it('omits User and MemoryMax lines when not provided', () => {
        const { unitContent } = generateSystemdUnit({
            name: 'Minimal Service',
            serviceName: 'minimal-svc',
            template: 'node'
        });

        assert.doesNotMatch(unitContent, /^User=/m);
        assert.doesNotMatch(unitContent, /^MemoryMax=/m);
    });
});
