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
- keep `.symphony/WORKFLOW.md`, `AGENTS.md`, `README.md`, `.env.example`, and
  deploy docs aligned when the runtime or delivery contract changes

## Run Locally

```bash
cd crowd-snake
cp .env.example .env
docker compose up --build -d
```

Local auth is optional. Leave `DEMO_BASIC_AUTH_USERNAME` and
`DEMO_BASIC_AUTH_PASSWORD` empty in `.env` to keep the demo open on
`http://127.0.0.1:8081`.

The API creates the `demo_state` table automatically on first access if it does
not exist yet.

## Demo Deployment

- `.env.example` documents the runtime contract used by the deploy workflow.
- `scripts/smoke-test.sh` exercises the full stack locally.
- `scripts/deploy-remote.sh` is the entrypoint used on the demo host.
- `docs/demo-deploy.md` lists the required GitHub variables, secrets, and the
  one-time host bootstrap steps.

## Naming

This repository is published as `crowd-snake`. Keep code, compose metadata, and documentation aligned with that name.
