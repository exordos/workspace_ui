# Integrating a Workspace feature

Start with [AGENTS.md](../AGENTS.md), [PROJECT_FACTS.md](PROJECT_FACTS.md) and [FSD architecture](fsd-architecture.md). The Workspace API is the source of truth for the new messenger. Preserve the visible chat shell unless the task explicitly includes redesign.

## 1. Find the owner and the contract

Trace the current UI entry point to its feature, entity and API module. Use the [component map](COMPONENT_CATALOG.md), [state map](STORES_REFERENCE.md) and [API map](API_CLIENT_REFERENCE.md) for navigation, then read the actual code. Identify which layer owns the change before creating files.

Dependency direction is `app -> pages -> widgets -> features -> entities -> shared`. Keep new route/page wiring thin. Extend existing helpers and models where they own the behavior; do not create a store, API wrapper, type file or page merely to complete a template. Import from concrete files, without barrel-only `index.ts` files.

Check the backend contract links in `PROJECT_FACTS.md` before relying on an endpoint, mutation or event. Keep Workspace identifiers UUID-native. If an action is not supported by the available contract/integration, expose an explicit unsupported, read-only or error state. Never substitute a hidden Zulip request or fake successful result.

## 2. Integrate data through the existing boundary

Use the relevant [Workspace API module](API_CLIENT_REFERENCE.md) and existing runtime token provider. Parse incoming DTOs with the domain guards and adapt them before store writes. Errors must preserve enough information for the feature to distinguish authentication, authorization, validation and transport failures; do not log credentials, PII or message bodies.

For persistent data, preserve cache-first rendering where supported: restore the owner's cache, refresh from the server, then update the active state and the appropriate cache. Use a stricter loading policy only when showing stale data would violate the feature's contract, and record why.

Before async work starts, capture `captureWorkspaceRuntimeRequestContext()` from [workspace-runtime.lib.ts](../packages/web/src/entities/workspace-runtime/workspace-runtime.lib.ts). Before applying results, use `isWorkspaceRuntimeRequestInvalidated()` with the current-context getter and the request's abort signal. Owner fields and `runtimeGeneration` matter even if the request was not aborted. Guard success, error/finally state, cache writes and optimistic rollback. Read [ORG_SCOPED_ASYNC_SAFETY.md](ORG_SCOPED_ASYNC_SAFETY.md) for the full invariant.

Use narrow selectors and keep derived values stable. Do not introduce a second store for data already owned by the messenger or message store.

## 3. Connect realtime only when the feature needs it

Inspect the current [layout realtime hook](../packages/web/src/widgets/layout/layout-workspace-realtime.hook.ts), [event API](../packages/web/src/shared/api/messenger-realtime.api.ts), [event applier](../packages/web/src/entities/messenger/messenger-realtime-applier.lib.ts) and [cache application](../packages/web/src/entities/messenger/messenger-realtime-cache.lib.ts). Extend the existing event path instead of adding the legacy Zulip event loop.

Preserve REST catch-up ordering, epoch generation/version cursor semantics, deduplication, active conversation updates and background projections. Bind listeners and cleanup to the runtime that created them. A newly visible message must not bypass existing unread/read or notification policy.

## 4. Wire UI and explicit capabilities

Reuse existing primitives and feature components. Keep visible text in both English and Russian [i18n files](../packages/web/src/i18n). Use the established keyboard, focus and accessible-name patterns.

The [composer](../packages/web/src/widgets/message-composer/message-composer.ui.tsx) receives explicit capabilities. Keep read-only and unsupported states visible; adding a button or local state does not establish backend support. Message HTML/markdown must remain in the existing sanitized [render path](../packages/web/src/shared/lib/workspace-message-render/workspace-message-render.lib.ts).

## 5. Verify the changed behavior

Use the commands and working directories in [PROJECT_FACTS.md](PROJECT_FACTS.md). Run focused existing tests for a narrow behavior change, typecheck for a type/API/store contract change, and the broader project check for broad changes. Use E2E when user flow or route behavior changes. Add tests for meaningful new behavior or regressions, not to mirror a trivial implementation.

For async changes, exercise an owner switch or reset while the request is pending and verify both store and cache boundaries. For UI changes, report whether browser/native visual interaction was actually checked; unit tests do not replace it. Documentation-only maintenance needs link/source checks and `git diff --check`, not a claim that the app was tested.

Inspect `git status --short` and the relevant diff before reporting. Preserve unrelated work. Update the affected canonical document when a responsibility or contract changes; avoid copying the same instructions into multiple catalogs or creating a new rule for each fix. Analysis/review requests remain read-only unless the user authorizes edits.
