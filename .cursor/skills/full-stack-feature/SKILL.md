---
name: full-stack-feature
description: >-
  Implement a Workspace feature across the necessary FSD layers, using the
  existing API contract, runtime ownership, cache, and UI conventions.
  Use for feature implementation; analysis-only requests remain read-only.
---

# Workspace Feature Development

Read [AGENTS.md](../../../AGENTS.md) and [PROJECT_FACTS.md](../../../docs/PROJECT_FACTS.md)
for project constraints, current module paths, backend contracts, and verification commands.
Use [INTEGRATION_GUIDE.md](../../../docs/INTEGRATION_GUIDE.md) for integration details.
The user's requested scope determines whether to analyze or implement; an implementation
request does not require another approval after routine planning.

## Find the owner and contract

- Trace the closest existing user flow before adding a new abstraction.
- Identify the owning FSD layer, state owner, actual backend operation, and observable result.
  Keep route code thin; follow [FSD architecture](../../../docs/fsd-architecture.md).
- Verify Workspace capabilities in the linked backend contract and current client wrappers.
  Use UUID-native domain identifiers. Do not introduce a Zulip fallback, invented endpoint,
  fabricated domain data, or a numeric ID guard for a UUID.
- Explain unsupported capabilities explicitly. Separate implemented behavior from proposals.

## Implement the smallest complete change

Extend existing slices and helpers where they own the behavior. Create types, store, API,
UI, or route files only when the feature needs them. Import concrete segment files;
do not create barrel-only `index.ts` files.

Adapt API DTOs before writing domain state. Use narrow Zustand selectors and stable derived
values where needed. Prefer existing cache-first loading with a background refresh when
persisted data is safe to show. Keep active state and durable cache consistent.

For asynchronous work, follow [runtime ownership](../../../docs/ORG_SCOPED_ASYNC_SAFETY.md):
capture the request owner and generation before awaiting, and verify them before scoped
writes, including error/finally handling and cache updates. Cancellation alone is not an
ownership check. Shared-layer helpers receive ownership information from their caller;
do not import entity stores into `shared`.

Integrate realtime through the current Workspace runtime and ordered event processing.
Preserve owner-scoped cursors, deduplication, and REST catch-up semantics. Read the relevant
runtime code before changing event application; do not wire new behavior into the old
Zulip event loop.

Reuse current UI components and semantic tokens. Preserve the existing shell unless the
request changes it. Follow project i18n, sanitized rendering, accessibility, and logging
rules; do not add memoization mechanically without a relevant rendering cost.

## Verify and report

Choose checks from [PROJECT_FACTS.md](../../../docs/PROJECT_FACTS.md): focused tests for
changed behavior, typecheck for type/API/store contracts, and the broad check for broad
changes. Use E2E for changed user flows or routes. Add a regression test when it exercises
meaningful behavior, not merely the implementation structure. Do not run the entire suite
after every editing step.

Update only documentation whose contract or navigation changed; a new feature does not
automatically need another Cursor rule or duplicated API/store catalog. Report what changed,
checks and results, remaining uncertainty, and any manual/browser validation not performed.
