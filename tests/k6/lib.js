import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3099';
export const WS_URL = BASE_URL.replace(/^http/, 'ws');
export const ADMIN_USER = __ENV.ADMIN_USER || 'admin';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'k6-load-password';

// 10 -> 50 -> 100 VUs. STAGE_SECONDS shortens or stretches every step.
const step = `${__ENV.STAGE_SECONDS || 30}s`;
export const RAMP = [
    { duration: step, target: 10 },
    { duration: step, target: 50 },
    { duration: step, target: 100 },
    { duration: step, target: 100 },
    { duration: '10s', target: 0 }
];

export const THRESHOLDS = {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    checks: ['rate>0.99']
};

export function login() {
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    const cookie = res.cookies.aeros_session;
    if (!check(res, { 'login 200': (r) => r.status === 200 }) || !cookie || !cookie.length) {
        fail(`login failed: ${res.status}`);
    }
    return cookie[0].value;
}

export function authHeaders(token, extra = {}) {
    return { headers: { Cookie: `aeros_session=${token}`, ...extra } };
}
