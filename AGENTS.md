# Crowd Snake Guidelines

## Symphony Workflow

- Managed Symphony runs load `.symphony/WORKFLOW.md` as the primary agent prompt via `AGENTS_MD`.
- Keep `.symphony/WORKFLOW.md`, `AGENTS.md`, `README.md`, `.env.example`, and deploy docs aligned when the runtime or delivery contract changes.
- The workflow assumes Linear states `Todo`, `In Progress`, `Human Review`, `Rework`, `Merging`, and `Done`; update the file if the actual team workflow differs.
- `Human Review` stays in `active_states` intentionally: it is still a waiting state for people, but Symphony must remain attached there to run agent review/polling and automatically return issues to `Rework` when review finds problems.
- Confirm `tracker.project_slug` in `.symphony/WORKFLOW.md` before enabling the project in Symphony or the platform registry.
- Repo-local Symphony skills now live under `.codex/skills` (`linear`, `commit`, `pull`, `push`, `land`).

## Scope

- This repository is `crowd-snake`.
- Do not reintroduce historical project names.
- Do not add workflow, docs, or runtime dependencies on removed sidecar services.

## Delivery Discipline

- Keep changes single-purpose and update the narrowest relevant check first when changing behavior.
- Keep `README.md` aligned with the real compose/runtime contract.
- For runtime behavior, compose, nginx, frontend, API, deploy, or docs that describe those surfaces, run `docker compose config -q` and `./scripts/smoke-test.sh`.
- For workflow or agent-guidance-only changes, verify every referenced path, command, env var, port, and service name against the repo and local platform contract.

## Runtime Contract

- The compose stack consists only of `web`, `api`, `db`, and `redis`.
- `web` is the only public service.
- Default database/cache identifiers should use `crowd-snake` or `crowd_snake` naming.
- Internal service ports stay `9001`, `5433`, and `6380`.
