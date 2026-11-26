import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, RAMP, THRESHOLDS, login, authHeaders } from './lib.js';

// Only requests that cannot change the host: unauthenticated and cross-origin mutations must be
// rejected, and the authenticated ones either render a preview or target a project that does not exist.
export const options = { stages: RAMP, thresholds: THRESHOLDS };

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const expect = (...codes) => ({ responseCallback: http.expectedStatuses(...codes) });

export function setup() {
    return { token: login() };
}

export default function ({ token }) {
    const body = JSON.stringify({ name: 'k6', service_name: 'k6-load', template: 'node' });

    const unauthenticated = [
        http.post(`${BASE_URL}/api/projects`, body, { headers: JSON_HEADERS, ...expect(401) }),
        http.post(`${BASE_URL}/api/projects/1/restart`, null, expect(401)),
        http.del(`${BASE_URL}/api/projects/1`, null, expect(401)),
        http.put(`${BASE_URL}/api/settings/public-status`, '{}', { headers: JSON_HEADERS, ...expect(401) }),
        http.post(`${BASE_URL}/api/auth/password`, '{}', { headers: JSON_HEADERS, ...expect(401) })
    ];
    for (const res of unauthenticated) {
        check(res, { 'mutation without session is 401': (r) => r.status === 401 });
    }

    const crossOrigin = http.post(`${BASE_URL}/api/templates/preview`, body, {
        headers: { ...authHeaders(token).headers, ...JSON_HEADERS, Origin: 'http://evil.example' },
        ...expect(403)
    });
    check(crossOrigin, { 'cross-origin mutation is 403': (r) => r.status === 403 });

    const crossSite = http.post(`${BASE_URL}/api/projects/1/stop`, null, {
        headers: { ...authHeaders(token).headers, 'Sec-Fetch-Site': 'cross-site' },
        ...expect(403)
    });
    check(crossSite, { 'cross-site fetch is 403': (r) => r.status === 403 });

    const preview = http.post(`${BASE_URL}/api/templates/preview`, body, {
        headers: { ...authHeaders(token).headers, ...JSON_HEADERS, Origin: BASE_URL }
    });
    check(preview, { 'authenticated preview 200': (r) => r.status === 200 && r.body.includes('[Service]') });

    const missing = http.post(`${BASE_URL}/api/projects/999999/restart`, null, {
        ...authHeaders(token),
        ...expect(404)
    });
    check(missing, { 'unknown project is 404': (r) => r.status === 404 });

    sleep(1);
}
