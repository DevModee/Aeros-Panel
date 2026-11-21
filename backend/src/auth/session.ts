import type { IncomingMessage } from 'http';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../database/db';
import { generateSessionToken, hashToken, parseCookies } from './crypto';

export const SESSION_COOKIE_NAME = 'aeros_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthUser {
    id: number;
    username: string;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
    sessionToken?: string;
}

interface RateLimitEntry {
    attempts: number;
    resetAt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();
const MAX_LOGIN_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (!entry || entry.resetAt <= now) {
        if (entry) loginAttempts.delete(ip);
        return { allowed: true, retryAfterSec: 0 };
    }

    if (entry.attempts >= MAX_LOGIN_ATTEMPTS) {
        return {
            allowed: false,
            retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
        };
    }

    return { allowed: true, retryAfterSec: 0 };
}

export function recordFailedLogin(ip: string): void {
    const now = Date.now();
    // Keep map bounded without background timers
    if (loginAttempts.size > 500) {
        for (const [key, val] of loginAttempts.entries()) {
            if (val.resetAt <= now) loginAttempts.delete(key);
        }
    }

    const entry = loginAttempts.get(ip);
    if (!entry || entry.resetAt <= now) {
        loginAttempts.set(ip, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    } else {
        entry.attempts += 1;
    }
}

export function clearFailedLogins(ip: string): void {
    loginAttempts.delete(ip);
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: number }> {
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    const token = generateSessionToken();
    const tokenHash = hashToken(token);

    // Lazily prune expired sessions
    await db('sessions').where('expires_at', '<=', now).del();
    await db('sessions').insert({
        token: tokenHash,
        user_id: userId,
        expires_at: expiresAt,
        created_at: now
    });

    return { token, expiresAt };
}

export async function validateSessionToken(token: string | undefined): Promise<AuthUser | null> {
    if (!token) {
        return null;
    }

    const now = Date.now();
    const tokenHash = hashToken(token);
    const row = await db('sessions')
        .join('users', 'sessions.user_id', 'users.id')
        .where('sessions.token', tokenHash)
        .andWhere('sessions.expires_at', '>', now)
        .select('users.id', 'users.username')
        .first();

    if (!row) {
        return null;
    }

    return { id: row.id, username: row.username };
}

export async function deleteSession(token: string | undefined): Promise<void> {
    if (!token) return;
    await db('sessions').where('token', hashToken(token)).del();
}

export async function deleteUserSessions(userId: number): Promise<void> {
    await db('sessions').where('user_id', userId).del();
}

export function getSessionTokenFromRequest(req: IncomingMessage): string | undefined {
    const cookies = parseCookies(req.headers.cookie);
    return cookies[SESSION_COOKIE_NAME];
}

function isSecureRequest(req: Request): boolean {
    if (req.secure) return true;
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (typeof forwardedProto === 'string') {
        return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
    }
    return false;
}

export function setSessionCookie(req: Request, res: Response, token: string, expiresAt: number): void {
    const maxAgeSec = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        `Max-Age=${maxAgeSec}`
    ];

    if (isSecureRequest(req)) {
        parts.push('Secure');
    }

    res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
    const parts = [
        `${SESSION_COOKIE_NAME}=`,
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=0'
    ];

    if (isSecureRequest(req)) {
        parts.push('Secure');
    }

    res.setHeader('Set-Cookie', parts.join('; '));
}

export async function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const token = getSessionTokenFromRequest(req);
        const user = await validateSessionToken(token);

        if (!user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        req.user = user;
        req.sessionToken = token;
        next();
    } catch {
        res.status(500).json({ error: 'Session verification failed' });
    }
}
