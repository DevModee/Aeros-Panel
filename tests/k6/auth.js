import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, RAMP, THRESHOLDS, ADMIN_USER, ADMIN_PASSWORD, login, authHeaders } from './lib.js';

// Status checks ramp 10 -> 100 VUs. Full login/logout cycles run at a fixed rate on top,
// since every login is a scrypt hash (16 MB, threadpool bound) and nobody logs in 100 times a second.
export const options = {
    scenarios: {
        status: { executor: 'ramping-vus', stages: RAMP, exec: 'status' },
        cycle: {
            executor: 'ramping-arrival-rate',
            exec: 'cycle',
            startRate: 1,
            timeUnit: '1s',
            preAllocatedVUs: 20,
            stages: [
                { duration: RAMP[0].duration, target: 2 },
                { duration: RAMP[1].duration, target: 5 },
                { duration: RAMP[2].duration, target: 10 },
                { duration: RAMP[3].duration, target: 10 }
            ]
        }
    },
    thresholds: {
        ...THRESHOLDS,
        'http_req_duration{endpoint:login}': ['p(95)<1500']
    }
};

export function setup() {
    return { token: login() };
}

export function status({ token }) {
    const anon = http.get(`${BASE_URL}/api/auth/status`);
    check(anon, {
        'anon status not authenticated': (r) => r.status === 200 && r.json('authenticated') === false,
        'setup already done': (r) => r.json('setupRequired') === false
    });

    const authed = http.get(`${BASE_URL}/api/auth/status`, authHeaders(token));
    check(authed, { 'session status authenticated': (r) => r.status === 200 && r.json('authenticated') === true });

    sleep(1);
}

export function cycle() {
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
        { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'login' } }
    );
    if (!check(res, { 'login 200': (r) => r.status === 200 })) return;
    const token = res.cookies.aeros_session[0].value;

    const out = http.post(`${BASE_URL}/api/auth/logout`, null, authHeaders(token));
    check(out, { 'logout 200': (r) => r.status === 200 });

    const after = http.get(`${BASE_URL}/api/auth/status`, authHeaders(token));
    check(after, { 'session revoked after logout': (r) => r.json('authenticated') === false });
}
