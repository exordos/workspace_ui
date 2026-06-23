# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.12] — 2026-06-23

### Added

- Zulip stream references and unknown stream route resolution (#192)
- Top overlay host for system banners (#192)

### Fixed

- Current user cache bootstrap and org-safe register flow (#192)
- Personal/channel folders and system folder unread badges sync (#192)
- Attachment download URL normalization and long link wrapping in messages (#192)

## [0.1.11] — 2026-06-18

### Added

- Edit last message shortcut with message edit policy support (#151)

### Fixed

- Unread count synchronization across inbox, sidebar, and inactive instances (#178)
- Chat read-state, media viewer, and composer UI polish (#178)

## [0.1.10] — 2026-06-16

### Added

- User status emoji metadata support (`emojiCode`, `reactionType`) (#140)

### Fixed

- Org switch race condition (#147)
- Protected media URL trust and sanitization (#146)
- Sentry replay text masking to prevent credential exposure (#124)
- Workspace sibling origin derivation hardening (#123)

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
