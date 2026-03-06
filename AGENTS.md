# Crowd Snake Guidelines

## Scope

- This repository is `crowd-snake`.
- Do not reintroduce historical project names.
- Do not add workflow, docs, or runtime dependencies on removed sidecar services.

## Delivery Discipline

- Keep changes single-purpose and update the narrowest relevant check first when changing behavior.
- Keep `README.md` aligned with the real compose/runtime contract.
- Before handoff, at minimum run static sanity checks that match the touched files.

## Runtime Contract

- The compose stack consists only of `web`, `api`, `db`, and `redis`.
- `web` is the only public service.
- Default database/cache identifiers should use `crowd-snake` or `crowd_snake` naming.
