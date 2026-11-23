import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    BACKUP_DIR,
    generateBackupUnits,
    validateBackupName,
    validateBackupPaths,
    validateBackupSchedule
} from '../src/system/backups';

describe('validateBackupName', () => {
    it('accepts valid lowercase names and normalizes case', () => {
        assert.equal(validateBackupName('panel-db'), 'panel-db');
        assert.equal(validateBackupName('  App_Env_1 '), 'app_env_1');
    });

    it('rejects invalid characters, leading hyphens, and path traversal', () => {
        assert.throws(() => validateBackupName(''), /Invalid backup name/);
        assert.throws(() => validateBackupName('-bad'), /Invalid backup name/);
        assert.throws(() => validateBackupName('../etc'), /Invalid backup name/);
        assert.throws(() => validateBackupName('name with spaces'), /Invalid backup name/);
    });
});

describe('validateBackupSchedule', () => {
    it('accepts standard OnCalendar presets and HH:MM times', () => {
        assert.equal(validateBackupSchedule(undefined), 'daily');
        assert.equal(validateBackupSchedule('hourly'), 'hourly');
        assert.equal(validateBackupSchedule('weekly'), 'weekly');
        assert.equal(validateBackupSchedule('03:30'), '*-*-* 03:30:00');
        assert.equal(validateBackupSchedule('*-*-* 04:00:00'), '*-*-* 04:00:00');
    });

    it('rejects invalid schedules and injection attempts', () => {
        assert.throws(() => validateBackupSchedule('every-minute'), /Invalid schedule/);
        assert.throws(() => validateBackupSchedule('25:00'), /Invalid schedule/);
        assert.throws(() => validateBackupSchedule('daily\nExecStart=/bin/sh'), /Invalid schedule/);
    });
});

describe('validateBackupPaths', () => {
    it('accepts valid project file paths and deduplicates entries', () => {
        assert.deepEqual(
            validateBackupPaths(['/opt/aeros-panel/backend/aeros.db', '/opt/my-app/.env', '/opt/my-app/.env']),
            ['/opt/aeros-panel/backend/aeros.db', '/opt/my-app/.env']
        );
    });

    it('rejects system paths, traversal, empty arrays, and shell metacharacters', () => {
        assert.throws(() => validateBackupPaths([]), /At least one/);
        assert.throws(() => validateBackupPaths(['/etc/shadow']), /system directory/);
        assert.throws(() => validateBackupPaths(['/opt/app/../../etc/passwd']), /system directory/);
        assert.throws(() => validateBackupPaths(['/opt/app/.env;rm']), /unsupported characters/);
        assert.throws(() => validateBackupPaths(['/opt/my app/.env']), /unsupported characters/);
    });
});

describe('generateBackupUnits', () => {
    it('generates oneshot service and persistent timer units targeting /var/backups/aeros-panel', () => {
        const result = generateBackupUnits({
            name: 'daily-db',
            paths: ['/opt/aeros-panel/backend/aeros.db', '/opt/my-app/.env'],
            schedule: 'daily'
        });

        assert.equal(result.unitName, 'aeros-backup-daily-db');
        assert.match(result.serviceContent, /Type=oneshot/);
        assert.match(result.serviceContent, /UMask=0077/);
        assert.match(result.serviceContent, new RegExp(BACKUP_DIR.replace(/\//g, '\\/')));
        assert.match(result.serviceContent, /\/opt\/aeros-panel\/backend\/aeros\.db \/opt\/my-app\/\.env/);
        assert.match(result.timerContent, /OnCalendar=daily/);
        assert.match(result.timerContent, /Persistent=true/);
        assert.match(result.timerContent, /WantedBy=timers\.target/);
    });
});
