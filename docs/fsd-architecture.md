# Frontend architecture

The project uses Feature-Sliced Design with explicit module boundaries. Current entrypoints are listed in [Project Facts](PROJECT_FACTS.md), not duplicated as a full filesystem inventory here.

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

A standalone module has one cohesive responsibility, an owner in the appropriate FSD layer, and an explicit, bounded consumer API. Its internals can be reorganized while preserving that contract. File count and number of consumers do not define the boundary: one consumer is sufficient, and a subfolder or helper is not automatically a separate module.

Such a module may use an `index.ts` containing only explicit named re-exports and `export type`:

```ts
// Illustrative shared/ui/button/index.ts; no relocation is required.
export { Button } from "./button";
export type { ButtonProps } from "./button.types";
```

Export only symbols deliberately included in the public contract. A helper may be public when it is deliberately part of that contract; implementation helpers, tests, stories and fixtures stay out of the production API. Do not use `export *`, aggregate unrelated modules, or hide initialization and side effects in an index. Do not create layer/category mega-barrels such as `shared/index.ts`, `shared/ui/index.ts`, `shared/lib/index.ts` or `features/index.ts`.

Import according to the boundary:

- Outside a module, use its established public index, including when calling another module in a nearby folder. This does not grant new same-layer imports or relax FSD dependency rules.
- Inside the same module, use direct relative imports to concrete files, never its own index. Importing through an index that re-exports the caller can create a cycle. Module-owned tests and stories may directly import internals they exercise.
- Where no module public entrypoint is established, existing concrete implementation/type imports remain valid:

```ts
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import { Avatar } from "~/shared/ui/avatar";
```

`~/` resolves to `packages/web/src/`. Indexes are optional: do not create one for every helper or folder, scaffold module trees, or retroactively migrate working imports merely for consistency. Existing indexes with real implementation may remain natural entrypoints. An index alone does not enforce encapsulation; the module contract and FSD rules still apply.

For example, inside `button.tsx`, import types from `./button.types`; avoid importing them from `.` if that resolves to the index exporting `Button`. Outside the module, use its public index when one exists. A global `shared/ui/index.ts` collecting every component is not a substitute for these module boundaries.

Do not infer a performance defect from an index alone. Development loading and production tree-shaking depend on the dependency graph, side effects and tooling.

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
