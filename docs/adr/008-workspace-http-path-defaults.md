# ADR-008: Workspace gateway HTTP path defaults

**Date**: 2026-04-14  
**Status**: accepted

## Context

Workspace UI supports both:

1. **Vanilla Zulip** — JSON API and upload-related URLs use `/api/v1` on the realm host.
2. **Workspace gateway** — Workspace REST and gateway-aligned URLs use `/workspace/v1` (and optional `VITE_WORKSPACE_REST_API_PATH` / uploads prefix) while the Zulip realm may stay on a canonical host with `/api/v1`.

Previously, path defaults lived only as string literals in [`packages/web/src/shared/lib/env.ts`](packages/web/src/shared/lib/env.ts), duplicated from mental model to [`packages/web/vite.config.ts`](packages/web/vite.config.ts). Product scope for the primary shipping configuration (gateway) was not documented in one place.

## Options

1. **Keep vanilla-only defaults** — zero migration; gateway users must always set three `VITE_*` path vars.
2. **Gateway-first defaults in code** — one shared module; vanilla deployments set explicit `VITE_WORKSPACE_API_PATH=/api/v1` (and related) to restore historical behaviour.
3. **Remove env entirely, hardcode gateway** — breaks vanilla Zulip without fork; rejected for an open-source Zulip client.

## Decision

Adopt **option 2**:

- Introduce [`packages/web/src/shared/config/workspace-api-layout.ts`](packages/web/src/shared/config/workspace-api-layout.ts) exporting `WORKSPACE_GATEWAY_HTTP_PATH_DEFAULTS`, `VANILLA_ZULIP_HTTP_PATH_DEFAULTS`, and `WORKSPACE_HTTP_PATH_DEFAULTS` (alias of gateway defaults).
- [`env.ts`](packages/web/src/shared/lib/env.ts) uses `WORKSPACE_HTTP_PATH_DEFAULTS` as fallbacks for `VITE_ZULIP_API_PATH`, `VITE_WORKSPACE_API_PATH`, `VITE_WORKSPACE_REST_API_PATH`, `VITE_USER_UPLOADS_PATH_PREFIX` when unset.
- [`vite.config.ts`](packages/web/vite.config.ts) uses the same defaults for dev proxy path resolution when `loadEnv` omits keys (undefined), keeping dev aligned with the client bundle.

`VITE_ZULIP_API_PATH` remains defaulted to `/api/v1` in the gateway preset so JSON API calls against a canonical Zulip realm URL stay standard.

## Consequences

- **Positive**: Gateway deployments need fewer lines in `.env`; defaults are documented and testable; Vite and client share one source of truth.
- **Negative**: Upgrades from older releases that relied on implicit `/api/v1` for `WORKSPACE_API_PATH` without setting `VITE_WORKSPACE_API_PATH` now get `/workspace/v1` until they set `VITE_WORKSPACE_API_PATH=/api/v1` (vanilla preset).
- **Risks**: CI or local tests that assumed implicit vanilla paths must stub env explicitly (already common in Vitest).

## Migration (vanilla Zulip)

Set in `packages/web/.env`:

```bash
VITE_WORKSPACE_API_PATH=/api/v1
VITE_ZULIP_API_PATH=/api/v1
# leave VITE_WORKSPACE_REST_API_PATH and VITE_USER_UPLOADS_PATH_PREFIX unset or empty
```

Or copy values from `VANILLA_ZULIP_HTTP_PATH_DEFAULTS` in `workspace-api-layout.ts`.
