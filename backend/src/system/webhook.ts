import crypto from 'crypto';

const SHA256_HEADER_PATTERN = /^sha256=([a-f0-9]{64})$/i;

export function generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
}

export function verifyGitHubSignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    secret: string
): boolean {
    if (!secret || !signatureHeader || !Buffer.isBuffer(rawBody)) {
        return false;
    }

    const match = SHA256_HEADER_PATTERN.exec(signatureHeader.trim());
    if (!match) {
        return false;
    }

    const received = Buffer.from(match[1], 'hex');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();

    if (received.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(received, expected);
}

export function isMatchingPushRef(payload: unknown, branch: string | null | undefined): boolean {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const ref = (payload as { ref?: unknown }).ref;
    if (typeof ref !== 'string') {
        return false;
    }

    const targetBranch = (branch || 'main').trim() || 'main';
    return ref === `refs/heads/${targetBranch}`;
}
