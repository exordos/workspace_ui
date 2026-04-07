# Integration Guide — Adding New Features

Step-by-step guide for integrating new functionality using Feature-Sliced Design (FSD).

---

## Project Structure (FSD)

```
packages/web/src/
├── app/                 ← Entry point, router, providers, event loop
├── pages/               ← Route pages (lazy-loaded)
├── widgets/             ← Composite UI blocks (sidebar, chat-view, layout)
├── features/            ← User scenarios (15 features: ai-reply, chat-info, create-chat, etc.)
├── entities/            ← Business entities with stores and API (11: user, message, draft, inbox, etc.)
├── shared/              ← Design system, utilities, API helpers, icons
│   ├── ui/              ← Primitives (Avatar, Badge, Button, Icon, ScrollArea)
│   ├── api/             ← Low-level fetch helpers (zulipFetch, workspaceRequest)
│   ├── lib/             ← Utilities (format, html, logger, auth, validation)
│   ├── config/          ← Constants (JITSI_MEET_DOMAIN, WORKSPACE_ORIGIN)
│   └── assets/icons/    ← SVG icons
└── i18n/                ← Internationalization (ru, en)
```

Import rules: `shared → entities → features → widgets → pages → app` (only downward).

---

## Checklist for Adding a New Feature

### 1. Entity API (if new data source)

**Where**: `entities/<name>/<name>.api.ts`

```typescript
// entities/draft/draft.api.ts
import { zulipFetch, zulipPost, zulipDelete } from "~/shared/api";
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
import { request } from "~/shared/api";
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

### 4. Slice Public API (index.ts)

**Where**: `entities/<name>/index.ts`

```typescript
// entities/draft/index.ts
export { useDraftsStore } from "./draft.model";
export type { Draft, DraftInput } from "./draft.types";
export { fetchDrafts, createDraft, deleteDraft } from "./draft.api";
```

### 5. Feature (user scenario)

If the feature has UI and its own logic beyond the entity, create a feature slice:

**Where**: `features/<action>/`

```typescript
// features/manage-drafts/manage-drafts.ui.tsx
import { useDraftsStore } from "~/entities/draft";
import { ScrollArea, Icon } from "~/shared/ui";

export const DraftList: React.FC = () => {
  const drafts = useDraftsStore((s) => s.drafts);
  const loading = useDraftsStore((s) => s.loading);
  const deleteDraft = useDraftsStore((s) => s.deleteDraft);

  return (
    <ScrollArea className="flex-1">
      {loading && <p className="text-text-muted p-4">{t("app.loading")}</p>}
      {drafts.map((d) => (
        <DraftItem key={d.id} draft={d} onDelete={() => deleteDraft(d.id)} />
      ))}
    </ScrollArea>
  );
};
```

### 6. Page Component

**Where**: `pages/<name>/<name>-page.ui.tsx`

```typescript
// pages/drafts/drafts-page.ui.tsx
import { useEffect } from "react";
import { useDraftsStore } from "~/entities/draft";
import { DraftList } from "~/features/manage-drafts";
import { ChatHeader } from "~/widgets/chat-view";
import { useTranslation } from "~/i18n";

export const DraftsPage: React.FC = () => {
  const { t } = useTranslation();
  const loadDrafts = useDraftsStore((s) => s.loadDrafts);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  return (
    <div className="flex-1 flex flex-col max-w-[1199px] min-h-0">
      <ChatHeader channelName={t("nav.drafts")} hideTopic hideParticipants />
      <DraftList />
    </div>
  );
};
```

### 7. Route

**Where**: `app/app.tsx`

```tsx
const DraftsPage = React.lazy(() =>
  import("~/pages/drafts").then((m) => ({ default: m.DraftsPage })),
);

// Inside <Route element={<Layout />}>:
<Route path="/drafts" element={<DraftsPage />} />;
```

### 8. Navigation

**Sidebar link** → `widgets/sidebar/sidebar-activity.ui.tsx`:
Add an item or update `MY_ACTIVITY` data.

**TopBar section** → `widgets/top-bar/top-bar.ui.tsx`:
Add a section button if a top-level tab is needed.

### 9. Real-time Events

**Where**: `app/app.event-loop.ts` (or `widgets/layout/layout.ui.tsx` → onEvent callback)

```typescript
if (event.type === "drafts") {
  useDraftsStore.getState().loadDrafts();
}
```

If a new event type is needed, add it to `eventTypes` when registering the queue:

```typescript
const EVENT_TYPES = [...DEFAULT_EVENT_TYPES, "drafts"];
```

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
[ ] Entity: index.ts public API
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

| Pattern               | Recommended approach                                       |
| --------------------- | ---------------------------------------------------------- |
| Read state in UI      | `const x = useStore((s) => s.x)`                           |
| Trigger store action  | `useStore.getState().action()`                             |
| React to state change | `useEffect(() => { ... }, [state])`                        |
| Update state          | `set((s) => ({ field: next }))`                            |
| Define domain store   | `create<State>(...)` in `entities/<name>/<name>.model.ts`  |
| Add route             | `<Route path=\"...\" element={<.../>} />` in `app/app.tsx` |
| Navigate              | `navigate(\"/path\")`                                      |
| Component             | `const Component: React.FC = () => { ... }`                |
| Resource cleanup      | `useEffect` cleanup function                               |
| Async cancellation    | `AbortController` + cleanup                                |
| API calls             | `zulipFetch/zulipPost` from `~/shared/api`                 |
| Cross-slice usage     | Import only from public `index.ts`                         |
| UI primitives         | Radix UI + Tailwind + `~/shared/ui`                        |
