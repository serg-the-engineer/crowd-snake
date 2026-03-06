# crowd-snake demo deploy

This repository contains both the CI smoke test and the GitHub Actions CD path
for the demo host.

## Current external dependency

As of March 6, 2026, the public DNS record for
`crowdsnake.redmadrobot.com` resolves to `198.18.0.35`, not to
`93.77.189.239`. Point the public `A` record to `93.77.189.239` before
expecting external traffic or automatic TLS issuance to work on the new host.

## GitHub Actions variables

Configure these repository variables:

- `DEMO_SSH_HOST`: `93.77.189.239`
- `DEMO_SSH_USER`: `sretivykh-rmr`
- `DEMO_APP_DIR`: `/home/sretivykh-rmr/apps/crowd-snake`
- `DEMO_DOMAIN`: `crowdsnake.redmadrobot.com`
- `DEMO_WEB_PORT`: `18081`
- `DEMO_WEB_BIND_ADDRESS`: `127.0.0.1`
- `DEMO_POSTGRES_DB`: `crowd_snake`
- `DEMO_POSTGRES_USER`: `crowd_snake`
- `DEMO_REDIS_DATABASE`: `0`

## GitHub Actions secrets

Configure these repository secrets:

- `DEMO_SSH_PRIVATE_KEY`: private key used by the deploy workflow to connect to
  the demo host
- `DEMO_BASIC_AUTH_USERNAME`: demo basic auth username
- `DEMO_BASIC_AUTH_PASSWORD`: demo basic auth password
- `DEMO_POSTGRES_PASSWORD`: postgres password for the demo stack

## One-time host bootstrap

Run this once from your local checkout:

```bash
ssh sretivykh-rmr@93.77.189.239 'bash -s' -- crowdsnake.redmadrobot.com 18081 /home/sretivykh-rmr/apps/crowd-snake < ./scripts/bootstrap-host.sh
```

That installs Caddy, configures the domain, and proxies public traffic to the
internal compose port.

## First deploy

1. Add the deploy public key to `/home/sretivykh-rmr/.ssh/authorized_keys`.
2. Add the GitHub variables and secrets above.
3. Push the repository changes to the branch used by the deploy workflow.
4. Run the `deploy-demo` workflow manually once or push to `main`.
5. Verify locally on the host:

```bash
cd /home/sretivykh-rmr/apps/crowd-snake
docker compose ps
curl -u "${DEMO_BASIC_AUTH_USERNAME}:${DEMO_BASIC_AUTH_PASSWORD}" http://127.0.0.1:18081/api/state
```

After DNS points to the host, verify externally:

```bash
curl -I https://crowdsnake.redmadrobot.com
```
