import { Router } from 'express';
import { getSystemMetrics } from '../system/sensors';
import { startService, stopService, restartService, enableService, disableService, getServiceStatus } from '../system/systemd';
import { db } from '../database/db';

export const apiRouter = Router();

apiRouter.get('/system/metrics', async (req, res) => {
    try {
        const metrics = await getSystemMetrics();
        res.json(metrics);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/projects', async (req, res) => {
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
        const { name, service_name, repository, branch } = req.body;
        const [id] = await db('projects').insert({ name, service_name, repository, branch });
        res.json({ id });
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
        
        // Escribir el archivo físico en el servidor
        const fs = require('fs');
        const path = require('path');
        const projectDir = `/opt/${project.service_name}`;
        
        if (fs.existsSync(projectDir)) {
            fs.writeFileSync(path.join(projectDir, '.env'), env_vars || '');
        }
        
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects', async (req, res) => {
    try {
        const { name, service_name, repository } = req.body;
        
        await db('projects').insert({
            name,
            service_name,
            repository,
            branch: 'main',
            autostart: 0
        });

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/system/info', async (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');
        
        let osName = os.type();
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            const match = osRelease.match(/PRETTY_NAME="([^"]+)"/);
            if (match) osName = match[1];
        } catch(e) {}
        
        let ipv4 = 'UNKNOWN';
        let mac = 'UNKNOWN';
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
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
        } catch(e) {}

        const info = {
            hostname: os.hostname(),
            os: osName,
            kernel: os.release(),
            uptime: os.uptime(),
            cpu: os.cpus()[0].model,
            cores: os.cpus().length,
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
