# crowd-snake

Standalone `crowd-snake` demo project. It runs as an independent Docker Compose stack with no external sidecar services.

## Stack

- `web`: nginx entrypoint, publishes `8081`
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
- `web` is the only public service and binds `8081:8081`
- `api`, `db`, and `redis` stay internal to the compose network
- internal service ports stay `9001`, `5433`, and `6380`

## Run Locally

```bash
cd crowd-snake
docker compose up --build -d
```

The API creates the `demo_state` table automatically on first access if it does not exist yet.

## Naming

This repository is published as `crowd-snake`. Keep code, compose metadata, and documentation aligned with that name.
