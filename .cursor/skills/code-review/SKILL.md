---
name: code-review
description: >-
  Systematic code review and refactoring following project standards.
  Use when asked to review code, audit a module, refactor, clean up,
  or improve code quality. Checks FSD compliance, security, performance,
  a11y, i18n, testing, and documentation.
  Optimized for deep-context review — reads entire files and cross-references rules.
---

# Code Review & Refactoring

> Read full files and cross-reference with all applicable rules.

## Review Checklist (12 categories)

For each file under review, check ALL categories. Score: PASS / WARN / FAIL.

### 1. FSD Architecture

| Check                                                                       | Rule                   |
| --------------------------------------------------------------------------- | ---------------------- |
| Imports only go DOWN the layer hierarchy                                    | `fsd-architecture.mdc` |
| No cross-slice imports within same layer                                    | `fsd-architecture.mdc` |
| Imports use concrete segment files (no barrel-only `index.ts`)              | `no-barrel-index.mdc` |
| File naming: `*.ui.tsx`, `*.model.ts`, `*.api.ts`, `*.lib.ts`, `*.types.ts` | `fsd-architecture.mdc` |
| No imports from legacy paths (`~/components/`, `~/stores/`, `~/lib/`)       | Migration complete     |

### 2. TypeScript

| Check                                                     | Rule                        |
| --------------------------------------------------------- | --------------------------- |
| No `any` — use `unknown` + type guard                     | `project-architecture.mdc`  |
| No `@ts-ignore` without ticket reference                  | `defensive-programming.mdc` |
| `import type` for type-only imports                       | `project-architecture.mdc`  |
| No `as T` to silence errors — fix the actual type         | `defensive-programming.mdc` |
| `noUncheckedIndexedAccess`: array access uses `!` or `?.` | `defensive-programming.mdc` |

### 3. Security

| Check                                                          | Rule           |
| -------------------------------------------------------------- | -------------- |
| `dangerouslySetInnerHTML` ONLY with `sanitizeHtml()`           | `security.mdc` |
| URLs validated with `isValidUrl()` or `guard.url()` before use | `security.mdc` |
| No `eval`, `new Function`, `document.write`                    | `security.mdc` |
| User input sanitized before API calls                          | `security.mdc` |
| Credentials not in logs (redaction by `logger`)                | `logging.mdc`  |

### 4. Performance

| Check                                                   | Rule              |
| ------------------------------------------------------- | ----------------- |
| `React.memo` on components rendered in `.map()`         | `performance.mdc` |
| `useCallback` for handlers passed to children           | `performance.mdc` |
| `useMemo` for sort/filter/reduce on arrays >10 items    | `performance.mdc` |
| Zustand selectors: `(s) => s.field`, not destructuring  | `performance.mdc` |
| No inline objects/arrays in JSX props                   | `performance.mdc` |
| Zustand getters with derived data use referential cache | `performance.mdc` |

### 5. Memory Leaks

| Check                                                            | Rule               |
| ---------------------------------------------------------------- | ------------------ |
| Every `addEventListener` has `removeEventListener` in cleanup    | `memory-leaks.mdc` |
| Every `setInterval` has `clearInterval` in cleanup               | `memory-leaks.mdc` |
| Every `useEffect` with side effects returns cleanup              | `memory-leaks.mdc` |
| Async operations check `cancelled` flag or use `AbortController` | `memory-leaks.mdc` |
| Named listeners (not anonymous) for removability                 | `memory-leaks.mdc` |

### 6. Accessibility

| Check                                                            | Rule                 |
| ---------------------------------------------------------------- | -------------------- |
| Interactive elements have `aria-label` (using `t()`)             | `focus-tabindex.mdc` |
| Custom interactive elements: `tabIndex={0}`, `role`, `onKeyDown` | `focus-tabindex.mdc` |
| No `tabIndex > 0`                                                | `focus-tabindex.mdc` |
| Touch targets >= 44px on `@media (pointer: coarse)`              | `touch.mdc`          |
| Modals use `useFocusTrap` and `role="dialog"`                    | `focus-tabindex.mdc` |

### 7. Internationalization

| Check                                                    | Rule              |
| -------------------------------------------------------- | ----------------- |
| All UI text uses `t("key")`                              | `i18n.mdc`        |
| Keys exist in BOTH `en.json` and `ru.json`               | `i18n.mdc`        |
| No hardcoded "Workspace" — use `brand.appName`           | `white-label.mdc` |
| Plurals use `_one/_few/_many` (ru) or `_one/_other` (en) | `i18n.mdc`        |

### 8. Error Handling

| Check                                                 | Rule                        |
| ----------------------------------------------------- | --------------------------- |
| Async functions have try/catch                        | `defensive-programming.mdc` |
| `invariant()` for preconditions                       | `defensive-programming.mdc` |
| `guard.*` for input validation at boundaries          | `defensive-programming.mdc` |
| `safeCatch()` for event listeners that must not crash | `defensive-programming.mdc` |
| ErrorBoundary wraps each page route                   | `react-components.mdc`      |

### 9. Logging

| Check                                           | Rule                 |
| ----------------------------------------------- | -------------------- |
| Uses `createLogger("scope")`, not `console.log` | `logging.mdc`        |
| API calls tracked via middleware (automatic)    | `api-middleware.mdc` |
| Store actions logged via `logStoreAction`       | `logging.mdc`        |
| No PII/credentials in log messages              | `logging.mdc`        |

### 10. Caching & Staleness

| Check                                                     | Rule          |
| --------------------------------------------------------- | ------------- |
| `createResilientInterval` for polling (not `setInterval`) | `caching.mdc` |
| Avatar URLs use `resolveAvatarUrl()` (cache busting)      | `caching.mdc` |
| Event loop has `onReconnect` → re-fetch stale data        | `caching.mdc` |

### 11. Testing

| Check                                  | Rule          |
| -------------------------------------- | ------------- |
| Test file exists next to source file   | `testing.mdc` |
| Store actions tested (TDD)             | `testing.mdc` |
| Uses factories from `~/test/factories` | `testing.mdc` |
| No `it.skip` without ticket            | `testing.mdc` |

### 12. Documentation

| Check                                             | Rule |
| ------------------------------------------------- | ---- |
| New entity in `docs/STORES_REFERENCE.md`          | —    |
| New UC in `docs/USE_CASES.md`                     | —    |
| Complex feature has its own `.cursor/rules/*.mdc` | —    |

## Review Output Format

```markdown
## Review: <file path>

### PASS (N/12)

- [x] FSD Architecture
- [x] TypeScript
      ...

### FAIL (N/12)

- [ ] Performance — inline object in JSX prop (line 45)
- [ ] i18n — hardcoded "Close" (line 78)

### Fixes Applied

1. Line 45: extracted `style` to `useMemo`
2. Line 78: replaced with `t("common.close")`
```

## Refactoring Strategy

When refactoring, follow this order:

1. **Fix Critical** (security, bugs, crashes) — immediately
2. **Fix High** (memory leaks, type errors, FSD violations) — same PR
3. **Report Medium** (performance, i18n, a11y) — fix if < 5 min, else ticket
4. **Report Low** (naming, style, docs) — log for later

After every fix: `npx tsc --noEmit && npx vitest run`
