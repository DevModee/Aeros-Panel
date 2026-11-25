import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { initializeDatabase } from './database/db';
import { apiRouter } from './api';
import { setupWebSocket } from './websockets/logs';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Only trust X-Forwarded-* from a reverse proxy on the same host (Caddy, cloudflared).
// The panel binds 0.0.0.0, so trusting any first hop lets clients spoof req.ip.
app.set('trust proxy', 'loopback');

app.use((_req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    next();
});

const corsOrigin = process.env.CORS_ORIGIN?.trim();
if (corsOrigin) {
    app.use(cors({
        origin: corsOrigin.split(',').map((o) => o.trim()),
        credentials: true
    }));
}

app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    }
}));

app.use('/api', apiRouter);

const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
const frontendIndexHtml = path.join(frontendDistPath, 'index.html');

app.use(express.static(frontendDistPath, {
    index: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        next();
        return;
    }

    if (fs.existsSync(frontendIndexHtml)) {
        res.sendFile(frontendIndexHtml);
        return;
    }

    res.status(503).type('text/plain').send(
        'AerosPanel frontend build not found. Run "npm run build" inside frontend/ to serve the UI from this process.'
    );
});

const server = http.createServer(app);
setupWebSocket(server);

async function startServer() {
    try {
        await initializeDatabase();

        server.listen(PORT, HOST, () => {
            console.log(`AerosPanel listening on http://${HOST}:${PORT}`);
        });
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

startServer();
