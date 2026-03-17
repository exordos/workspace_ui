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

Current FSD structure:

- **11 entities**: call, chat-list, draft, feed, folder, inbox, instance, message, sticker, theme, user
- **16 features**: ai-reply, chat-info, create-chat, instance-switch, jitsi-call, manage-folders, media-viewer, mention-suggest, message-readers, mute-chat, pin-chat, settings, sticker-picker, theme-picker, typing-indicator, user-profile
- **10 widgets**: layout, sidebar, chat-view, message-list, message-composer, top-bar, folder-rail, right-panel, search-modal, profile-drawer
- **9 pages**: activity, calendar, calls, chat, feed, inbox, licenses, login, mail
- **shared**: UI primitives, API client, utility modules, config, icon set

Legacy directories (`components/`, `stores/`, `lib/`, `contexts/`) remain for backward compatibility and will be removed in a cleanup pass.

## Consequences

- Positive: predictable structure, parallel team work, easy code review, new features (sticker, ai-reply) created directly in FSD
- Negative: overhead when creating files (mitigation: code generation, AI agent, slice templates)
- Risks: excessive structure for small features (mitigation: apply FSD to significant slices only)
