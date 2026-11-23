import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
    generateWebhookSecret,
    isMatchingPushRef,
    verifyGitHubSignature
} from '../src/system/webhook';

function sign(payload: string, secret: string): string {
    const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${digest}`;
}

describe('generateWebhookSecret', () => {
    it('generates 64-char hex secrets', () => {
        const a = generateWebhookSecret();
        const b = generateWebhookSecret();
        assert.match(a, /^[a-f0-9]{64}$/);
        assert.notEqual(a, b);
    });
});

describe('verifyGitHubSignature', () => {
    it('accepts valid sha256 HMAC signatures', () => {
        const secret = 'test-webhook-secret';
        const body = Buffer.from(JSON.stringify({ ref: 'refs/heads/main' }));
        const sig = sign(body.toString('utf8'), secret);

        assert.equal(verifyGitHubSignature(body, sig, secret), true);
    });

    it('rejects tampered payloads, wrong secrets, and malformed headers', () => {
        const secret = 'test-webhook-secret';
        const body = Buffer.from(JSON.stringify({ ref: 'refs/heads/main' }));
        const validSig = sign(body.toString('utf8'), secret);

        assert.equal(verifyGitHubSignature(Buffer.from('{"ref":"refs/heads/dev"}'), validSig, secret), false);
        assert.equal(verifyGitHubSignature(body, validSig, 'other-secret'), false);
        assert.equal(verifyGitHubSignature(body, undefined, secret), false);
        assert.equal(verifyGitHubSignature(body, 'sha1=deadbeef', secret), false);
        assert.equal(verifyGitHubSignature(body, 'sha256=not-hex', secret), false);
        assert.equal(verifyGitHubSignature(body, validSig, ''), false);
    });
});

describe('isMatchingPushRef', () => {
    it('matches refs/heads/<branch> and defaults to main', () => {
        assert.equal(isMatchingPushRef({ ref: 'refs/heads/main' }, 'main'), true);
        assert.equal(isMatchingPushRef({ ref: 'refs/heads/main' }, null), true);
        assert.equal(isMatchingPushRef({ ref: 'refs/heads/release/v2' }, 'release/v2'), true);
    });

    it('rejects non-matching branches, tags, and invalid payloads', () => {
        assert.equal(isMatchingPushRef({ ref: 'refs/heads/develop' }, 'main'), false);
        assert.equal(isMatchingPushRef({ ref: 'refs/tags/v2.0.0' }, 'main'), false);
        assert.equal(isMatchingPushRef({}, 'main'), false);
        assert.equal(isMatchingPushRef(null, 'main'), false);
    });
});
