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

## Capability limits

Search-result storage helpers do not imply a working server search API. Check the current [API map](API_CLIENT_REFERENCE.md), [use cases](USE_CASES.md) and backend contracts before adding search or message-window behavior. Anchor navigation already has a [Workspace feature](../packages/web/src/features/workspace-message-anchor-navigation/); distinguish its implemented loading strategy from a server-provided page-around-message endpoint.

For cache changes, test affected persistence and owner-switch races. For hydration/scroll changes, also verify the relevant user flow and state the limits of browser/native validation.
