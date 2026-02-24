#!/usr/bin/env bash
set -euo pipefail

node dist/index.mjs &
pid=$!

# Wait until workflows endpoint is reachable (h2c).
until curl -sS --http2-prior-knowledge http://127.0.0.1:9080 >/dev/null 2>&1; do
  sleep 0.5
done

# Re-register deployment on every hot reload (retry to avoid startup races).
registered=0
for _ in $(seq 1 30); do
  status=$(curl -s -o /tmp/restate-register.out -w "%{http_code}" \
    -X POST http://127.0.0.1:9070/deployments \
    -H 'content-type: application/json' \
    --data '{"uri":"http://127.0.0.1:9080","force":true}')

  if [[ "$status" == "200" || "$status" == "201" || "$status" == "409" ]]; then
    echo "Registered workflows deployment to Restate (force=true)"
    registered=1
    break
  fi

  echo "Register attempt failed (status $status)" >&2
  cat /tmp/restate-register.out >&2 || true
  echo >&2
  sleep 1
done

if [[ "$registered" != "1" ]]; then
  echo "WARN: Failed to register deployment after retries (status $status)" >&2
  cat /tmp/restate-register.out >&2 || true
fi

wait "$pid"
