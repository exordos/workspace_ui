# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] — 2026-07-22

### Added

- Independent `workspace_ui` Exordos element with its own public load balancer and versioned `workspace-ui.tar.zst` web artifact (#225)

### Changed

- Public `/api/` traffic now passes through the UI-owned load balancer to the separately deployed Workspace backend (#225)
- Workspace UI and backend can now be released and deployed independently (#225)

### Fixed

- Cold-start login routing no longer races before the authenticated server context is ready (#224)

### Migration notes

- Deploy Workspace backend `0.1.5` or newer before installing or updating `workspace_ui` `0.2.1`.
- Deploy the `workspace_ui` element separately; the backend image no longer owns the web UI artifact or public load balancer.

## [0.2.0] — 2026-07-21

### Added

- Workspace-native messenger flows for project-scoped realtime, chat lists, messages, inbox, starred messages, notifications, forwarding, media, and stream membership (#211)
- IAM project selection and one-time-password login (#217)
- Server-synchronized message drafts with a dedicated drafts view (#217)

### Changed

- Web and desktop sessions now use Workspace API authentication and messaging contracts instead of legacy Zulip credentials (#211)
- Messenger state, cache reconciliation, background projection, and desktop notifications now operate on Workspace-native data (#211)

### Fixed

- Stale realtime cursor recovery and runaway epoch watchdog requests (#217)
- Workspace realtime delivery recovery when a WebSocket errors without closing (#221)
- Multi-tab watchdog recovery when another tab advances the shared durable cursor (#222)

### Migration notes

- The client now requires Workspace API and IAM project access; the legacy Zulip credential path is no longer supported.
- Existing sessions may require project selection and authentication after upgrading.

## [0.1.13] — 2026-06-26

### Added

- Resizable chat list in the sidebar (#197)

### Changed

- Sidebar chat card layout and shared action slot (#197)

### Fixed

- Aborted requests no longer logged as errors (#197)
- Zulip emoji catalog resolution for picker reactions (#197)
- Message bubble visualization and reaction emoji sizing (#197)
- Org-scoped async sidebar writes guard (#197)

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
