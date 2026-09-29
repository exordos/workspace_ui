# Frontend architecture

The project uses Feature-Sliced Design with concrete module imports. Current entrypoints are listed in [Project Facts](PROJECT_FACTS.md), not duplicated as a full filesystem inventory here.

## Ownership

| Layer      | Owns                                                      |
| ---------- | --------------------------------------------------------- |
| `app`      | App entry, router, global providers and composition       |
| `pages`    | Route-level composition and intent                        |
| `widgets`  | Shell and composite UI, lifecycle wiring                  |
| `features` | User scenarios such as forwarding or downloading a file   |
| `entities` | Domain state, adapters, actions and domain lifecycle      |
| `shared`   | Domain-independent UI, utilities and transport primitives |

Dependencies flow `app -> pages -> widgets -> features -> entities -> shared`. Shared code must not reach upward into domain stores; inject callbacks or data at the composition boundary.

Prefer composing sibling features/widgets in a higher layer instead of coupling them. Existing entity-to-entity dependencies exist (for example messenger request ownership depends on workspace-runtime); keep those explicit, acyclic and limited to domain responsibilities. `getState()` does not bypass dependency rules. Do not introduce an abstraction solely to satisfy a file template.

## Files and imports

Use descriptive kebab-case filenames and existing segment conventions: `.model.ts`, `.api.ts`, `.types.ts`, `.lib.ts`, `.hook.ts`, `.ui.tsx`. Shared UI also uses existing names such as `avatar.tsx`.

Create only the files required by the change. A small component does not require a separate types file, store, API module, or new directory hierarchy.

Import concrete modules:

```ts
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import { Avatar } from "~/shared/ui/avatar";
```

`~/` resolves to `packages/web/src/`. Do not create barrel-only `index.ts` exports. See the [import rule](../.cursor/rules/no-barrel-index.mdc).

## Workspace data flow

1. IAM establishes the session and runtime owner in `entities/workspace-auth`.
2. Shell hooks compose catalog/message hydration and realtime lifecycle.
3. Workspace clients decode API DTOs; entity adapters convert them to domain values.
4. `entities/messenger` owns catalogs and actions; `entities/message` owns message state.
5. UI reads narrow selectors and sends intent through features or entity actions.

Use UUID-native identifiers and the [runtime ownership rules](ORG_SCOPED_ASYNC_SAFETY.md). Restore owned cached data before server refresh where appropriate. Preserve ordering, pagination markers, read boundaries and realtime cursor semantics.

The previous Zulip/FSD migration is history, not a template for new work. Do not recreate removed instance/chat-list stores or add Zulip fallback behavior to Workspace routes.

## Working references

- [Integration workflow](INTEGRATION_GUIDE.md)
- [Store map](STORES_REFERENCE.md)
- [UI map](COMPONENT_CATALOG.md)
- [API map](API_CLIENT_REFERENCE.md)
- [Messenger cache](WORKSPACE_MESSENGER_CACHE.md)
