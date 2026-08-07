# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.6] — 2026-08-06

### Added

- The topic information panel now shows AI-generated topic context when the
  backend supplies summary metadata, including pending, disabled, and
  new-message states.

### Changed

- macOS release artifacts for Apple Silicon and Intel are now Developer ID
  signed and notarized in a protected tag-only job. Release publication fails
  closed unless signatures, hardened runtime, secure timestamps, stapled
  tickets, Gatekeeper acceptance, signing team, and architectures are verified.

### Fixed

- Per-topic read boundaries are persisted across cached and realtime state, so
  previously read messages no longer reappear as unread after switching clients
  or reloading the application.
- Initial chat positioning waits for restored read state and preserves its
  viewport anchor while older or newer pages and realtime messages arrive,
  preventing stale unread dividers and unexpected scroll jumps.

### Requirements and compatibility

- Requirements are unchanged from `0.4.5`: Exordos Core `0.2.3` or newer and
  Workspace backend `0.1.30` or newer.
- Topic-summary fields remain optional; the context panel shows the available
  empty or disabled state when summary metadata is not provided.
- The local messenger cache upgrades automatically from schema version 6 to 7.
  No manual client or server data migration is required.

### Migration notes

- Update `workspace_ui` to `0.4.6`.
- macOS desktop packages now require the signed and notarized release pipeline;
  no user-side signing configuration is needed.

## [0.4.5] — 2026-08-04

### Changed

- Stream and topic unread badges now prefer active unread messages, fall back to
  a muted-color passive count, and stay hidden when both counters are zero.
- A muted stream with an explicitly active topic remains in the active sidebar
  group with normal title emphasis while retaining its muted-stream indicator.
- Fully muted streams remain in the muted group, and muted topics use passive
  badge styling in both the sidebar and channel information panel.
- Inbox, folder, organization, and workspace-session badges now use active
  unread counts only, so passive traffic does not raise attention indicators.
- Desktop notification decisions now honor explicit topic overrides and the
  effective notification mode inherited from the parent stream.

### Requirements and compatibility

- Requires Exordos Core `0.2.3` or newer.
- Requires Workspace backend `0.1.30` or newer because stream, topic, and folder
  payloads must provide separate active and passive unread counters.
- No persisted-data or client-data migration is required.

### Migration notes

- Update the Workspace backend to `0.1.30` or newer before updating
  `workspace_ui` to `0.4.5`.

No client or server data migration is required.

## [0.4.4] — 2026-08-04

### Added

- Activity now includes a dedicated Mentions view for messages that mention the
  current user.
- Favorites opens a personal self-chat for saved messages and notes.

### Changed

- Workspace message bodies have richer formatting and file-reference rendering,
  with message metadata kept next to the trailing content.
- The messenger sidebar highlights personal mentions, exposes notification modes,
  and groups muted conversations after active conversations.
- Settings, external-account controls, message actions, icons, date dividers, and
  chat-list states have been refined for more consistent navigation.

### Fixed

- Authoritative topic data and completed network bootstraps can no longer be
  replaced by stale cached names or delayed IndexedDB hydration.
- Reply composition preserves the existing draft and scroll position, then clears
  the reply context after the message is sent.

### Requirements and compatibility

- Requirements are unchanged from `0.4.3`: Exordos Core `0.2.3` or newer and
  Workspace backend `0.1.18` or newer.
- No Workspace API, persisted-data format, or client data migration changes are
  introduced by this release.

### Migration notes

- Update `workspace_ui` to `0.4.4`.

No client or server data migration is required.

## [0.4.3] — 2026-07-31

### Fixed

- The Workspace UI load balancer now owns an HTTP-only default site, so its
  internal nodes no longer expose a fallback TLS listener without a configured
  certificate. The site-specific public TLS layer continues to forward traffic
  to the Workspace load balancer on port 80.
- Message-route links render their anchor before surrounding context finishes
  loading, preventing valid deep links from appearing unavailable temporarily.
- URL-shaped URNs in message content are rendered as links.

### Requirements and compatibility

- Requirements are unchanged from `0.4.2`: Exordos Core `0.2.3` or newer and
  Workspace backend `0.1.18` or newer.
- No Workspace API, persisted-data format, or client data migration changes are
  introduced by this release.

### Migration notes

- Update `workspace_ui` to `0.4.3`.

No client or server data migration is required.

## [0.4.2] — 2026-07-29

### Fixed

- Stable `.deb` packages are now published from the internal self-hosted runner, so apt repository updates no longer depend on exposing the repository host to GitHub-hosted runners.
- Apt publication clears persistent runner workspaces before downloading artifacts and uploads only the `.deb` files selected for the current release, preventing stale packages or unrelated files from entering the release batch.
- Temporary SSH material used by apt publication is stored in the runner's per-job temporary directory and removed after the job.

### Requirements and compatibility

- Requirements are unchanged from `0.4.1`: Exordos Core `0.2.3` or newer and Workspace backend `0.1.18` or newer.
- No application, Workspace API, persisted-data, server, or client runtime changes are introduced by this release.

### Migration notes

- Update `workspace_ui` to `0.4.2`.

No client or server data migration is required.

## [0.4.1] — 2026-07-29

### Added

- Debian and Ubuntu packages are published to the shared Exordos apt repository on every release, so the desktop application updates through `apt upgrade`. Setup instructions are in `docs/apt-repository.md`.

### Requirements and compatibility

- Requirements are unchanged from `0.4.0`: Exordos Core `0.2.3` or newer and Workspace backend `0.1.18` or newer.
- No application code changes: this release only adds package publication.

### Migration notes

- Update `workspace_ui` to `0.4.1`.

No client or server data migration is required.

## [0.4.0] — 2026-07-29

### Added

- External-account synchronization settings can switch a Zulip account between
  manual chat selection and automatic connection of current and new chats
  within the administrator-defined limit. Selection mode and history depth are
  saved together with conflict handling (#255).
- Workspace-native message references render as quote cards, resolve the source
  message from the active store, durable cache, or server, and show a safe
  unavailable state when the source can no longer be loaded (#255).
- The user profile panel now exposes richer profile details and actions. The
  current user can edit supported fields and change or remove the avatar from
  the same save flow (#255).
- Channel and direct-message chats have dedicated headers. Channel headers show
  topic and member presence details, while direct-message headers show the
  partner avatar, presence, typing or custom status, profile action, and call
  action when available (#255).

### Changed

- The desktop application identifies itself as Exordos Workspace instead of
  Electron: window class, taskbar entry, Linux desktop entry, package name, and
  application-data directory now use `exordos-workspace`. Existing packaged
  profiles named `Exordos Workspace` or `electron-app` are carried over on
  first start, so accounts and sessions survive the rename. The shared
  unpackaged `Electron` profile is deliberately left untouched.
- The menu bar is hidden on Windows and Linux, where it only repeated the tray menu and the window controls. Keyboard shortcuts (copy/paste, reload, developer tools, zoom, full screen, quit) are unchanged, and the macOS menu bar is untouched.
- External-account onboarding and synchronization controls use clearer manual
  and automatic-mode descriptions, save-state feedback, and selection
  safeguards while settings are being changed (#255).
- Profile, sidebar, message metadata, quote, reply, and forward layouts were
  refined with updated icons and more consistent selected-state highlighting
  (#255).

### Fixed

- Draft deletion is persisted before the remote request, consumed drafts cannot
  be restored into the composer, and failed remote deletions remain visible
  with an explicit retry action instead of reviving sent text (#255).
- Avatar changes are included in the profile save transaction and remain
  visible after the profile is refreshed (#255).
- Reply and edit restoration preserve Workspace-native quote references instead
  of degrading them to stale rendered text (#255).

### Requirements and compatibility

- Requirements are unchanged from `0.3.0`: Exordos Core `0.2.3` or newer and
  Workspace backend `0.1.18` or newer.
- Zulip external-account synchronization requires `workspace_zulip_bridge`
  `0.0.11` or newer.
- No Workspace API, server-side persisted-data format, or server migration
  changes are introduced by this release.

### Migration notes

- Update `workspace_ui` to `0.4.0`.
- On the first packaged desktop start, an existing application-specific profile
  is moved to the `exordos-workspace` profile automatically. No manual account
  or session migration is required.

No browser, PWA, or server data migration is required.

## [0.3.0] — 2026-07-28

### Added

- External-chat setup can select or clear all available chats visible through the current search, including an indeterminate state for partial selections (#251)

### Changed

- Activity, Feed, and Inbox now use the full available content width (#251)
- External synchronization actions use shorter, clearer labels (#251)

### Fixed

- Clearing local application data preserves Workspace authentication sessions and the selected account (#251)
- Sent draft deletion retries stale-ETag conflicts when the server content still matches, preventing already-sent text from returning as a conflicted draft after navigation (#250)

### Requirements and compatibility

- Requirements are unchanged from `0.2.4`: Exordos Core `0.2.3` or newer and Workspace backend `0.1.18` or newer.
- Zulip external-account synchronization requires `workspace_zulip_bridge` `0.0.11` or newer.
- No API, persisted-data format, or server migration changes are introduced by this release.

### Migration notes

- Update `workspace_ui` to `0.3.0`.

No client or server data migration is required.

## [0.2.4] — 2026-07-27

### Fixed

- Draft deletion tombstones are persisted before the server delete begins, closing the reload window that could restore already-sent text (#245)

### Requirements and compatibility

- Requirements are unchanged from `0.2.3`: Exordos Core `0.2.3` or newer and Workspace backend `0.1.18` or newer.
- No API, persisted-data format, or migration changes are introduced by this patch release.

### Migration notes

- Update `workspace_ui` to `0.2.4`.

No client or server data migration is required.

## [0.2.3] — 2026-07-27

### Fixed

- Persisted deletion tombstones are excluded from composer restoration after reload (#243)

### Requirements and compatibility

- Requirements are unchanged from `0.2.2`: Exordos Core `0.2.3` or newer and Workspace backend `0.1.18` or newer.
- No API, persisted-data, or migration changes are introduced by this patch release.

### Migration notes

- Update `workspace_ui` to `0.2.3`.

No client or server data migration is required.

## [0.2.2] — 2026-07-27

### Added

- Zulip external-account onboarding, lifecycle management, chat selection, provider administration, realtime projection, and cached integration state (#240)
- Protected video previews in messenger conversations (#234)

### Changed

- Messenger, profile, settings, and responsive UI refinements (#231)
- Exordos element publication now uses the organization-level push configuration (#235)

### Fixed

- Redundant server draft updates are no longer emitted (#232)
- Message sort parameters are preserved across messenger requests (#233)
- Incomplete search actions remain hidden and external-account credential labels are restored (#234)
- Unread indicators stay synchronized and deferred auto-read resumes after window focus returns (#239)

### Requirements and compatibility

- Requires Exordos Core `0.2.3` or newer.
- Requires Workspace backend `0.1.18` or newer.
- Zulip external-account synchronization requires `workspace_zulip_bridge` `0.0.11` or newer.

### Migration notes

1. Update Workspace backend to `0.1.18`.
2. Update `workspace_zulip_bridge` to `0.0.11`.
3. Update `workspace_ui` to `0.2.2`.

No client or server data migration is required.

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
