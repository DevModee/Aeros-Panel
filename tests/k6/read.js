import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, RAMP, THRESHOLDS, login, authHeaders } from './lib.js';

export const options = {
    stages: RAMP,
    thresholds: {
        ...THRESHOLDS,
        'http_req_duration{endpoint:projects}': ['p(95)<500'],
        'http_req_duration{endpoint:metrics}': ['p(95)<500'],
        'http_req_duration{endpoint:info}': ['p(95)<500']
    }
};

export function setup() {
    return { token: login() };
}

function get(path, token, endpoint) {
    const params = authHeaders(token);
    params.tags = { endpoint };
    return http.get(`${BASE_URL}${path}`, params);
}

export default function ({ token }) {
    const projects = get('/api/projects', token, 'projects');
    check(projects, { 'projects 200 array': (r) => r.status === 200 && Array.isArray(r.json()) });

    const metrics = get('/api/system/metrics', token, 'metrics');
    check(metrics, { 'metrics 200': (r) => r.status === 200 && r.json('memory.total') > 0 });

    const info = get('/api/system/info', token, 'info');
    check(info, { 'info 200': (r) => r.status === 200 && Boolean(r.json('remoteAccess')) });

    // Dashboard refresh cadence is seconds, not milliseconds.
    sleep(1);
}
