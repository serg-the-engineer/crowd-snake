# Crowd Snake Guidelines

## Symphony Workflow

- Managed Symphony runs load `.symphony/WORKFLOW.md` as the primary agent prompt via `AGENTS_MD`.
- Managed runs keep the issue in `In Progress` through implementation, validation, the required four-pass agent review phase, and a final workpad-only complexity score before handing off at `Human Review`.

## Scope

- This repository is `crowd-snake`.
- Do not reintroduce historical project names.
- Do not add workflow, docs, or runtime dependencies on removed sidecar services.

## Delivery Discipline

- Keep changes single-purpose and update the narrowest relevant check first when changing behavior.
- Every gameplay logic change must bump the user-facing version in `site/index.html` and `site/version.json`.
- Keep `README.md` aligned with the real compose/runtime contract.
- For runtime behavior, compose, nginx, frontend, API, deploy, or docs that describe those surfaces, run `docker compose config -q` and `./scripts/smoke-test.sh`.
- The `main` deploy contract is sequential: reusable CI, remote deploy, public
  `commitSha` confirmation, browser probe, then incident handling / rollback
  guardrails.
- When smoke tests run from a managed runner that talks to host Docker, use the runtime-provided issue-scoped env (`SYMPHONY_DOCKER_*`) or the script's compatible `DEMO_*` overrides instead of hardcoding localhost assumptions.
- Do not downgrade the managed workflow sandbox below `danger-full-access` unless the platform runtime contract is redesigned; `workspace-write` blocks `/var/run/docker.sock`, `/run/symphony/github/*`, and related unattended validation flows.
- For workflow or agent-guidance-only changes, verify every referenced path, command, env var, port, and service name against the repo and local platform contract.

## Runtime Contract

- The compose stack consists only of `web`, `api`, `db`, and `redis`.
- `web` is the only public service.
- Default database/cache identifiers should use `crowd-snake` or `crowd_snake` naming.
- Internal service ports stay `9001`, `5433`, and `6380`.
