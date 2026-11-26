import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, ADMIN_USER, ADMIN_PASSWORD } from './lib.js';

// Login limiter allows 10 failed attempts per IP per 15 minutes. Fire a concurrent burst of bad
// passwords: if the limit is enforced only after the async lookup, the whole burst gets through.
// Run against a fresh server: afterwards 127.0.0.1 stays locked out.
const passedLimiter = new Counter('login_attempts_not_limited');
const limited = new Counter('login_attempts_limited');

const BURST = Number(__ENV.BURST || 50);

export const options = {
    scenarios: {
        burst: { executor: 'per-vu-iterations', vus: BURST, iterations: 1, exec: 'burst' },
        lockedOut: { executor: 'per-vu-iterations', vus: 1, iterations: 1, exec: 'lockedOut', startTime: '5s' }
    },
    thresholds: {
        login_attempts_not_limited: ['count<=10'],
        checks: ['rate==1']
    }
};

http.setResponseCallback(http.expectedStatuses(401, 429));

export function burst() {
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username: ADMIN_USER, password: `wrong-${__VU}-password` }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    check(res, { 'bad login is 401 or 429': (r) => r.status === 401 || r.status === 429 });
    if (res.status === 429) limited.add(1);
    else passedLimiter.add(1);
}

export function lockedOut() {
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    check(res, { 'correct password still 429 while locked': (r) => r.status === 429 });
}
