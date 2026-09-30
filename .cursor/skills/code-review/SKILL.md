---
name: code-review
description: >-
  Review a Workspace change or module for actionable correctness, security,
  architecture, and regression findings. Reviews and audits are read-only unless
  the user also requests fixes.
---

# Workspace Code Review

Read [AGENTS.md](../../../AGENTS.md) and [PROJECT_FACTS.md](../../../docs/PROJECT_FACTS.md).
Establish the requested files or diff and compare behavior with its callers, tests, and
backend contract. Treat comments and older docs as claims to verify in current source.

A review or audit is read-only by default, regardless of finding severity. Report issues
without applying fixes unless the user requested changes. If fixes are authorized, keep
them within scope, preserve unrelated work, and validate the final change proportionally.

## Review relevant risks

- **Behavior and contracts:** concrete trigger, incorrect result, API DTO mapping, UUID
  handling, error behavior, and supported backend capabilities. No implicit Zulip fallback.
- **Async ownership and cache:** captured owner/generation checked before store, cache, and
  error/finally writes; safe switch/logout behavior; cache-first loading preserved where
  appropriate. Follow [async safety](../../../docs/ORG_SCOPED_ASYNC_SAFETY.md).
- **Realtime:** event order, duplicate application, reconnect catch-up, scoped cursors,
  and stale callbacks from a replaced runtime.
- **Architecture and types:** FSD direction, concrete imports without barrels, workflows
  owned outside pages, strict types, and explicit handling of absent indexed values.
- **Security:** actual auth/permission boundary, sanitized HTML rendering, URL use in its
  destination context, sensitive logging, Electron IPC and external navigation when relevant.
  Do not equate client UI permission checks with server authorization.
- **Performance and resources:** unstable store selectors, costly repeated derivations,
  retained subscriptions/timers, excessive requests or immutable copying. Missing `memo`,
  `useMemo`, or `useCallback` alone is not evidence of a defect.
- **UI:** both locale keys, semantic tokens, accessible names and keyboard behavior,
  focus/scroll behavior, and relevant empty/loading/error states.
- **Verification:** whether tests cover observable failure modes. Do not require a new test
  file, documentation entry, or rule merely because a file changed.

Load specialized docs or rules only for the affected area. Distinguish a reproduced defect,
a source-supported defect, and a hypothesis that needs runtime evidence. Avoid generic
checklist findings and claims that tests or manual checks passed without running them.

## Report

Lead with actionable findings ordered by severity. Each finding needs a precise location,
trigger, consequence, and concise suggested correction. Mention assumptions and validation
limits. If there are no findings, say so plainly and state meaningful coverage gaps.

For authorized fixes, use verification commands from project facts for the affected scope;
do not run the full suite after every individual fix. Report fixes separately from findings
left for the user. Do not commit or publish as part of a review unless requested.
