#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

export DEMO_WEB_BIND_ADDRESS="${DEMO_WEB_BIND_ADDRESS:-${SYMPHONY_DOCKER_BIND_ADDRESS:-127.0.0.1}}"
export DEMO_WEB_PORT="${DEMO_WEB_PORT:-${SYMPHONY_DOCKER_PUBLISHED_PORT:-18081}}"
export DEMO_BASIC_AUTH_USERNAME="${DEMO_BASIC_AUTH_USERNAME:-ci}"
export DEMO_BASIC_AUTH_PASSWORD="${DEMO_BASIC_AUTH_PASSWORD:-ci-password}"
export DEMO_POSTGRES_PASSWORD="${DEMO_POSTGRES_PASSWORD:-ci-password}"
export DEMO_SMOKE_TARGET_HOST="${DEMO_SMOKE_TARGET_HOST:-${SYMPHONY_DOCKER_TARGET_HOST:-127.0.0.1}}"
export DEMO_SMOKE_TARGET_PORT="${DEMO_SMOKE_TARGET_PORT:-${SYMPHONY_DOCKER_TARGET_PORT:-${DEMO_WEB_PORT}}}"
export DEMO_SMOKE_COMPOSE_PROJECT_NAME="${DEMO_SMOKE_COMPOSE_PROJECT_NAME:-${SYMPHONY_DOCKER_COMPOSE_PROJECT_NAME:-crowd-snake-smoke}}"

print_effective_config() {
    echo "smoke-test config: publish=${DEMO_WEB_BIND_ADDRESS}:${DEMO_WEB_PORT} target=${DEMO_SMOKE_TARGET_HOST}:${DEMO_SMOKE_TARGET_PORT} compose_project=${DEMO_SMOKE_COMPOSE_PROJECT_NAME}"
}

fail_config() {
    echo "$1" >&2
    print_effective_config >&2
    exit 1
}

is_loopback_host() {
    [[ "$1" == "127.0.0.1" || "$1" == "localhost" ]]
}

if ! [[ "${DEMO_WEB_PORT}" =~ ^[0-9]+$ ]]; then
    fail_config "DEMO_WEB_PORT must be numeric."
fi

if ! [[ "${DEMO_SMOKE_TARGET_PORT}" =~ ^[0-9]+$ ]]; then
    fail_config "DEMO_SMOKE_TARGET_PORT must be numeric."
fi

if [[ "${DEMO_SMOKE_TARGET_HOST}" == "host.docker.internal" && "${DEMO_WEB_BIND_ADDRESS}" != "0.0.0.0" ]]; then
    fail_config "DEMO_WEB_BIND_ADDRESS=${DEMO_WEB_BIND_ADDRESS} is incompatible with DEMO_SMOKE_TARGET_HOST=host.docker.internal; publish on 0.0.0.0 for managed runner smoke tests."
fi

if [[ "${DEMO_SMOKE_TARGET_HOST}" == "host.docker.internal" && "${DEMO_SMOKE_TARGET_PORT}" != "${DEMO_WEB_PORT}" ]]; then
    fail_config "DEMO_SMOKE_TARGET_PORT=${DEMO_SMOKE_TARGET_PORT} must match DEMO_WEB_PORT=${DEMO_WEB_PORT} when targeting host.docker.internal."
fi

if ! is_loopback_host "${DEMO_SMOKE_TARGET_HOST}" && [[ "${DEMO_WEB_BIND_ADDRESS}" == "127.0.0.1" ]]; then
    fail_config "DEMO_WEB_BIND_ADDRESS=127.0.0.1 is unreachable from DEMO_SMOKE_TARGET_HOST=${DEMO_SMOKE_TARGET_HOST}; use DEMO_WEB_BIND_ADDRESS=0.0.0.0 for managed runner smoke tests."
fi

compose_cmd=(docker compose --project-name "${DEMO_SMOKE_COMPOSE_PROJECT_NAME}")
base_url="http://${DEMO_SMOKE_TARGET_HOST}:${DEMO_SMOKE_TARGET_PORT}"
tmp_index_file="$(mktemp "${TMPDIR:-/tmp}/crowd-snake-smoke-index.XXXXXX.html")"
expected_version_manifest="$(python3 - <<'PY'
import json
from pathlib import Path

print(json.dumps(json.loads(Path("site/version.json").read_text())))
PY
)"

cleanup() {
    rm -f "${tmp_index_file}"
    "${compose_cmd[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup
"${compose_cmd[@]}" config -q
print_effective_config
"${compose_cmd[@]}" up --build -d

for _ in $(seq 1 24); do
    if curl --fail --silent --show-error "${base_url}/_healthz" >/dev/null; then
        break
    fi
    sleep 2
done

curl --fail --silent --show-error "${base_url}/_healthz" >/dev/null

status_code="$(
    curl --silent --output /dev/null --write-out "%{http_code}" "${base_url}/"
)"
[ "${status_code}" = "401" ]

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    "${base_url}/" \
    > "${tmp_index_file}"

grep -q 'id="game-board"' "${tmp_index_file}"
grep -q 'data-app-commit-sha="local-dev"' "${tmp_index_file}"
grep -q 'New build ready:' "${tmp_index_file}"

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    "${base_url}/version.json" \
    | EXPECTED_VERSION_MANIFEST="${expected_version_manifest}" \
        python3 -c 'import json,os,sys; payload=json.load(sys.stdin); expected=json.loads(os.environ["EXPECTED_VERSION_MANIFEST"]); assert payload == expected'

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    "${base_url}/api/state" \
    | python3 -c 'import json,sys; payload=json.load(sys.stdin); assert payload["bestScore"] == 0'

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    --header "Content-Type: application/json" \
    --data '{"bestScore": 17}' \
    "${base_url}/api/state" \
    | python3 -c 'import json,sys; payload=json.load(sys.stdin); assert payload["bestScore"] == 17'

curl --fail --silent --show-error \
    --user "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
    "${base_url}/api/state" \
    | python3 -c 'import json,sys; payload=json.load(sys.stdin); assert payload["bestScore"] == 17'
