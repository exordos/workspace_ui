# Integration Guide — Adding New Features

Step-by-step guide for integrating new functionality using Feature-Sliced Design (FSD).

> **Canonical structure:** [PROJECT_FACTS.md](PROJECT_FACTS.md) · **Architecture:** [fsd-architecture.md](fsd-architecture.md) · **Async org safety:** [ORG_SCOPED_ASYNC_SAFETY.md](ORG_SCOPED_ASYNC_SAFETY.md)

---

## Project Structure (FSD)

```
packages/web/src/
├── app/                 ← Entry point, router, providers, contexts
├── pages/               ← 14 route pages (lazy-loaded)
├── widgets/             ← 9 composite UI blocks
├── features/            ← 22 user scenarios
├── entities/            ← 17 business entities (stores + API)
├── shared/              ← Design system, utilities, API helpers, icons
│   ├── ui/
│   ├── api/             ← client.ts, workspace-client.ts, messenger-*.ts
│   ├── lib/             ← event-loop.ts, brand.ts, guards.ts, …
│   └── config/
└── i18n/
```

Import rules: `shared → entities → features → widgets → pages → app` (only downward). Use **concrete segment imports** — no barrel-only `index.ts` (see `.cursor/rules/no-barrel-index.mdc`).

---

## Checklist for Adding a New Feature

Before adding any organization-scoped async loader or mutation, read [ORG_SCOPED_ASYNC_SAFETY.md](ORG_SCOPED_ASYNC_SAFETY.md). Active-organization validation is mandatory for async work that can outlive organization switch and later write into store state or IndexedDB.

### 1. Entity API (if new data source)

**Where**: `entities/<name>/<name>.api.ts`

For a current production example, see `entities/draft/draft.api.ts`. It uses the shared raw
`messengerApi` wrapper because conditional mutations and pagination require access to `ETag`,
`If-Match`, and `X-Pagination-Marker` headers. Prefer generated API functions normally; document
an exception when the generated layer cannot expose a required part of the HTTP contract.

**Workspace API** (via `shared/api/workspace-client.ts`):

```typescript
// entities/folder/folder.api.ts
import { request } from "~/shared/api/workspace-client";
import type { WorkspaceFolder } from "./folder.types";

export async function getFolders(): Promise<WorkspaceFolder[]> {
  return request<WorkspaceFolder[]>("folders/");
}
```

### 2. TypeScript Types

**Where**: `entities/<name>/<name>.types.ts`

Model server-owned identifiers and concurrency fields explicitly. The Draft entity, for example,
uses client-generated UUIDs, mandatory `stream_uuid` and `topic_uuid`, a typed markdown payload,
server revision, timestamps, and ETag. Do not collapse multiple server resources into a
chat-addressed singleton when the API permits sibling resources.

### 3. Zustand Store (entity model)

**Where**: `entities/<name>/<name>.model.ts`

Keep entity stores keyed by stable server identity and separate paging/hydration from mutations.
For optimistic conditional updates, preserve unsent local input on 412 and expose the current
server snapshot rather than silently overwriting either side.

### 4. Feature (user scenario)

If the feature has UI and its own logic beyond the entity, create a feature slice:

**Where**: `features/<action>/`

```typescript
// features/manage-drafts/manage-drafts.ui.tsx
import { useDraftStore } from "~/entities/draft/draft.model";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { Icon } from "~/shared/ui/icon";

export const DraftList: React.FC = () => {
  const drafts = useDraftStore((s) => s.drafts);
  // ...
};
```

Import concrete segment files from other slices (example above).

### 5. Page or activity tab

Drafts are shown on the **activity** page, not a separate `/drafts` route. For a new dedicated route:

**Where**: `pages/<name>/<name>-page.ui.tsx`

```typescript
// pages/logs/logs-page.ui.tsx
import { useTranslation } from "~/i18n/i18n";

export const LogsPage: React.FC = () => {
  const { t } = useTranslation();
  return <div>{t("nav.logs")}</div>;
};
```

### 6. Route

**Where**: `app/app.tsx`

```tsx
const LogsPage = React.lazy(() =>
  import("~/pages/logs/logs-page.ui").then((m) => ({ default: m.LogsPage })),
);

<Route path="/logs" element={<LogsPage />} />;
```

### 8. Navigation

**Sidebar link** → `widgets/sidebar/sidebar-activity.ui.tsx`:
Add an item or update `MY_ACTIVITY` data.

**TopBar section** → `widgets/top-bar/top-bar.ui.tsx`:
Add a section button if a top-level tab is needed.

### 9. Real-time Events

**Where**: `widgets/layout/layout-messenger-event-dispatch.lib.ts` (extend dispatch for new event types)

The loop itself lives in `shared/lib/event-loop.ts` and is started from `widgets/layout/layout-messenger-event-loop.hook.ts`.

### 10. Theme / Styles

New colors → `app/app.styles.css` (CSS variable) + `shared/lib/themes/` (token mapping).

Never use hardcoded colors. Always use semantic tokens: `text-primary`, `bg-card-bg`, `accent`, etc.

### 11. Cleanup on Instance Switch

**Where**: `widgets/layout/layout.ui.tsx` → useEffect on `currentInstanceId` change:

```typescript
useEffect(() => {
  useDraftsStore.getState().clear();
  // ...other stores
}, [currentInstanceId]);
```

---

## Context Patterns

### When to Use Context vs Store

| Situation                          | Solution                         |
| ---------------------------------- | -------------------------------- |
| Global state (data from API)       | Zustand store in `entities/`     |
| UI state of a single screen        | `useState`                       |
| Callback passed through 3+ levels  | React Context in `app/contexts/` |
| State needed in sibling components | Zustand store                    |
| Persist between sessions           | Zustand store + localStorage     |

### When to Create a New Entity vs Feature

| If the code is...                      | Place it in...       |
| -------------------------------------- | -------------------- |
| Data model + API + store (domain)      | `entities/<name>/`   |
| User interaction / scenario            | `features/<action>/` |
| Composite block used on multiple pages | `widgets/<name>/`    |
| UI primitive (button, badge, icon)     | `shared/ui/`         |
| Utility function                       | `shared/lib/`        |
| API helper                             | `shared/api/`        |

### Naming Style (FSD)

| Type           | Pattern              | Example                   |
| -------------- | -------------------- | ------------------------- |
| Entity folder  | `kebab-case`         | `entities/sticker/`       |
| Feature folder | `kebab-case`         | `features/ai-reply/`      |
| Store file     | `<name>.model.ts`    | `sticker.model.ts`        |
| Store hook     | `use<Name>Store`     | `useStickerStore`         |
| API file       | `<name>.api.ts`      | `sticker.api.ts`          |
| Types file     | `<name>.types.ts`    | `ai-reply.types.ts`       |
| UI file        | `<name>.ui.tsx`      | `sticker-picker.ui.tsx`   |
| Page file      | `<name>-page.ui.tsx` | `drafts-page.ui.tsx`      |
| API function   | `camelCase`          | `fetchStickerPacks`       |
| Interface      | `PascalCase`         | `Sticker`, `AiSuggestion` |

---

## Complete Checklist for a New Feature

When implementing each feature, verify:

```
[ ] Entity: API (entities/<name>/<name>.api.ts) or shared/api/
[ ] Entity: Types (entities/<name>/<name>.types.ts) — no `any`
[ ] Entity: Zustand store (entities/<name>/<name>.model.ts) with createLogger
[ ] Imports: concrete segment paths only (no barrel index.ts)
[ ] Feature: UI component (features/<action>/<action>.ui.tsx) if needed
[ ] Page: lazy-loaded page (pages/<name>/<name>-page.ui.tsx) if new route
[ ] Route in app/app.tsx (React.lazy + Suspense)
[ ] i18n: strings in ru.json + en.json, uses t("key")
[ ] Branding: brand.* instead of hardcoded "Workspace"
[ ] Permissions: hasPermission() for role-dependent UI
[ ] Keyboard shortcuts: SHORTCUTS[] if there are new actions
[ ] Logging: createLogger("scope"), logApiCall — no PII
[ ] Security: sanitizeHtml, isValidUrl, validateFileUpload
[ ] Theme: semantic tokens only, verify dark+light
[ ] Tests: store + utility + component render
[ ] Performance: lazy imports, minimal selectors, React.memo for list items
[ ] Error handling: try/catch, loading/error state, ErrorBoundary
[ ] TypeCheck: npm run typecheck — 0 errors
[ ] Cleanup on instance switch: store.clear()
[ ] Docs: update docs/ if needed
```

## React FSD: Quick Reference

| Pattern               | Recommended approach                                         |
| --------------------- | ------------------------------------------------------------ |
| Read state in UI      | `const x = useStore((s) => s.x)`                             |
| Trigger store action  | `useStore.getState().action()`                               |
| React to state change | `useEffect(() => { ... }, [state])`                          |
| Update state          | `set((s) => ({ field: next }))`                              |
| Define domain store   | `create<State>(...)` in `entities/<name>/<name>.model.ts`    |
| Add route             | `<Route path=\"...\" element={<.../>} />` in `app/app.tsx`   |
| Navigate              | `navigate(\"/path\")`                                        |
| Component             | `const Component: React.FC = () => { ... }`                  |
| Resource cleanup      | `useEffect` cleanup function                                 |
| Async cancellation    | `AbortController` + cleanup                                  |
| API calls             | `messengerFetch/messengerPost` from `~/shared/api`           |
| Cross-slice usage     | Import concrete `*.model.ts` / `*.api.ts` / `*.ui.tsx` paths |
| UI primitives         | Radix UI + Tailwind + `~/shared/ui`                          |
