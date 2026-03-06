#!/usr/bin/env bash
set -euo pipefail

app_dir="${1:-$(pwd)}"
cd "${app_dir}"

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi

docker compose config -q
docker compose up -d --build --remove-orphans

health_url="http://127.0.0.1:${DEMO_WEB_PORT:-8081}/_healthz"
state_url="http://127.0.0.1:${DEMO_WEB_PORT:-8081}/api/state"

for _ in $(seq 1 24); do
    if curl --fail --silent --show-error "${health_url}" >/dev/null; then
        break
    fi
    sleep 5
done

curl --fail --silent --show-error "${health_url}" >/dev/null

if [ -n "${DEMO_BASIC_AUTH_USERNAME:-}" ] && [ -n "${DEMO_BASIC_AUTH_PASSWORD:-}" ]; then
    curl --fail --silent --show-error \
        --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
        "${state_url}" >/dev/null
else
    curl --fail --silent --show-error "${state_url}" >/dev/null
fi

docker compose ps
