#!/usr/bin/env bash
# Run k6 scripts against a throwaway AerosPanel instance.
# Usage: tests/k6/run.sh read.js mutations.js ...   (needs `npm run build` in backend/ and k6 on PATH or $K6)
# Each script gets a fresh server and database so the in-memory login rate limiter starts empty.
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
K6="${K6:-k6}"
PORT="${PORT:-3099}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

status=0
for script in "$@"; do
    name="$(basename "$script" .js)"
    rm -f "$TMP"/aeros.db*
    log="$TMP/server-$name.log"

    PORT="$PORT" HOST=127.0.0.1 AEROS_DB_PATH="$TMP/aeros.db" \
    AEROS_ADMIN_USER=admin AEROS_ADMIN_PASSWORD="${ADMIN_PASSWORD:-k6-load-password}" \
        node --expose-gc --require "$ROOT/tests/k6/memprobe.cjs" "$ROOT/backend/dist/index.js" >"$log" 2>&1 &
    server=$!

    for _ in $(seq 1 50); do
        curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break
        sleep 0.2
    done

    "$K6" run --quiet -e BASE_URL="http://127.0.0.1:$PORT" "$ROOT/tests/k6/${name}.js" || status=1

    # Let one post-load sample land so idle memory shows next to the peak.
    sleep 6
    kill "$server" 2>/dev/null
    wait "$server" 2>/dev/null
    echo "== $name: server memory (first sample, last sample) =="
    grep '\[mem\]' "$log" | sed -n '1p;$p'
    grep -v '\[mem\]' "$log" | grep -v 'listening\|Initialized admin' | head -20
done

exit $status
