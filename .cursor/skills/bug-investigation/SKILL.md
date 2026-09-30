---
name: bug-investigation
description: >-
  Trace a Workspace bug from observed symptoms to its cause, then apply a focused
  fix when requested. Use for errors, stale data, crashes, and visual regressions;
  diagnosis-only requests remain read-only.
---

# Bug Investigation

Start with [AGENTS.md](../../../AGENTS.md) and [PROJECT_FACTS.md](../../../docs/PROJECT_FACTS.md).
Respect the user's scope: a request to investigate does not authorize edits. A request to
fix does authorize the necessary focused changes without another routine approval.

## Establish the failure

Identify the trigger, expected and actual behavior, affected runtime owner, and whether
the symptom is reproduced or inferred. Preserve unrelated changes in the working tree.
Trace the actual path: user action or realtime event, API/cache reads, store writes,
selectors, and rendered state. Verify backend-dependent assumptions against the contract
linked in project facts. Do not infer the cause from a symptom alone.

Useful distinctions:

- Wrong data after a switch: inspect captured owner/generation, resets, and pending writes
  using [async safety](../../../docs/ORG_SCOPED_ASYNC_SAFETY.md), including error/finally paths.
- Stale realtime data: inspect event order, catch-up, owner-scoped cursors, and cache updates.
- Memory growth: distinguish allocation churn from retained objects using available evidence.
- Rendering defects: check containment, state, and selector behavior before adding memoization,
  polling, or a new component.

Use existing debugging helpers only after checking their current exports. Avoid logging
credentials, personal data, or message bodies. Workspace identifiers are UUID-native;
do not use legacy numeric guards or Zulip fixtures for the new messenger path.

## Fix and validate when authorized

Explain the structural cause and apply the smallest fix that addresses it. Reuse current
helpers and concrete imports. Preserve cache-first behavior and runtime ownership.

For a logic or state regression, add a focused test that reproduces the failure when useful,
and verify it fails before the fix if practical. For a visual-only adjustment, use the
relevant existing tests and browser comparison; do not create a test that only asserts
implementation wording or class names.

Run the checks appropriate to the change from project facts. Broaden testing for new
failures or unresolved risk, not after every edit. Confirm the original reproduction when
the environment allows it. Report evidence, fix, checks, and missing runtime/visual coverage
separately. Update a rule only if the task reveals an enduring project constraint that is
not already documented.
