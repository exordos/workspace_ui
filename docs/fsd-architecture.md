# Frontend architecture

The project uses Feature-Sliced Design with explicit module boundaries. Current entrypoints are listed in [Project Facts](PROJECT_FACTS.md), not duplicated as a full filesystem inventory here.

## Ownership

Workspace still uses the existing FSD layers for the shell and other applications. The Messenger application is organized as `applications/messenger/pages → features → model`. `runtime/sync` contains the domain implementations of bootstrap, realtime, and projection cleanup. Workspace shell hooks still decide when these operations start and stop.

| Layer          | Owns                                                        |
| -------------- | ----------------------------------------------------------- |
| `app`          | App entry, router, global providers and composition         |
| `applications` | Messenger routes, features, business models and domain sync |
| `pages`        | Route-level composition and intent                          |
| `widgets`      | Shell and composite UI, lifecycle wiring                    |
| `features`     | User scenarios such as forwarding or downloading a file     |
| `entities`     | Domain state, adapters, actions and domain lifecycle        |
| `modules`      | Business domains shared across Workspace applications       |
| `platform`     | Runtime capabilities such as clipboard access               |
| `shared`       | Domain-independent UI, utilities and transport primitives   |

In the legacy tree, dependencies flow `app -> pages -> widgets -> features -> entities -> shared`. Shared code must not reach upward into domain stores; inject callbacks or data at the composition boundary.

Prefer composing sibling features/widgets in a higher layer instead of coupling them. Existing dependencies between domain modules remain explicit and limited to domain responsibilities. Messenger uses `entities/workspace-auth`, `platform/sessions` for context and request validity, and shared API and storage primitives during the migration. `getState()` does not bypass dependency rules. Do not introduce an abstraction solely to satisfy a file template.

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
import { useKnownMessage } from "~/applications/messenger/model/messages/messages-consumers";
```

`~/` resolves to `packages/web/src/`. Indexes are optional: do not create one for every helper or folder, scaffold module trees, or retroactively migrate working imports merely for consistency. Existing indexes with real implementation may remain natural entrypoints. An index alone does not enforce encapsulation; the module contract and FSD rules still apply.

For example, inside `button.tsx`, import types from `./button.types`; avoid importing them from `.` if that resolves to the index exporting `Button`. Outside the module, use its public index when one exists. A global `shared/ui/index.ts` collecting every component is not a substitute for these module boundaries.

Do not infer a performance defect from an index alone. Development loading and production tree-shaking depend on the dependency graph, side effects and tooling.

### Messenger application imports

The app router uses the lazy [Messenger route entry](../packages/web/src/applications/messenger/messenger.ts). Workspace shell slots and other consumers import the specific feature entry or model contract they use. Code inside Messenger imports the owning files directly. The route entry stays out of models, sync adapters, and eagerly loaded shell code.

Messenger features use the [catalog](../packages/web/src/applications/messenger/model/chats/chats.ts), [messages](../packages/web/src/applications/messenger/model/messages/messages.ts), and [drafts](../packages/web/src/applications/messenger/model/drafts/composer-draft-actions.lib.ts) contracts. Outgoing delivery stays inside `model/messages/outgoing`. Profile, account settings, and the right drawer remain Workspace widgets. The chat details feature uses the existing Workspace profile view for a direct conversation.

The [Workspace session runtime](../packages/web/src/app/workspace-session/) composes bootstrap and realtime. Its Messenger participant calls operations in the Messenger model and sync adapters. The session host and model contracts own account cleanup and diagnostics. The [boundary inventory](plans/messenger-architecture/modules.md#оставшиеся-прямые-обращения) links the platform entrypoints.

### Workspace users imports

The [users module](../packages/web/src/modules/users/) owns user records, profile projection, and presence by runtime owner. Production consumers use one of its public entries.

- [`users.ts`](../packages/web/src/modules/users/users.ts) for reads and subscriptions
- [`users-profile.ts`](../packages/web/src/modules/users/users-profile.ts) for profile and own status operations
- [`users-runtime.ts`](../packages/web/src/modules/users/users-runtime.ts) for session lifecycle, cache hydration, realtime, and presence
- [`users-selectors.ts`](../packages/web/src/modules/users/users-selectors.ts) for pure selectors
- [`users-types.ts`](../packages/web/src/modules/users/users-types.ts) for shared domain types

`npm run arch:check` enforces these public entries for external production imports and forbids dependencies from `modules/users` on `applications/*`. The module uses the existing Workspace auth, runtime, and shared infrastructure. [Users contract](plans/messenger-architecture/scenarios/users-contract.md)

### Platform imports

For imports within `src`, `npm run arch:check` limits production dependencies from `platform` to `platform` and `shared`, and forbids `shared` from importing `platform`. Callers import [the clipboard operations](../packages/web/src/platform/desktop/clipboard.ts) and pass a copy action to shared controls such as `Copyable`. [Clipboard and Electron bridge](plans/messenger-architecture/platform.md#буфер-обмена-и-мост-electron)

The shell uses the platform notification service for system delivery and owns notification policy and click navigation. The application bootstrap passes a show action to the permission-gated plugin API. [System notifications](plans/messenger-architecture/platform.md#системные-уведомления)

## Workspace data flow

1. IAM establishes the session and runtime owner in `entities/workspace-auth`.
2. Shell hooks compose catalog and message hydration with Messenger domain sync and the existing realtime lifecycle.
3. Workspace clients decode API DTOs. The catalog and message adapters convert them to domain values.
4. Messenger `model/chats` owns the catalog. `model/messages` owns canonical messages and outgoing delivery. `model/drafts` owns draft versions, and `model/crypto` owns encrypted chat sessions.
5. `features/decrypted-message` prepares content for the current runtime and invalidates outdated results when access or keys change. `features/timeline` owns window presentation and scrolling. Body rendering uses the shared sanitize/render path.
6. UI reads narrow selectors and sends intent through features or entity actions.

Use UUID-native identifiers and the [runtime ownership rules](ORG_SCOPED_ASYNC_SAFETY.md). Restore owned cached data before server refresh where appropriate. Preserve ordering, pagination markers, read boundaries and realtime cursor semantics.

The previous Zulip/FSD migration is history, not a template for new work. Do not recreate removed instance/chat-list stores or add Zulip fallback behavior to Workspace routes.

## Working references

- [Integration workflow](INTEGRATION_GUIDE.md)
- [Store map](STORES_REFERENCE.md)
- [UI map](COMPONENT_CATALOG.md)
- [API map](API_CLIENT_REFERENCE.md)
- [Messenger cache](WORKSPACE_MESSENGER_CACHE.md)
