import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    generateSessionToken,
    hashPassword,
    hashToken,
    parseCookies,
    verifyPassword
} from '../src/auth/crypto';

describe('hashPassword and verifyPassword', () => {
    it('hashes passwords with scrypt and verifies matching passwords', async () => {
        const hash = await hashPassword('CorrectHorseBatteryStaple!');
        assert.match(hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);

        assert.equal(await verifyPassword('CorrectHorseBatteryStaple!', hash), true);
        assert.equal(await verifyPassword('WrongPassword123', hash), false);
    });

    it('uses unique random salts per hash', async () => {
        const first = await hashPassword('SamePassword123!');
        const second = await hashPassword('SamePassword123!');
        assert.notEqual(first, second);
    });

    it('returns false for malformed stored hashes', async () => {
        assert.equal(await verifyPassword('password', ''), false);
        assert.equal(await verifyPassword('password', 'bcrypt$abc$def'), false);
        assert.equal(await verifyPassword('password', 'scrypt$$'), false);
        assert.equal(await verifyPassword('password', 'scrypt$onlysalt'), false);
    });
});

describe('token helpers', () => {
    it('generates 64-char hex session tokens and deterministic SHA-256 hashes', () => {
        const token = generateSessionToken();
        assert.match(token, /^[a-f0-9]{64}$/);
        assert.equal(hashToken(token).length, 64);
        assert.equal(hashToken(token), hashToken(token));
        assert.notEqual(hashToken(token), token);
    });
});

describe('parseCookies', () => {
    it('parses standard cookie headers and URL-decodes values', () => {
        assert.deepEqual(parseCookies('aeros_session=abc123; theme=dark%20mode'), {
            aeros_session: 'abc123',
            theme: 'dark mode'
        });
    });

    it('handles empty headers, malformed percent-encoding, and equals signs in values', () => {
        assert.deepEqual(parseCookies(undefined), {});
        assert.deepEqual(parseCookies(''), {});
        assert.deepEqual(parseCookies('token=a=b=c; bad=%E0%A4%A; novalue'), {
            token: 'a=b=c',
            bad: '%E0%A4%A'
        });
    });
});
