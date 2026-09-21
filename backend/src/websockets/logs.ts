import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import { Server } from 'http';

export function setupWebSocket(server: Server) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket, req) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const serviceName = url.searchParams.get('service');

        if (!serviceName) {
            ws.close();
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

        ws.on('close', () => {
            journalctl.kill();
        });

        journalctl.on('close', () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send('SYSTEM: Log stream closed.');
                ws.close();
            }
        });
    });
}
