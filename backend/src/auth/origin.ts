import type { IncomingMessage } from 'http';
import type { Request, Response, NextFunction } from 'express';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

export function getAllowedCorsOrigins(): string[] {
    const raw = process.env.CORS_ORIGIN?.trim();
    if (!raw) return [];
    return raw
        .split(',')
        .map((item) => item.trim().replace(/\/+$/, '').toLowerCase())
        .filter(Boolean);
}

function getRequestHosts(req: IncomingMessage): string[] {
    const hosts: string[] = [];
    const hostHeader = req.headers.host;
    if (typeof hostHeader === 'string' && hostHeader.trim()) {
        hosts.push(hostHeader.trim().toLowerCase());
    }

    const forwardedHost = req.headers['x-forwarded-host'];
    if (typeof forwardedHost === 'string' && forwardedHost.trim()) {
        const first = forwardedHost.split(',')[0]?.trim().toLowerCase();
        if (first && !hosts.includes(first)) {
            hosts.push(first);
        }
    }

    return hosts;
}

export function isExplicitlyAllowedCorsOrigin(origin: string | undefined): boolean {
    if (!origin) return false;
    try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }
        const normalized = parsed.origin.toLowerCase();
        return getAllowedCorsOrigins().includes(normalized);
    } catch {
        return false;
    }
}

export function isRequestOriginAllowed(
    req: IncomingMessage,
    { allowMissingOrigin }: { allowMissingOrigin: boolean }
): boolean {
    const originHeader = req.headers.origin;
    if (originHeader === undefined) {
        return allowMissingOrigin;
    }

    if (typeof originHeader !== 'string' || !originHeader.trim()) {
        return false;
    }

    let parsed: URL;
    try {
        parsed = new URL(originHeader);
    } catch {
        return false;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
    }

    const requestHosts = getRequestHosts(req);
    const originHost = parsed.host.toLowerCase();
    if (requestHosts.includes(originHost)) {
        return true;
    }

    const normalizedOrigin = parsed.origin.toLowerCase();
    return getAllowedCorsOrigins().includes(normalizedOrigin);
}

export function requireSameOriginForMutations(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
        next();
        return;
    }

    const fetchSite = req.headers['sec-fetch-site'];
    if (
        typeof fetchSite === 'string' &&
        fetchSite.toLowerCase() === 'cross-site' &&
        !isExplicitlyAllowedCorsOrigin(req.headers.origin)
    ) {
        res.status(403).json({ error: 'Cross-site request blocked' });
        return;
    }

    if (!isRequestOriginAllowed(req, { allowMissingOrigin: true })) {
        res.status(403).json({ error: 'Cross-origin request blocked' });
        return;
    }

    next();
}
