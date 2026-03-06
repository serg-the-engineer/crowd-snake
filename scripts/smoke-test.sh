#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

export DEMO_WEB_BIND_ADDRESS="${DEMO_WEB_BIND_ADDRESS:-127.0.0.1}"
export DEMO_WEB_PORT="${DEMO_WEB_PORT:-18081}"
export DEMO_BASIC_AUTH_USERNAME="${DEMO_BASIC_AUTH_USERNAME:-ci}"
export DEMO_BASIC_AUTH_PASSWORD="${DEMO_BASIC_AUTH_PASSWORD:-ci-password}"
export DEMO_POSTGRES_PASSWORD="${DEMO_POSTGRES_PASSWORD:-ci-password}"

compose_cmd=(docker compose --project-name crowd-snake-smoke)

cleanup() {
    "${compose_cmd[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup
"${compose_cmd[@]}" config -q
"${compose_cmd[@]}" up --build -d

for _ in $(seq 1 24); do
    if curl --fail --silent --show-error "http://127.0.0.1:${DEMO_WEB_PORT}/_healthz" >/dev/null; then
        break
    fi
    sleep 2
done

curl --fail --silent --show-error "http://127.0.0.1:${DEMO_WEB_PORT}/_healthz" >/dev/null

status_code="$(
    curl --silent --output /dev/null --write-out "%{http_code}" "http://127.0.0.1:${DEMO_WEB_PORT}/"
)"
[ "${status_code}" = "401" ]

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    "http://127.0.0.1:${DEMO_WEB_PORT}/" \
    | grep -q 'id="game-board"'

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    "http://127.0.0.1:${DEMO_WEB_PORT}/version.json" \
    | python3 -c 'import json,sys; payload=json.load(sys.stdin); assert payload["name"] == "crowd-snake"; assert payload["version"] == "0.2.0"'

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    "http://127.0.0.1:${DEMO_WEB_PORT}/api/state" \
    | python3 -c 'import json,sys; payload=json.load(sys.stdin); assert payload["bestScore"] == 0'

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    --header "Content-Type: application/json" \
    --data '{"bestScore": 17}' \
    "http://127.0.0.1:${DEMO_WEB_PORT}/api/state" \
    | python3 -c 'import json,sys; payload=json.load(sys.stdin); assert payload["bestScore"] == 17'

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    "http://127.0.0.1:${DEMO_WEB_PORT}/api/state" \
    | python3 -c 'import json,sys; payload=json.load(sys.stdin); assert payload["bestScore"] == 17'
