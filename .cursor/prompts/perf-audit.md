# Performance Audit

```
Audit performance in <PATH_OR_SCOPE>.

Check for (see .cursor/rules/performance.mdc):

1. Zustand selectors returning new objects (referential inequality)
2. Missing React.memo on components in .map()
3. Missing useMemo for sort/filter/reduce
4. Missing useCallback for handlers passed as props
5. Inline objects/arrays in JSX props
6. Zustand getters creating new arrays/maps without cache
7. Empty array/object fallbacks creating new references (use module constant)
8. setInterval instead of createResilientInterval
9. Large component files that should be decomposed
10. Missing lazy loading for pages/heavy libraries

Fix Critical anti-patterns. Report others.
Verify: npx tsc --noEmit && npx vitest run
```
