# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3] — 2026-06-03

### Changed

- Default HTTP path layout when `VITE_WORKSPACE_API_PATH` (and related path env vars) are unset is now **Workspace gateway** (`/workspace/v1` for workspace API path). Vanilla Zulip: set `VITE_WORKSPACE_API_PATH=/api/v1` (see `docs/adr/008-workspace-http-path-defaults.md).
- Dependency and CI updates; greenfield client legacy cleanup

### Fixed

- Read/mark-as-read message handling and chat scroll-to-bottom behavior
- Folder chat type preservation in sidebar (#98)

## [0.1.2] — 2026-06-02

### Fixed

- Keep chat scroll position (#97)
- Embed CSRF handling (#96)

### Added

- macOS CI builds

## [0.1.1] — 2026-06-01

### Bug Fixes

- restore tail autoscroll at bottom (#92)

### Other

- Fix/release fixes (#93)
