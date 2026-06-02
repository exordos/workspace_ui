# ADR-006: Semantic Versioning with synced monorepo packages

**Date**: 2026-03
**Status**: accepted

## Context

Monorepo with multiple packages (web, electron, workspace-api, mock-server). Electron auto-updater and Sentry releases depend on consistent version numbers. Need a clear versioning policy.

## Decision

Single version number across all packages. Semantic Versioning 2.0.

- **MAJOR** (1.0.0): breaking API changes, incompatible data format, major UX redesign
- **MINOR** (0.2.0): new features, new screens, new API endpoints, backward-compatible
- **PATCH** (0.1.1): bug fixes, performance improvements, dependency updates

**Lerna fixed mode** (`lerna.json` `version` field): root (`.`) and all `packages/*` bump together via `lerna version` with `forcePublish: true`. Source of truth: `lerna.json`; root `package.json` `version` is updated by Lerna directly.

`CHANGELOG.md` is updated manually at release time.

Each release (local):

1. `npm run version:bump -- <patch|minor|major>` — Lerna updates all workspace packages + `lerna.json`, then syncs root `package.json`
2. Edit `CHANGELOG.md` if needed
3. `git add -A && git commit -m "chore: release v<version>"` → merge to `master` via MR (direct push forbidden)
4. On `master` after merge: `npm run version:tag` — creates tag `<version>` (no `v` prefix) and pushes tag only

Pushing a semver tag to GitHub triggers CI (`build-electron` + GitHub Release with desktop artifacts). Push to `master` alone runs check/e2e/build but does **not** create a GitHub Release.

GitLab CI does not run pipelines on tags (branch/MR only).

## Consequences

- Positive: one version to track, standard Lerna tooling, Electron updater and Sentry aligned
- Negative: packages bump even if unchanged (`forcePublish`); root version requires sync script (not a Lerna package)
- Git tags trigger GitHub Actions release builds
