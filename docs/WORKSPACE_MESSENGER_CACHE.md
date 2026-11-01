# Workspace messenger cache

The Workspace cache is implemented. Its original [July plan](archive/WORKSPACE_MESSENGER_CACHE_PLAN.md) is historical; do not restart its phases or treat its backend-gap statements as current contracts.

## Sources

| Concern                                     | Source                                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexedDB repository, database name/version | [workspace-messenger-cache-db.ts](../packages/web/src/shared/lib/workspace-messenger-cache-db.ts)                                                                                                              |
| Schema and upgrades                         | [workspace-messenger-cache-db-upgrade.lib.ts](../packages/web/src/shared/lib/workspace-messenger-cache-db-upgrade.lib.ts)                                                                                      |
| Domain adapters and writes                  | [messenger-cache.lib.ts](../packages/web/src/entities/messenger/messenger-cache.lib.ts)                                                                                                                        |
| Catalog hydration and server refresh        | [messenger-bootstrap.lib.ts](../packages/web/src/entities/messenger/messenger-bootstrap.lib.ts)                                                                                                                |
| Message windows and pagination              | [messenger-messages-loader.lib.ts](../packages/web/src/entities/messenger/messenger-messages-loader.lib.ts)                                                                                                    |
| Store projections                           | [messenger.model.ts](../packages/web/src/entities/messenger/messenger.model.ts), [message.model.ts](../packages/web/src/entities/message/message.model.ts)                                                     |
| Realtime/cursor ownership                   | [workspace-runtime.types.ts](../packages/web/src/entities/workspace-runtime/workspace-runtime.types.ts), [realtime runtime](../packages/web/src/shared/lib/workspace-realtime/)                                |
| Cache regression tests                      | [workspace-messenger-cache-db.test.ts](../packages/web/src/shared/lib/workspace-messenger-cache-db.test.ts), [messenger-cache.lib.test.ts](../packages/web/src/entities/messenger/messenger-cache.lib.test.ts) |

## Invariants

- Cache identity includes account, instance, organization, project and user. Generation protects live writes but is not a durable owner key; see [async safety](ORG_SCOPED_ASYNC_SAFETY.md).
- Restore useful owned cache before refresh where appropriate. A late hydrate must not overwrite a newer server/realtime projection.
- Messages use UUIDs and may appear in conversation buckets. Preserve message ordering and window boundaries; `page_marker` is an opaque server pagination token, not a sort key.
- UI components do not write directly to IndexedDB. Use the owning entity flow so store and cache updates remain consistent.
- Preserve read boundaries, reaction state semantics, deletion fences and catalog reconciliation. Cache invalidation must not resurrect removed resources.
- Retention and logout/account cleanup are owner-scoped. Do not clear another owner's cache as a shortcut.
- Existing schema upgrades are part of the current contract. Historical permission to drop Zulip cache compatibility is not permission to discard current Workspace data.

## External-provider direct conversations

The catalog retains physical streams and topic UUIDs for each provider. Sidebar and topic-list projections group visible unencrypted direct streams only by the exact counterpart Workspace UUID, project and viewer. Names and email addresses do not establish identity. Encrypted conversations stay separate.

A grouped row sums stream counters and retains each topic's physical route for message delivery. Default external topics are named `telegram` and `zulip`. Additional topics use the existing canonical native direct-stream creation action; they are never sent as new Telegram or Zulip threads. Stored catalogs, cache buckets and backend permissions keep their physical UUIDs.

Telegram channel and basic-group catalog entries use the channel audience while retaining the backend's membership-restricted `private` access flag. Direct conversations remain personal. No history-depth or chat-selection settings are persisted for Telegram: all accessible history imports automatically.

## Realtime memory bounds

REST catch-up delegates sorted event runs to batch-capable appliers. Adjacent `message.created` events are applied in groups of at most 100; edits, reads, deletes, catalog changes, duplicates and unsupported envelopes preserve their ordering barriers. Active message and pointer maps are copied once per group. Both active and background owners use the batch cache writer; background application never writes active message stores.

Each created group writes bodies once, stream/topic buckets, window bounds, monotonic activity pointers and its IndexedDB cursor in one transaction. Live WebSocket events remain individually awaited, including their cursor write. Transport advances its durable cursor only after every applier completes and the owner/generation is still current. Cache failures remain best effort; persistence work must not accumulate as detached promises.

Retention uses the existing `byConversationOrder` index to count rows, read the first/last retained entries and fetch only the entries to evict. All affected conversation views are trimmed atomically; body and own-reaction cleanup checks remaining references in that transaction. Historical imports cannot leave bodies behind after both stream and topic references are removed by retention. No schema upgrade or cache reset is required.

Read-boundary updates read only the newly covered interval. Every body insertion path applies the durable boundary, including late history/snapshot writes. Boundaries from older clients materialize their full prefix once before incremental reads are enabled.

Each socket queues at most 256 pending frames or 4 MiB of estimated string storage. On overflow, transport releases the queued frames, waits for the current event to complete, then reconnects through REST catch-up from the completed cursor. Closing a socket or replacing its owner releases its pending queue; stale completions cannot advance the replacement transport cursor. A synchronous frame burst yields to browser tasks every 32 frames.

Conversation selector memoization uses weak message-map keys so visiting another conversation cannot keep an obsolete full message map alive.

Compact list previews reuse Markdown summaries across read/reaction snapshots. Their in-memory cache is limited to 512 entries and 1 MiB of estimated UTF-16 input/output storage, invalidates on locale changes, and clears on message-store owner changes. Sender names and routes are resolved from the current view; encrypted plaintext is not cached here.

The sidebar publishes presentation snapshots at most once per 100 ms during realtime bursts; canonical stores, event order and persistence still update for every event. Hidden documents defer sidebar publication until visibility returns. User interaction and view selection flush the latest snapshot, while owner/generation changes and loading errors invalidate it immediately. Pending publication is cancelled on unmount and owner replacement.

Topic grouping reuses one index per immutable catalog snapshot through weak keys. Date labels reuse at most 12 formatters; locale and visibility changes select or refresh them. One sidebar clock refreshes relative labels at local midnight and on visibility return, including memoized rows.

## Capability limits

Search-result storage helpers do not imply a working server search API. Check the current [API map](API_CLIENT_REFERENCE.md), [use cases](USE_CASES.md) and backend contracts before adding search or message-window behavior. Anchor navigation already has a [Workspace feature](../packages/web/src/features/workspace-message-anchor-navigation/); distinguish its implemented loading strategy from a server-provided page-around-message endpoint.

For cache changes, test affected persistence and owner-switch races. For hydration/scroll changes, also verify the relevant user flow and state the limits of browser/native validation.

## Provider posting capability and user provenance

Stream DTOs can expose `can_send` and `announcement_only`. Adapters retain them as `canSend` and `announcementOnly`; older server/cache rows remain readable. The composer and its send callback respect an explicit capability denial. Stream snapshots propagate account disable/reauthorization and posting-right changes through the existing realtime and cache path. The backend remains authoritative for every write. `announce` continues to describe the creation notification. The existing announcement-only creation control sends `announcement_only` for an ordinary native channel.

User DTO `source` is retained in the user store and durable profile cache. Profile and mention suggestions display Workspace, Zulip or Telegram provenance when available; older cached users do not invent a source. Mention URNs remain Workspace UUIDs, and the physical topic's provider resolves the destination identity.

## Large imported catalogs

Direct-conversation grouping indexes each immutable stream catalog once and keeps
project, viewer and counterpart UUID boundaries. Closed stream menus subscribe
to folder details only when opened. Sidebar rows reuse the existing visibility
hook to defer interactive controls until near the scroll viewport; active,
expanded and searched rows render immediately. A visited row remains mounted so
sorting or scrolling does not discard an open menu or dialog.

A folder snapshot and its changed item rows commit in one IndexedDB transaction.
Small item deltas use point lookups, while full snapshots use the existing folder
index. The same owner, generation and timestamp checks still apply before each
write, and realtime cursors keep their existing ordered commit behavior.
