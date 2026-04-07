# Code Review

```
Review the code in <PATH_OR_DIRECTORY>.

Follow .cursor/skills/code-review/SKILL.md.

Check all 12 categories:
1. FSD Architecture (import direction, barrel imports)
2. TypeScript (no any, type imports, noUncheckedIndexedAccess)
3. Security (XSS, URL validation, no eval)
4. Performance (React.memo, useMemo, useCallback, Zustand selectors)
5. Memory leaks (useEffect cleanup, named listeners)
6. Accessibility (aria-labels, roles, tabIndex, touch targets)
7. i18n (all text via t(), keys in both locales)
8. Error handling (invariant, guard.*, try/catch)
9. Logging (createLogger, no console.log)
10. Caching (createResilientInterval, resolveAvatarUrl)
11. Testing (test file exists, TDD)
12. Documentation (docs updated)

Fix Critical and High issues. Report Medium and Low.
After fixes: npx tsc --noEmit && npx vitest run
```
