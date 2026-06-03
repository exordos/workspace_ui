# ADR-003: Feature-Sliced Design for Scaling

**Date**: 2026-03
**Status**: accepted (migration complete)

## Context

The original structure (`components/`, `stores/`, `lib/`) did not scale with team growth and increasing number of features. An architecture was needed that prevents "spaghetti imports" and allows multiple developers to work in parallel without conflicts.

## Options

1. **No formal architecture** — fast initially, problems at scale
2. **Feature-Sliced Design** — layered architecture with clear import rules
3. **Module Federation** — micro-frontends, excessive for the current size

## Decision

FSD as the standard architecture for all new development. The incremental rollout is complete; detailed conventions are documented in `docs/fsd-architecture.md`.

Phases (all complete):

1. `shared/` + `entities/` (foundation) — **Done**
2. `widgets/` (composition) — **Done**
3. `features/` (scenarios) — **Done**
4. `pages/` + `app/` (upper layers) — **Done**

Current FSD structure (see [PROJECT_FACTS.md](../PROJECT_FACTS.md) for the authoritative list):

- **17 entities**, **22 features**, **9 widgets**, **14 pages**
- **shared**: UI primitives, API client (`shared/api/`), utilities (`shared/lib/`), config, icons
- **Imports**: concrete segment files only — no barrel-only `index.ts` (see ADR-009, `.cursor/rules/no-barrel-index.mdc`)

Pre-FSD directories (`components/`, `stores/`, `lib/`, `contexts/`) are **removed**. Client-side legacy compatibility for old persisted state was dropped per [ADR-013](013-greenfield-drop-client-legacy-compat.md).

## Consequences

- Positive: predictable structure, parallel team work, easy code review, new slices created directly in FSD
- Negative: overhead when creating files (mitigation: code generation, AI agent, slice templates)
- Risks: excessive structure for small features (mitigation: apply FSD to significant slices only)
