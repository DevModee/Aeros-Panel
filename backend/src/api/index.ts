import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSystemMetrics } from '../system/sensors';
import {
    startService,
    stopService,
    restartService,
    enableService,
    disableService,
    getServiceStatus,
    writeSystemdUnit,
    removeSystemdUnit
} from '../system/systemd';
import {
    PROJECT_TEMPLATES,
    generateSystemdUnit,
    getTemplateById,
    validateWorkDir,
    type TemplateId
} from '../system/templates';
import { validateGitBranch, validateRepositoryUrl } from '../system/git';
import { deployProject, isDeployRunning } from '../system/deploy';
import { getRemoteAccessInfo } from '../system/remote';
import { db } from '../database/db';
import { getPublicStatusConfig, updatePublicStatusConfig } from '../database/settings';
import { authRouter } from './auth';
import { publicStatusRouter, invalidatePublicStatusCache } from './publicStatus';
import { webhooksRouter } from './webhooks';
import { generateWebhookSecret } from '../system/webhook';
import { requireAuth } from '../auth/session';
import { requireSameOriginForMutations } from '../auth/origin';

export const apiRouter = Router();

// CSRF defense-in-depth for all state-changing API requests
apiRouter.use(requireSameOriginForMutations);

// Unauthenticated endpoints
apiRouter.get('/health', (_req, res) => {
    res.json({
        ok: true,
        uptime: Math.floor(process.uptime())
    });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/public', publicStatusRouter);
apiRouter.use('/webhooks', webhooksRouter);

// Everything below requires a valid session cookie
apiRouter.use(requireAuth);

apiRouter.get('/settings/public-status', async (_req, res) => {
    try {
        const config = await getPublicStatusConfig();
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.put('/settings/public-status', async (req, res) => {
    try {
        const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined;
        const token = typeof req.body?.token === 'string' ? req.body.token : undefined;
        const updated = await updatePublicStatusConfig({ enabled, token });
        invalidatePublicStatusCache();
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/system/metrics', async (_req, res) => {
    try {
        const metrics = await getSystemMetrics();
        res.json(metrics);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/templates', (_req, res) => {
    res.json(PROJECT_TEMPLATES);
});

apiRouter.post('/templates/preview', (req, res) => {
    try {
        const {
            name = 'My Service',
            service_name = 'my-service',
            template = 'node',
            work_dir,
            exec_start,
            run_user,
            memory_max
        } = req.body || {};

        const result = generateSystemdUnit({
            name: String(name),
            serviceName: String(service_name),
            template: String(template) as TemplateId,
            workDir: work_dir ? String(work_dir) : undefined,
            execStart: exec_start ? String(exec_start) : undefined,
            runUser: run_user ? String(run_user) : undefined,
            memoryMax: memory_max ? String(memory_max) : undefined
        });

        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

apiRouter.get('/projects', async (_req, res) => {
    try {
        const projects = await db('projects').select(
            'id',
            'name',
            'service_name',
            'repository',
            'branch',
            'autostart',
            'use_tailscale',
            'template',
            'work_dir',
            'exec_start',
            'build_cmd',
            'run_user',
            'memory_max',
            'last_deploy_at',
            'webhook_secret'
        );

        const projectsWithStatus = await Promise.all(projects.map(async (p) => {
            const status = await getServiceStatus(p.service_name);
            const { webhook_secret, ...safeProject } = p;
            return {
                ...safeProject,
                has_webhook: Boolean(webhook_secret),
                status,
                deploying: isDeployRunning(p.service_name)
            };
        }));

        res.json(projectsWithStatus);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const serviceNameRaw = String(req.body?.service_name || '').trim();
        const rawRepository = req.body?.repository ? String(req.body.repository).trim() : '';
        const rawBranch = String(req.body?.branch || 'main').trim();
        const templateId = String(req.body?.template || 'custom') as TemplateId;
        const tpl = getTemplateById(templateId);
        const buildCmd = req.body?.build_cmd !== undefined
            ? String(req.body.build_cmd).trim()
            : tpl.defaultBuildCmd;
        const createUnit = req.body?.create_unit !== false;

        let repository: string | null = null;
        let branch: string;
        let config: ReturnType<typeof generateSystemdUnit>['config'];
        let unitContent: string;

        try {
            if (rawRepository) {
                repository = validateRepositoryUrl(rawRepository);
            }
            branch = validateGitBranch(rawBranch);
            const generated = generateSystemdUnit({
                name,
                serviceName: serviceNameRaw,
                template: tpl.id,
                workDir: req.body?.work_dir ? String(req.body.work_dir) : undefined,
                execStart: req.body?.exec_start ? String(req.body.exec_start) : undefined,
                runUser: req.body?.run_user ? String(req.body.run_user) : undefined,
                memoryMax: req.body?.memory_max ? String(req.body.memory_max) : undefined
            });
            config = generated.config;
            unitContent = generated.unitContent;
        } catch (validationError: any) {
            res.status(400).json({ error: validationError.message });
            return;
        }

        const [id] = await db('projects').insert({
            name: config.name,
            service_name: config.serviceName,
            repository,
            branch,
            autostart: 0,
            template: config.template,
            work_dir: config.workDir,
            exec_start: config.execStart,
            build_cmd: buildCmd || null,
            run_user: config.runUser || null,
            memory_max: config.memoryMax || null
        });

        let unitResult: { installed: boolean; unitPath: string; warning?: string } = {
            installed: false,
            unitPath: `/etc/systemd/system/${config.serviceName}.service`
        };

        if (createUnit) {
            if (process.platform === 'linux') {
                try {
                    fs.mkdirSync(config.workDir, { recursive: true });
                } catch {}
            }
            unitResult = await writeSystemdUnit(config.serviceName, unitContent);
        }

        res.status(201).json({
            id,
            success: true,
            unit: {
                ...unitResult,
                content: unitContent
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.delete('/projects/:id', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        if (req.query.removeUnit === '1') {
            await removeSystemdUnit(project.service_name);
        }

        await db('projects').where('id', req.params.id).del();
        res.json({ success: true });
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

apiRouter.post('/projects/:id/deploy', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        if (isDeployRunning(project.service_name)) {
            return res.status(409).json({ error: 'Deployment already in progress for this project' });
        }

        void deployProject(project);
        res.status(202).json({ started: true, service_name: project.service_name });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects/:id/webhook', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        const secret = generateWebhookSecret();
        await db('projects').where('id', req.params.id).update({ webhook_secret: secret });

        res.setHeader('Cache-Control', 'no-store');
        res.json({
            enabled: true,
            secret,
            path: `/api/webhooks/github/${project.id}`
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.delete('/projects/:id/webhook', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        await db('projects').where('id', req.params.id).update({ webhook_secret: null });
        res.json({ enabled: false });
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

apiRouter.get('/projects/:id/env', async (req, res) => {
    try {
        const project = await db('projects')
            .where('id', req.params.id)
            .select('id', 'env_vars')
            .first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        res.setHeader('Cache-Control', 'no-store');
        res.json({ env_vars: project.env_vars || '' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/projects/:id/env', async (req, res) => {
    try {
        const envVars = typeof req.body?.env_vars === 'string' ? req.body.env_vars : '';
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        let projectDir: string;
        try {
            projectDir = validateWorkDir(project.work_dir || `/opt/${project.service_name}`);
        } catch (validationError: any) {
            res.status(400).json({ error: validationError.message });
            return;
        }

        await db('projects').where('id', req.params.id).update({ env_vars: envVars });

        // Write physical .env file on the server if directory exists
        if (fs.existsSync(projectDir)) {
            fs.writeFileSync(path.join(projectDir, '.env'), envVars, { mode: 0o600 });
        }

        res.setHeader('Cache-Control', 'no-store');
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
        const panelPort = Number(process.env.PORT) || 3000;
        const remoteAccess = await getRemoteAccessInfo(panelPort);
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
            storageTotal,
            panelPort,
            remoteAccess
        };
        res.json(info);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
