# ADR 010: IndexedDB subsystem layout

## Status

Deferred — phase-1 scaffold removed (2026-06-01); full snapshot unification pending

## Context

Snapshot persistence is split across `message-cache-db.ts` and several `*-snapshot-db.ts` modules with overlapping store names.

## Decision

When snapshot unification resumes, introduce `shared/lib/idb/` with a single open helper and generic snapshot row helpers. Until then, existing `*-snapshot-db.ts` modules and `message-cache-db.ts` remain the source of truth.

## Consequences

- No `shared/lib/idb/` scaffold in the tree until a follow-up ADR implements migration
- `message-cache-db.ts` remains source of truth for schema until migration ADR is implemented
