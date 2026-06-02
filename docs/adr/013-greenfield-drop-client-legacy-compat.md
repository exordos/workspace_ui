# ADR 013: Greenfield — drop client legacy compatibility

**Date**: 2026-06-02  
**Status**: accepted

## Context

Workspace UI historically carried several pieces of client-side backward compatibility:

- Copy-on-read migrations for `localStorage` keys (unscoped → org-scoped).
- Legacy persisted settings fields (e.g. `chatSorting` derived from older flags).
- Incremental IndexedDB migrations for the message cache database.
- Legacy URL handling for stream routes without numeric `stream_id`.
- Legacy folder/pin `chat_id` aliases (bare numeric ids, multiple representations).

This service now starts from scratch (greenfield). Backward compatibility with previously persisted client state is not required and increases complexity, test surface, and the risk of shipping dead branches.

## Options

1. **Keep all legacy compatibility**  
   Pros: safer for existing installations.  
   Cons: ongoing complexity and maintenance cost; obscures the “real” contracts.

2. **Drop client-side legacy compatibility (greenfield)**  
   Pros: simpler codepaths, fewer tests, clearer contracts, faster iteration.  
   Cons: breaking change for existing installations (requires resetting browser storage).

3. **Drop everything including server (Zulip) API fallbacks**  
   Pros: smallest client code.  
   Cons: forces a minimum Zulip version contract and may break multi-server support.

## Decision

We choose **Option 2**:

- Remove client-side backward compatibility for persisted browser state (localStorage + IndexedDB),
  legacy routes, and legacy folder/pin identifiers.
- **Keep** server-side (Zulip API) fallbacks and parsing, because they are not client-data
  migrations and still provide value when connecting to different server versions.

## Consequences

- Codebase becomes simpler: fewer “legacy” branches and fewer migration tests.
- Existing dev installs may need a one-time reset.

### Developer break-glass reset

If you are developing locally and hit broken state after this change:

- **Reset localStorage** for the app origin in DevTools → Application → Storage.
- **Delete IndexedDB** database used by the message cache (`message-cache` / `MESSAGE_CACHE_DB_NAME`)
  in DevTools → Application → IndexedDB.
