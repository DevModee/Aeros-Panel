import crypto from 'crypto';

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS: crypto.ScryptOptions = { N: 16384, r: 8, p: 1 };

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, keylen, SCRYPT_OPTIONS, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
        });
    });
}

export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scryptAsync(password, salt, KEY_LENGTH);
    return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
        return false;
    }

    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) {
        return false;
    }

    const expected = Buffer.from(expectedHex, 'hex');
    const derived = await scryptAsync(password, salt, expected.length);
    if (derived.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(derived, expected);
}

export function generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    if (!cookieHeader) {
        return {};
    }

    const cookies: Record<string, string> = {};
    for (const part of cookieHeader.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key) {
            try {
                cookies[key] = decodeURIComponent(value);
            } catch {
                cookies[key] = value;
            }
        }
    }
    return cookies;
}
