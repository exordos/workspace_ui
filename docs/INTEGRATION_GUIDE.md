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
│   ├── api/             ← client.ts, workspace-client.ts, zulip-*.ts
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

```typescript
// entities/draft/draft.api.ts
import { zulipFetch, zulipPost, zulipDelete } from "~/shared/api/client";
import type { Draft, DraftInput } from "./draft.types";

export async function fetchDrafts(): Promise<Draft[]> {
  const res = await zulipFetch("drafts");
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.drafts;
}

export async function createDraft(draft: DraftInput): Promise<{ ids: number[] }> {
  const res = await zulipPost("drafts", {
    drafts: JSON.stringify([draft]),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function deleteDraft(id: number): Promise<void> {
  const res = await zulipDelete(`drafts/${id}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}
```

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

```typescript
// entities/draft/draft.types.ts
export interface Draft {
  id: number;
  type: "private" | "stream";
  to: number[];
  topic: string;
  content: string;
  timestamp?: number;
}

export interface DraftInput {
  type: "private" | "stream";
  to: number[];
  topic: string;
  content: string;
}
```

### 3. Zustand Store (entity model)

**Where**: `entities/<name>/<name>.model.ts`

```typescript
// entities/draft/draft.model.ts
import { create } from "zustand";
import { createLogger } from "~/shared/lib/logger";
import { fetchDrafts, createDraft as apiCreateDraft, deleteDraft as apiDeleteDraft } from "./draft.api";
import type { Draft, DraftInput } from "./draft.types";

const log = createLogger("draft");

interface DraftsState {
  drafts: Draft[];
  loading: boolean;

  loadDrafts: () => Promise<void>;
  createDraft: (draft: DraftInput) => Promise<void>;
  deleteDraft: (id: number) => Promise<void>;
  getDraftForChat: (chatId: string) => Draft | undefined;
  clear: () => void;
}

export const useDraftsStore = create<DraftsState>((set, get) => ({
  drafts: [],
  loading: false,

  async loadDrafts() {
    set({ loading: true });
    try {
      const drafts = await fetchDrafts();
      set({ drafts, loading: false });
      log.info("Drafts loaded", { count: drafts.length });
    } catch (err) {
      log.error("Failed to load drafts", { error: String(err) });
      set({ loading: false });
    }
  },

  async createDraft(input) {
    const { ids } = await apiCreateDraft(input);
    log.info("Draft created", { id: ids[0] });
    await get().loadDrafts();
  },

  async deleteDraft(id) {
    await apiDeleteDraft(id);
    set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }));
    log.info("Draft deleted", { id });
  },

  getDraftForChat(chatId) {
    return get().drafts.find((d) => /* match logic */);
  },

  clear() {
    set({ drafts: [], loading: false });
  },
}));
```

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

**Where**: `widgets/layout/layout-zulip-event-dispatch.lib.ts` (extend dispatch for new event types)

The loop itself lives in `shared/lib/event-loop.ts` and is started from `widgets/layout/layout-zulip-event-loop.hook.ts`.

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
| API calls             | `zulipFetch/zulipPost` from `~/shared/api`                   |
| Cross-slice usage     | Import concrete `*.model.ts` / `*.api.ts` / `*.ui.tsx` paths |
| UI primitives         | Radix UI + Tailwind + `~/shared/ui`                          |
