# ADR-006: Semantic Versioning with synced monorepo packages

**Date**: 2026-03
**Status**: accepted

## Context

Monorepo with 3 packages (web, electron, mock-server). Electron auto-updater and Sentry releases depend on consistent version numbers. Need a clear versioning policy.

## Decision

Single version number across all packages. Semantic Versioning 2.0.

- **MAJOR** (1.0.0): breaking API changes, incompatible data format, major UX redesign
- **MINOR** (0.2.0): new features, new screens, new API endpoints, backward-compatible
- **PATCH** (0.1.1): bug fixes, performance improvements, dependency updates

All packages (`root`, `web`, `electron`) bump together via `scripts/version.mjs`.

Each release:

1. **GitHub Actions** (recommended): workflow `.github/workflows/release.yml` — `workflow_dispatch` with `patch` | `minor` | `major` on the default branch. It runs `version:bump`, commits, tags `X.Y.Z` (no `v` prefix), and pushes.
2. **Local** (alternative): `npm run version:bump <patch|minor|major>` → review `CHANGELOG.md` → commit `chore: release v<version>` → `git tag <version>` → push with tags.

Pushing a semver tag triggers CI (`build-electron` + GitHub Release).

## Consequences

- Positive: one version to track, Electron updater and Sentry aligned
- Negative: packages bump even if unchanged (acceptable for private monorepo)
- Git tags trigger CI release builds
