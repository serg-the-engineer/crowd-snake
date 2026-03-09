# Crowd Snake Guidelines

## Symphony Workflow

- Managed Symphony runs load `.symphony/WORKFLOW.md` as the primary agent prompt via `AGENTS_MD`.
- Keep `.symphony/WORKFLOW.md`, `AGENTS.md`, `README.md`, `.env.example`, and deploy docs aligned when the runtime or delivery contract changes.
- The workflow assumes Linear states `Todo`, `In Progress`, `Human Review`, `Rework`, `Merging`, and `Done`; update the file if the actual team workflow differs.
- `Human Review` is intentionally not in `active_states`: it is a human handoff state, and Symphony resumes only after a human moves the issue to `Merging` or `Rework`.
- Keep at least two global agent slots if you want two execution tasks to run concurrently.
- Confirm `tracker.project_slug` in `.symphony/WORKFLOW.md` before enabling the project in Symphony or the platform registry.
- Managed runs for this repo expect platform model routing with `gpt-5.4` as the default execution lane and `gpt-oss` as the free self-hosted lane.
- Keep platform registry config aligned with the workflow: `Allowed model profiles` should include `gpt-5.4` and `gpt-oss`; include `gpt-spark` only when the active tariff/runtime actually supports it. `Default model profile` should be `gpt-5.4`; `GPT_OSS_BASE_URL` and `GPT_OSS_API_KEY` must be present whenever `gpt-oss` is allowed.
- Preserve label routing semantics in `.symphony/WORKFLOW.md`: direct `ai:model/<slug>` labels override everything. Semantic lane labels map `ai:lane/paid` to `gpt-5.4` and `ai:lane/free` to `gpt-oss`. Only use `ai:model/gpt-spark` when that profile is enabled for the project.
- Do not assume Symphony's built-in `review` stage is active for this repo; `Human Review` is a non-active human handoff state here, so the repo relies on explicit human transitions to `Merging` or `Rework` rather than a background review polling loop.
- PR bodies must keep the hidden marker `<!-- linear-issue: <identifier> -->`
  populated with the source Linear issue identifier so merged commits can be
  mapped back during post-deploy incident handling.
- Repo-local Symphony skills now live under `.codex/skills` (`linear`, `commit`, `pull`, `push`, `land`).
- Managed Symphony runs for this repo intentionally use `danger-full-access` sandboxing because the canonical validation path requires host Docker access plus the GitHub App broker socket outside the workspace.
- Managed Symphony runs must also keep the Symphony dashboard bound on `0.0.0.0`; otherwise the platform URL proxy can reach the host port, but the observability server still stays hidden on container loopback.

## Scope

- This repository is `crowd-snake`.
- Do not reintroduce historical project names.
- Do not add workflow, docs, or runtime dependencies on removed sidecar services.

## Delivery Discipline

- Keep changes single-purpose and update the narrowest relevant check first when changing behavior.
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
