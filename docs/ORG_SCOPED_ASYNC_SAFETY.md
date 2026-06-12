# Organization-Scoped Async Safety

This document defines the application-level rule for async work that depends on the active organization.

Use it for any loader, mutation, cache hydrate, or delayed side effect that can outlive the current UI state and later write into stores, IndexedDB, or derived in-memory structures.

## Problem

The core bug class is organization-switch data mixing:

- async work starts under organization `A`;
- the user switches to organization `B` or clears the active organization;
- a stale response from `A` resolves later and writes into state now owned by `B` or by no active organization.

Checking only `instanceId` is not sufficient. The sequence `A -> B -> A` can make an old request from the first `A` look valid again after the user returns to `A`.

## Required Invariants

Every organization-scoped async path must preserve these rules:

1. Async work must know which active organization it started under.
2. Async work must not write to Zustand stores after the active organization changes.
3. Async work must not write stale organization data into IndexedDB after switch.
4. In-flight dedupe keys for organization-scoped data must be organization-scoped too.
5. Cleanup on organization switch must invalidate both:
   - local store state;
   - in-flight async work that may still resolve later.

## Core Pattern

Use three protections together.

### 1. `requestVersion`

Use `requestVersion` to preserve ordering inside one active organization.

It answers:
"Is this still the latest request for this store or loader?"

It does **not** answer:
"Does this request still belong to the current organization?"

### 2. Active organization context

Use `instanceId + activeOrgEpoch` to preserve organization validity across switches.

The source of truth lives in:

- `packages/web/src/entities/instance/instance.model.ts`

The store exposes:

- `activeOrgEpoch`
- `captureActiveOrgRequestContext()`
- `isActiveOrgRequestContextCurrent()`
- `isActiveOrgRequestInvalidated()`

`activeOrgEpoch` increments on every real active-organization change, including switch to `null`.

This is what closes the `A -> B -> A` hole:

- old request starts under `A + epoch 5`;
- user switches to `B`;
- user returns to `A`, now `A + epoch 7`;
- stale response from `A + epoch 5` must be rejected.

### 3. `AbortSignal`

Use `AbortSignal` when work is tied to component or store lifecycle, or when stopping the request early is materially useful.

It helps reduce wasted network and prevents some stale continuations from even reaching the write path.

`AbortSignal` is not a replacement for active organization validation. A request may still resolve or continue after cleanup, so post-`await` validity checks remain mandatory.

## Implementation Rules

### For loaders and async hydrators

Use this pattern:

1. Capture `orgContext` before the first `await`.
2. Start or reuse `requestVersion` if the loader needs in-store ordering.
3. Create `AbortController` when the work belongs to a lifecycle boundary.
4. After every meaningful `await`, check whether the request is still valid.
5. Only then write to store, cache, or IndexedDB.

Minimal shape:

```ts
const controller = new AbortController();
const orgContext = captureActiveOrgRequestContext();
const requestVersion = startRequest();

const data = await fetchSomething({ signal: controller.signal });

if (isActiveOrgRequestInvalidated(orgContext, controller.signal)) return;
if (get().requestVersion !== requestVersion) return;

applyState(data);
```

### For UI-triggered async mutations

The same rule applies to user actions, not only loaders.

Examples:

- unstar message;
- delete draft;
- save edited draft;
- load profile-linked user status;
- any post-`await` local mutation in a page or feature.

Pattern:

1. Capture `orgContext` when the action starts.
2. Await the server call.
3. Before every local mutation, check `isActiveOrgRequestInvalidated(...)`.
4. Drop the stale result if the organization changed.

### For dedupe keys

If a request is organization-scoped, the dedupe key must be organization-scoped too.

Prefer:

- `instanceId::streamId`
- `${instanceId}:${userId}`
- `${instanceId}:activity:${filter}:newest:${pageSize}`

Avoid keys that only use entity-local identity when the result depends on the active organization.

## Cleanup Rules

When the active organization changes, including `A -> null`, cleanup must be symmetric.

Do not special-case `null` as a lighter transition if the shell state is still organization-scoped.

Cleanup should:

- clear organization-owned stores;
- reset shell refs that may re-apply stale bootstrap data;
- abort in-flight requests owned by the current active organization;
- clear dedupe and hydrate coordination state.

The canonical shell cleanup entrypoint lives in:

- `packages/web/src/widgets/layout/layout-zulip-event-loop.hook.ts`

## When Each Tool Is Mandatory

Use `requestVersion` when:

- multiple requests can race inside one store lifetime;
- newer data must win over older data for the same active organization.

Use active organization context when:

- the result depends on the active organization;
- the code writes to organization-scoped store state;
- the code writes to organization-scoped IndexedDB rows;
- the request can outlive organization switch or active-org clear.

Use `AbortSignal` when:

- the work belongs to a component, hook, or store lifecycle;
- a newer run supersedes the old one;
- network or cache work is expensive enough that early stop matters.

## Exceptions

Do not blindly apply active-org validation to true multi-organization background work.

If a task intentionally iterates explicit `instanceId` values and is not keyed to the current active organization, it needs a different contract.

Typical examples:

- inactive-instance background polling;
- explicit multi-org maintenance jobs;
- other logic whose ownership is a concrete instance list rather than the active shell.

In those cases, the request must still be scoped, but to explicit instance ownership instead of active-org ownership.

## Review Checklist

When reviewing new async code, verify:

1. Does it depend on the active organization?
2. Can it resolve after organization switch or `active org -> null`?
3. Does it mutate Zustand state, cache, IndexedDB, or derived indices?
4. Does it rely only on `requestVersion` where active-org validation is also required?
5. Is the dedupe key organization-scoped?
6. Is cleanup symmetric for `A -> B` and `A -> null`?

If the answer to 1, 2, and 3 is "yes", then active organization validation is usually mandatory.
