# Messenger cache performance — 2026-10-20

The baseline is `eb800080e4a4d6cb4a7442b8baa97636d952317e` (Workspace UI 0.9.2). This change reduces IndexedDB work during message-event application and fixes retention races between stream and topic views.

## Method

The [benchmark](../scripts/benchmark-messenger-cache.mjs) invokes the real cache repository functions with synthetic messages on an isolated origin/profile. It never connects to a Workspace server. The baseline follows the active applier's two parallel conversation writes, pointer writes and per-event cursor write. The updated path uses the batch writer for catch-up and the individual writer for live events.

Each case resets its database, seeds identical state and applies 100 events (one event for `single-live`). One instrumented sample counts operations; five separate, uninstrumented samples measure wall time. Tables use their median. Bucket rows are lightweight membership records, not message bodies; cursor writes are included in the transaction count. The raw results include all samples, ranges, final body/window counts and cache-source hashes.

These timings cover cache persistence only. They exclude REST latency, DTO adaptation, Zustand, React rendering, notifications and production-client variability. Separate regression tests exercise batch routing and store semantics. They are not measurements of the original incident or a promise of equal end-to-end speedup.

## Results

Native IndexedDB in **Headless Chrome 155 / Linux**, five timed repetitions per case, on 2026-10-20. Heavy validation jobs were completed before these runs. [Raw samples and source hashes](messenger-cache-performance-results.json).

| Scenario                                      | Before, median ms | After, median ms | Speedup | Transactions before → after |
| --------------------------------------------- | ----------------: | ---------------: | ------: | --------------------------: |
| 100 fresh creates, catch-up (400 cached)      |            1281.9 |              9.9 |  129.5× |                   1,300 → 1 |
| 100 historical creates, catch-up (500 cached) |            1415.2 |             21.8 |   64.9× |                   1,700 → 1 |
| 100 fresh creates, live (400 cached)          |            1267.4 |             93.1 |   13.6× |                 1,300 → 200 |
| 100 historical creates, live (500 cached)     |            1341.6 |            153.0 |    8.8× |                 1,700 → 200 |
| 100 read-boundary advances (500 cached)       |             901.6 |             51.2 |   17.6× |                   100 → 100 |
| 100 creates, cold catch-up (empty cache)      |             236.5 |              8.9 |   26.6× |                   1,300 → 1 |
| One fresh live create (500 cached)            |              12.9 |              1.8 |    7.2× |                      17 → 2 |

No measured scenario regressed by median. Results are specific to these synthetic workloads and browser; see the raw sample ranges before extrapolating.

For 100 historical creates, returned bucket rows fell from **200,600 to 202** and cursor writes from **100 to 1**. Final bodies fell from **600 to 500**, while both retained windows still contained the correct 500 messages: the 100 evicted historical bodies no longer leaked. The single-message eviction case likewise retained 500 bodies instead of 501.

For read-boundary advances, body reads fell from **45,050 to 500**. For fresh catch-up, returned bucket rows fell from **180,000 to 2**.

## Behavior and tradeoffs

- Existing compound indexes provide bounded endpoints, eviction ranges and message-reference counts. There is no new index, schema bump or cache reset.
- Adjacent creates are grouped up to 100, and edits/reads/deletes/catalog mutations remain ordering barriers. Large message and pointer maps are copied once per created group.
- Bodies, both conversation views, retention, own-reaction cleanup, activity pointers and the batch cursor share one transaction. Runtime invalidation before commit aborts it.
- Read-boundary updates scan only the newly covered interval. All body-write paths apply the durable boundary; old boundary records materialize their existing prefix once.
- A batch holds a write transaction across more stores until it commits. Its size is bounded; multi-tab contention, many unrelated conversations, Firefox and Electron were not performance-profiled.
- Existing unreferenced body rows from older releases are not globally purged: some body-only cache entries intentionally have no conversation membership. New retention writes prevent the reproduced leak.
- Server-side historical-event production is unchanged.

## Reproduce

```sh
# Deterministic operation counts; fake-indexeddb timings are not browser timings.
node scripts/benchmark-messenger-cache.mjs --ref eb800080e4a4d6cb4a7442b8baa97636d952317e
node scripts/benchmark-messenger-cache.mjs

# Run these servers in separate terminals, then use a dedicated browser profile.
node scripts/benchmark-messenger-cache.mjs --ref eb800080e4a4d6cb4a7442b8baa97636d952317e --serve 21980
node scripts/benchmark-messenger-cache.mjs --serve 21981
```

On each benchmark origin, await `window.runBenchmark(5)` in DevTools. Use isolated browser profiles/origins because the harness resets its benchmark database. Do not run concurrent CPU-heavy tests while comparing times.

## Validation

- Full web suite: **6,070 passed, 1 skipped**, 509 files, Node 24.15.0; run from `packages/web` with `node ../../node_modules/vitest/vitest.mjs run --maxWorkers=4`.
- Electron script suite: **50 passed** (`npm run test --workspace=exordos-workspace`).
- Web, Storybook and Electron typechecks: passed (`npm run typecheck`).
- Production web/PWA build: passed (`npm run build --workspace=web`).
- Existing realtime browser regressions: **2 passed**, using Chrome, a separate Vite port, mocked APIs and WebSockets. Bootstrap gap replay, applied cursor, and expired-socket recovery were exercised. No live-server or visual redesign QA was performed.
- Targeted ESLint: no errors; style/complexity warnings remain. Formatting, documentation links and `git diff --check` passed.
- The full suite on Node 26.8.2 exposed an unrelated organization-history persistence test failure. The same test failed on the unchanged baseline revision and passed on Node 24.15.0; no authentication code was changed. `.nvmrc` requests Node 22, which was not installed locally.

Regression coverage includes concurrent stream/topic retention, atomic stale-generation rollback, durable late-write read boundaries, old boundary records, active/background isolation, edit/read/delete barriers, duplicate/unknown envelopes, bounded batches, message/reaction/window revision equivalence, composed appliers and socket connection after batch completion.
