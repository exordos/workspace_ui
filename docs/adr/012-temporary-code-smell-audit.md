# ADR 012: Temporary code smell audit

## Status

Accepted (living document — update after each remediation wave)

## Context

ESLint already runs SonarJS (`recommended`), `eslint-plugin-promise`, and curated `unicorn` rules as **warnings** (see `packages/web/eslint.config.js`). There was no aggregated report beyond `npm run lint:cc` (cognitive complexity only).

## Decision

1. Add `npm run lint:smells` → `scripts/lint-code-smells-report.mjs` (group by rule, file, category; `--json`, `--category`, `--rule`, `--top`).
2. Add root `npm run knip` → workspace web dead-code scan.
3. Remediate smells in waves (full `packages/web/src`); do **not** add CI failure on smell count until warnings are near zero.
4. **Deferred** category (case-by-case only): `react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`, `require-atomic-updates`, `react-hooks/preserve-manual-memoization`.

## Baseline log

| Date       | Total warnings | sonarjs | CC @ 20 | Notes                                    |
| ---------- | -------------: | ------: | ------: | ---------------------------------------- |
| 2026-06-01 |            351 |     192 |      16 | Pre-audit (`lint:smells`)                |
| 2026-06-01 |            342 |     TBD |      16 | After `eslint --fix` autofix             |
| 2026-06-01 |            208 |      57 |       0 | After CC ratchet + smell waves           |
| 2026-06-01 |            189 |      50 |       0 | Final audit pass (`npm run check` green) |
| 2026-06-04 |            TBD |     TBD |       1 | CC @ 20: one warning (`lint:cc`)         |

## Deferred react-hooks (case-by-case review)

Do **not** batch-fix. Track: suppress with comment, refactor, or accept.

| File                                                | Rule(s)                              | Count | Notes                                       |
| --------------------------------------------------- | ------------------------------------ | ----: | ------------------------------------------- |
| `pages/chat/chat-page.ui.tsx`                       | set-state-in-effect, exhaustive-deps |    12 | Route/draft hydration; high regression risk |
| `pages/settings/settings-personal-info-page.ui.tsx` | set-state-in-effect                  |     5 | Form sync from server profile               |
| `widgets/message-composer/message-composer.ui.tsx`  | set-state-in-effect, exhaustive-deps |     4 | Draft/attachment state                      |
| `widgets/right-panel/right-panel-shell.ui.tsx`      | set-state-in-effect                  |     3 | Panel open state from URL                   |
| `pages/calls/calls-page.ui.tsx`                     | set-state-in-effect                  |     2 | Filter from query                           |
| `pages/login/login-page.ui.tsx`                     | set-state-in-effect                  |     2 | Realm/instance restore                      |
| `widgets/message-list/message-list.ui.tsx`          | set-state-in-effect                  |     2 | Scroll/read markers                         |
| Other hooks (1 each)                                | mixed                                |    22 | Review when touching file                   |

Also deferred: `require-atomic-updates` (7), `react-hooks/preserve-manual-memoization` (3).

## Commands

```bash
npm run lint:smells
npm run lint:smells -- --category sonarjs
npm run lint:smells -- --rule sonarjs/no-nested-conditional
npm run lint:smells -- --json
npm run lint:cc
npm run knip
```

## Exit criteria (temporary audit)

- `npm run lint:cc` → 0 at threshold 20 (see ADR-009 ratchet log)
- `lint:smells` sonarjs total &lt; 50
- Knip: no duplicate exports in `shared/config/*`

## Consequences

- Local exit code 1 from `lint:smells` / `lint:cc` is expected when warnings remain; `npm run check` stays green (warn-only).
- Remove or narrow this ADR when sonarjs warnings are sustainably low.
