import { Router, type Request } from 'express';
import { db } from '../database/db';
import { deployProject, isDeployRunning } from '../system/deploy';
import { isMatchingPushRef, verifyGitHubSignature } from '../system/webhook';

type RawBodyRequest = Request & { rawBody?: Buffer };

export const webhooksRouter = Router();

webhooksRouter.post('/github/:id', async (req: RawBodyRequest, res) => {
    try {
        const projectId = Number(req.params.id);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            res.status(400).json({ error: 'Invalid project ID' });
            return;
        }

        const project = await db('projects').where('id', projectId).first();
        if (!project || !project.webhook_secret) {
            res.status(404).json({ error: 'Webhook not configured for this project' });
            return;
        }

        const rawBody = req.rawBody;
        const signatureHeader = req.header('x-hub-signature-256');
        if (!rawBody || !verifyGitHubSignature(rawBody, signatureHeader, project.webhook_secret)) {
            res.status(401).json({ error: 'Invalid webhook signature' });
            return;
        }

        const event = (req.header('x-github-event') || '').trim().toLowerCase();
        if (event === 'ping') {
            res.status(200).json({ ok: true, event: 'ping' });
            return;
        }

        if (event !== 'push') {
            res.status(200).json({ ignored: true, reason: `Ignored event: ${event || 'unknown'}` });
            return;
        }

        if (!isMatchingPushRef(req.body, project.branch)) {
            res.status(200).json({ ignored: true, reason: 'Push branch does not match configured branch' });
            return;
        }

        if (isDeployRunning(project.service_name)) {
            res.status(409).json({ error: 'Deployment already in progress for this project' });
            return;
        }

        void deployProject(project);
        res.status(202).json({ started: true, service_name: project.service_name });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
