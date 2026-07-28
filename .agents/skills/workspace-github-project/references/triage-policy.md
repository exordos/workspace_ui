# Workspace task triage

Use GitHub fields as facts and present the ordering below as a recommendation.

## Status order

1. Resolve inconsistent or stale `In progress` cards.
2. Finish genuine `In progress` work before starting unrelated work.
3. Pull from `Ready`.
4. Promote from `Backlog` only with a stated reason.

`In review` work normally has the shortest path to completion and should be checked before starting new work.

## Stale work signals

Flag a card for review when one or more conditions apply:

- `In progress` has no assignee.
- A linked pull request is closed without merge.
- There is no recent issue or pull-request activity.
- The task depends on a backend contract or external decision that is not recorded.

Do not silently move a stale card. Recommend `Ready`, `Backlog`, or a named owner and let the user decide.

## Recommended priority factors

Prefer, in order:

1. Security, authentication, data loss, or incorrect identity attribution.
2. Broken primary messaging flows and persistent unread/read state.
3. Release, build, or quality-gate blockers.
4. Small confirmed defects with a narrow implementation path.
5. Assigned product work already in `Ready`.
6. Broad enhancements and unconfirmed investigations.

Treat a dependency advisory according to runtime reachability as well as its published severity.

## Workspace migration check

Workspace API is the source of truth for the new messenger path. Before promoting an issue that describes Zulip stores, numeric IDs, or Zulip event flows:

1. Check whether the behavior still applies to the Workspace path.
2. Check the backend contract links from `docs/PROJECT_FACTS.md` when backend capability matters.
3. Recommend closing, rewriting, or explicitly scoping legacy-only work rather than pulling hidden Zulip behavior into Workspace logic.

Do not fabricate backend support or domain data to make an old task appear implementable.
