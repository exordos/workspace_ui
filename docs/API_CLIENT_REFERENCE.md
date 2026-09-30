# Workspace API client map

Workspace Messenger uses the Workspace/IAM contracts. Canonical backend contract locations and checkout fallbacks are maintained in [PROJECT_FACTS.md](PROJECT_FACTS.md). This document maps frontend responsibilities; it does not replace the backend endpoint specification.

## Clients and authentication

| Responsibility                                                                  | Source                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IAM login and token operations                                                  | [workspace-iam-auth.ts](../packages/web/src/shared/api/workspace-iam-auth.ts)                                                                                                                          |
| IAM project discovery and capability introspection                              | [workspace-iam-projects.api.ts](../packages/web/src/shared/api/workspace-iam-projects.api.ts), [workspace-iam-introspection.api.ts](../packages/web/src/shared/api/workspace-iam-introspection.api.ts) |
| Workspace users, current user, services, presence, avatars and workspace events | [workspace-client.ts](../packages/web/src/shared/api/workspace-client.ts)                                                                                                                              |
| Messenger entry points                                                          | [messenger-client.ts](../packages/web/src/shared/api/messenger-client.ts)                                                                                                                              |
| Transport, options, pagination parsing and API errors                           | [messenger-transport.internal.ts](../packages/web/src/shared/api/messenger-transport.internal.ts)                                                                                                      |
| REST and WebSocket bearer construction                                          | [messenger-auth.ts](../packages/web/src/shared/api/messenger-auth.ts)                                                                                                                                  |
| Runtime token/session orchestration                                             | [workspace-auth.lib.ts](../packages/web/src/entities/workspace-auth/workspace-auth.lib.ts)                                                                                                             |

The transport defaults are `/api/workspace/v1` for Workspace and `/api/workspace/v1/messenger` for Messenger. Existing runtime helpers supply the appropriate base URL, project and access-token provider. REST authenticates with `Authorization: Bearer …`; public calls omit bearer authentication. Browser WebSocket authentication uses the `bearer.…` subprotocol, not a token in the URL. Do not duplicate token refresh in a component or copy Basic Auth from legacy code.

## Domain endpoints

| Domain                                   | Concrete module                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streams and memberships                  | [messenger-streams.api.ts](../packages/web/src/shared/api/messenger-streams.api.ts)                                                                                                                        |
| Topics                                   | [messenger-topics.api.ts](../packages/web/src/shared/api/messenger-topics.api.ts)                                                                                                                          |
| Messages and message operations          | [messenger-messages.api.ts](../packages/web/src/shared/api/messenger-messages.api.ts)                                                                                                                      |
| Folders                                  | [messenger-folders.api.ts](../packages/web/src/shared/api/messenger-folders.api.ts)                                                                                                                        |
| Drafts                                   | [messenger-drafts.api.ts](../packages/web/src/shared/api/messenger-drafts.api.ts)                                                                                                                          |
| Files and multipart upload               | [messenger-files.api.ts](../packages/web/src/shared/api/messenger-files.api.ts), [messenger-upload.internal.ts](../packages/web/src/shared/api/messenger-upload.internal.ts)                               |
| Realtime epoch, events and subscriptions | [messenger-realtime.api.ts](../packages/web/src/shared/api/messenger-realtime.api.ts)                                                                                                                      |
| External accounts and chats              | [messenger-external-accounts.api.ts](../packages/web/src/shared/api/messenger-external-accounts.api.ts), [messenger-external-chats.api.ts](../packages/web/src/shared/api/messenger-external-chats.api.ts) |
| External provider administration         | [messenger-external-provider-admin.api.ts](../packages/web/src/shared/api/messenger-external-provider-admin.api.ts)                                                                                        |
| Topic summary management                 | [messenger-topic-summary-management.api.ts](../packages/web/src/shared/api/messenger-topic-summary-management.api.ts)                                                                                      |

DTO definitions and runtime guards live in [messenger.types.ts](../packages/web/src/shared/api/messenger.types.ts) and specialized adjacent `*.types.ts` modules. Do not duplicate those interfaces here. Convert DTOs through the existing [domain adapters](../packages/web/src/entities/messenger/messenger-adapters.lib.ts) before writing stores.

## Calling rules

- Use the concrete domain API module and its typed options. `workspace-client.ts` is not a generic `request()` interface, and `shared/api/client.ts` is not the entry point for new Workspace requests.
- Preserve UUID identifiers, backend pagination markers and event generation/version pairs. Do not pass UUIDs into legacy integer-only guards or infer pagination completion from an arbitrary page size.
- Capture async runtime ownership before a request; cancellation alone does not prevent every stale store/cache write. Follow [async safety](ORG_SCOPED_ASYNC_SAFETY.md).
- Keep transport errors and server authorization failures visible to the owning feature. Do not turn failures into fabricated successful domain data or automatically retry a mutation without checking its contract.
- Confirm endpoint availability in the backend contract before implementing it. A UI capability marked `unsupported` describes the current frontend path; it is not proof that every backend deployment lacks the endpoint.
- Extend the existing transport and domain modules rather than introducing a parallel fetch/token/error layer. Import symbols from concrete modules, not a new barrel.

For integration steps and appropriately scoped checks, see [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md).
