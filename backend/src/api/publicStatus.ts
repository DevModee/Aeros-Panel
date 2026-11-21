import crypto from 'crypto';
import os from 'os';
import { Router, type Request } from 'express';
import { db } from '../database/db';
import { getPublicStatusConfig } from '../database/settings';
import { getSystemMetrics } from '../system/sensors';
import { getServiceStatus } from '../system/systemd';

export const publicStatusRouter = Router();

const CACHE_TTL_MS = 2000;
let cachedAt = 0;
let cachedPayload: Record<string, unknown> | null = null;

export function invalidatePublicStatusCache(): void {
    cachedAt = 0;
    cachedPayload = null;
}

function safeTokenMatch(provided: string, expected: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function extractToken(req: Request): string {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }
    if (typeof req.query.token === 'string') {
        return req.query.token.trim();
    }
    return '';
}

publicStatusRouter.options('/status', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    res.status(204).end();
});

publicStatusRouter.get('/status', async (req, res) => {
    try {
        const config = await getPublicStatusConfig();
        if (!config.enabled) {
            res.status(404).json({ error: 'Public status endpoint is disabled' });
            return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');

        if (config.token) {
            const provided = extractToken(req);
            if (!provided || !safeTokenMatch(provided, config.token)) {
                res.status(401).json({ error: 'Invalid or missing status token' });
                return;
            }
        }

        const now = Date.now();
        if (cachedPayload && now - cachedAt < CACHE_TTL_MS) {
            res.json(cachedPayload);
            return;
        }

        const [metrics, projects] = await Promise.all([
            getSystemMetrics(),
            db('projects').select('name', 'service_name')
        ]);

        const items = await Promise.all(
            projects.map(async (p) => {
                const status = await getServiceStatus(p.service_name);
                return {
                    name: p.name,
                    service_name: p.service_name,
                    status
                };
            })
        );

        const total = items.length;
        const up = items.filter((item) => item.status === 'active').length;
        const down = total - up;
        const overallStatus = total === 0 || down === 0 ? 'operational' : up === 0 ? 'down' : 'degraded';

        const payload = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            panel: {
                name: 'AerosPanel',
                version: '2.0.0'
            },
            host: {
                hostname: os.hostname(),
                uptime: Math.floor(os.uptime())
            },
            metrics: {
                cpuPercent: metrics.cpu.usage,
                memoryPercent: Number(metrics.memory.percentage.toFixed(1)),
                memoryUsedMb: Math.round(metrics.memory.used / 1024 / 1024),
                memoryTotalMb: Math.round(metrics.memory.total / 1024 / 1024),
                storagePercent: Number(metrics.storage.percentage.toFixed(1)),
                temperatureC: metrics.thermal.temperature
            },
            services: {
                total,
                up,
                down,
                items
            }
        };

        cachedPayload = payload;
        cachedAt = now;
        res.json(payload);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
