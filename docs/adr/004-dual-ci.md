# ADR-004: Dual CI — GitHub Actions + GitLab CI

**Date**: 2026-03
**Status**: accepted

## Context

The team works with two git hosting platforms: GitHub and GitLab. The ability to run CI on both without duplicating logic is needed.

## Decision

Two CI files with mirrored logic, both using the same npm scripts:

| Stage | GitHub Actions            | GitLab CI                                                           |
| ----- | ------------------------- | ------------------------------------------------------------------- |
| check | `ci.yml → check`          | `typecheck`, `lint`, `prettier`, `unit-tests`, `build-web`, `audit` |
| e2e   | `ci.yml → e2e`            | `e2e-tests`                                                         |
| build | `ci.yml → build-electron` | `electron-linux/windows/macos`                                      |

Principle: all logic lives in npm scripts (`npm run check`, `npm run e2e`, `npm run package:electron:*`). CI files are orchestration only.

## Consequences

- Positive: works on both platforms, logic is not duplicated (scripts)
- Negative: two configuration files need to be kept in sync
- Mitigation: ADR documents the mapping, documentation in Cursor rule
