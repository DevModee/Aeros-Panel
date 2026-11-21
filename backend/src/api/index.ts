import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSystemMetrics } from '../system/sensors';
import { startService, stopService, restartService, enableService, disableService, getServiceStatus } from '../system/systemd';
import { db } from '../database/db';
import { authRouter } from './auth';
import { requireAuth } from '../auth/session';

export const apiRouter = Router();

const SERVICE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

// Unauthenticated endpoints
apiRouter.get('/health', (_req, res) => {
    res.json({
        ok: true,
        uptime: Math.floor(process.uptime())
    });
});

apiRouter.use('/auth', authRouter);

// Everything below requires a valid session cookie
apiRouter.use(requireAuth);

apiRouter.get('/system/metrics', async (_req, res) => {
    try {
        const metrics = await getSystemMetrics();
        res.json(metrics);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/projects', async (_req, res) => {
    try {
        const projects = await db('projects').select('*');

        const projectsWithStatus = await Promise.all(projects.map(async (p) => {
            const status = await getServiceStatus(p.service_name);
            return { ...p, status };
        }));

        res.json(projectsWithStatus);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const service_name = String(req.body?.service_name || '').trim().toLowerCase();
        const repository = req.body?.repository ? String(req.body.repository).trim() : null;
        const branch = String(req.body?.branch || 'main').trim();

        if (!name || !service_name) {
            res.status(400).json({ error: 'Project name and service_name are required' });
            return;
        }

        if (!SERVICE_NAME_PATTERN.test(service_name)) {
            res.status(400).json({
                error: 'Invalid service_name. Use lowercase letters, numbers, dots, underscores, or hyphens.'
            });
            return;
        }

        const [id] = await db('projects').insert({
            name,
            service_name,
            repository,
            branch,
            autostart: 0
        });
        res.status(201).json({ id, success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects/:id/start', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        await startService(project.service_name);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects/:id/stop', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        await stopService(project.service_name);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects/:id/restart', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        await restartService(project.service_name);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects/:id/autostart', async (req, res) => {
    try {
        const { enabled } = req.body;
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        if (enabled) {
            await enableService(project.service_name);
        } else {
            await disableService(project.service_name);
        }

        await db('projects').where('id', req.params.id).update({ autostart: enabled ? 1 : 0 });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects/:id/env', async (req, res) => {
    try {
        const { env_vars } = req.body;
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        await db('projects').where('id', req.params.id).update({ env_vars });

        // Write physical .env file on the server if directory exists
        const projectDir = project.work_dir || `/opt/${project.service_name}`;
        if (fs.existsSync(projectDir)) {
            fs.writeFileSync(path.join(projectDir, '.env'), env_vars || '');
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/system/info', async (_req, res) => {
    try {
        let osName = os.type();
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            const match = osRelease.match(/PRETTY_NAME="([^"]+)"/);
            if (match && match[1]) osName = match[1];
        } catch {}

        let ipv4 = 'UNKNOWN';
        let mac = 'UNKNOWN';
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            const entries = interfaces[name];
            if (!entries) continue;
            for (const iface of entries) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ipv4 = iface.address;
                    mac = iface.mac;
                    break;
                }
            }
            if (ipv4 !== 'UNKNOWN') break;
        }

        let storageTotal = 0;
        try {
            const stats = fs.statfsSync('/');
            storageTotal = stats.blocks * stats.bsize;
        } catch {}

        const cpus = os.cpus();
        const info = {
            hostname: os.hostname(),
            os: osName,
            kernel: os.release(),
            uptime: os.uptime(),
            cpu: cpus[0]?.model || 'Unknown CPU',
            cores: cpus.length,
            memory: os.totalmem(),
            ipv4,
            mac,
            storageTotal
        };
        res.json(info);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
