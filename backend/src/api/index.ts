import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getCpuSummary, getSystemMetrics } from '../system/sensors';
import {
    assertManageableServiceName,
    startService,
    stopService,
    restartService,
    enableService,
    disableService,
    getServiceSnapshot,
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
import { deployProject, getDeploymentAction, isDeployRunning, rollbackProject, validateGitCommit } from '../system/deploy';
import { getRemoteAccessInfo, invalidateRemoteAccessInfo } from '../system/remote';
import { applyCaddyRoute, detectCaddy, removeCaddyRoute } from '../system/caddy';
import {
    BACKUP_DIR,
    getBackupTimerStatus,
    removeBackupUnits,
    runBackupNow,
    setBackupTimerEnabled,
    validateBackupName,
    validateBackupPaths,
    validateBackupSchedule,
    writeBackupUnits
} from '../system/backups';
import {
    ALERTS_SUPPORTED,
    applyAlertConfiguration,
    readAlertConfiguration,
    sendAlert,
    setProjectFailureAlert,
    validateAlertProvider,
    validateAlertWebhook
} from '../system/alerts';
import { db } from '../database/db';
import { getAlertSettings, getPublicStatusConfig, updateAlertSettings, updatePublicStatusConfig } from '../database/settings';
import { authRouter } from './auth';
import { publicStatusRouter, invalidatePublicStatusCache } from './publicStatus';
import { webhooksRouter } from './webhooks';
import { generateWebhookSecret } from '../system/webhook';
import { requireAuth } from '../auth/session';
import { requireSameOriginForMutations } from '../auth/origin';

export const apiRouter = Router();

let pendingAlertChanges: Promise<unknown> = Promise.resolve();

function withAlertChanges<T>(change: () => Promise<T>): Promise<T> {
    const next = pendingAlertChanges.then(change);
    pendingAlertChanges = next.catch(() => {});
    return next;
}

function canConfigureProjectAlerts(serviceName: string): boolean {
    try {
        assertManageableServiceName(serviceName);
        return true;
    } catch {
        return false;
    }
}

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

apiRouter.get('/settings/alerts', async (_req, res) => {
    try {
        const settings = await getAlertSettings();
        const configuration = await readAlertConfiguration();
        res.json({ ...settings, supported: ALERTS_SUPPORTED, configured: Boolean(configuration) });
    } catch {
        res.status(500).json({ error: 'Could not read alert settings.' });
    }
});

apiRouter.put('/settings/alerts', async (req, res) => {
    if (!ALERTS_SUPPORTED) return res.status(409).json({ error: 'Service alerts require Linux with systemd.' });
    const { enabled, provider: requestedProvider, webhookUrl } = req.body ?? {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'Set enabled to true or false.' });

    let provider: ReturnType<typeof validateAlertProvider>;
    let newUrl: string | undefined;
    try {
        provider = validateAlertProvider(requestedProvider);
        if (webhookUrl !== undefined) newUrl = validateAlertWebhook(webhookUrl, provider).href;
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const updated = await withAlertChanges(async () => {
            const previous = await readAlertConfiguration();
            const url = newUrl ?? (previous?.provider === provider ? previous.webhookUrl : undefined);
            if ((enabled || previous) && !url) return null;

            const settings = { enabled, provider };
            const next = url ? { ...settings, webhookUrl: url } : null;
            const services: string[] = (await db('projects').pluck('service_name')).filter(canConfigureProjectAlerts);
            try {
                await applyAlertConfiguration(next, services);
                await updateAlertSettings(settings);
            } catch (error) {
                await applyAlertConfiguration(previous, services).catch(() => {});
                throw error;
            }
            return { ...settings, supported: true, configured: Boolean(next) };
        });
        if (!updated) return res.status(400).json({ error: 'Enter a webhook URL for the selected provider.' });
        res.json(updated);
    } catch {
        res.status(500).json({ error: 'Could not apply alert settings.' });
    }
});

apiRouter.post('/settings/alerts/test', async (_req, res) => {
    if (!ALERTS_SUPPORTED) return res.status(409).json({ error: 'Service alerts require Linux with systemd.' });
    let configuration: Awaited<ReturnType<typeof readAlertConfiguration>>;
    try {
        configuration = await readAlertConfiguration();
    } catch {
        return res.status(500).json({ error: 'Could not read alert settings.' });
    }
    if (!configuration) return res.status(409).json({ error: 'Save a webhook URL before testing alerts.' });
    try {
        await sendAlert(configuration);
        res.json({ ok: true });
    } catch (error: any) {
        res.status(502).json({ error: error.message });
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
            memory_max,
            cpu_quota
        } = req.body || {};

        const result = generateSystemdUnit({
            name: String(name),
            serviceName: String(service_name),
            template: String(template) as TemplateId,
            workDir: work_dir ? String(work_dir) : undefined,
            execStart: exec_start ? String(exec_start) : undefined,
            runUser: run_user ? String(run_user) : undefined,
            memoryMax: memory_max ? String(memory_max) : undefined,
            cpuQuota: cpu_quota ? String(cpu_quota) : undefined
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
            'cpu_quota',
            'last_deploy_at',
            'current_commit',
            'previous_commit',
            'webhook_secret',
            'domain',
            'port'
        );

        const projectsWithStatus = await Promise.all(projects.map(async (p) => {
            const snapshot = await getServiceSnapshot(p.service_name).catch(async () => ({
                status: await getServiceStatus(p.service_name),
                metrics: null
            }));
            const { webhook_secret, ...safeProject } = p;
            return {
                ...safeProject,
                has_webhook: Boolean(webhook_secret),
                ...snapshot,
                deploying: isDeployRunning(p.service_name),
                deployment_action: getDeploymentAction(p.service_name)
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
                memoryMax: req.body?.memory_max ? String(req.body.memory_max) : undefined,
                cpuQuota: req.body?.cpu_quota ? String(req.body.cpu_quota) : undefined
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
            memory_max: config.memoryMax || null,
            cpu_quota: config.cpuQuota || null
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

        if (ALERTS_SUPPORTED) {
            try {
                await withAlertChanges(async () => {
                    const { enabled } = await getAlertSettings();
                    if (enabled) await setProjectFailureAlert(config.serviceName, true);
                });
            } catch {
                unitResult.warning = [unitResult.warning, 'Could not install failure alerts for this service.']
                    .filter(Boolean).join(' ');
            }
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
        const deleted = await withAlertChanges(async () => {
            const project = await db('projects').where('id', req.params.id).first();
            if (!project) return false;

            if (ALERTS_SUPPORTED && canConfigureProjectAlerts(project.service_name)) {
                await setProjectFailureAlert(project.service_name, false);
            }
            if (req.query.removeUnit === '1') {
                await removeSystemdUnit(project.service_name);
            }

            if (project.domain) {
                await removeCaddyRoute(project.service_name).catch(() => {});
                invalidateRemoteAccessInfo();
            }

            await db('projects').where('id', req.params.id).del();
            return true;
        });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
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

apiRouter.post('/projects/:id/rollback', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });
        if (isDeployRunning(project.service_name)) {
            return res.status(409).json({ error: 'Deployment already in progress for this project' });
        }

        let target: string;
        try {
            target = validateGitCommit(project.previous_commit);
        } catch {
            return res.status(409).json({ error: 'No previous deploy commit is available' });
        }
        if (req.body?.commit !== undefined && req.body.commit !== target) {
            return res.status(409).json({ error: 'The rollback commit changed. Refresh the project and try again.' });
        }

        void rollbackProject(project);
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

apiRouter.get('/caddy/status', async (_req, res) => {
    try {
        const info = await detectCaddy();
        res.json(info);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.put('/projects/:id/domain', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        const rawDomain = typeof req.body?.domain === 'string' ? req.body.domain : '';
        const rawPort = req.body?.port;

        let applied: { domain: string; port: number; snippetPath: string };
        try {
            applied = await applyCaddyRoute(project.service_name, rawDomain, rawPort);
            invalidateRemoteAccessInfo();
        } catch (error: any) {
            res.status(400).json({ error: error.message });
            return;
        }

        await db('projects').where('id', req.params.id).update({
            domain: applied.domain,
            port: applied.port
        });

        res.json({ success: true, domain: applied.domain, port: applied.port });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.delete('/projects/:id/domain', async (req, res) => {
    try {
        const project = await db('projects').where('id', req.params.id).first();
        if (!project) return res.status(404).json({ error: 'Not found' });

        await removeCaddyRoute(project.service_name);
        invalidateRemoteAccessInfo();
        await db('projects').where('id', req.params.id).update({
            domain: null,
            port: null
        });

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.get('/backups', async (_req, res) => {
    try {
        const jobs = await db('backup_jobs').select('*').orderBy('id', 'desc');
        const enriched = await Promise.all(jobs.map(async (job) => {
            let paths: string[] = [];
            try {
                const parsed = JSON.parse(job.paths);
                if (Array.isArray(parsed)) paths = parsed;
            } catch {}
            const status = await getBackupTimerStatus(job.name);
            return {
                id: job.id,
                name: job.name,
                paths,
                schedule: job.schedule,
                enabled: Boolean(job.enabled),
                status,
                destination: BACKUP_DIR,
                created_at: job.created_at
            };
        }));

        res.json(enriched);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/backups', async (req, res) => {
    try {
        const rawName = String(req.body?.name || '');
        const rawSchedule = req.body?.schedule ? String(req.body.schedule) : 'daily';
        const rawPaths = Array.isArray(req.body?.paths)
            ? req.body.paths.map((p: unknown) => String(p))
            : [];
        const enableNow = Boolean(req.body?.enabled);

        let name: string;
        let schedule: string;
        let paths: string[];
        try {
            name = validateBackupName(rawName);
            schedule = validateBackupSchedule(rawSchedule);
            paths = validateBackupPaths(rawPaths);
        } catch (validationError: any) {
            res.status(400).json({ error: validationError.message });
            return;
        }

        const unitResult = await writeBackupUnits({ name, paths, schedule });
        if (enableNow && unitResult.installed) {
            await setBackupTimerEnabled(name, true);
        }

        const [id] = await db('backup_jobs').insert({
            name,
            paths: JSON.stringify(paths),
            schedule,
            enabled: enableNow && unitResult.installed ? 1 : 0,
            created_at: Date.now()
        });

        res.status(201).json({
            id,
            name,
            paths,
            schedule,
            enabled: enableNow && unitResult.installed,
            unitName: unitResult.unitName,
            installed: unitResult.installed,
            warning: unitResult.warning
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/backups/:id/toggle', async (req, res) => {
    try {
        const job = await db('backup_jobs').where('id', req.params.id).first();
        if (!job) return res.status(404).json({ error: 'Not found' });

        const enabled = Boolean(req.body?.enabled);
        await setBackupTimerEnabled(job.name, enabled);
        await db('backup_jobs').where('id', req.params.id).update({ enabled: enabled ? 1 : 0 });

        res.json({ success: true, enabled });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/backups/:id/run', async (req, res) => {
    try {
        const job = await db('backup_jobs').where('id', req.params.id).first();
        if (!job) return res.status(404).json({ error: 'Not found' });

        await runBackupNow(job.name);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.delete('/backups/:id', async (req, res) => {
    try {
        const job = await db('backup_jobs').where('id', req.params.id).first();
        if (!job) return res.status(404).json({ error: 'Not found' });

        await removeBackupUnits(job.name);
        await db('backup_jobs').where('id', req.params.id).del();
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

// Host facts rarely change, but os.networkInterfaces() and the sync fs calls block the event loop.
const HOST_FACTS_TTL_MS = 30_000;
let cachedHostFacts: { at: number; osName: string; ipv4: string; mac: string; storageTotal: number } | null = null;

function readHostFacts() {
    const now = Date.now();
    if (cachedHostFacts && now - cachedHostFacts.at < HOST_FACTS_TTL_MS) {
        return cachedHostFacts;
    }

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

    cachedHostFacts = { at: now, osName, ipv4, mac, storageTotal };
    return cachedHostFacts;
}

apiRouter.get('/system/info', async (_req, res) => {
    try {
        const { osName, ipv4, mac, storageTotal } = readHostFacts();
        const cpu = getCpuSummary();
        const panelPort = Number(process.env.PORT) || 3000;
        const remoteAccess = await getRemoteAccessInfo(panelPort);
        const info = {
            hostname: os.hostname(),
            os: osName,
            kernel: os.release(),
            uptime: os.uptime(),
            cpu: cpu.model,
            cores: cpu.cores,
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
