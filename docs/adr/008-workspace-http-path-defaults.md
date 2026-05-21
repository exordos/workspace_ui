# ADR-008: Workspace gateway HTTP path defaults

**Date**: 2026-04-14  
**Status**: accepted (superseded in part: path env overrides removed 2026-05)

## Context

Workspace UI supports both:

1. **Vanilla Zulip** — JSON API and upload-related URLs use `/api/v1` on the realm host.
2. **Workspace gateway** — Workspace REST mount `/workspace` and uploads prefix `/workspace/v1` are fixed in code; gateway-aligned API path defaults to `/workspace/v1` while the Zulip realm may stay on `/api/v1`.

Previously, path defaults lived only as string literals in [`packages/web/src/shared/lib/env.ts`](packages/web/src/shared/lib/env.ts), duplicated from mental model to [`packages/web/vite.config.ts`](packages/web/vite.config.ts). Product scope for the primary shipping configuration (gateway) was not documented in one place.

## Options

1. **Keep vanilla-only defaults** — zero migration; gateway users must always set three `VITE_*` path vars.
2. **Gateway-first defaults in code** — one shared module; vanilla deployments set explicit env paths (historical; removed later).
3. **Remove env entirely, hardcode gateway** — adopted for path layout: all paths in `workspace-api-layout.ts` (no `VITE_*` path overrides).

## Decision

Adopt **option 2**:

- [`packages/web/src/shared/config/workspace-api-layout.ts`](packages/web/src/shared/config/workspace-api-layout.ts) exports fixed `ZULIP_API_PATH`, `WORKSPACE_REST_API_PATH`, `WORKSPACE_GATEWAY_V1_PATH`, `WORKSPACE_API_PATH`.
- [`env.ts`](packages/web/src/shared/lib/env.ts) re-exports those constants on `env`; no `VITE_ZULIP_API_PATH` / `VITE_WORKSPACE_API_PATH`.
- [`vite.config.ts`](packages/web/vite.config.ts) uses the same defaults for dev proxy path resolution when `loadEnv` omits keys (undefined), keeping dev aligned with the client bundle.

`ZULIP_API_PATH` is fixed to `/api/v1` so JSON API calls against a canonical Zulip realm URL stay standard.

## Consequences

- **Positive**: Gateway deployments need fewer lines in `.env`; defaults are documented and testable; Vite and client share one source of truth.
- **Negative**: Vanilla Zulip (workspace uploads at `/api/v1`) is not configurable via env; gateway-only path layout.
- **Risks**: CI or local tests that assumed implicit vanilla paths must stub env explicitly (already common in Vitest).

## Migration (vanilla Zulip)

Path env overrides are no longer supported. Deployments that are not the Workspace gateway require a fork or a future product decision to reintroduce configurable paths.
