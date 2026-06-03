# ADR-005: White-label architecture

**Date**: 2026-03
**Status**: accepted

## Context

The product must be released under different brands (OEM/white-label) without forking the code. Each brand: its own name, logo, colors, links, icons, update server.

## Decision

All brand-specific values are in env vars (`VITE_BRAND_*`), centralized in `packages/web/src/shared/lib/brand.ts`. Zero code changes for a new brand.

Customization points:

1. **Name/description** → `VITE_BRAND_APP_NAME`, `_DESCRIPTION`
2. **Visuals** → palette, accent color, theme mode, logo URL
3. **Legal** → copyright, terms/privacy URLs
4. **Infrastructure** → app ID, update server URL
5. **Icons** → replace files in `public/` and `resources/`
6. **Electron** → electron-builder.yml override via env

## Consequences

- Positive: single codebase, multiple brands, CI builds per-brand
- Negative: cannot add brand-specific code (configuration only)
- If brand-specific logic is needed → feature flags, not branches
