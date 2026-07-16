# ADR 010: IndexedDB subsystem layout

## Status

Accepted and implemented incrementally (2026-07-16)

## Context

Messenger state must render without repeatedly downloading unchanged entities,
messages, avatars, and protected files. Cached data is account-specific and must
not cross IAM origin, project, or user boundaries.

The earlier generic `shared/lib/idb/` scaffold was removed. The existing
`message-cache-db.ts` database is already the stable migration boundary used by
specialized snapshot modules, so replacing it with a second abstraction would
add migration risk without improving ownership.

## Decision

Keep one versioned `message-cache` IndexedDB database with domain-specific
modules owning their records. `message-cache-db-upgrade.lib.ts` remains the
schema source of truth and creates stores for:

- messages and chat metadata;
- chat-list, users, folders, and mute snapshots;
- Messenger users, streams, topics, and binding snapshots;
- protected file metadata and binary blobs;
- avatar blobs and user-to-file avatar pointers.

Cache keys include the instance/account scope required by each store. Protected
Workspace files use the full IAM origin/project/user partition and a
server-provided content hash as their revision.

Bootstrap is cache-first and single-flight. REST and realtime events refresh or
invalidate targeted rows. Only an explicit expired server event cursor (HTTP
`410` or WebSocket close `4410`) clears the current account cache and starts a
full resynchronization.

IndexedDB remains a rebuildable UI projection. PostgreSQL, IMAP, and object
storage on the backend remain authoritative.

## Consequences

- Cached Messenger UI can render immediately and then converge through the event
  stream instead of refetching every entity on each load.
- Reconnects preserve useful cache state; only a server-declared cursor gap
  triggers full invalidation.
- Account partitioning and authorization failures prevent cached protected files
  from leaking across users or surviving revoked access.
- `message-cache-db.ts` remains the schema source of truth, while specialized
  modules keep domain rules explicit.
- Schema upgrades create the latest required shape; IndexedDB contents may be
  discarded because they are rebuildable.
