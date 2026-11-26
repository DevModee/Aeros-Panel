import { WebSocket } from 'k6/websockets';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, WS_URL, RAMP, login } from './lib.js';

// Concurrent log streams. Each authenticated socket spawns `journalctl -u <service> -f` on Linux,
// so the service name is one that does not exist. Every few iterations an unauthenticated socket
// must be closed by the server with 4401.
const opened = new Counter('ws_opened');
const rejected = new Counter('ws_unauth_rejected');
const leakedUnauth = new Counter('ws_unauth_not_rejected');
const firstMessage = new Trend('ws_first_message', true);

const HOLD_MS = Number(__ENV.WS_HOLD_MS || 5000);

export const options = {
    stages: RAMP,
    thresholds: {
        ws_connecting: ['p(95)<500'],
        ws_unauth_not_rejected: ['count==0'],
        checks: ['rate>0.99']
    }
};

export function setup() {
    return { token: login() };
}

function streamLogs(token) {
    const started = Date.now();
    let gotMessage = false;
    const ws = new WebSocket(`${WS_URL}/?service=k6-load-missing`, null, {
        headers: { Cookie: `aeros_session=${token}`, Origin: BASE_URL }
    });

    ws.onopen = () => {
        opened.add(1);
        setTimeout(() => ws.close(), HOLD_MS);
    };
    ws.onmessage = () => {
        if (!gotMessage) firstMessage.add(Date.now() - started);
        gotMessage = true;
    };
    ws.onclose = (e) => {
        check(e, { 'stream closed by client': (ev) => ev.code === 1000 || ev.code === 1005 });
    };
    ws.onerror = (e) => check(e, { 'no socket error': () => false });
}

function unauthenticated() {
    const ws = new WebSocket(`${WS_URL}/?service=k6-load-missing`, null, { headers: { Origin: BASE_URL } });
    const guard = setTimeout(() => {
        leakedUnauth.add(1);
        ws.close();
    }, 3000);
    ws.onclose = (e) => {
        clearTimeout(guard);
        if (e.code === 4401) rejected.add(1);
        check(e, { 'unauthenticated socket closed with 4401': (ev) => ev.code === 4401 });
    };
}

export default function ({ token }) {
    if (__ITER % 5 === 4) {
        unauthenticated();
    } else {
        streamLogs(token);
    }
}
