import { Router } from 'express';
import { db } from '../database/db';
import { hashPassword, verifyPassword } from '../auth/crypto';
import {
    type AuthenticatedRequest,
    checkLoginRateLimit,
    clearFailedLogins,
    clearSessionCookie,
    createSession,
    deleteSession,
    deleteUserSessions,
    getSessionTokenFromRequest,
    recordFailedLogin,
    requireAuth,
    setSessionCookie,
    validateSessionToken
} from '../auth/session';

export const authRouter = Router();

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

async function getUserCount(): Promise<number> {
    const result = await db('users').count<{ count: number | string }>('id as count').first();
    return Number(result?.count ?? 0);
}

authRouter.get('/status', async (req, res) => {
    try {
        const userCount = await getUserCount();
        const token = getSessionTokenFromRequest(req);
        const user = await validateSessionToken(token);

        res.json({
            authenticated: Boolean(user),
            setupRequired: userCount === 0,
            user: user || null
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

authRouter.post('/setup', async (req, res) => {
    try {
        const userCount = await getUserCount();
        if (userCount > 0) {
            res.status(409).json({ error: 'Admin account is already configured' });
            return;
        }

        const username = String(req.body?.username || 'admin').trim();
        const password = String(req.body?.password || '');

        if (!USERNAME_PATTERN.test(username)) {
            res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, _ or -)' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters' });
            return;
        }

        const passwordHash = await hashPassword(password);
        const [userId] = await db('users').insert({
            username,
            password: passwordHash,
            created_at: Date.now()
        });

        const { token, expiresAt } = await createSession(userId);
        setSessionCookie(req, res, token, expiresAt);

        res.status(201).json({
            authenticated: true,
            user: { id: userId, username }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

authRouter.post('/login', async (req, res) => {
    try {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const limit = checkLoginRateLimit(ip);
        if (!limit.allowed) {
            res.status(429).json({
                error: `Too many failed login attempts. Try again in ${limit.retryAfterSec}s.`
            });
            return;
        }

        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');

        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }

        const user = await db('users').where('username', username).first();
        if (!user) {
            recordFailedLogin(ip);
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const valid = await verifyPassword(password, user.password);
        if (!valid) {
            recordFailedLogin(ip);
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        clearFailedLogins(ip);
        const { token, expiresAt } = await createSession(user.id);
        setSessionCookie(req, res, token, expiresAt);

        res.json({
            authenticated: true,
            user: { id: user.id, username: user.username }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

authRouter.post('/logout', async (req, res) => {
    try {
        const token = getSessionTokenFromRequest(req);
        await deleteSession(token);
        clearSessionCookie(req, res);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

authRouter.post('/password', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user!.id;
        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');

        if (newPassword.length < 6) {
            res.status(400).json({ error: 'New password must be at least 6 characters' });
            return;
        }

        const user = await db('users').where('id', userId).first();
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const valid = await verifyPassword(currentPassword, user.password);
        if (!valid) {
            res.status(401).json({ error: 'Current password is incorrect' });
            return;
        }

        const passwordHash = await hashPassword(newPassword);
        await db('users').where('id', userId).update({ password: passwordHash });

        // Rotate sessions after password change
        await deleteUserSessions(userId);
        const { token, expiresAt } = await createSession(userId);
        setSessionCookie(req, res, token, expiresAt);

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
