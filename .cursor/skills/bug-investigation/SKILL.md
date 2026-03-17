---
name: bug-investigation
description: >-
  Systematic bug investigation and fix with regression test.
  Use when the user reports a bug, unexpected behavior, error, crash,
  or visual glitch. Follows: reproduce → diagnose → test → fix → verify.
  Optimized for deep-context debugging — reads full call stacks and cross-references stores.
---

# Bug Investigation

> Use deep file reading, store state tracing, and full-stack analysis.

## Step 1: Reproduce

Before writing any code, understand the bug:

1. **What** — exact symptoms (error message, wrong UI, crash, stale data)
2. **Where** — which page/component/action triggers it
3. **When** — always, intermittent, after specific sequence
4. **Inputs** — what data/state produces the bug
5. **Expected** — what should happen
6. **Actual** — what actually happens

## Step 2: Diagnose

### Trace the data flow

```
User action → Event handler → Store action → API call → Store update → UI re-render
```

For each step, check:

- Is the correct store action called?
- Does the API return expected data?
- Does the store update correctly?
- Does the selector return fresh data?
- Does the component re-render?

### Common root causes

| Symptom                          | Likely cause                        | Where to look                             |
| -------------------------------- | ----------------------------------- | ----------------------------------------- |
| Stale data after tab switch      | Missing `createResilientInterval`   | `caching.mdc`                             |
| Component doesn't update         | Zustand selector returns new object | `performance.mdc` anti-patterns           |
| Memory grows over time           | Missing cleanup in `useEffect`      | `memory-leaks.mdc`                        |
| Error on navigate                | Missing null check / guard          | `defensive-programming.mdc`               |
| Wrong data after instance switch | Store not cleared                   | Layout `useEffect` on `currentInstanceId` |
| XSS / broken HTML                | Missing `sanitizeHtml()`            | `security.mdc`                            |
| Network retry storm              | Missing offline check               | `network-awareness.mdc`                   |
| i18n key shown instead of text   | Missing key in locale JSON          | `i18n.mdc`                                |

### Tools

```typescript
// Dev console (browser)
window.__dev__.stores.chatList.getState();
window.__dev__.stores.users.getState().getUser(42);
window.__dev__.logs();
window.__dev__.logs("error");

// AI context
window.__ai__.context.getCurrentChat();
window.__ai__.context.getAppState();
```

## Step 3: Write Failing Test (TDD)

**BEFORE fixing the bug**, write a test that REPRODUCES it:

```typescript
it("does not crash when userId is null", () => {
  // This test MUST FAIL with the current code (proving the bug exists)
  expect(() => processUser(null)).not.toThrow();
});
```

Run: `npx vitest run <test-file>` — confirm it FAILS.

## Step 4: Fix

Apply the minimum fix. Prefer:

1. Adding a guard / null check at the boundary
2. Fixing the root cause (wrong logic)
3. Adding missing cleanup
4. Fixing the type definition

Avoid:

- `try { } catch { }` that swallows errors silently
- `as T` casts that hide the real problem
- Workarounds that fix the symptom but not the cause

## Step 5: Verify

1. Run the specific test: `npx vitest run <test-file>` → PASSES
2. Run all tests: `npx vitest run` → no regressions
3. TypeScript: `npx tsc --noEmit` → 0 errors
4. Manual: confirm the original bug no longer reproduces

## Step 6: Document

1. Add a comment in the test explaining WHAT bug it prevents
2. If the bug reveals a missing rule → update the relevant `.cursor/rules/*.mdc`
3. If it's a pattern that could recur → add to `defensive-programming.mdc`

## Parallel Investigation

For complex bugs, dispatch agents:

```
Agent A: Read the component + trace event handlers
Agent B: Read the store + trace actions/selectors
Agent C: Read the API layer + check network behavior
Agent D: Read related tests + check coverage gaps
```

Combine findings to triangulate the root cause.
