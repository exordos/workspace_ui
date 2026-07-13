# Release Guide

Step-by-step instructions for publishing a new version of Workspace UI.

For policy background see [`docs/adr/006-versioning.md`](docs/adr/006-versioning.md).

## Overview

```
feature/fix branches → release branch → version bump + CHANGELOG
       → PR to master (merge commit) → tag push → GitHub Release
```

| Step                   | Result                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm run version:bump` | Updates `lerna.json`, root `package.json`, and all `packages/*`          |
| PR merge to `master`   | Release commit lands on default branch                                   |
| `npm run version:tag`  | Pushes semver tag (no `v` prefix)                                        |
| GitHub Actions on tag  | Builds Electron for Linux / Windows / macOS and publishes GitHub Release |

**Important:** pushing to `master` alone runs CI and Electron builds, but **does not** create a GitHub Release. A Release is created only when a semver tag is pushed.

GitLab CI mirrors check/e2e/web build only — it does not publish releases on tags.

---

## Prerequisites

- Node.js ≥ 22 (see `.nvmrc`)
- Clean working tree on latest `master`
- All changes for the release already merged or collected on a release branch
- `gh` CLI (optional, for monitoring CI and releases)

```bash
git checkout master
git pull origin master
npm run check   # typecheck + lint + test + audit
```

---

## Versioning

Single version for the entire monorepo (Lerna **fixed mode**). Source of truth: `lerna.json`.

| Bump         | When                                       | Command                         |
| ------------ | ------------------------------------------ | ------------------------------- |
| **Patch**    | Bug fixes, performance, dependency updates | `npm run version:bump -- patch` |
| **Minor**    | New features, backward-compatible          | `npm run version:bump -- minor` |
| **Major**    | Breaking API or data format changes        | `npm run version:bump -- major` |
| **Explicit** | Set exact version                          | `npm run version:bump -- 1.2.3` |

Current version:

```bash
npm run version:print
```

Git tags use semver **without** the `v` prefix: `0.1.10`, not `v0.1.10`.

---

## Release workflow

### 1. Create a release branch

Branch from `master` using the project naming convention:

```bash
git checkout master
git pull origin master
git checkout -b chore/release-0.1.11
```

Release branches use **merge commits** when merging to `master` (not squash merge). Feature and fix branches use squash merge.

### 2. Bump the version

```bash
npm run version:bump -- patch   # or minor, major, or x.y.z
```

This runs Lerna with `forcePublish: true` and updates:

- `lerna.json`
- `package.json` (root)
- `packages/web/package.json`
- `packages/electron/package.json`
- `packages/workspace-api/package.json`

Verify:

```bash
npm run version:print
# lerna.json and root package.json must match
```

### 3. Update CHANGELOG.md

Edit [`CHANGELOG.md`](CHANGELOG.md) manually. Format: [Keep a Changelog](https://keepachangelog.com/).

```markdown
## [Unreleased]

## [0.1.11] — YYYY-MM-DD

### Added

- …

### Fixed

- …

### Changed

- …
```

Move items from `[Unreleased]` or summarize merged PRs since the previous tag:

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

### 4. Commit and open PR

```bash
git add -A
git commit -m "chore: release v$(npm run version:print -s)"
git push -u origin chore/release-0.1.11
```

Open a pull request to `master`. Wait for CI (`check` + `e2e`) to pass.

With `gh`:

```bash
gh pr create --base master --title "Chore/release 0.1.11" --body "Release v0.1.11"
gh pr checks --watch
gh pr merge --merge --delete-branch
```

Direct push to `master` is forbidden — always merge via PR.

### 5. Tag on master after merge

After the PR is merged, on an up-to-date `master`:

```bash
git checkout master
git pull origin master
npm run version:print   # confirm version matches the release commit

npm run version:tag
# dry-run first if unsure:
# npm run version:tag:dry-run
```

`scripts/release-tag.mjs` will:

1. Verify `lerna.json` matches root `package.json`
2. Refuse if the tag already exists
3. Create tag `<version>` and push **only the tag** to `origin`

### 6. Wait for CI and GitHub Release

Tag push triggers [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Job              | Platform | Output                                  |
| ---------------- | -------- | --------------------------------------- |
| `check`          | ubuntu   | typecheck, lint, test, audit, web build |
| `e2e`            | ubuntu   | Playwright (Chromium)                   |
| `build-electron` | ubuntu   | `.deb`, `.rpm`, `.AppImage`             |
| `build-electron` | windows  | `.exe` (x64, arm64, universal)          |
| `build-electron` | macos    | `.dmg`, `.zip` (x64, arm64)             |
| `release`        | ubuntu   | GitHub Release with all artifacts       |

Monitor:

```bash
gh run list --limit 5
gh run watch <run-id> --exit-status
gh release view 0.1.11
```

Release URL pattern:

```
https://github.com/exordos/workspace_ui/releases/tag/<version>
```

---

## Local packaging (without CI)

Useful for testing installers before tagging:

```bash
npm run check
npm run build --workspace=web
npm run package:electron:linux   # AppImage, deb, rpm
npm run package:electron:win
npm run package:electron:mac
```

Artifacts land in `packages/electron/release/`.

Electron auto-updater reads version from `package.json` and checks:

```
https://update.workspace.genesis-core.tech/releases
```

(configured in `packages/electron/electron-builder.yml`).

---

## Checklist

- [ ] All intended changes are on `master` or the release branch
- [ ] `npm run check` passes locally
- [ ] Version bumped via `npm run version:bump`
- [ ] `CHANGELOG.md` updated for the new version
- [ ] Commit message: `chore: release vX.Y.Z`
- [ ] PR merged to `master` (merge commit for release branches)
- [ ] `npm run version:tag` run on merged `master`
- [ ] GitHub Actions tag workflow succeeded
- [ ] GitHub Release published with desktop artifacts

---

## Troubleshooting

### Root `package.json` version does not match `lerna.json`

```bash
npm run version:bump -- patch   # re-run bump to align
```

### Tag already exists

Delete the local tag and bump to a new version, or delete the remote tag only if the release was never published:

```bash
git tag -d 0.1.11
git push origin :refs/tags/0.1.11   # use with care
```

### CI passed on PR but Release job did not run

The `release` job runs only when `github.ref_type == 'tag'`. Ensure you ran `npm run version:tag` after merging to `master`, not before.

### PR branch name vs actual version

Branch names like `chore/release-0.1.11` are labels only. The version in `lerna.json` after `version:bump` is authoritative.

---

## Related docs

| Document                                                   | Content                     |
| ---------------------------------------------------------- | --------------------------- |
| [`docs/adr/006-versioning.md`](docs/adr/006-versioning.md) | Versioning ADR              |
| [`CONTRIBUTING.md`](CONTRIBUTING.md#release-process)       | Contributor release section |
| [`CHANGELOG.md`](CHANGELOG.md)                             | Release history             |
| [`scripts/version-bump.mjs`](scripts/version-bump.mjs)     | Bump script                 |
| [`scripts/release-tag.mjs`](scripts/release-tag.mjs)       | Tag script                  |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml)     | CI and release pipeline     |
