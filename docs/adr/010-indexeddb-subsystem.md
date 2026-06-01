# ADR 010: IndexedDB subsystem layout

## Status

Proposed (phase 1: shared open helper; full snapshot unification pending)

## Context

Snapshot persistence is split across `message-cache-db.ts` and several `*-snapshot-db.ts` modules with overlapping store names.

## Decision

Introduce `shared/lib/idb/`:

- `idb-open.lib.ts` — single entry to open DB (delegates to `message-cache-db` until schema is unified)
- `idb-snapshot-store.lib.ts` — generic read/write helpers for snapshot rows keyed by `instanceId`

Future: bump DB version once, migrate stores, delete duplicate snapshot modules.

## Consequences

- New snapshot stores use `idb-snapshot-store.lib.ts`
- `message-cache-db.ts` remains source of truth for schema until migration ADR is implemented
