# ADR 016: Mail API Contract Package

## Status

Accepted

## Context

`packages/mail-proxy` exposes REST endpoints for mail (`/v1/mail/*`) and calendar (`/v1/calendar/*`). The web client previously duplicated request/response types and hand-wrote fetch wrappers in `mail.api.ts` and `calendar.api.ts`.

ADR-014/015 noted a future move into Workspace API OpenAPI; until then we need a single contract for the standalone proxy.

## Options

1. **Hand-written types in web + mail-proxy** — duplicates drift from implementation.
2. **Extend `@workspace/api`** — mixes Zulip gateway API with Mailcow proxy; premature before backend merge.
3. **Separate `@mail/api` package** — OpenAPI spec + Orval client, mirroring `@workspace/api`.

## Decision

Add **`packages/mail-api`** (`@mail/api`) with:

- `openapi/mail-proxy.openapi.json` as source of truth
- Orval-generated `src/generated/mail-api.ts`
- Injectable mutator (`mail-api-mutator.ts`) wired in web via `mail-orval-mutator.ts`

Web entities keep thin wrappers (`mail.api.ts`, `calendar.api.ts`) for domain mapping (e.g. `sessionToken` → `token`, folder delimiter fallback).

`packages/mail-proxy` is reorganized into `server/`, `shared/`, `mail/`, `calendar/` and imports DTO types from `@mail/api`.

## Consequences

### Positive

- Single OpenAPI contract for mail + calendar REST surface
- Regenerate client with `npm run codegen:mail-api`
- Clear path to merge spec into Workspace API later (import paths change, not behavior)

### Negative

- Extra package in monorepo
- Spec must be updated manually when routes change (no server-side codegen yet)
