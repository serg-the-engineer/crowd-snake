# crowd-snake

Standalone `crowd-snake` demo project. It runs as an independent Docker Compose stack with no external sidecar services.

## Stack

- `web`: nginx frontend + reverse proxy, publishes `8081` by default
- `api`: Python API, listens on `9001`
- `db`: Postgres, listens on `5433` inside the compose network
- `redis`: Redis, listens on `6380` inside the compose network

The API uses Postgres as the source of truth and Redis as a cache for the shared "Server Best" score.

## API

- `GET /healthz`
- `GET /api/state`
- `POST /api/state`

## Compose Contract

The runtime is intentionally small and fixed:

- there is exactly one compose file: `docker-compose.yml`
- service names are `web`, `api`, `db`, and `redis`
- `web` is the only public service and binds `${DEMO_WEB_PORT:-8081}:8081`
- `api`, `db`, and `redis` stay internal to the compose network
- internal service ports stay `9001`, `5433`, and `6380`

## Symphony Workflow

This repository now carries a Symphony workflow at `.symphony/WORKFLOW.md`.
The local platform/control-plane defaults `workflow_path` to that location and
exports `AGENTS_MD` to the same file, so managed agents read it as their primary
repo prompt.

Relevant repo-local Symphony skills are available in `.codex/skills/`:
`linear`, `commit`, `pull`, `push`, and `land`.

Before enabling the project in Symphony or the platform registry:

- confirm `tracker.project_slug` in `.symphony/WORKFLOW.md`
- make sure the Linear workflow includes `Todo`, `In Progress`, `Human Review`,
  `Rework`, `Merging`, and terminal done/closed states
- keep `Human Review` in `active_states`: it remains a human waiting state semantically, but Symphony uses it to keep the agent alive for automated PR review/polling and auto-return to `Rework`
- keep the hidden PR marker `<!-- linear-issue: <identifier> -->` populated
  with the source Linear issue identifier so post-deploy incident handling can
  map a merged commit back to the original ticket
- keep `.symphony/WORKFLOW.md`, `AGENTS.md`, `README.md`, `.env.example`, and
  deploy docs aligned when the runtime or delivery contract changes
- keep the managed workflow sandbox at `danger-full-access` while validation depends on host Docker and the GitHub App broker socket outside the workspace
- keep `server.host: 0.0.0.0` in the managed workflow so the Symphony dashboard can be proxied through the platform URL instead of remaining loopback-only inside the project container

## Run Locally

If `127.0.0.1:8081` is already occupied, free that port first or choose a
different value for `DEMO_WEB_PORT` in `.env`.

```bash
cd crowd-snake
cp .env.example .env
docker compose config -q
docker compose up --build -d
```

Local auth is optional. Leave `DEMO_BASIC_AUTH_USERNAME` and
`DEMO_BASIC_AUTH_PASSWORD` empty in `.env` to keep the demo open on
`http://127.0.0.1:8081`.

The API creates the `demo_state` table automatically on first access if it does
not exist yet.

Open `http://127.0.0.1:8081` and confirm the page shows the snake board, score
HUD, and restart controls.

To stop the local stack:

```bash
cd crowd-snake
docker compose down
```

## Verify Locally

Automated verification:

```bash
cd crowd-snake
./scripts/smoke-test.sh
```

The smoke script is also runner-safe. For managed runs that launch Docker on the
host from inside another container, override the published target and compose
namespace, for example:

```bash
DEMO_WEB_BIND_ADDRESS=0.0.0.0 \
DEMO_SMOKE_TARGET_HOST=host.docker.internal \
DEMO_SMOKE_TARGET_PORT=19081 \
DEMO_SMOKE_COMPOSE_PROJECT_NAME=crowd-snake-managed \
DEMO_WEB_PORT=19081 \
./scripts/smoke-test.sh
```

The script prints its effective publish and probe settings before it starts. If
you target `host.docker.internal`, `DEMO_SMOKE_TARGET_PORT` must match
`DEMO_WEB_PORT` because the probe is hitting the host-published web port.

Manual verification without local auth:

```bash
curl --fail http://127.0.0.1:8081/_healthz
curl --fail http://127.0.0.1:8081/api/state
curl --fail \
  --header "Content-Type: application/json" \
  --data '{"bestScore":17}' \
  http://127.0.0.1:8081/api/state
curl --fail http://127.0.0.1:8081/api/state
```

Manual verification with local auth enabled:

```bash
curl --fail -u "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
  http://127.0.0.1:8081/_healthz
curl --fail -u "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
  http://127.0.0.1:8081/api/state
curl --fail \
  -u "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" \
  --header "Content-Type: application/json" \
  --data '{"bestScore":17}' \
  http://127.0.0.1:8081/api/state
```

Browser verification checklist:

- load `http://127.0.0.1:8081`
- confirm the page renders the snake canvas and HUD
- confirm `Version` shows the human-readable app version while build detection
  stays internal to `commitSha`
- move the snake with arrow keys
- crash once and confirm `Server Best` updates after the run
- click `Restart` and confirm a fresh game starts

## Demo Deployment

- `.env.example` documents the runtime contract used by the deploy workflow.
- `site/version.json` publishes the user-facing `version` plus the canonical
  deploy identity `commitSha`.
- `scripts/smoke-test.sh` exercises the full stack locally.
- `scripts/smoke-test.sh` also supports managed-runner overrides through
  `DEMO_SMOKE_TARGET_HOST`, `DEMO_SMOKE_TARGET_PORT`, and
  `DEMO_SMOKE_COMPOSE_PROJECT_NAME`.
- `scripts/deploy-remote.sh` is the entrypoint used on the demo host.
- `.github/workflows/deploy-demo.yml` runs the mainline in order:
  reusable CI -> remote deploy -> public `commitSha` witness -> browser probe ->
  incident handling / safe revert.
- Post-deploy incident handling depends on the hidden PR marker
  `<!-- linear-issue: <identifier> -->` and the `LINEAR_API_KEY` GitHub secret.
- `docs/demo-deploy.md` lists the required GitHub variables, secrets, and the
  one-time host bootstrap steps.

## Naming

This repository is published as `crowd-snake`. Keep code, compose metadata, and documentation aligned with that name.
