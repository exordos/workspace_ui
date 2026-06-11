# Plan: Fix Races on Organization Switch

## Purpose

This document is the source of truth for fixing data-mixing races that can happen when the user switches between organizations. It is written so that any next agent can resume work from the repo alone without recovering context from chat history.

The target bug class is:

- stale async work started under organization A applies into stores while organization B is already active;
- sidebars, chat windows, feed, inbox, or activity show mixed data from different organizations;
- cache hydrate or delayed network responses overwrite newer state after an organization switch.

This plan is intentionally phased. Each phase should be merged only after its own tests pass and the listed handoff notes are updated.

## Current Findings

Confirmed risk areas found in the current codebase:

1. Active chat boundary pagination can apply stale responses after organization switch.
2. Lazy sidebar topic hydrate is keyed only by `streamId` in some places and does not abort in-flight work on switch.
3. Cache-first page loading can still apply stale cache/network data after switch because cancellation is checked too late.
4. `requestVersion` protects ordering inside one store lifetime, but it is not a sufficient cross-organization guard after `clear()` resets local counters.

Primary files already identified:

- `packages/web/src/entities/message/message.model.ts`
- `packages/web/src/entities/chat-list/chat-list-hydrate-stream-sidebar.lib.ts`
- `packages/web/src/entities/chat-list/chat-list-unread-preview-hydrate.lib.ts`
- `packages/web/src/entities/chat-list/chat-list-dm-preview-hydrate.lib.ts`
- `packages/web/src/shared/lib/use-cache-first-page.hook.ts`
- `packages/web/src/pages/feed/feed-page.ui.tsx`
- `packages/web/src/pages/inbox/inbox-page.ui.tsx`
- `packages/web/src/pages/activity/activity-page.ui.tsx`
- `packages/web/src/entities/feed/feed.model.ts`
- `packages/web/src/entities/inbox/inbox.model.ts`
- `packages/web/src/entities/instance/instance.model.ts`

## Non-Negotiable Invariants

Every fix in every phase must preserve these rules:

1. Async work must know which organization it started under.
2. Async work must not write to Zustand stores if the active organization changed.
3. Async work must not write stale organization data into IndexedDB after switch.
4. In-flight dedupe keys for organization-scoped data must be organization-scoped too.
5. Cleanup on organization switch must invalidate both:
   - local store state;
   - in-flight async work that may still resolve later.

## Chosen Strategy

Implementation strategy is fixed as phased delivery:

1. Phase 1 closes confirmed data-corruption paths.
2. Phase 2 unifies cache-first loaders around a stronger organization-aware lifecycle.
3. Phase 3 is cleanup and hardening, not a blocker for shipping if phases 1 and 2 are complete and stable.

Scope is fixed to all known organization-switch races in:

- chat window;
- chat sidebar;
- feed;
- inbox;
- activity;
- nearby lazy hydrators that can mutate those stores after switch.

## Core Design

Use two layers of protection together:

1. Keep local `requestVersion` where it already helps with ordering inside the same active organization.
2. Add a global active-organization validity marker so any async task can detect that it belongs to an outdated organization context.

Recommended shape:

- add `activeOrgEpoch` to `useInstancesStore`;
- increment it on every real active-organization change, including switch away to `null`;
- add a helper that captures `{ instanceId, epoch }` at request start;
- add a helper that checks whether the captured context still matches the live active organization.

This lets the code reject stale results even when store-local counters were reset.

## Phase 1: Stop Real State Corruption

### Goal

Close the places where stale results can directly mix messages or chats between organizations.

### Work

1. Add active organization request context helpers in the instance layer.
2. Update chat boundary pagination in `message.model.ts`:
   - capture active organization context before fetch;
   - capture current chat context before fetch;
   - abort or drop result if either organization or chat changed;
   - skip stale IDB writes too.
3. Update lazy sidebar topic hydrate:
   - scope in-flight maps by `instanceId::streamId`;
   - keep abort controllers for in-flight requests;
   - abort all active hydrate requests on organization switch cleanup;
   - guard every post-`await` store mutation with active organization validity.
4. Update unread-preview and DM-preview hydrate helpers so they cannot apply results from a stale organization context.

### Files Expected

- `packages/web/src/entities/instance/instance.model.ts`
- `packages/web/src/entities/message/message.model.ts`
- `packages/web/src/entities/chat-list/chat-list-hydrate-stream-sidebar.lib.ts`
- `packages/web/src/entities/chat-list/chat-list-unread-preview-hydrate.lib.ts`
- `packages/web/src/entities/chat-list/chat-list-dm-preview-hydrate.lib.ts`
- `packages/web/src/widgets/layout/layout-zulip-event-loop.hook.ts`
- any directly related test files

### Completion Criteria

- switching organizations during chat pagination never appends stale messages;
- switching organizations during sidebar lazy hydrate never adds topics/previews from the previous organization;
- all new or changed code paths have regression tests.

## Phase 2: Fix Cache-First Loaders

### Goal

Make cache hydrate and page refresh paths organization-safe across feed, inbox, and activity.

### Work

1. Strengthen `use-cache-first-page.hook.ts`:
   - create a per-run `AbortController`;
   - pass `signal` into both `hydrate` and `fetch`;
   - ensure stale runs cannot apply data after switch.
2. Update feed page loading:
   - cache hydrate must apply only if the organization run is still current;
   - newest refresh must apply only if both request version and organization context are still current;
   - older-page pagination must use the same organization guard before `appendOlder`.
3. Update inbox page loading with the same contract.
4. Update activity loaders and page logic:
   - maintain current store-local request ordering;
   - add organization validity checks before applying cached or network results.
5. Add optional `signal?: AbortSignal` to API helpers that currently cannot be interrupted but are used by these loaders.

### Files Expected

- `packages/web/src/shared/lib/use-cache-first-page.hook.ts`
- `packages/web/src/pages/feed/feed-page.ui.tsx`
- `packages/web/src/pages/inbox/inbox-page.ui.tsx`
- `packages/web/src/pages/activity/activity-page.ui.tsx`
- `packages/web/src/entities/feed/feed.model.ts`
- `packages/web/src/entities/inbox/inbox.model.ts`
- `packages/web/src/entities/activity/activity-starred-loader.lib.ts`
- `packages/web/src/entities/activity/activity-reactions-loader.lib.ts`
- related API helpers and tests

### Completion Criteria

- stale cache hydrate cannot overwrite feed/inbox/activity after switch;
- stale network refresh cannot overwrite feed/inbox/activity after switch;
- `load more` on feed cannot append stale results after switch.

## Phase 3: Hardening and Cleanup

### Goal

Remove remaining weak spots and make the pattern reusable for future work.

### Work

1. Audit organization-scoped async loaders near messenger shell for the same bug class.
2. Consolidate helper usage so new loaders follow one pattern.
3. Add short internal guidance near the helper or in docs describing:
   - when to use `requestVersion`;
   - when `instanceId + activeOrgEpoch` is mandatory;
   - when `AbortSignal` must be threaded through.

### Completion Criteria

- no remaining known loader in the messenger shell writes organization-scoped state without validity guard;
- tests cover at least one representative stale-result scenario per subsystem.

## Tests to Add

Minimum regression coverage:

1. chat pagination drops stale page after organization switch;
2. chat pagination does not perform stale IDB write after switch;
3. sidebar topic hydrate drops stale result from old organization;
4. sidebar topic shell hydrate drops stale result from old organization;
5. sidebar preview backfill drops stale result from old organization;
6. feed cache hydrate does not overwrite the next organization;
7. feed newest refresh does not overwrite the next organization;
8. feed load-more does not append stale messages after switch;
9. inbox cache hydrate does not overwrite the next organization;
10. inbox network refresh does not overwrite the next organization;
11. activity loader does not apply stale results after switch.

Where possible, use focused store/unit tests instead of only UI-level tests. Add one higher-level integration scenario for fast `A -> B` switching while multiple loaders are in flight.

## Suggested Execution Order

1. Add the instance-level context helpers and tests for them.
2. Fix chat pagination.
3. Fix sidebar lazy hydrators and cleanup.
4. Fix shared cache-first hook.
5. Fix feed and inbox.
6. Fix activity.
7. Run final audit pass for nearby loaders.

Do not start feed/inbox/activity first. The highest-value correctness gain is in chat window plus sidebar.

## Handoff Rules for the Next Agent

Before starting a new phase:

1. Read this file completely.
2. Check which bullets are already implemented in the working tree.
3. Update this file only if the plan itself changes or a phase is completed.

When finishing a phase:

1. Mark completed items in this file.
2. Add a short note under the phase with:
   - what was implemented;
   - what tests were added;
   - any follow-up left for the next phase.

## Phase Status

### Phase 1

- Status: completed
- Notes:
  - Added active-organization request context helpers in `instance.model.ts` with `activeOrgEpoch` bumping on real organization switches, including switch to `null`.
  - Guarded chat boundary pagination in `message.model.ts` so stale older/newer pages are dropped after organization or chat changes, with stale IndexedDB writes skipped as well.
  - Scoped lazy sidebar stream hydrators by `instanceId::streamId`, added abort controllers for in-flight requests, and made `clearStreamSidebarHydrateState()` abort active work on organization switch cleanup.
  - Guarded unread-preview and DM-preview hydrators so stale organization results cannot mutate sidebar stores or DM index.
  - Added regression coverage in:
    - `packages/web/src/entities/instance/instance.test.ts`
    - `packages/web/src/entities/message/message.model.load-older.test.ts`
    - `packages/web/src/entities/chat-list/chat-list-hydrate-stream-sidebar.lib.test.ts`
    - `packages/web/src/entities/chat-list/chat-list-unread-preview-hydrate.lib.test.ts`
    - `packages/web/src/entities/chat-list/chat-list-dm-preview-hydrate.lib.test.ts`
  - Next phase starts at cache-first loaders in feed, inbox, and activity.

### Phase 2

- Status: planned
- Notes: none yet

### Phase 3

- Status: planned
- Notes: none yet

## Final Acceptance

The overall work is complete only when:

- rapid organization switching cannot mix chats or messages;
- no known stale organization response can mutate messenger shell stores;
- tests exist for all confirmed bug classes above;
- the pattern for future organization-scoped async work is explicit in code and easy to reuse.
