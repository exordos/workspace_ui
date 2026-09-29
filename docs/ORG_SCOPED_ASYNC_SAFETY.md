# Runtime-scoped async safety

An async result may arrive after account, organization, project or user changes, after logout, or after the user leaves and returns to the same owner. It must not overwrite state belonging to another runtime.

## Source of truth

- [workspace-runtime.types.ts](../packages/web/src/entities/workspace-runtime/workspace-runtime.types.ts): owner and request-context types.
- [workspace-runtime.lib.ts](../packages/web/src/entities/workspace-runtime/workspace-runtime.lib.ts): capture, comparison and owner keys.
- [workspace-auth.model.ts](../packages/web/src/entities/workspace-auth/workspace-auth.model.ts): current session, runtime context and generation transitions.

`WorkspaceRuntimeOwner` contains `accountId`, `instanceId`, `organizationId`, `projectId`, and `userUuid`. A request snapshot adds `runtimeGeneration`. Comparing only organization or instance is insufficient: returning to the same owner must not revive old callbacks.

`workspaceRuntimeOwnerKey()` is the stable identity for persisted data. Generation identifies a live runtime and must be checked before commits; it is not part of the durable cache/cursor key.

## Active runtime work

1. Capture the request context before starting asynchronous work using `captureWorkspaceRuntimeRequestContext(getRuntimeContext)`.
2. If no context exists, skip the owner-dependent work.
3. Use an `AbortSignal` when work belongs to a component/runtime lifecycle.
4. After meaningful awaits and before store/cache writes, call `isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)`.
5. Apply the result only while the captured owner and generation are current.
6. Use a separate request version when newer requests for the same live owner must supersede older ones.

The getter used for validation must return the **current** runtime, not always the captured snapshot. Pass it down from the owning layer; shared modules should not import the auth store.

See [catalog bootstrap](../packages/web/src/entities/messenger/messenger-bootstrap.lib.ts) and [message loaders](../packages/web/src/entities/messenger/messenger-messages-loader.lib.ts) for working examples. Prefer extending these flows rather than copying a new lifecycle into a page.

## Store and cache commits

Cancellation reduces unnecessary work but does not replace validity checks. An already resolved promise can continue after cleanup. A request version protects ordering within a loader, not ownership across accounts/projects.

Catalog reconciliation fences protect newer cache projections; they are not a runtime ownership check. If a cache helper itself awaits before committing, inspect its continuation and owner-scoping rather than assuming the caller's earlier validity check covers it. Keep dedupe and in-flight keys owner-scoped; add generation where coordination belongs to one live runtime.

UI mutations need the same protection as loaders: edit, delete, read, react, draft changes and post-request cleanup must not write into a newer owner's state.

## Cleanup and background work

The shell's [bootstrap hook](../packages/web/src/widgets/layout/layout-workspace-messenger-bootstrap.hook.ts) and [realtime hook](../packages/web/src/widgets/layout/layout-workspace-realtime.hook.ts) compose current lifecycle cleanup. Invalidate pending writes, abort owned work, release subscriptions and reset coordination when the runtime ends, including transition to no session.

Background multi-owner work has a different lifecycle. Check the explicit owner and lifecycle supplied to the job, rather than requiring it to equal the active UI selection. The [realtime runtime](../packages/web/src/shared/lib/workspace-realtime/) supports separate active/background surfaces; neither may write into another owner's active store.

## Verification scenarios

For changed async behavior, cover the relevant races: owner A to B; A to no session; A to B to A; project/user changes; older request finishing after a newer request; pending cache write after cleanup. Verify both store and durable writes where affected. Reuse the [runtime helper tests](../packages/web/src/entities/workspace-runtime/workspace-runtime.lib.test.ts).
