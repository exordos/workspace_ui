---
name: full-stack-feature
description: >-
  End-to-end feature development following FSD architecture and TDD.
  Use when the user asks to implement a new feature, add a screen, create
  a new entity, or build any non-trivial functionality. Covers the complete
  cycle: analysis → types → store → API → tests → UI → integration → docs.
  Optimized for deep-context agent workflows with parallel agent dispatch.
---

# Full-Stack Feature Development

> Use full repository context and parallel agents for complex tasks.

## Before You Start

Read these files to understand the project (use semantic search, don't read linearly):

| What             | Where                                                               |
| ---------------- | ------------------------------------------------------------------- |
| Architecture     | `AGENTS.md` (sections: Architecture, Key Modules, Coding Standards) |
| FSD rules        | `.cursor/rules/fsd-architecture.mdc`                                |
| Current features | `docs/USE_CASES.md`                                                 |

## Phase 1: Plan (DO NOT WRITE CODE)

### 1.1 Define the scope

Before touching code, answer these questions IN YOUR RESPONSE:

1. **What** — one-sentence description of the feature
2. **Why** — user need / business value
3. **Where in FSD** — which layer(s) will be affected:
   - Entity? (new data model / store) → `entities/<name>/`
   - Feature? (user scenario) → `features/<name>/`
   - Widget? (new UI block) → `widgets/<name>/`
   - Page? (new route) → `pages/<name>/`
   - Shared? (reusable utility) → `shared/lib/`, `shared/ui/`
4. **API** — which Zulip/Workspace endpoints are needed
5. **State** — what data goes in Zustand, what stays in component state
6. **Test plan** — what to test (store actions, API, UI behavior)

### 1.2 Check for conflicts

- Search for existing code that does something similar
- Check if an FSD slice already exists: `ls src/entities/ src/features/`
- Check if the API endpoint is already wrapped: grep for the path in `lib/zulipClient.ts`

## Phase 2: Types + Store (TDD)

### 2.1 Create types FIRST

```
entities/<name>/<name>.types.ts
```

Define all TypeScript interfaces. Export from `index.ts`.

### 2.2 Write failing tests

```
entities/<name>/<name>.test.ts
```

Write tests for store actions BEFORE implementing the store. Use factories:

```typescript
import { createMessage, createUser } from "~/test/factories";
```

### 2.3 Implement the store

```
entities/<name>/<name>.model.ts
```

Zustand store with cached selectors. Run tests → GREEN.

### 2.4 Create barrel

```
entities/<name>/index.ts
```

Export only the public API. No internal imports allowed from outside.

## Phase 3: API

### 3.1 Write failing API tests (MSW)

```typescript
const server = setupServer(
  http.get("*/api/v1/<endpoint>", () => {
    return HttpResponse.json({ result: "success", data: [...] });
  }),
);
```

### 3.2 Implement API functions

```
entities/<name>/<name>.api.ts
```

Use `zulipApi.get()` / `.post()` from `~/shared/api/client`. Add to barrel.

## Phase 4: UI Components

### 4.1 Feature UI (if user scenario)

```
features/<name>/<name>.ui.tsx
features/<name>/index.ts
```

### 4.2 Widget UI (if composite block)

```
widgets/<name>/<name>.ui.tsx
widgets/<name>/index.ts
```

### 4.3 Page (if new route)

```
pages/<name>/<name>-page.ui.tsx
pages/<name>/index.ts
```

Add lazy route to `app/app.tsx`.

## Phase 5: Integration

### 5.1 Event loop (if real-time events)

Add event handler to `app/app.event-loop.ts` → dispatch to store.

### 5.2 Layout integration

Wire up in `widgets/layout/layout.ui.tsx` or the appropriate page.

### 5.3 Keyboard shortcuts (if applicable)

Add to `SHORTCUTS[]` in `shared/lib/shortcuts.ts`. Register with `useShortcut()`.

## Phase 6: Quality Gates (MANDATORY)

Run each check. Do NOT skip any.

| Gate        | Command / Action                                        | Passing criteria             |
| ----------- | ------------------------------------------------------- | ---------------------------- |
| TypeScript  | `npx tsc --noEmit`                                      | 0 errors                     |
| Tests       | `npx vitest run`                                        | All pass, new tests included |
| ESLint      | `npx eslint src/`                                       | 0 errors (warnings OK)       |
| Security    | Check: no XSS, no raw HTML, URLs validated              | Manual review                |
| i18n        | All UI strings use `t()`                                | No hardcoded text            |
| Theming     | Uses semantic tokens, not hardcoded colors              | Visual check                 |
| A11y        | aria-labels, roles, keyboard nav, 44px touch targets    | Manual review                |
| Logging     | Uses `createLogger`, sensitive data redacted            | Grep for console.log         |
| Guards      | `guard.userId()` / `invariant()` at boundaries          | Code review                  |
| Memory      | useEffect cleanup, no dangling listeners                | Code review                  |
| Performance | `React.memo` on list items, `useMemo` for expensive ops | Code review                  |
| Docs        | Update `docs/USE_CASES.md` if new UC                    | Check                        |

### Quick check command

```bash
cd packages/web && npx tsc --noEmit && npx vitest run && echo "ALL GATES PASSED"
```

## Phase 7: Documentation

1. Add use case(s) to `docs/USE_CASES.md`
2. If new entity: add to `docs/STORES_REFERENCE.md`
3. If new API: add to `docs/API_CLIENT_REFERENCE.md`
4. If new component: add to `docs/COMPONENT_CATALOG.md`
5. If complex: write Cursor rule `.cursor/rules/<feature>.mdc`

## Parallel Agent Strategy

For complex feature work, dispatch up to 4 agents for independent work:

```
Agent A: Types + Store + Tests (entities/)
Agent B: API functions + MSW handlers (entities/*.api.ts)
Agent C: UI components (features/ or widgets/)
Agent D: Documentation + Cursor rule
```

Merge results, then run quality gates as a single pass.

## Common Mistakes to Avoid

| Mistake                           | Correct approach                      |
| --------------------------------- | ------------------------------------- |
| Import from internal file         | Import from `index.ts` barrel only    |
| `useStore()` without selector     | `useStore((s) => s.field)`            |
| Inline function in JSX prop       | `useCallback` or extract handler      |
| Hardcoded color in Tailwind       | Use semantic token (`bg-bg-elevated`) |
| `console.log`                     | `createLogger("scope")`               |
| Missing cleanup in useEffect      | Always return cleanup function        |
| `any` type                        | `unknown` + type guard                |
| Missing `React.memo` on list item | Wrap in `React.memo`                  |
| Forgot to add i18n key            | Add to BOTH `en.json` and `ru.json`   |
| Forgot test                       | Write test FIRST (TDD)                |
