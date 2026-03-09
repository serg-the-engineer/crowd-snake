# Demo Deploy

`crowd-snake` deploys on `main` through a sequential GitHub Actions pipeline:

1. reusable CI (`.github/workflows/ci.yml`)
2. remote deploy (`.github/workflows/deploy-demo.yml`)
3. public build witness via `https://crowdsnake.redmadrobot.com/version.json`
4. browser probe against the protected public URL
5. Linear incident handling and safe rollback when needed

## Required GitHub Variables

- `DEMO_APP_DIR`
- `DEMO_DOMAIN`
- `DEMO_POSTGRES_DB`
- `DEMO_POSTGRES_USER`
- `DEMO_REDIS_DATABASE`
- `DEMO_SSH_HOST`
- `DEMO_SSH_USER`
- `DEMO_WEB_BIND_ADDRESS`
- `DEMO_WEB_PORT`

## Required GitHub Secrets

- `DEMO_BASIC_AUTH_PASSWORD`
- `DEMO_BASIC_AUTH_USERNAME`
- `DEMO_POSTGRES_PASSWORD`
- `DEMO_SSH_PRIVATE_KEY`
- `LINEAR_API_KEY`

## Build Identity

- `site/version.json` keeps the user-facing `version`.
- `commitSha` is the canonical deploy identity.
- `site/index.html` embeds the same `commitSha` in `data-app-commit-sha`.
- The HUD `Version` stays human-readable; the banner copy is `New build ready`.

## PR Contract

- Every PR body must include the hidden marker
  `<!-- linear-issue: <identifier> -->`.
- The marker must point to the source Linear issue for the branch.
- Post-deploy incident handling uses `merge commit -> PR -> marker -> Linear issue`.

## Failure Handling

- If the public `version.json` never switches to the expected `commitSha`, the
  workflow records a deployment incident in Linear and stops without rollback.
- If the public build is confirmed but the browser probe captures a console
  error, `pageerror`, failed same-origin request, or same-origin response
  `>= 400`, the workflow records the incident in Linear and attempts a safe
  revert.
- Auto-revert is only allowed for `push` runs on `main`.
- Revert is skipped when:
  - `origin/main` already moved past the failing SHA
  - the current commit is itself an auto-revert commit
  - the scenario is a deploy witness timeout instead of a confirmed browser
    regression

## Host Bootstrap

- Provision the demo host with Docker and Compose support.
- Ensure `${DEMO_APP_DIR}` is writable by `${DEMO_SSH_USER}`.
- Run `scripts/bootstrap-host.sh` once on the host if you need initial system
  setup for the demo environment.
- Keep the public domain protected with the configured basic-auth credentials so
  both `version.json` and the browser probe exercise the real auth path.
