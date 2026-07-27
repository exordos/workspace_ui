import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  deleteWorkspaceComposerDraftRecord,
  migrateWorkspaceComposerDraftToRecord,
  readWorkspaceComposerDraft,
  readWorkspaceComposerDraftRecords,
  writeWorkspaceComposerDraftRecord,
} from "~/shared/lib/workspace-messenger-cache-db";
import {
  createWorkspaceComposerDraftKey,
  createWorkspaceComposerDraftSnapshotId,
  createWorkspaceComposerDraftUuid,
  isWorkspaceComposerDraftContentEmpty,
  normalizeWorkspaceComposerDraftContent,
  normalizeWorkspaceComposerDraftRemoteText,
} from "./composer-draft.lib";
import type {
  WorkspaceComposerDraft,
  WorkspaceComposerDraftContent,
  WorkspaceComposerDraftTarget,
} from "./composer-draft.types";

const COMPOSER_DRAFT_DEBOUNCE_MS = 400;

type ScheduledOperation =
  | {
      kind: "write";
      draft: WorkspaceComposerDraft;
      ownerGeneration: number;
      timer: ReturnType<typeof setTimeout> | null;
    }
  | {
      kind: "delete";
      ownerKey: string;
      draftUuid: string;
      ownerGeneration: number;
      timer: ReturnType<typeof setTimeout> | null;
    };

const pendingOperations = new Map<string, ScheduledOperation>();
const persistChains = new Map<string, Promise<void>>();
const ownerGenerations = new Map<string, number>();
const hydratedOwners = new Set<string>();
const hydrationPromises = new Map<string, Promise<void>>();
const removedStreamKeys = new Set<string>();
let lastDraftUpdatedAt = 0;
let storeGeneration = 0;

function ownerGeneration(ownerKey: string): number {
  return ownerGenerations.get(ownerKey) ?? 0;
}

function draftKey(ownerKey: string, draftUuid: string): string {
  return `${ownerKey}:${draftUuid}`;
}

function removedStreamKey(ownerKey: string, streamUuid: string): string {
  return `${ownerKey}\0${streamUuid}`;
}

function isDraftStreamRemoved(ownerKey: string, streamUuid: string): boolean {
  return removedStreamKeys.has(removedStreamKey(ownerKey, streamUuid));
}

function nextDraftUpdatedAt(): number {
  const next = Math.max(Date.now(), lastDraftUpdatedAt + 1);
  lastDraftUpdatedAt = next;
  return next;
}

function clearPendingOperation(key: string): void {
  const pending = pendingOperations.get(key);
  if (pending?.timer != null) clearTimeout(pending.timer);
  pendingOperations.delete(key);
}

function removeDraft(
  draftsByKey: Record<string, WorkspaceComposerDraft>,
  key: string,
): Record<string, WorkspaceComposerDraft> {
  if (draftsByKey[key] == null) return draftsByKey;
  const next = { ...draftsByKey };
  delete next[key];
  return next;
}

function isComposerDraftRestorable(draft: WorkspaceComposerDraft): boolean {
  return draft.syncStatus !== "deleting";
}

function candidatesForConversation(
  draftsByKey: Record<string, WorkspaceComposerDraft>,
  ownerKey: string,
  conversationId: string,
): WorkspaceComposerDraft[] {
  return Object.values(draftsByKey)
    .filter(
      (draft) =>
        draft.ownerKey === ownerKey &&
        draft.conversationId === conversationId &&
        isComposerDraftRestorable(draft),
    )
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt || right.draftUuid.localeCompare(left.draftUuid),
    );
}

async function persist(operation: ScheduledOperation): Promise<void> {
  if (
    operation.ownerGeneration !==
    ownerGeneration(operation.kind === "write" ? operation.draft.ownerKey : operation.ownerKey)
  )
    return;
  if (operation.kind === "delete") {
    await deleteWorkspaceComposerDraftRecord(operation.ownerKey, operation.draftUuid);
    return;
  }
  const draft = operation.draft;
  await writeWorkspaceComposerDraftRecord(draft.ownerKey, draft);
}

function scheduleWrite(draft: WorkspaceComposerDraft): void {
  const key = draft.key;
  clearPendingOperation(key);
  const operation: ScheduledOperation = {
    kind: "write",
    draft,
    ownerGeneration: ownerGeneration(draft.ownerKey),
    timer: null,
  };
  operation.timer = setTimeout(() => {
    operation.timer = null;
    void useWorkspaceComposerDraftStore.getState().flushDraft(draft.ownerKey, draft.draftUuid);
  }, COMPOSER_DRAFT_DEBOUNCE_MS);
  pendingOperations.set(key, operation);
}

function scheduleDelete(ownerKey: string, draftUuid: string): void {
  const key = draftKey(ownerKey, draftUuid);
  clearPendingOperation(key);
  const operation: ScheduledOperation = {
    kind: "delete",
    ownerKey,
    draftUuid,
    ownerGeneration: ownerGeneration(ownerKey),
    timer: null,
  };
  operation.timer = setTimeout(() => {
    operation.timer = null;
    void useWorkspaceComposerDraftStore.getState().flushDraft(ownerKey, draftUuid);
  }, COMPOSER_DRAFT_DEBOUNCE_MS);
  pendingOperations.set(key, operation);
}

export interface WorkspaceComposerDraftStoreState {
  draftsByKey: Record<string, WorkspaceComposerDraft>;
  activeDraftUuidByConversationKey: Record<string, string>;
  completedConversationVisits: Record<string, true>;

  setDraft: (
    ownerKey: string,
    conversationId: string,
    content: WorkspaceComposerDraftContent,
    target?: WorkspaceComposerDraftTarget,
  ) => WorkspaceComposerDraft | null;
  hydrateDraft: (
    ownerKey: string,
    conversationId: string,
    requestedDraftUuid?: string | null,
  ) => Promise<WorkspaceComposerDraft | null>;
  hydrateOwnerDrafts: (ownerKey: string) => Promise<void>;
  selectDraftForConversation: (
    ownerKey: string,
    conversationId: string,
    requestedDraftUuid?: string | null,
  ) => WorkspaceComposerDraft | null;
  leaveConversation: (ownerKey: string, conversationId: string) => void;
  completeDraftVisit: (ownerKey: string, conversationId: string, draftUuid: string) => void;
  applyServerDrafts: (ownerKey: string, drafts: readonly WorkspaceComposerDraft[]) => void;
  markDraftSyncing: (
    ownerKey: string,
    draftUuid: string,
    mode: "create" | "update",
    canonicalCreatePayload?: string,
  ) => WorkspaceComposerDraft | null;
  applyDraftSyncSuccess: (
    ownerKey: string,
    draftUuid: string,
    syncedSnapshotId: string,
    server: { etag: string; updatedAt: string },
  ) => WorkspaceComposerDraft | null;
  markDraftSyncFailed: (ownerKey: string, draftUuid: string) => WorkspaceComposerDraft | null;
  markDraftDeleting: (ownerKey: string, draftUuid: string) => WorkspaceComposerDraft | null;
  markDraftConflict: (
    ownerKey: string,
    draftUuid: string,
    serverContent: WorkspaceComposerDraftContent,
    serverEtag: string,
  ) => void;
  acceptDraftConflictServerVersion: (
    ownerKey: string,
    draftUuid: string,
  ) => WorkspaceComposerDraft | null;
  retryDraftConflictWithLocalVersion: (
    ownerKey: string,
    draftUuid: string,
  ) => WorkspaceComposerDraft | null;
  deleteDraftConflictWithServerVersion: (
    ownerKey: string,
    draftUuid: string,
  ) => WorkspaceComposerDraft | null;
  removeDraftByUuid: (ownerKey: string, draftUuid: string) => void;
  flushDraft: (ownerKey: string, draftUuid: string) => Promise<void>;
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
    activeDraftUuidByConversationKey: {},
    completedConversationVisits: {},

    setDraft(ownerKey, conversationId, content, target) {
      const scopeKey = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      const normalizedContent = normalizeWorkspaceComposerDraftContent(content);
      const activeDraftUuid = get().activeDraftUuidByConversationKey[scopeKey];
      const current =
        activeDraftUuid == null ? null : get().draftsByKey[draftKey(ownerKey, activeDraftUuid)];
      const targetStreamUuid = target?.streamUuid ?? current?.streamUuid ?? "";
      if (targetStreamUuid.length > 0 && isDraftStreamRemoved(ownerKey, targetStreamUuid)) {
        return null;
      }
      if (isWorkspaceComposerDraftContentEmpty(normalizedContent)) {
        if (current != null)
          get().clearDraftIfSnapshotMatches(ownerKey, conversationId, current.snapshotId);
        return null;
      }

      const newDraftUuid = current == null ? createWorkspaceComposerDraftUuid() : null;
      const remoteTextUnchanged =
        current != null &&
        normalizeWorkspaceComposerDraftRemoteText(current.content.text) ===
          normalizeWorkspaceComposerDraftRemoteText(normalizedContent.text);

      const next: WorkspaceComposerDraft =
        current == null
          ? {
              key: draftKey(ownerKey, newDraftUuid ?? ""),
              draftUuid: newDraftUuid ?? "",
              ownerKey,
              conversationId,
              streamUuid: target?.streamUuid ?? "",
              topicUuid: target?.topicUuid ?? "",
              snapshotId: createWorkspaceComposerDraftSnapshotId(),
              content: normalizedContent,
              etag: null,
              syncStatus: "local",
              serverUpdatedAt: null,
              updatedAt: nextDraftUpdatedAt(),
              pendingCreatePayload: null,
            }
          : {
              ...current,
              streamUuid: target?.streamUuid ?? current.streamUuid,
              topicUuid: target?.topicUuid ?? current.topicUuid,
              snapshotId: createWorkspaceComposerDraftSnapshotId(),
              content: normalizedContent,
              syncStatus:
                current.syncStatus === "conflict"
                  ? "conflict"
                  : current.syncStatus === "saved" && remoteTextUnchanged
                    ? "saved"
                    : "local",
              updatedAt: nextDraftUpdatedAt(),
            };
      logStoreAction("workspaceComposerDraft", "setDraft", { ownerKey, conversationId });
      set((state) => ({
        draftsByKey: { ...state.draftsByKey, [next.key]: next },
        activeDraftUuidByConversationKey: {
          ...state.activeDraftUuidByConversationKey,
          [scopeKey]: next.draftUuid,
        },
      }));
      scheduleWrite(next);
      return next;
    },

    hydrateOwnerDrafts(ownerKey) {
      if (hydratedOwners.has(ownerKey)) return Promise.resolve();
      const existing = hydrationPromises.get(ownerKey);
      if (existing != null) return existing;
      const generation = ownerGeneration(ownerKey);
      const generationAtStart = storeGeneration;
      const hydration = (async (): Promise<void> => {
        const rows =
          await readWorkspaceComposerDraftRecords<WorkspaceComposerDraftContent>(ownerKey);
        if (generation !== ownerGeneration(ownerKey) || generationAtStart !== storeGeneration)
          return;
        hydratedOwners.add(ownerKey);
        const drafts = rows
          .filter((row) => !isDraftStreamRemoved(ownerKey, row.streamUuid))
          .map((row) => ({
            ...row,
            key: draftKey(ownerKey, row.draftUuid),
            content: normalizeWorkspaceComposerDraftContent(row.content),
            ...(row.conflictServerContent == null
              ? {}
              : {
                  conflictServerContent: normalizeWorkspaceComposerDraftContent(
                    row.conflictServerContent,
                  ),
                }),
            pendingCreatePayload: row.pendingCreatePayload ?? null,
          }));
        set((state) => ({
          draftsByKey: {
            ...state.draftsByKey,
            ...Object.fromEntries(
              drafts
                .filter((draft) => state.draftsByKey[draft.key] == null)
                .map((draft) => [draft.key, draft]),
            ),
          },
        }));
      })();
      hydrationPromises.set(ownerKey, hydration);
      void hydration.then(
        () => {
          if (hydrationPromises.get(ownerKey) === hydration) hydrationPromises.delete(ownerKey);
        },
        () => {
          if (hydrationPromises.get(ownerKey) === hydration) hydrationPromises.delete(ownerKey);
        },
      );
      return hydration;
    },

    async hydrateDraft(ownerKey, conversationId, requestedDraftUuid) {
      await get().hydrateOwnerDrafts(ownerKey);
      const selected = get().selectDraftForConversation(
        ownerKey,
        conversationId,
        requestedDraftUuid,
      );
      if (selected != null) return selected;

      // Version 5 persisted one row per conversation. Preserve it as a local
      // draft on first visit instead of silently losing text during the schema move.
      const legacy = await readWorkspaceComposerDraft<WorkspaceComposerDraftContent>(
        ownerKey,
        conversationId,
      );
      if (legacy == null || get().selectDraftForConversation(ownerKey, conversationId) != null)
        return null;
      const topicParts = conversationId.split(":");
      const isTopic = topicParts[0] === "topic" && topicParts.length === 3;
      const draftUuid = createWorkspaceComposerDraftUuid();
      const migrated: WorkspaceComposerDraft = {
        key: draftKey(ownerKey, draftUuid),
        draftUuid,
        ownerKey,
        conversationId,
        streamUuid: isTopic ? (topicParts[1] ?? "") : conversationId.replace(/^stream:/, ""),
        topicUuid: isTopic ? (topicParts[2] ?? "") : "",
        snapshotId: legacy.snapshotId,
        content: normalizeWorkspaceComposerDraftContent(legacy.content),
        etag: null,
        syncStatus: "local",
        serverUpdatedAt: null,
        pendingCreatePayload: null,
        updatedAt: legacy.updatedAt,
      };
      if (isDraftStreamRemoved(ownerKey, migrated.streamUuid)) return null;
      const migratedInCache = await migrateWorkspaceComposerDraftToRecord(
        ownerKey,
        conversationId,
        {
          draftUuid: migrated.draftUuid,
          conversationId: migrated.conversationId,
          streamUuid: migrated.streamUuid,
          topicUuid: migrated.topicUuid,
          snapshotId: migrated.snapshotId,
          content: migrated.content,
          etag: migrated.etag,
          syncStatus: migrated.syncStatus,
          updatedAt: migrated.updatedAt,
          serverUpdatedAt: migrated.serverUpdatedAt,
          pendingCreatePayload: migrated.pendingCreatePayload,
        },
      );
      if (!migratedInCache) return null;
      set((state) => ({
        draftsByKey: { ...state.draftsByKey, [migrated.key]: migrated },
        activeDraftUuidByConversationKey: {
          ...state.activeDraftUuidByConversationKey,
          [createWorkspaceComposerDraftKey(ownerKey, conversationId)]: migrated.draftUuid,
        },
      }));
      return migrated;
    },

    selectDraftForConversation(ownerKey, conversationId, requestedDraftUuid) {
      const scopeKey = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      const activeUuid = get().activeDraftUuidByConversationKey[scopeKey];
      const active = activeUuid == null ? null : get().draftsByKey[draftKey(ownerKey, activeUuid)];
      if (active != null && isComposerDraftRestorable(active)) return active;
      if (get().completedConversationVisits[scopeKey] != null) return null;
      const candidates = candidatesForConversation(get().draftsByKey, ownerKey, conversationId);
      const selected =
        requestedDraftUuid == null
          ? (candidates[0] ?? null)
          : (candidates.find((draft) => draft.draftUuid === requestedDraftUuid) ?? null);
      if (selected == null) return null;
      set((state) => ({
        activeDraftUuidByConversationKey: {
          ...state.activeDraftUuidByConversationKey,
          [scopeKey]: selected.draftUuid,
        },
      }));
      return selected;
    },

    leaveConversation(ownerKey, conversationId) {
      const scopeKey = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      set((state) => {
        const active = { ...state.activeDraftUuidByConversationKey };
        const completed = { ...state.completedConversationVisits };
        delete active[scopeKey];
        delete completed[scopeKey];
        return { activeDraftUuidByConversationKey: active, completedConversationVisits: completed };
      });
    },

    completeDraftVisit(ownerKey, conversationId, draftUuid) {
      const scopeKey = createWorkspaceComposerDraftKey(ownerKey, conversationId);
      if (get().activeDraftUuidByConversationKey[scopeKey] !== draftUuid) return;
      set((state) => {
        const active = { ...state.activeDraftUuidByConversationKey };
        delete active[scopeKey];
        return {
          activeDraftUuidByConversationKey: active,
          completedConversationVisits: { ...state.completedConversationVisits, [scopeKey]: true },
        };
      });
    },

    applyServerDrafts(ownerKey, drafts) {
      set((state) => {
        const next = { ...state.draftsByKey };
        const serverDraftUuids = new Set(drafts.map((draft) => draft.draftUuid));
        for (const [key, current] of Object.entries(next)) {
          if (
            current.ownerKey === ownerKey &&
            current.syncStatus === "saved" &&
            !serverDraftUuids.has(current.draftUuid)
          ) {
            delete next[key];
            scheduleDelete(ownerKey, current.draftUuid);
          }
        }
        for (const draft of drafts) {
          if (draft.ownerKey !== ownerKey) continue;
          if (isDraftStreamRemoved(ownerKey, draft.streamUuid)) continue;
          const current = next[draft.key];
          if (
            current?.syncStatus === "local" ||
            current?.syncStatus === "saving" ||
            current?.syncStatus === "failed" ||
            current?.syncStatus === "deleting" ||
            current?.syncStatus === "conflict"
          )
            continue;
          next[draft.key] = draft;
          scheduleWrite(draft);
        }
        return { draftsByKey: next };
      });
    },

    markDraftSyncing(ownerKey, draftUuid, mode, canonicalCreatePayload) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (current == null || current.syncStatus === "conflict" || current.syncStatus === "deleting")
        return null;
      const next = {
        ...current,
        syncStatus: "saving" as const,
        pendingCreatePayload:
          mode === "create"
            ? (current.pendingCreatePayload ?? canonicalCreatePayload ?? null)
            : null,
      };
      set((state) => ({ draftsByKey: { ...state.draftsByKey, [key]: next } }));
      scheduleWrite(next);
      logStoreAction("workspaceComposerDraft", `sync:${mode}`, { ownerKey });
      return next;
    },

    applyDraftSyncSuccess(ownerKey, draftUuid, syncedSnapshotId, server) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (current == null) return null;
      const syncStatus =
        current.syncStatus === "deleting"
          ? "deleting"
          : current.snapshotId === syncedSnapshotId
            ? "saved"
            : "local";
      const next: WorkspaceComposerDraft = {
        ...current,
        etag: server.etag,
        serverUpdatedAt: server.updatedAt,
        syncStatus,
        pendingCreatePayload: null,
      };
      set((state) => ({ draftsByKey: { ...state.draftsByKey, [key]: next } }));
      scheduleWrite(next);
      return next;
    },

    markDraftSyncFailed(ownerKey, draftUuid) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (current == null || current.syncStatus === "conflict") return null;
      const next: WorkspaceComposerDraft = { ...current, syncStatus: "failed" };
      set((state) => ({ draftsByKey: { ...state.draftsByKey, [key]: next } }));
      scheduleWrite(next);
      logStoreAction("workspaceComposerDraft", "sync:failed", { ownerKey });
      return next;
    },

    markDraftDeleting(ownerKey, draftUuid) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (current == null || current.syncStatus === "conflict") return null;
      const next = { ...current, syncStatus: "deleting" as const };
      set((state) => ({ draftsByKey: { ...state.draftsByKey, [key]: next } }));
      scheduleWrite(next);
      logStoreAction("workspaceComposerDraft", "deletePending", { ownerKey });
      return next;
    },

    markDraftConflict(ownerKey, draftUuid, serverContent, serverEtag) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (current == null) return;
      const next = {
        ...current,
        syncStatus: "conflict" as const,
        conflictServerContent: normalizeWorkspaceComposerDraftContent(serverContent),
        conflictServerEtag: serverEtag,
      };
      set((state) => ({ draftsByKey: { ...state.draftsByKey, [key]: next } }));
      scheduleWrite(next);
    },

    acceptDraftConflictServerVersion(ownerKey, draftUuid) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (
        current?.syncStatus !== "conflict" ||
        current.conflictServerContent == null ||
        current.conflictServerEtag == null
      )
        return null;
      const { conflictServerContent, conflictServerEtag, ...withoutConflict } = current;
      const next: WorkspaceComposerDraft = {
        ...withoutConflict,
        content: conflictServerContent,
        etag: conflictServerEtag,
        snapshotId: createWorkspaceComposerDraftSnapshotId(),
        syncStatus: "saved",
        pendingCreatePayload: null,
        updatedAt: nextDraftUpdatedAt(),
      };
      set((state) => ({ draftsByKey: { ...state.draftsByKey, [key]: next } }));
      scheduleWrite(next);
      return next;
    },

    retryDraftConflictWithLocalVersion(ownerKey, draftUuid) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (current?.syncStatus !== "conflict" || current.conflictServerEtag == null) return null;
      const next: WorkspaceComposerDraft = {
        ...current,
        etag: current.conflictServerEtag,
        syncStatus: "local",
        updatedAt: nextDraftUpdatedAt(),
      };
      delete next.conflictServerContent;
      delete next.conflictServerEtag;
      set((state) => ({ draftsByKey: { ...state.draftsByKey, [key]: next } }));
      scheduleWrite(next);
      return next;
    },

    deleteDraftConflictWithServerVersion(ownerKey, draftUuid) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (current?.syncStatus !== "conflict" || current.conflictServerEtag == null) return null;
      const next: WorkspaceComposerDraft = {
        ...current,
        etag: current.conflictServerEtag,
        syncStatus: "deleting",
        pendingCreatePayload: null,
      };
      delete next.conflictServerContent;
      delete next.conflictServerEtag;
      set((state) => ({ draftsByKey: { ...state.draftsByKey, [key]: next } }));
      scheduleWrite(next);
      return next;
    },

    removeDraftByUuid(ownerKey, draftUuid) {
      const key = draftKey(ownerKey, draftUuid);
      const current = get().draftsByKey[key];
      if (current == null) return;
      set((state) => ({ draftsByKey: removeDraft(state.draftsByKey, key) }));
      scheduleDelete(ownerKey, draftUuid);
      get().completeDraftVisit(ownerKey, current.conversationId, draftUuid);
    },

    async flushDraft(ownerKey, draftUuid) {
      const key = draftKey(ownerKey, draftUuid);
      const operation = pendingOperations.get(key);
      if (operation == null) {
        await (persistChains.get(key) ?? Promise.resolve());
        return;
      }
      clearPendingOperation(key);
      const previous = persistChains.get(key) ?? Promise.resolve();
      const chain = previous
        .catch(() => undefined)
        .then(() => persist(operation))
        .catch(() => undefined);
      persistChains.set(key, chain);
      await chain;
      if (persistChains.get(key) === chain) persistChains.delete(key);
    },

    clearDraft(ownerKey, conversationId) {
      const selected = get().selectDraftForConversation(ownerKey, conversationId);
      if (selected != null)
        get().clearDraftIfSnapshotMatches(ownerKey, conversationId, selected.snapshotId);
    },

    clearDraftIfSnapshotMatches(ownerKey, conversationId, snapshotId) {
      const selected = get().selectDraftForConversation(ownerKey, conversationId);
      if (selected?.snapshotId !== snapshotId) return false;
      set((state) => ({ draftsByKey: removeDraft(state.draftsByKey, selected.key) }));
      scheduleDelete(ownerKey, selected.draftUuid);
      get().completeDraftVisit(ownerKey, conversationId, selected.draftUuid);
      logStoreAction("workspaceComposerDraft", "clearDraft", { ownerKey, conversationId });
      return true;
    },

    async disposeOwner(ownerKey) {
      ownerGenerations.set(ownerKey, ownerGeneration(ownerKey) + 1);
      hydratedOwners.delete(ownerKey);
      hydrationPromises.delete(ownerKey);
      for (const key of removedStreamKeys) {
        if (key.startsWith(`${ownerKey}\0`)) removedStreamKeys.delete(key);
      }
      const keys = [...pendingOperations.keys()].filter((key) => key.startsWith(`${ownerKey}:`));
      for (const key of keys) clearPendingOperation(key);
      await Promise.all(
        keys
          .map((key) => persistChains.get(key))
          .filter((chain): chain is Promise<void> => chain != null),
      );
      set((state) => ({
        draftsByKey: Object.fromEntries(
          Object.entries(state.draftsByKey).filter(([, draft]) => draft.ownerKey !== ownerKey),
        ),
        activeDraftUuidByConversationKey: Object.fromEntries(
          Object.entries(state.activeDraftUuidByConversationKey).filter(
            ([key]) => !key.startsWith(`${ownerKey}:`),
          ),
        ),
        completedConversationVisits: Object.fromEntries(
          Object.entries(state.completedConversationVisits).filter(
            ([key]) => !key.startsWith(`${ownerKey}:`),
          ),
        ),
      }));
    },

    async clear() {
      await Promise.all(
        [...new Set(Object.values(get().draftsByKey).map((draft) => draft.ownerKey))].map(
          (ownerKey) => get().disposeOwner(ownerKey),
        ),
      );
      set({
        draftsByKey: {},
        activeDraftUuidByConversationKey: {},
        completedConversationVisits: {},
      });
    },
  }),
);

export function selectWorkspaceComposerDraft(
  state: Pick<
    WorkspaceComposerDraftStoreState,
    "draftsByKey" | "activeDraftUuidByConversationKey" | "completedConversationVisits"
  >,
  ownerKey: string | null | undefined,
  conversationId: string | null | undefined,
): WorkspaceComposerDraft | null {
  if (ownerKey == null || conversationId == null) return null;
  const scopeKey = createWorkspaceComposerDraftKey(ownerKey, conversationId);
  if (state.completedConversationVisits[scopeKey] != null) return null;
  const activeUuid = state.activeDraftUuidByConversationKey[scopeKey];
  if (activeUuid != null) {
    const active = state.draftsByKey[draftKey(ownerKey, activeUuid)] ?? null;
    if (active != null && isComposerDraftRestorable(active)) return active;
  }
  return candidatesForConversation(state.draftsByKey, ownerKey, conversationId)[0] ?? null;
}

export function resetWorkspaceComposerDraftStoreForTests(): void {
  for (const pending of pendingOperations.values())
    if (pending.timer != null) clearTimeout(pending.timer);
  pendingOperations.clear();
  persistChains.clear();
  ownerGenerations.clear();
  hydratedOwners.clear();
  hydrationPromises.clear();
  removedStreamKeys.clear();
  lastDraftUpdatedAt = 0;
  storeGeneration += 1;
  useWorkspaceComposerDraftStore.setState({
    draftsByKey: {},
    activeDraftUuidByConversationKey: {},
    completedConversationVisits: {},
  });
}

export async function removeWorkspaceComposerDraftsForStream(
  ownerKey: string,
  streamUuid: string,
): Promise<void> {
  removedStreamKeys.add(removedStreamKey(ownerKey, streamUuid));
  const store = useWorkspaceComposerDraftStore.getState();
  const draftUuids = Object.values(store.draftsByKey)
    .filter((draft) => draft.ownerKey === ownerKey && draft.streamUuid === streamUuid)
    .map((draft) => draft.draftUuid);
  for (const draftUuid of draftUuids) {
    store.removeDraftByUuid(ownerKey, draftUuid);
  }
  await Promise.all(draftUuids.map((draftUuid) => store.flushDraft(ownerKey, draftUuid)));
}

export function restoreWorkspaceComposerDraftsForStream(
  ownerKey: string,
  streamUuid: string,
): void {
  removedStreamKeys.delete(removedStreamKey(ownerKey, streamUuid));
}
