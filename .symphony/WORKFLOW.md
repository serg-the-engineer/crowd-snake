---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  # Confirm this matches the actual Linear project URL slug before enabling the project.
  project_slug: "crowd-snake-08ebbbc1ad1a"
  active_states:
    - Todo
    - In Progress
    - Human Review
    - Merging
    - Rework
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: $WORKSPACE_BASE
server:
  host: 0.0.0.0
hooks:
  timeout_ms: 120000
  after_create: |
    git clone --branch "${SOURCE_REPO_DEFAULT_BRANCH:-main}" "${SOURCE_REPO_URL:-git@github.com:serg-the-engineer/crowd-snake.git}" .
    if [ -f .env.example ] && [ ! -f .env ]; then
      cp .env.example .env
    fi
  before_remove: |
    if command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
      docker compose down -v --remove-orphans >/dev/null 2>&1 || true
    fi
agent:
  max_concurrent_agents: 1
  max_turns: 20
codex:
  command: codex --config shell_environment_policy.inherit=all --config model_reasoning_effort=xhigh --model gpt-5.3-codex app-server
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
---

You are working on a Linear ticket `{{ issue.identifier }}`

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the ticket is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
- Do not repeat already-completed investigation or validation unless needed for new code changes.
- Do not end the turn while the issue remains in an active state unless you are blocked by missing required permissions/secrets.
  {% endif %}

Issue context:
Identifier: {{ issue.identifier }}
Title: {{ issue.title }}
Current status: {{ issue.state }}
Labels: {{ issue.labels }}
URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Instructions:

1. This is an unattended orchestration session. Never ask a human to perform follow-up actions.
2. Only stop early for a true blocker (missing required auth/permissions/secrets). If blocked, record it in the workpad and move the issue according to workflow.
3. Final message must report completed actions and blockers only. Do not include "next steps for user".

Work only in the provided repository copy. Do not touch any other path.

## Prerequisite: Linear MCP or `linear_graphql` tool is available

The agent should be able to talk to Linear, either via a configured Linear MCP server or injected `linear_graphql` tool. If none are present, treat that as a blocker: record it in the workpad and stop according to the blocked-access escape hatch.

## Repository context

- This repository is `crowd-snake`.
- Do not reintroduce historical project names.
- Do not add workflow, docs, or runtime dependencies on removed sidecar services.
- The compose stack consists only of `web`, `api`, `db`, and `redis`.
- `web` is the only public service.
- Internal service ports stay `9001`, `5433`, and `6380`.
- Default database/cache identifiers should use `crowd-snake` or `crowd_snake` naming.

## Key files

- `docker-compose.yml` is the runtime contract.
- `api/server.py` serves `/healthz`, `GET /api/state`, and `POST /api/state`.
- `nginx/` contains the public reverse proxy and auth entrypoint.
- `site/` contains the static frontend served by `web`.
- `scripts/smoke-test.sh` is the canonical end-to-end validation.
- `.github/workflows/ci.yml` and `.github/workflows/deploy-demo.yml` are the CI/CD contract.
- `docs/demo-deploy.md` and `.env.example` document the demo deployment contract.
- `AGENTS.md` and this workflow must stay aligned when agent guidance changes.

## Default validation contract

- When touching runtime behavior, compose topology, frontend assets, nginx, API code, deploy scripts, or docs that describe those surfaces, run `docker compose config -q` and `./scripts/smoke-test.sh`.
- When changing only workflow or agent guidance, verify every referenced file path, command, env var, port, service name, and state name against the repo and platform docs.
- This managed project intentionally uses `danger-full-access` so Codex can reach `/var/run/docker.sock`, the GitHub App broker socket under `/run/symphony/github`, and outbound GitHub network calls needed for unattended validation and PR work.
- Keep `server.host: 0.0.0.0` in this workflow so the managed Symphony observability dashboard is reachable through the platform URL proxy instead of staying bound to container loopback.
- Keep `README.md`, `.env.example`, `docs/demo-deploy.md`, `.github/workflows/*.yml`, `AGENTS.md`, and this workflow aligned with any runtime or deployment contract change.

## Default posture

- Start by determining the ticket's current status, then follow the matching flow for that status.
- Start every task by opening the tracking workpad comment and bringing it up to date before doing new implementation work.
- Spend extra effort up front on planning and verification design before implementation.
- Reproduce first: always confirm the current behavior/issue signal before changing code so the fix target is explicit.
- Keep ticket metadata current (state, checklist, acceptance criteria, links).
- Treat a single persistent Linear comment as the source of truth for progress.
- Use that single workpad comment for all progress and handoff notes; do not post separate "done"/summary comments.
- Treat any ticket-authored `Validation`, `Test Plan`, or `Testing` section as non-negotiable acceptance input: mirror it in the workpad and execute it before considering the work complete.
- When meaningful out-of-scope improvements are discovered during execution,
  file a separate Linear issue instead of expanding scope. The follow-up issue
  must include a clear title, description, and acceptance criteria, be placed in
  `Backlog`, be assigned to the same project as the current issue, link the
  current issue as `related`, and use `blockedBy` when the follow-up depends on
  the current issue.
- Move status only when the matching quality bar is met.
- Operate autonomously end-to-end unless blocked by missing requirements, secrets, or permissions.
- Use the blocked-access escape hatch only for true external blockers (missing required tools/auth) after exhausting documented fallbacks.

## Related skills

If repository-local skills exist under `.codex/skills`, prefer them. If they do
not exist, follow the equivalent procedure directly from this workflow.

- `linear`: interact with Linear.
- `commit`: produce clean, logical commits during implementation.
- `push`: keep remote branch current and publish updates.
- `pull`: keep branch updated with latest `origin/main` before handoff.
- `land`: when ticket reaches `Merging`, use the repo-local skill if present; otherwise run the equivalent merge loop directly.

## Status map

- `Backlog` -> out of scope for this workflow; do not modify.
- `Todo` -> queued; immediately transition to `In Progress` before active work.
  - Special case: if a PR is already attached, treat as feedback/rework loop (run full PR feedback sweep, address or explicitly push back, revalidate, return to `Human Review`).
- `In Progress` -> implementation actively underway.
- `Human Review` -> PR is attached and validated; semantically waiting on a human, but kept active so Symphony can run agent review for the current PR head and continue polling.
- `Merging` -> approved by human; use the repo-local `land` skill if available, otherwise run the equivalent land loop (sync branch, address feedback, wait for green checks, squash-merge).
- `Rework` -> reviewer requested changes; planning + implementation required.
- `Done` -> terminal state; no further action required.

## Step 0: Determine current ticket state and route

1. Fetch the issue by explicit ticket ID.
2. Read the current state.
3. Route to the matching flow:
   - `Backlog` -> do not modify issue content/state; stop and wait for human to move it to `Todo`.
   - `Todo` -> immediately move to `In Progress`, then ensure bootstrap workpad comment exists (create if missing), then start execution flow.
     - If PR is already attached, start by reviewing all open PR comments and deciding required changes vs explicit pushback responses.
   - `In Progress` -> continue execution flow from current scratchpad comment.
   - `Human Review` -> run the human-review flow.
   - `Merging` -> use the repo-local `land` skill if present; otherwise run the equivalent land loop directly.
   - `Rework` -> run rework flow.
   - `Done` -> do nothing and shut down.
4. Check whether a PR already exists for the current branch and whether it is closed.
   - If a branch PR exists and is `CLOSED` or `MERGED`, treat prior branch work as non-reusable for this run.
   - Create a fresh branch from `origin/main` and restart execution flow as a new attempt.
5. For `Todo` tickets, do startup sequencing in this exact order:
   - `update_issue(..., state: "In Progress")`
   - find/create `## Codex Workpad` bootstrap comment
   - only then begin analysis/planning/implementation work.
6. Add a short comment if state and issue content are inconsistent, then proceed with the safest flow.

## Step 1: Start/continue execution (Todo or In Progress)

1.  Find or create a single persistent scratchpad comment for the issue:
    - Search existing comments for a marker header: `## Codex Workpad`.
    - Ignore resolved comments while searching; only active/unresolved comments are eligible to be reused as the live workpad.
    - If found, reuse that comment; do not create a new workpad comment.
    - If not found, create one workpad comment and use it for all updates.
    - Persist the workpad comment ID and only write progress updates to that ID.
2.  If arriving from `Todo`, do not delay on additional status transitions: the issue should already be `In Progress` before this step begins.
3.  Immediately reconcile the workpad before new edits:
    - Check off items that are already done.
    - Expand/fix the plan so it is comprehensive for current scope.
    - Ensure `Acceptance Criteria` and `Validation` are current and still make sense for the task.
4.  Start work by writing/updating a hierarchical plan in the workpad comment.
5.  Ensure the workpad includes a compact environment stamp at the top as a code fence line:
    - Format: `<host>:<abs-workdir>@<short-sha>`
    - Example: `devbox-01:/var/lib/symphony/workspaces/CS-12@7bdde33bc`
    - Do not include metadata already inferable from Linear issue fields (`issue ID`, `status`, `branch`, `PR link`).
6.  Add explicit acceptance criteria and TODOs in checklist form in the same comment.
    - If changes are user-facing, include a UI walkthrough acceptance criterion that describes the end-to-end user path to validate.
    - If changes touch app files or runtime behavior, include explicit checks for `/_healthz`, `GET /api/state`, `POST /api/state`, and the expected basic-auth behavior when credentials are configured.
    - If changes touch deploy flows, include acceptance criteria for `.env.example`, `docs/demo-deploy.md`, and `.github/workflows/deploy-demo.yml` staying aligned.
    - If the ticket description/comment context includes `Validation`, `Test Plan`, or `Testing` sections, copy those requirements into the workpad `Acceptance Criteria` and `Validation` sections as required checkboxes (no optional downgrade).
7.  Run a principal-style self-review of the plan and refine it in the comment.
8.  Before implementing, capture a concrete reproduction signal and record it in the workpad `Notes` section (command/output, screenshot, or deterministic UI behavior).
9.  Sync with latest `origin/main` before any code edits, then record the sync result in the workpad `Notes`.
    - If the repo-local `pull` skill exists, use it. Otherwise fetch, fast-forward the branch from `origin`, merge `origin/main`, resolve conflicts, and rerun relevant checks.
    - Include a `pull skill evidence` note with:
      - merge source(s),
      - result (`clean` or `conflicts resolved`),
      - resulting `HEAD` short SHA.
10. Compact context and proceed to execution.

## PR feedback sweep protocol (required)

When a ticket has an attached PR, run this protocol before moving to `Human Review`:

1. Identify the PR number from issue links/attachments.
2. Gather feedback from all channels:
   - Top-level PR comments (`gh pr view --comments`).
   - Inline review comments (`gh api repos/<owner>/<repo>/pulls/<pr>/comments`).
   - Review summaries/states (`gh pr view --json reviews`).
3. Treat every actionable reviewer comment (human or bot), including inline review comments, as blocking until one of these is true:
   - code/test/docs updated to address it, or
   - explicit, justified pushback reply is posted on that thread.
4. Update the workpad plan/checklist to include each feedback item and its resolution status.
5. Re-run validation after feedback-driven changes and push updates.
6. Repeat this sweep until there are no outstanding actionable comments.

## Blocked-access escape hatch (required behavior)

Use this only when completion is blocked by missing required tools or missing auth/permissions that cannot be resolved in-session.

- GitHub is **not** a valid blocker by default. First attempt the normal publish/review flow using the repo's existing remote and auth configuration.
- For GitHub failures, distinguish sync problems from auth/permission/workflow restrictions:
  - sync problems -> resolve them and continue;
  - auth/permission/workflow restrictions -> document the exact error in the workpad and treat as blocker only after the normal flow failed with the existing config.
- Do not move to `Human Review` for GitHub access/auth until the normal GitHub publish/review flow has been attempted and the exact failure is documented in the workpad.
- If a non-GitHub required tool is missing, or required non-GitHub auth is unavailable, move the ticket to `Human Review` with a short blocker brief in the workpad that includes:
  - what is missing,
  - why it blocks required acceptance/validation,
  - exact human action needed to unblock.
- Keep the brief concise and action-oriented; do not add extra top-level comments outside the workpad.

## Step 2: Execution phase (Todo -> In Progress -> Human Review)

1.  Determine current repo state (`branch`, `git status`, `HEAD`) and verify the kickoff sync result is already recorded in the workpad before implementation continues.
2.  If current issue state is `Todo`, move it to `In Progress`; otherwise leave the current state unchanged.
3.  Load the existing workpad comment and treat it as the active execution checklist.
    - Edit it liberally whenever reality changes (scope, risks, validation approach, discovered tasks).
4.  Implement against the hierarchical TODOs and keep the comment current:
    - Check off completed items.
    - Add newly discovered items in the appropriate section.
    - Keep parent/child structure intact as scope evolves.
    - Update the workpad immediately after each meaningful milestone (for example: reproduction complete, code change landed, validation run, review feedback addressed).
    - Never leave completed work unchecked in the plan.
    - For tickets that started as `Todo` with an attached PR, run the full PR feedback sweep protocol immediately after kickoff and before new feature work.
5.  Run validation/tests required for the scope.
    - Mandatory gate: execute all ticket-provided `Validation`/`Test Plan`/`Testing` requirements when present; treat unmet items as incomplete work.
    - Mandatory gate for crowd-snake runtime/deploy changes: run `docker compose config -q` and `./scripts/smoke-test.sh`.
    - If API, nginx, or UI behavior changed, capture the exact `curl` or browser path through `web`, including auth expectations when relevant.
    - Prefer a targeted proof that directly demonstrates the behavior you changed.
    - You may make temporary local proof edits to validate assumptions when this increases confidence.
    - Revert every temporary proof edit before commit/push.
    - Document these temporary proof steps and outcomes in the workpad `Validation`/`Notes` sections so reviewers can follow the evidence.
6.  Re-check all acceptance criteria and close any gaps.
7.  Before every `git push` attempt, run the required validation for your scope and confirm it passes; if it fails, address issues and rerun until green, then commit and push changes.
8.  Attach PR URL to the issue.
    - Prefer an issue attachment/link field.
    - If attachment is unavailable, add exactly one fallback line to the workpad: `PR Link (fallback): <url>`.
9.  Merge latest `origin/main` into branch, resolve conflicts, and rerun checks.
10. Update the workpad comment with final checklist status and validation notes.
    - Mark completed plan/acceptance/validation checklist items as checked.
    - Add final handoff notes (commit + validation summary) in the same workpad comment.
    - Do not duplicate PR URL elsewhere; keep PR linkage on the issue via attachment/link fields, or use the single fallback line only when attachment is unavailable.
    - Add a short `### Confusions` section at the bottom when any part of task execution was unclear/confusing, with concise bullets.
    - Do not post any additional completion summary comment.
11. Before moving to `Human Review`, poll PR feedback and checks:
    - Read the PR `Manual QA Plan` comment when present and use it to sharpen UI/runtime test coverage for the current change.
    - Run the full PR feedback sweep protocol.
    - Confirm PR checks are passing (green) after the latest changes.
    - Confirm every required ticket-provided validation/test-plan item is explicitly marked complete in the workpad.
    - Repeat this check-address-verify loop until no outstanding comments remain and checks are fully passing.
    - Re-open and refresh the workpad before state transition so `Plan`, `Acceptance Criteria`, and `Validation` exactly match completed work.
12. Only then move issue to `Human Review`.
    - Exception: if blocked by missing required non-GitHub tools/auth per the blocked-access escape hatch, move to `Human Review` with the blocker brief and explicit unblock actions.
13. For `Todo` tickets that already had a PR attached at kickoff:
    - Ensure all existing PR feedback was reviewed and resolved, including inline review comments (code changes or explicit, justified pushback response).
    - Ensure branch was pushed with any required updates.
    - Then move to `Human Review`.

## Step 3: Human Review and merge handling

1. `Human Review` is semantically a waiting state for a human, but it remains active so Symphony can stay attached, review the PR, and keep polling.
2. When the issue enters `Human Review`, identify the attached PR and current PR head SHA.
3. Check the workpad and PR discussion to determine whether this exact head SHA has already been reviewed by the agent.
4. If the current head SHA has not yet been reviewed by the agent:
   - perform an agent review of the PR focused on bugs, regressions, missing validation, and runtime/deploy/docs contract mismatches;
   - record the review pass in the workpad, including the reviewed head SHA and the outcome.
5. If the agent review finds actionable issues:
   - post or update PR feedback when possible,
   - update the workpad with the findings and why they block approval,
   - move the issue to `Rework`,
   - stop waiting in `Human Review`.
6. If the current head SHA has already been reviewed and no new findings exist, do not repeat the full review; just poll for changes.
7. While the issue remains in `Human Review`, poll for updates:
   - new PR head SHA -> rerun the agent review for the new head;
   - new human/bot feedback that requires code changes -> move the issue to `Rework`;
   - human approval -> wait for the human to move the issue to `Merging`.
8. Do not implement code changes while the issue remains in `Human Review`; if changes are needed, move to `Rework` first.
9. When the issue is in `Merging`, open and follow `.codex/skills/land/SKILL.md`, then run the `land` skill in a loop until the PR is merged. If the repo-local `land` skill is unavailable, run the equivalent land loop directly. Do not merge until checks are green and review feedback is resolved.
10. After merge is complete, move the issue to `Done`.

## Step 4: Rework handling

1. Treat `Rework` as a full approach reset, not incremental patching.
2. Re-read the full issue body and all human comments; explicitly identify what will be done differently this attempt.
3. Close the existing PR tied to the issue.
4. Remove or supersede the existing live `## Codex Workpad` comment.
   - Prefer deleting it.
   - If deletion is unavailable, rename its header so it is no longer the live workpad, then create a fresh `## Codex Workpad` comment.
5. Create a fresh branch from `origin/main`.
6. Start over from the normal kickoff flow:
   - If current issue state is `Todo`, move it to `In Progress`; otherwise keep the current state.
   - Create a new bootstrap `## Codex Workpad` comment.
   - Build a fresh plan/checklist and execute end-to-end.

## Completion bar before Human Review

- Step 1/2 checklist is fully complete and accurately reflected in the single workpad comment.
- Acceptance criteria and required ticket-provided validation items are complete.
- Validation/tests are green for the latest commit.
- PR feedback sweep is complete and no actionable comments remain.
- PR checks are green, branch is pushed, and PR is linked on the issue.
- If runtime, deployment, or environment contract changed, the matching docs/config files are updated and consistent (`README.md`, `.env.example`, `docs/demo-deploy.md`, workflow files, and this workflow when relevant).

## Guardrails

- If the branch PR is already closed/merged, do not reuse that branch or prior implementation state for continuation.
- For closed/merged branch PRs, create a new branch from `origin/main` and restart from reproduction/planning as if starting fresh.
- If issue state is `Backlog`, do not modify it; wait for human to move to `Todo`.
- Do not edit the issue body/description for planning or progress tracking.
- Use exactly one live persistent workpad comment (`## Codex Workpad`) per issue. Superseded workpads from prior rework attempts must be removed or renamed so search finds only the live one.
- Temporary proof edits are allowed only for local verification and must be reverted before commit.
- If out-of-scope improvements are found, create a separate Backlog issue rather
  than expanding current scope, and include a clear
  title/description/acceptance criteria, same-project assignment, a `related`
  link to the current issue, and `blockedBy` when the follow-up depends on the
  current issue.
- Do not move to `Human Review` unless the `Completion bar before Human Review` is satisfied.
- In `Human Review`, do not implement code changes directly. Review, comment, poll, and move to `Rework` if changes are needed.
- If state is terminal (`Done`), do nothing and shut down.
- Keep issue text concise, specific, and reviewer-oriented.
- If blocked and no workpad exists yet, add one blocker comment describing blocker, impact, and next unblock action.

## Workpad template

Use this exact structure for the persistent workpad comment and keep it updated in place throughout execution:

````md
## Codex Workpad

```text
<hostname>:<abs-path>@<short-sha>
```

### Plan

- [ ] 1\. Parent task
  - [ ] 1.1 Child task
  - [ ] 1.2 Child task
- [ ] 2\. Parent task

### Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

### Validation

- [ ] targeted tests: `<command>`

### Notes

- <short progress note with timestamp>

### Confusions

- <only include when something was confusing during execution>
````
