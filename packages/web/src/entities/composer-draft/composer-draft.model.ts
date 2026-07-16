import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  deleteWorkspaceComposerDraft,
  deleteWorkspaceComposerDraftIfSnapshotMatches,
  readWorkspaceComposerDraft,
  writeWorkspaceComposerDraft,
} from "~/shared/lib/workspace-messenger-cache-db";
import {
  createWorkspaceComposerDraftKey,
  createWorkspaceComposerDraftSnapshotId,
  isWorkspaceComposerDraftContentEmpty,
  normalizeWorkspaceComposerDraftContent,
} from "./composer-draft.lib";
import type { WorkspaceComposerDraft, WorkspaceComposerDraftContent } from "./composer-draft.types";

const COMPOSER_DRAFT_DEBOUNCE_MS = 400;

interface PendingWriteOperation {
  kind: "write";
  draft: WorkspaceComposerDraft;
}

interface PendingDeleteOperation {
  kind: "delete";
}

interface PendingConditionalDeleteOperation {
  kind: "conditional-delete";
  snapshotId: string;
}

type PendingOperation =
  | PendingWriteOperation
  | PendingDeleteOperation
  | PendingConditionalDeleteOperation;

type ScheduledOperation = PendingOperation & {
  key: string;
  ownerKey: string;
  conversationId: string;
  ownerGeneration: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const pendingOperations = new Map<string, ScheduledOperation>();
const persistChains = new Map<string, Promise<void>>();
const ownerGenerations = new Map<string, number>();
const localMutationVersions = new Map<string, number>();
const hydrateRequestVersions = new Map<string, number>();
const hydratedKeys = new Set<string>();
const draftOwnerKeys = new Map<string, string>();
const persistedSnapshotIds = new Map<string, string>();

function currentOwnerGeneration(ownerKey: string): number {
  return ownerGenerations.get(ownerKey) ?? 0;
}

function markLocalMutation(key: string): void {
  localMutationVersions.set(key, (localMutationVersions.get(key) ?? 0) + 1);
  hydratedKeys.add(key);
}

function setDraftOwnerKey(key: string, ownerKey: string): void {
  draftOwnerKeys.set(key, ownerKey);
}

function clearPendingOperation(key: string): void {
  const pending = pendingOperations.get(key);
  if (pending?.timer != null) {
    clearTimeout(pending.timer);
  }
  pendingOperations.delete(key);
}

function scheduleOperation(
  ownerKey: string,
  conversationId: string,
  operation: PendingOperation,
): void {
  const key = createWorkspaceComposerDraftKey(ownerKey, conversationId);
  clearPendingOperation(key);
  setDraftOwnerKey(key, ownerKey);

  const scheduled: ScheduledOperation = {
    ...operation,
    key,
    ownerKey,
    conversationId,
    ownerGeneration: currentOwnerGeneration(ownerKey),
    timer: null,
  };
  scheduled.timer = setTimeout(() => {
    scheduled.timer = null;
    void useWorkspaceComposerDraftStore.getState().flushDraft(ownerKey, conversationId);
  }, COMPOSER_DRAFT_DEBOUNCE_MS);
  pendingOperations.set(key, scheduled);
}

async function persistOperation(operation: ScheduledOperation): Promise<void> {
  if (operation.ownerGeneration !== currentOwnerGeneration(operation.ownerKey)) return;

  if (operation.kind === "write") {
    await writeWorkspaceComposerDraft(
      operation.ownerKey,
      operation.conversationId,
      operation.draft,
    );
    if (operation.ownerGeneration === currentOwnerGeneration(operation.ownerKey)) {
      persistedSnapshotIds.set(operation.key, operation.draft.snapshotId);
    }
    return;
  }
  if (operation.kind === "conditional-delete") {
    const deleted = await deleteWorkspaceComposerDraftIfSnapshotMatches(
      operation.ownerKey,
      operation.conversationId,
      operation.snapshotId,
    );
    if (deleted && operation.ownerGeneration === currentOwnerGeneration(operation.ownerKey)) {
      persistedSnapshotIds.delete(operation.key);
    }
    return;
  }
  await deleteWorkspaceComposerDraft(operation.ownerKey, operation.conversationId);
  if (operation.ownerGeneration === currentOwnerGeneration(operation.ownerKey)) {
    persistedSnapshotIds.delete(operation.key);
  }
}

function removeDraftFromState(
  draftsByKey: Record<string, WorkspaceComposerDraft>,
  key: string,
): Record<string, WorkspaceComposerDraft> {
  if (draftsByKey[key] == null) return draftsByKey;
  const nextDraftsByKey = { ...draftsByKey };
  delete nextDraftsByKey[key];
  return nextDraftsByKey;
}

export interface WorkspaceComposerDraftStoreState {
  draftsByKey: Record<string, WorkspaceComposerDraft>;

  setDraft: (
    ownerKey: string,
    conversationId: string,
    content: WorkspaceComposerDraftContent,
  ) => WorkspaceComposerDraft | null;
  hydrateDraft: (
    ownerKey: string,
    conversationId: string,
  ) => Promise<WorkspaceComposerDraft | null>;
  flushDraft: (ownerKey: string, conversationId: string) => Promise<void>;
  clearDraft: (ownerKey: string, conversationId: string) => void;
  clearDraftIfSnapshotMatches: (
    ownerKey: string,
    conversationId: string,
    snapshotId: string,
  ) => boolean;
  disposeOwner: (ownerKey: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useWorkspaceComposerDraftStore = create<WorkspaceComposerDraftStoreState>(
  (set, get) => ({
    draftsByKey: {},

    setDraft(ownerKey, conversationId, content) {
      const key = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      const normalizedContent = normalizeWorkspaceComposerDraftContent(content);
      markLocalMutation(key);
      setDraftOwnerKey(key, ownerKey);

      if (isWorkspaceComposerDraftContentEmpty(normalizedContent)) {
        logStoreAction("workspaceComposerDraft", "clearEmptyDraft", { ownerKey, conversationId });
        set((state) => ({ draftsByKey: removeDraftFromState(state.draftsByKey, key) }));
        scheduleOperation(ownerKey, conversationId, { kind: "delete" });
        return null;
      }

      const draft: WorkspaceComposerDraft = {
        key,
        ownerKey,
        conversationId,
        snapshotId: createWorkspaceComposerDraftSnapshotId(),
        content: normalizedContent,
        updatedAt: Date.now(),
      };
      logStoreAction("workspaceComposerDraft", "setDraft", { ownerKey, conversationId });
      set((state) => ({
        draftsByKey: {
          ...state.draftsByKey,
          [key]: draft,
        },
      }));
      scheduleOperation(ownerKey, conversationId, { kind: "write", draft });
      return draft;
    },

    async hydrateDraft(ownerKey, conversationId) {
      const key = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      setDraftOwnerKey(key, ownerKey);
      const currentDraft = get().draftsByKey[key];
      if (currentDraft != null) return currentDraft;
      if (localMutationVersions.has(key) || hydratedKeys.has(key)) return null;

      const ownerGeneration = currentOwnerGeneration(ownerKey);
      const localMutationVersion = localMutationVersions.get(key) ?? 0;
      const requestVersion = (hydrateRequestVersions.get(key) ?? 0) + 1;
      hydrateRequestVersions.set(key, requestVersion);
      const row = await readWorkspaceComposerDraft<unknown>(ownerKey, conversationId);

      if (
        ownerGeneration !== currentOwnerGeneration(ownerKey) ||
        requestVersion !== hydrateRequestVersions.get(key) ||
        localMutationVersion !== (localMutationVersions.get(key) ?? 0) ||
        get().draftsByKey[key] != null
      ) {
        return get().draftsByKey[key] ?? null;
      }

      hydratedKeys.add(key);
      if (row == null) return null;

      const draft: WorkspaceComposerDraft = {
        key,
        ownerKey,
        conversationId,
        snapshotId: row.snapshotId,
        content: normalizeWorkspaceComposerDraftContent(row.content),
        updatedAt: row.updatedAt,
      };
      persistedSnapshotIds.set(key, row.snapshotId);
      logStoreAction("workspaceComposerDraft", "hydrateDraft", { ownerKey, conversationId });
      set((state) => ({
        draftsByKey: {
          ...state.draftsByKey,
          [key]: draft,
        },
      }));
      return draft;
    },

    async flushDraft(ownerKey, conversationId) {
      const key = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      const pending = pendingOperations.get(key);
      if (pending == null) {
        await (persistChains.get(key) ?? Promise.resolve());
        return;
      }

      clearPendingOperation(key);
      const previous = persistChains.get(key) ?? Promise.resolve();
      const operationPromise = previous
        .catch(() => undefined)
        .then(() => persistOperation(pending))
        .catch(() => undefined);
      persistChains.set(key, operationPromise);
      await operationPromise;
      if (persistChains.get(key) === operationPromise) {
        persistChains.delete(key);
      }
    },

    clearDraft(ownerKey, conversationId) {
      const key = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      markLocalMutation(key);
      setDraftOwnerKey(key, ownerKey);
      logStoreAction("workspaceComposerDraft", "clearDraft", { ownerKey, conversationId });
      set((state) => ({ draftsByKey: removeDraftFromState(state.draftsByKey, key) }));
      scheduleOperation(ownerKey, conversationId, { kind: "delete" });
    },

    clearDraftIfSnapshotMatches(ownerKey, conversationId, snapshotId) {
      const key = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      const currentDraft = get().draftsByKey[key];
      if (currentDraft?.snapshotId !== snapshotId) return false;

      markLocalMutation(key);
      setDraftOwnerKey(key, ownerKey);
      logStoreAction("workspaceComposerDraft", "clearDraftIfSnapshotMatches", {
        ownerKey,
        conversationId,
      });
      set((state) => ({ draftsByKey: removeDraftFromState(state.draftsByKey, key) }));
      const operation: PendingOperation =
        persistedSnapshotIds.get(key) === snapshotId
          ? { kind: "conditional-delete", snapshotId }
          : { kind: "delete" };
      scheduleOperation(ownerKey, conversationId, operation);
      return true;
    },

    async disposeOwner(ownerKey) {
      ownerGenerations.set(ownerKey, currentOwnerGeneration(ownerKey) + 1);
      const keys = [...draftOwnerKeys.entries()]
        .filter(([, candidateOwnerKey]) => candidateOwnerKey === ownerKey)
        .map(([key]) => key);
      const pendingPersistChains = keys
        .map((key) => persistChains.get(key))
        .filter((chain): chain is Promise<void> => chain != null);
      for (const key of keys) {
        clearPendingOperation(key);
        localMutationVersions.delete(key);
        hydrateRequestVersions.delete(key);
        hydratedKeys.delete(key);
        draftOwnerKeys.delete(key);
        persistedSnapshotIds.delete(key);
      }
      logStoreAction("workspaceComposerDraft", "disposeOwner", { ownerKey });
      set((state) => {
        const draftsByKey = Object.fromEntries(
          Object.entries(state.draftsByKey).filter(([, draft]) => draft.ownerKey !== ownerKey),
        );
        return { draftsByKey };
      });
      await Promise.all(pendingPersistChains);
    },

    async clear() {
      const ownerKeys = new Set<string>([
        ...ownerGenerations.keys(),
        ...draftOwnerKeys.values(),
        ...Object.values(get().draftsByKey).map((draft) => draft.ownerKey),
      ]);
      await Promise.all([...ownerKeys].map((ownerKey) => get().disposeOwner(ownerKey)));
      logStoreAction("workspaceComposerDraft", "clear", {});
      set({ draftsByKey: {} });
    },
  }),
);

export function selectWorkspaceComposerDraft(
  state: Pick<WorkspaceComposerDraftStoreState, "draftsByKey">,
  ownerKey: string | null | undefined,
  conversationId: string | null | undefined,
): WorkspaceComposerDraft | null {
  if (ownerKey == null || conversationId == null) return null;
  return state.draftsByKey[createWorkspaceComposerDraftKey(ownerKey, conversationId)] ?? null;
}

export function resetWorkspaceComposerDraftStoreForTests(): void {
  for (const pending of pendingOperations.values()) {
    if (pending.timer != null) clearTimeout(pending.timer);
  }
  pendingOperations.clear();
  persistChains.clear();
  ownerGenerations.clear();
  localMutationVersions.clear();
  hydrateRequestVersions.clear();
  hydratedKeys.clear();
  draftOwnerKeys.clear();
  persistedSnapshotIds.clear();
  useWorkspaceComposerDraftStore.setState({ draftsByKey: {} });
}
