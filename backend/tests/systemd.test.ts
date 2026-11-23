import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    assertManageableServiceName,
    assertValidServiceName,
    isReservedServiceName
} from '../src/system/systemd';

describe('isReservedServiceName', () => {
    it('blocks critical system and panel services', () => {
        for (const name of [
            'ssh',
            'sshd',
            'aeros-panel',
            'aeros-panel.service',
            'cloudflared',
            'tailscaled',
            'systemd',
            'systemd-journald',
            'systemd-networkd.service',
            'SSH',
            'docker',
            'ufw',
            'cron',
            'dbus'
        ]) {
            assert.equal(isReservedServiceName(name), true, `expected ${name} to be reserved`);
        }
    });

    it('allows normal user application service names', () => {
        for (const name of ['my-api', 'DiscordBot', 'app_v2', 'web.frontend']) {
            assert.equal(isReservedServiceName(name), false, `expected ${name} to be allowed`);
        }
    });
});

describe('assertManageableServiceName', () => {
    it('accepts valid non-reserved service names including mixed case', () => {
        assert.doesNotThrow(() => assertManageableServiceName('my-api'));
        assert.doesNotThrow(() => assertManageableServiceName('MyService_1.0'));
        assert.doesNotThrow(() => assertValidServiceName('ssh'));
    });

    it('throws on reserved service names', () => {
        assert.throws(() => assertManageableServiceName('ssh'), /reserved/);
        assert.throws(() => assertManageableServiceName('aeros-panel'), /reserved/);
        assert.throws(() => assertManageableServiceName('cloudflared'), /reserved/);
        assert.throws(() => assertManageableServiceName('tailscaled'), /reserved/);
        assert.throws(() => assertManageableServiceName('systemd-resolved'), /reserved/);
    });

    it('throws on invalid characters or leading punctuation', () => {
        assert.throws(() => assertManageableServiceName(''), /Invalid systemd service name/);
        assert.throws(() => assertManageableServiceName('-flag'), /Invalid systemd service name/);
        assert.throws(() => assertManageableServiceName('../etc/passwd'), /Invalid systemd service name/);
        assert.throws(() => assertManageableServiceName('svc;rm -rf /'), /Invalid systemd service name/);
        assert.throws(() => assertManageableServiceName('svc name'), /Invalid systemd service name/);
    });
});
