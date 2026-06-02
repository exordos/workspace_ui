# ADR 011: Cognitive complexity ESLint ratchet

## Status

Accepted

## Context

Large orchestrator functions hurt review velocity and hide bugs. SonarJS `cognitive-complexity` is enabled as a **warning** ratchet (not error) so CI stays green while we drive count to zero per threshold.

## Decision

1. Track warnings via `npm run lint:cc` (`scripts/count-cognitive-complexity.mjs`). Broader smell audit: ADR 012 (`npm run lint:smells`).
2. Ratchet thresholds: **25 → 20** (steady-state target **15**, not in this sprint).
3. Do not lower the threshold until the current threshold has **0** warnings.
4. Refactor by extracting pure `*.lib.ts`, hooks, and `React.memo` subcomponents — no `eslint-disable` for new code.

## Ratchet log

| Date       | Threshold | Warnings | Notes                                              |
| ---------- | --------- | -------: | -------------------------------------------------- |
| 2026-05-29 | 25        |       25 | Baseline (ADR 009)                                 |
| 2026-06-01 | 25        |        0 | chat-list, folder-sync, message-bubble hook wiring |
| 2026-06-01 | 20        |      TBD | After band 21–25 fixed                             |

## Consequences

- Hot files shrink without behavior change; tests required for extracted libs.
- PRs should run `npm run lint:cc` when touching high-CC areas.
