import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import { Server } from 'http';
import { getSessionTokenFromRequest, validateSessionToken } from '../auth/session';

const SERVICE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function setupWebSocket(server: Server) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', async (ws: WebSocket, req) => {
        try {
            const token = getSessionTokenFromRequest(req);
            const user = await validateSessionToken(token);
            if (!user) {
                ws.close(4401, 'Unauthorized');
                return;
            }
        } catch {
            ws.close(4401, 'Unauthorized');
            return;
        }

        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const serviceName = url.searchParams.get('service');

        if (!serviceName || !SERVICE_NAME_PATTERN.test(serviceName)) {
            ws.close(4400, 'Invalid service name');
            return;
        }

        const journalctl = spawn('journalctl', ['-u', serviceName, '-f', '-n', '100']);

        journalctl.stdout.on('data', (data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data.toString());
            }
        });

        journalctl.stderr.on('data', (data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(`ERROR: ${data.toString()}`);
            }
        });

        journalctl.on('error', (err) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(`SYSTEM: journalctl unavailable (${err.message}).`);
            }
        });

        ws.on('close', () => {
            journalctl.kill();
        });

        journalctl.on('close', () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send('SYSTEM: Log stream closed.');
            }
        });
    });
}
