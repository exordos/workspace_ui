import { create } from "zustand";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import {
  addChatToFolder,
  getFolders,
  mapWorkspaceFolderItems,
  mapWorkspaceFoldersToRail,
  removeChatFromFolder,
  type FolderItemForClient,
  type WorkspaceFolder,
  type WorkspaceFolderForRail,
} from "~/shared/api/workspace-client";
import {
  loadFoldersSnapshotRow,
  persistFoldersSnapshotRow,
} from "~/shared/lib/folders-snapshot-db";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import { logFolderFlow } from "~/shared/lib/message-flow-debug.lib";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  sliceAfterFolderAssignmentRollback,
  sliceAfterOptimisticFolderAssignment,
} from "./folder-sync-assignment-rollback.lib";
import {
  OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID,
  type FolderAssignmentRow,
  type ToggleAssignmentInput,
  type ToggleAssignmentResult,
} from "./folder-sync-assignment.types";
import { areEquivalentChatIds, resolveFolderItemUuid } from "./folder-sync-chat-id.lib";
import { SYSTEM_ALL_FOLDER_ID } from "./folder-sync-constants.lib";
import { applyFolderUnreadBadges } from "./folder-sync-folder-badges.lib";
import { buildSelectedFolderSidebarChats, toChatIdSet } from "./folder-sync-sidebar-chats.lib";
import { loadFolderSyncSnapshot, type FolderSyncSnapshot } from "./folder-sync.api";
import {
  aliasAllFolderItemsCacheKeys,
  resolveAllFolderApiUuid,
  resolveFolderItemsRequestUuid,
  resolveSelectedFolderChatIdsOnSelect,
  resolveSelectedFolderChatIdsOnSyncDerived,
} from "./folder-sync.lib";
import {
  mergeFolderItemsSnapshot,
  resolveFolderUuidsForPollingItemsRefresh,
  resolveSelectedFolderId,
  shouldLoadFolderItemsForSelection,
  withDefaultSystemFolders,
  type FolderSyncSystemLabels,
} from "./folder-sync.lib";

export type FolderRefreshReason = "bootstrap" | "polling" | "mutation" | "reconnect";

const folderSyncLog = createLogger("folderSync");
// Backoff delays between reconcile attempts after optimistic mutation.
const ASSIGNMENT_RECONCILE_RETRY_DELAYS_MS = [0, 120, 360] as const;

// Reconcile outcome: server confirmed and matched item UUID, if any.
interface AssignmentReconcileOutcome {
  ok: boolean;
  items: FolderItemForClient[] | null;
  matchedItemUuid: string | null;
}

// Load rail folder cache from IndexedDB for a flicker-free cold start.
async function loadFolderRailCache(instanceId: string): Promise<WorkspaceFolderForRail[]> {
  const row = await loadFoldersSnapshotRow(instanceId).catch(() => null);
  return row?.folders ?? [];
}

// Persist current folder snapshot to IndexedDB asynchronously.
function schedulePersistFolders(instanceId: string, folders: WorkspaceFolderForRail[]): void {
  void persistFoldersSnapshotRow({ instanceId, folders, version: 1 });
}

// Compact log label for selected-folder state.
function describeFolderChatIds(value: Set<string> | null): "null" | "empty" | `size:${number}` {
  if (value === null) {
    return "null";
  }
  if (value.size === 0) {
    return "empty";
  }
  return `size:${value.size}`;
}

// Assignable folders from Workspace API (exclude system `all` and empty uuid).
function isAssignableWorkspaceFolder(
  folder: WorkspaceFolder,
): folder is WorkspaceFolder & { uuid: string } {
  return (
    folder.system_type !== "all" && typeof folder.uuid === "string" && folder.uuid.trim().length > 0
  );
}

// Assignable folders from rail state (exclude synthetic system folders).
function isAssignableRailFolder(folder: WorkspaceFolderForRail): boolean {
  if (folder.id.trim().length === 0) return false;
  if (
    folder.systemType === "all" ||
    folder.systemType === "personal" ||
    folder.systemType === "channels"
  ) {
    return false;
  }
  return true;
}

// Technical UUID for optimistic item before server confirmation.
function buildOptimisticFolderItemUuid(folderUuid: string, chatId: string): string {
  const safeChatId = chatId.replace(/[^a-zA-Z0-9:_-]/g, "_");
  return `${OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID}:${folderUuid}:${safeChatId}`;
}

// Optimistic item for instant chat visibility in a folder.
function buildOptimisticFolderItem(folderUuid: string, chatId: string): FolderItemForClient {
  const now = new Date().toISOString();
  return {
    uuid: buildOptimisticFolderItemUuid(folderUuid, chatId),
    chatId,
    folderUuid,
    orderIndex: 0,
    pinnedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// Add optimistic item when the chat is not yet in the folder.
function upsertOptimisticFolderItem(
  previousItems: readonly FolderItemForClient[],
  folderUuid: string,
  chatId: string,
): FolderItemForClient[] {
  if (previousItems.some((item) => areEquivalentChatIds(item.chatId, chatId))) {
    return [...previousItems];
  }
  const optimistic = buildOptimisticFolderItem(folderUuid, chatId);
  return [...previousItems, { ...optimistic, orderIndex: previousItems.length }];
}

// Remove assignment item (by uuid and/or equivalent chat_id) and recompute orderIndex.
function removeFolderAssignmentItem(
  previousItems: readonly FolderItemForClient[],
  chatId: string,
  itemUuid: string,
): FolderItemForClient[] {
  const withoutTarget = previousItems.filter(
    (item) => item.uuid !== itemUuid && !areEquivalentChatIds(item.chatId, chatId),
  );
  if (withoutTarget.length === previousItems.length) {
    return [...previousItems];
  }
  return withoutTarget.map((item, index) => ({ ...item, orderIndex: index }));
}

// Mark folder stale so the next select/load triggers a real fetch.
function markFolderAsStale(staleFolderIds: ReadonlySet<string>, folderUuid: string): Set<string> {
  const next = new Set(staleFolderIds);
  next.add(folderUuid);
  return next;
}

// Clear stale flag after successful fetch/reconcile.
function unmarkFolderAsStale(staleFolderIds: ReadonlySet<string>, folderUuid: string): Set<string> {
  if (!staleFolderIds.has(folderUuid)) {
    return new Set(staleFolderIds);
  }
  const next = new Set(staleFolderIds);
  next.delete(folderUuid);
  return next;
}

// Retain stale flags only for folders still present in the current rail snapshot.
function filterStaleFolderIdsByFolders(
  staleFolderIds: ReadonlySet<string>,
  folders: readonly WorkspaceFolderForRail[],
): Set<string> {
  if (staleFolderIds.size === 0) {
    return new Set();
  }
  const liveIds = new Set(folders.map((folder) => folder.id));
  const next = new Set<string>();
  for (const staleFolderId of staleFolderIds) {
    if (liveIds.has(staleFolderId)) {
      next.add(staleFolderId);
    }
  }
  return next;
}

// Non-blocking delay between reconcile attempts.
async function waitForDelay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

// Confirm optimistic mutation against server state with bounded retry.
async function reconcileFolderAssignment(
  folderUuid: string,
  chatId: string,
  shouldExist: boolean,
): Promise<AssignmentReconcileOutcome> {
  for (const delay of ASSIGNMENT_RECONCILE_RETRY_DELAYS_MS) {
    await waitForDelay(delay);
    try {
      const folders = await getFolders();
      const items = (() => {
        const folder = folders.find((f) => f.uuid === folderUuid);
        return folder ? mapWorkspaceFolderItems(folder) : [];
      })();
      const matchedItemUuid = resolveFolderItemUuid(items, chatId);
      const exists = matchedItemUuid != null;
      if (exists === shouldExist) {
        return { ok: true, items, matchedItemUuid };
      }
    } catch {
      // best-effort retries
    }
  }
  return { ok: false, items: null, matchedItemUuid: null };
}

interface FolderSyncBootstrapOptions {
  instanceId: string;
  showSystemFolders: boolean;
  labels: FolderSyncSystemLabels;
}

interface FolderSyncState {
  folders: WorkspaceFolderForRail[];
  // Currently selected rail/sidebar folder.
  selectedFolderId: string;
  // Normalized chat_id set for the selected folder.
  selectedFolderChatIds: Set<string> | null;
  // Ready sidebar chat projection for the selected folder.
  selectedFolderSidebarChats: SidebarChat[];
  loading: boolean;
  error: string | null;
  // Request version for anti-stale protection (async response races).
  requestVersion: number;
  instanceId: string | null;
  showSystemFolders: boolean;
  labels: FolderSyncSystemLabels;
  // Per-folder items cache (fallback and fast folder select).
  folderItemsByFolderId: Map<string, FolderItemForClient[]>;
  /** Workspace API uuid for the «all chats» folder (pin/unpin endpoints). */
  allFolderApiUuid: string | null;
  // Folders with potentially stale cache after optimistic/error — need re-fetch.
  staleFolderIds: Set<string>;
  bootstrap: (options: FolderSyncBootstrapOptions) => Promise<void>;
  selectFolder: (folderId: string) => Promise<void>;
  refresh: (reason: FolderRefreshReason) => Promise<void>;
  /** Reloads items for one folder after add/remove chat assignment (avoids full snapshot refresh). */
  refreshFolderItemsCache: (folderUuid: string) => Promise<void>;
  /** Optimistic pinned_at patch so pin mirror sync does not restore stale server state. */
  patchFolderItemPinnedAt: (
    folderUuid: string,
    folderItemUuid: string,
    pinnedAt: string | null,
  ) => void;
  loadAssignmentsForChat: (chatId: string) => Promise<FolderAssignmentRow[]>;
  toggleAssignment: (input: ToggleAssignmentInput) => Promise<ToggleAssignmentResult>;
  /** Inserts a folder from POST /folders response without reloading all folders/items. */
  applyLocallyCreatedFolder: (folder: {
    id: string;
    title: string;
    backgroundColor: number;
  }) => void;
  /** Removes a folder after DELETE /folders/{uuid} without reloading all folders/items. */
  applyLocallyDeletedFolder: (folderId: string) => void;
  syncSidebarProjection: (input: {
    chatsSortedByLastMessage: SidebarChat[];
    streamsMap: Map<number, StreamEntryInternal>;
    usersMapForChatInfo: Map<number, { full_name?: string; email?: string }>;
    currentUserId: number | null;
    hideUnknownArchivedStreams: boolean;
    isStreamMuted?: (streamId: number) => boolean;
  }) => void;
  syncDerived: (showSystemFolders: boolean, labels: FolderSyncSystemLabels) => void;
  clear: () => void;
}

/** Aligns with synthetic «All chats» id from `withDefaultSystemFolders` before API folders arrive. */
const DEFAULT_SELECTED_FOLDER_ID = SYSTEM_ALL_FOLDER_ID;
const DEFAULT_LABELS: FolderSyncSystemLabels = {
  allChats: "All chats",
  personal: "Personal",
  channels: "Channels",
};

function isCurrentRequest(
  state: Pick<FolderSyncState, "instanceId" | "requestVersion">,
  instanceId: string,
  requestVersion: number,
): boolean {
  // Apply response only when instance and request version still match.
  return state.instanceId === instanceId && state.requestVersion === requestVersion;
}

function normalizeFoldersForPresentation(
  snapshot: FolderSyncSnapshot,
  labels: FolderSyncSystemLabels,
  showSystemFolders: boolean,
): WorkspaceFolderForRail[] {
  // Map backend folders to rail model and inject system folders when needed.
  return withDefaultSystemFolders(
    mapWorkspaceFoldersToRail(snapshot.folders),
    labels,
    showSystemFolders,
  );
}

/** When Workspace returns an empty folder list, keep IDB-hydrated rail and item cache instead of wiping UI. */
function applySnapshotToFolderState(
  snapshot: FolderSyncSnapshot,
  latestState: FolderSyncState,
): {
  foldersWithSystemDefaults: WorkspaceFolderForRail[];
  nextFolderItemsByFolderId: Map<string, FolderItemForClient[]>;
} {
  const apiFoldersEmpty = snapshot.folders.length === 0;
  const hadLocalFolders = latestState.folders.length > 0;

  let foldersWithSystemDefaults = normalizeFoldersForPresentation(
    snapshot,
    latestState.labels,
    latestState.showSystemFolders,
  );
  let nextFolderItemsByFolderId = mergeFolderItemsSnapshot(
    latestState.folderItemsByFolderId,
    snapshot,
  );

  if (apiFoldersEmpty && hadLocalFolders) {
    foldersWithSystemDefaults = withDefaultSystemFolders(
      latestState.folders,
      latestState.labels,
      latestState.showSystemFolders,
    );
    nextFolderItemsByFolderId = new Map(latestState.folderItemsByFolderId);
  }

  return { foldersWithSystemDefaults, nextFolderItemsByFolderId };
}

function applyFolderSyncRefreshSnapshot(
  get: () => FolderSyncState,
  set: (
    partial: Partial<FolderSyncState> | ((state: FolderSyncState) => Partial<FolderSyncState>),
  ) => void,
  options: {
    instanceId: string;
    reason: FolderRefreshReason;
    requestVersion: number;
    snapshot: FolderSyncSnapshot;
    shouldToggleLoading: boolean;
  },
): void {
  const { instanceId, reason, requestVersion, snapshot, shouldToggleLoading } = options;
  const latestState = get();
  if (!isCurrentRequest(latestState, instanceId, requestVersion)) {
    logFolderFlow("refresh:snapshot ignored (stale requestVersion)", {
      instanceId,
      requestVersion,
    });
    return;
  }
  logFolderFlow("refresh:snapshot ok", {
    instanceId,
    requestVersion,
    reason,
    folderCount: snapshot.folders.length,
  });

  const { foldersWithSystemDefaults, nextFolderItemsByFolderId } = applySnapshotToFolderState(
    snapshot,
    latestState,
  );
  schedulePersistFolders(instanceId, foldersWithSystemDefaults);

  const selectedFolderId =
    resolveSelectedFolderId(foldersWithSystemDefaults, latestState.selectedFolderId) ??
    latestState.selectedFolderId;
  const nextStaleFolderIds = filterStaleFolderIdsByFolders(
    latestState.staleFolderIds,
    foldersWithSystemDefaults,
  );
  for (const [folderId, loadResult] of snapshot.itemsByFolderId) {
    if (loadResult.ok) {
      nextStaleFolderIds.delete(folderId);
    } else {
      nextStaleFolderIds.add(folderId);
    }
  }
  const shouldLoadSelectedItems = shouldLoadFolderItemsForSelection(
    foldersWithSystemDefaults,
    selectedFolderId,
  );

  let selectedFolderChatIds: Set<string> | null = null;
  if (shouldLoadSelectedItems) {
    const selectedLoadResult = snapshot.itemsByFolderId.get(selectedFolderId);
    if (selectedLoadResult?.ok) {
      selectedFolderChatIds = toChatIdSet(selectedLoadResult.items);
    } else {
      const staleItems = nextFolderItemsByFolderId.get(selectedFolderId);
      if (staleItems) {
        selectedFolderChatIds = toChatIdSet(staleItems);
      }
    }
  }

  set({
    folders: foldersWithSystemDefaults,
    selectedFolderId,
    selectedFolderChatIds,
    folderItemsByFolderId: nextFolderItemsByFolderId,
    allFolderApiUuid: resolveAllFolderApiUuid(snapshot.folders),
    staleFolderIds: nextStaleFolderIds,
    error: null,
    ...(shouldToggleLoading ? { loading: false } : {}),
  });

  folderSyncLog.debug("refresh:snapshotApplied", {
    reason,
    instanceId,
    requestVersion,
    folderCount: foldersWithSystemDefaults.length,
    selectedFolderId,
    shouldLoadSelectedItems,
    folderChatIds: describeFolderChatIds(selectedFolderChatIds),
  });
}

async function runFolderSyncRefreshAttempt(
  get: () => FolderSyncState,
  set: (
    partial: Partial<FolderSyncState> | ((state: FolderSyncState) => Partial<FolderSyncState>),
  ) => void,
  options: {
    instanceId: string;
    reason: FolderRefreshReason;
    requestVersion: number;
    shouldToggleLoading: boolean;
  },
): Promise<void> {
  const { instanceId, reason, requestVersion, shouldToggleLoading } = options;

  try {
    const stateBeforeSnapshot = get();
    const priorityFolderUuid = resolveFolderItemsRequestUuid(
      stateBeforeSnapshot.selectedFolderId,
      stateBeforeSnapshot.allFolderApiUuid,
    );
    const itemsLoadScope = reason === "polling" ? "selective" : "all";
    const snapshot = await loadFolderSyncSnapshot(instanceId, {
      force: reason === "bootstrap" || reason === "reconnect",
      priorityFolderUuid,
      itemsLoadScope,
      ...(itemsLoadScope === "selective"
        ? {
            resolveSelectiveFolderUuids: (folderRows) =>
              resolveFolderUuidsForPollingItemsRefresh({
                foldersFromApi: folderRows,
                folderItemsByFolderId: stateBeforeSnapshot.folderItemsByFolderId,
                staleFolderIds: stateBeforeSnapshot.staleFolderIds,
                selectedFolderId: stateBeforeSnapshot.selectedFolderId,
                foldersForRail: stateBeforeSnapshot.folders,
                allFolderApiUuid: stateBeforeSnapshot.allFolderApiUuid,
              }),
          }
        : {}),
      onFoldersLoaded: (folderRows) => {
        const phaseState = get();
        if (!isCurrentRequest(phaseState, instanceId, requestVersion) || folderRows.length === 0) {
          return;
        }

        const phaseSnapshot: FolderSyncSnapshot = {
          folders: folderRows,
          itemsByFolderId: new Map(),
          loadedAt: Date.now(),
        };
        const foldersWithSystemDefaults = normalizeFoldersForPresentation(
          phaseSnapshot,
          phaseState.labels,
          phaseState.showSystemFolders,
        );
        schedulePersistFolders(instanceId, foldersWithSystemDefaults);

        const selectedFolderId =
          resolveSelectedFolderId(foldersWithSystemDefaults, phaseState.selectedFolderId) ??
          phaseState.selectedFolderId;
        const nextStaleFolderIds = filterStaleFolderIdsByFolders(
          phaseState.staleFolderIds,
          foldersWithSystemDefaults,
        );

        set({
          folders: foldersWithSystemDefaults,
          selectedFolderId,
          staleFolderIds: nextStaleFolderIds,
          allFolderApiUuid: resolveAllFolderApiUuid(folderRows),
          error: null,
        });
      },
    });
    applyFolderSyncRefreshSnapshot(get, set, {
      instanceId,
      reason,
      requestVersion,
      snapshot,
      shouldToggleLoading,
    });
  } catch {
    const stateOnFailure = get();
    if (!isCurrentRequest(stateOnFailure, instanceId, requestVersion)) {
      return;
    }

    const row = await loadFoldersSnapshotRow(instanceId).catch(() => null);
    const offlineRail = row?.folders ?? [];
    const offlineFolders = withDefaultSystemFolders(
      offlineRail,
      stateOnFailure.labels,
      stateOnFailure.showSystemFolders,
    );
    const selectedFolderId =
      resolveSelectedFolderId(offlineFolders, stateOnFailure.selectedFolderId) ??
      stateOnFailure.selectedFolderId;
    const selectedFolderChatIds = shouldLoadFolderItemsForSelection(
      offlineFolders,
      selectedFolderId,
    )
      ? stateOnFailure.selectedFolderChatIds
      : null;

    set({
      folders: offlineFolders,
      selectedFolderId,
      selectedFolderChatIds,
      staleFolderIds: filterStaleFolderIdsByFolders(stateOnFailure.staleFolderIds, offlineFolders),
      error: "folder-sync:refresh_failed",
      ...(shouldToggleLoading ? { loading: false } : {}),
    });
    folderSyncLog.warn("refresh:failedUsingOfflineFolders", {
      instanceId,
      requestVersion,
      folderCount: offlineFolders.length,
      selectedFolderId,
      folderChatIds: describeFolderChatIds(selectedFolderChatIds),
    });
  } finally {
    const stateAfterFinish = get();
    if (shouldToggleLoading && isCurrentRequest(stateAfterFinish, instanceId, requestVersion)) {
      set({ loading: false });
    }
  }
}

export const useFolderSyncStore = create<FolderSyncState>((set, get) => {
  // Prevent two concurrent refreshes for the same instanceId.
  const inFlightRefreshByInstance = new Map<string, Promise<void>>();
  const inFlightAssignmentByFolder = new Map<string, Promise<ToggleAssignmentResult>>();

  return {
    folders: [],
    selectedFolderId: DEFAULT_SELECTED_FOLDER_ID,
    selectedFolderChatIds: null,
    selectedFolderSidebarChats: [],
    loading: false,
    error: null,
    requestVersion: 0,
    instanceId: null,
    showSystemFolders: true,
    labels: DEFAULT_LABELS,
    folderItemsByFolderId: new Map(),
    allFolderApiUuid: null,
    staleFolderIds: new Set(),

    async bootstrap({ instanceId, showSystemFolders, labels }) {
      logStoreAction("folderSync", "bootstrap", { instanceId });
      const previousInstanceId = get().instanceId;
      const isInstanceChanged = previousInstanceId !== instanceId;
      logFolderFlow("bootstrap:start", { instanceId, isInstanceChanged });
      // Hydrate from IndexedDB first to avoid UI flicker.
      const railFromCache = await loadFolderRailCache(instanceId);
      logFolderFlow("bootstrap:idb cache read", {
        instanceId,
        railCount: railFromCache.length,
      });
      const cachedFolders = withDefaultSystemFolders(railFromCache, labels, showSystemFolders);
      const currentSelected = isInstanceChanged
        ? DEFAULT_SELECTED_FOLDER_ID
        : get().selectedFolderId;
      const resolvedSelectedFolderId =
        resolveSelectedFolderId(cachedFolders, currentSelected) ?? currentSelected;

      set((state) => ({
        instanceId,
        showSystemFolders,
        labels,
        folders: cachedFolders,
        selectedFolderId: resolvedSelectedFolderId,
        selectedFolderChatIds: shouldLoadFolderItemsForSelection(
          cachedFolders,
          resolvedSelectedFolderId,
        )
          ? state.selectedFolderChatIds
          : null,
        error: null,
        loading: state.loading && !isInstanceChanged,
        // On instance switch clear items cache; otherwise reuse current map.
        folderItemsByFolderId: isInstanceChanged ? new Map() : state.folderItemsByFolderId,
        allFolderApiUuid: isInstanceChanged ? null : state.allFolderApiUuid,
        staleFolderIds: isInstanceChanged ? new Set() : state.staleFolderIds,
      }));
      if (isInstanceChanged) {
        usePinStore.getState().clear();
      }

      const afterBootstrap = get();
      folderSyncLog.debug("bootstrap:cacheApplied", {
        instanceId,
        folderCount: afterBootstrap.folders.length,
        selectedFolderId: afterBootstrap.selectedFolderId,
        folderChatIds: describeFolderChatIds(afterBootstrap.selectedFolderChatIds),
        shouldLoadItems: shouldLoadFolderItemsForSelection(cachedFolders, resolvedSelectedFolderId),
      });

      logFolderFlow("bootstrap:await refresh(api)", { instanceId, reason: "bootstrap" });
      // After cache hydrate always run network refresh for authoritative data.
      await get().refresh("bootstrap");
      logFolderFlow("bootstrap:refresh finished", { instanceId });
    },

    async selectFolder(folderId) {
      const nextFolderId = folderId.trim();
      if (nextFolderId.length === 0) return;

      logStoreAction("folderSync", "selectFolder", { folderId: nextFolderId });
      const stateBeforeSelect = get();
      const shouldLoadSelectedFolderItems = shouldLoadFolderItemsForSelection(
        stateBeforeSelect.folders,
        nextFolderId,
      );
      // Map.has distinguishes "no cache entry" from "cached empty folder".
      const hasCachedItemsForSelectedFolder =
        shouldLoadSelectedFolderItems && stateBeforeSelect.folderItemsByFolderId.has(nextFolderId);
      const selectedFolderCacheIsStale = stateBeforeSelect.staleFolderIds.has(nextFolderId);
      const canTrustCachedItems = hasCachedItemsForSelectedFolder && !selectedFolderCacheIsStale;
      const cachedItemsForSelectedFolder = hasCachedItemsForSelectedFolder
        ? (stateBeforeSelect.folderItemsByFolderId.get(nextFolderId) ?? [])
        : undefined;

      set({
        selectedFolderId: nextFolderId,
        error: null,
        selectedFolderChatIds: resolveSelectedFolderChatIdsOnSelect({
          shouldLoadSelectedFolderItems,
          cachedItemsForSelectedFolder,
        }),
        // Folder switch is cache-first without blocking loader, then best-effort fallback.
        loading: false,
      });

      if (!shouldLoadSelectedFolderItems) {
        // System folders need no items — list comes from global chat-list.
        return;
      }
      // Valid cache for created folder — skip network.
      if (canTrustCachedItems) {
        return;
      }
      // Items arrive inline in `getFolders()` — no separate items request.
      // On cache miss/stale trigger refresh; membershipPending shows sidebar loader.
      await get().refresh("mutation");
    },

    async refresh(reason) {
      const instanceId = get().instanceId;
      if (!instanceId) return;
      const shouldToggleLoading = reason !== "polling" && reason !== "reconnect";

      const inFlight = inFlightRefreshByInstance.get(instanceId);
      if (inFlight) {
        logFolderFlow("refresh:coalesced (await in-flight)", { instanceId, reason });
        // Anti-overlap for polling/mutation: return current in-flight promise.
        return inFlight;
      }

      const refreshPromise = (async () => {
        const requestVersion = get().requestVersion + 1;
        logFolderFlow("refresh:start", { reason, requestVersion, instanceId });
        logStoreAction("folderSync", "refresh:start", { reason, requestVersion, instanceId });
        set({
          error: null,
          requestVersion,
          ...(shouldToggleLoading ? { loading: true } : {}),
        });
        await runFolderSyncRefreshAttempt(get, set, {
          instanceId,
          reason,
          requestVersion,
          shouldToggleLoading,
        });
      })();

      inFlightRefreshByInstance.set(instanceId, refreshPromise);
      void refreshPromise.finally(() => {
        // Release in-flight guard after refresh completes.
        if (inFlightRefreshByInstance.get(instanceId) === refreshPromise) {
          inFlightRefreshByInstance.delete(instanceId);
        }
      });

      return refreshPromise;
    },

    async refreshFolderItemsCache(folderUuid) {
      const instanceId = get().instanceId;
      if (instanceId == null) {
        return;
      }
      const trimmed = folderUuid.trim();
      if (trimmed.length === 0) {
        return;
      }
      logStoreAction("folderSync", "refreshFolderItemsCache", { folderUuid: trimmed });
      const allFolderApiUuid = get().allFolderApiUuid;
      const apiUuid = resolveFolderItemsRequestUuid(trimmed, allFolderApiUuid);
      if (apiUuid == null) {
        return;
      }
      try {
        const folders = await getFolders();
        const folder = folders.find((f) => f.uuid === apiUuid);
        const items = folder ? mapWorkspaceFolderItems(folder) : [];
        set((state) => {
          const nextMap = new Map(state.folderItemsByFolderId);
          nextMap.set(apiUuid, items);
          if (apiUuid !== trimmed) {
            nextMap.set(trimmed, items);
          }
          aliasAllFolderItemsCacheKeys(nextMap, state.allFolderApiUuid);
          let nextStaleFolderIds = unmarkFolderAsStale(state.staleFolderIds, apiUuid);
          if (apiUuid !== trimmed) {
            nextStaleFolderIds = unmarkFolderAsStale(nextStaleFolderIds, trimmed);
          }
          const shouldPatchSelection =
            (state.selectedFolderId === trimmed || state.selectedFolderId === apiUuid) &&
            shouldLoadFolderItemsForSelection(state.folders, state.selectedFolderId);
          return {
            folderItemsByFolderId: nextMap,
            staleFolderIds: nextStaleFolderIds,
            ...(shouldPatchSelection ? { selectedFolderChatIds: toChatIdSet(items) } : {}),
          };
        });
      } catch {
        set((state) => {
          let nextStaleFolderIds = markFolderAsStale(state.staleFolderIds, apiUuid);
          if (apiUuid !== trimmed) {
            nextStaleFolderIds = markFolderAsStale(nextStaleFolderIds, trimmed);
          }
          return { staleFolderIds: nextStaleFolderIds };
        });
        folderSyncLog.warn("refreshFolderItemsCache:failed", { folderUuid: apiUuid });
      }
    },

    patchFolderItemPinnedAt(folderUuid, folderItemUuid, pinnedAt) {
      const trimmedFolderUuid = folderUuid.trim();
      const trimmedItemUuid = folderItemUuid.trim();
      if (trimmedFolderUuid.length === 0 || trimmedItemUuid.length === 0) {
        return;
      }
      logStoreAction("folderSync", "patchFolderItemPinnedAt", {
        folderUuid: trimmedFolderUuid,
        folderItemUuid: trimmedItemUuid,
        pinned: pinnedAt != null,
      });
      set((state) => {
        const items = state.folderItemsByFolderId.get(trimmedFolderUuid);
        if (items == null || items.length === 0) {
          return {};
        }
        let patched = false;
        const nextItems = items.map((item) => {
          if (item.uuid !== trimmedItemUuid) {
            return item;
          }
          patched = true;
          return { ...item, pinnedAt };
        });
        if (!patched) {
          return {};
        }
        const nextMap = new Map(state.folderItemsByFolderId);
        nextMap.set(trimmedFolderUuid, nextItems);
        return { folderItemsByFolderId: nextMap };
      });
    },

    async loadAssignmentsForChat(chatId) {
      // Load assignment rows for submenu: cache-first + stale-aware refetch.
      const safeChatId = chatId.trim();
      if (safeChatId.length === 0) {
        return [];
      }

      const syncState = get();
      const assignableRailFolders = syncState.folders.filter(isAssignableRailFolder);
      if (syncState.instanceId == null || assignableRailFolders.length === 0) {
        const folders = await getFolders().catch(() => []);
        const assignableFolders = folders.filter(isAssignableWorkspaceFolder);
        const rows = assignableFolders.map((folder) => {
          const folderUuid = folder.uuid?.trim() ?? "";
          if (folderUuid.length === 0) {
            return null;
          }
          const items = mapWorkspaceFolderItems(folder);
          return {
            folderUuid,
            label: folder.title ?? "",
            itemUuid: resolveFolderItemUuid(items, safeChatId),
          } satisfies FolderAssignmentRow;
        });
        return rows.filter((row): row is FolderAssignmentRow => row != null);
      }

      const fetchedItemsByFolderId = new Map<string, FolderItemForClient[]>();
      const failedFetchFolderIds = new Set<string>();
      const rows = assignableRailFolders.map((folder) => {
        const folderId = folder.id;
        const hasCachedItems = syncState.folderItemsByFolderId.has(folderId);
        const shouldRefetch = !hasCachedItems || syncState.staleFolderIds.has(folderId);
        if (!shouldRefetch) {
          const cached = syncState.folderItemsByFolderId.get(folderId) ?? [];
          return {
            folderUuid: folderId,
            label: folder.label,
            itemUuid: resolveFolderItemUuid(cached, safeChatId),
          } satisfies FolderAssignmentRow;
        }

        // Items only via `getFolders()` — on missing/stale cache refresh best-effort,
        // build row from fallback meanwhile.
        void get().refreshFolderItemsCache(folderId);
        failedFetchFolderIds.add(folderId);
        const fallback = syncState.folderItemsByFolderId.get(folderId) ?? [];
        return {
          folderUuid: folderId,
          label: folder.label,
          itemUuid: resolveFolderItemUuid(fallback, safeChatId),
        } satisfies FolderAssignmentRow;
      });

      if (fetchedItemsByFolderId.size > 0 || failedFetchFolderIds.size > 0) {
        set((state) => {
          const nextMap = new Map(state.folderItemsByFolderId);
          for (const [folderId, items] of fetchedItemsByFolderId) {
            nextMap.set(folderId, items);
          }

          const nextStaleFolderIds = new Set(state.staleFolderIds);
          for (const folderId of fetchedItemsByFolderId.keys()) {
            nextStaleFolderIds.delete(folderId);
          }
          for (const folderId of failedFetchFolderIds) {
            nextStaleFolderIds.add(folderId);
          }

          const selectedFolderId = state.selectedFolderId;
          const shouldPatchSelected =
            fetchedItemsByFolderId.has(selectedFolderId) &&
            shouldLoadFolderItemsForSelection(state.folders, selectedFolderId);

          return {
            folderItemsByFolderId: nextMap,
            staleFolderIds: nextStaleFolderIds,
            ...(shouldPatchSelected
              ? {
                  selectedFolderChatIds: toChatIdSet(
                    fetchedItemsByFolderId.get(selectedFolderId) ?? [],
                  ),
                }
              : {}),
          };
        });
      }

      return rows;
    },

    async toggleAssignment(input) {
      // Single add/remove assignment mutation: optimistic patch → server → reconcile/rollback.
      const folderUuid = input.folderUuid.trim();
      const chatId = input.chatId.trim();
      const itemUuid = input.itemUuid?.trim() ?? null;
      if (folderUuid.length === 0 || chatId.length === 0) {
        return {
          ok: false,
          folderUuid,
          nextItemUuid: itemUuid,
          removed: false,
          rolledBack: false,
        } satisfies ToggleAssignmentResult;
      }
      if (itemUuid === OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID) {
        return {
          ok: false,
          folderUuid,
          nextItemUuid: null,
          removed: false,
          rolledBack: false,
        } satisfies ToggleAssignmentResult;
      }

      const runMutation = async (): Promise<ToggleAssignmentResult> => {
        const stateBefore = get();
        const hadFolderCache = stateBefore.folderItemsByFolderId.has(folderUuid);
        const previousItems = stateBefore.folderItemsByFolderId.get(folderUuid) ?? [];
        const wasStaleBefore = stateBefore.staleFolderIds.has(folderUuid);
        const isRemove = itemUuid != null;

        const rollbackContext = {
          folderUuid,
          hadFolderCache,
          previousItems,
          wasStaleBefore,
        };
        const rollbackToPrevious = (markStaleAfterRollback: boolean): void => {
          // Roll back if server call/reconcile did not confirm the mutation.
          set(
            sliceAfterFolderAssignmentRollback(
              get(),
              rollbackContext,
              markStaleAfterRollback,
            ) as Partial<FolderSyncState>,
          );
        };

        // Optimistic update so chat appears/disappears immediately in the selected folder.
        set(
          sliceAfterOptimisticFolderAssignment(get(), {
            folderUuid,
            chatId,
            itemUuid,
            isRemove,
            removeFolderAssignmentItem,
            upsertOptimisticFolderItem,
            markFolderAsStale,
          }) as Partial<FolderSyncState>,
        );

        const mutationOk = isRemove
          ? await removeChatFromFolder(folderUuid, itemUuid ?? "")
          : await addChatToFolder(folderUuid, chatId);

        if (!mutationOk) {
          rollbackToPrevious(false);
          return {
            ok: false,
            folderUuid,
            nextItemUuid: itemUuid,
            removed: false,
            rolledBack: true,
          } satisfies ToggleAssignmentResult;
        }

        const reconcile = await reconcileFolderAssignment(folderUuid, chatId, !isRemove);
        if (!reconcile.ok || reconcile.items == null) {
          rollbackToPrevious(true);
          return {
            ok: false,
            folderUuid,
            nextItemUuid: itemUuid,
            removed: false,
            rolledBack: true,
          } satisfies ToggleAssignmentResult;
        }

        set((state) => {
          const nextMap = new Map(state.folderItemsByFolderId);
          nextMap.set(folderUuid, reconcile.items ?? []);
          const nextStaleFolderIds = unmarkFolderAsStale(state.staleFolderIds, folderUuid);
          const shouldPatchSelection =
            state.selectedFolderId === folderUuid &&
            shouldLoadFolderItemsForSelection(state.folders, folderUuid);
          return {
            folderItemsByFolderId: nextMap,
            staleFolderIds: nextStaleFolderIds,
            ...(shouldPatchSelection
              ? { selectedFolderChatIds: toChatIdSet(reconcile.items ?? []) }
              : {}),
          };
        });

        return {
          ok: true,
          folderUuid,
          nextItemUuid: isRemove ? null : reconcile.matchedItemUuid,
          removed: isRemove,
          rolledBack: false,
        } satisfies ToggleAssignmentResult;
      };

      logStoreAction("folderSync", "toggleAssignment", {
        folderUuid,
        chatId,
        operation: itemUuid != null ? "remove" : "add",
      });

      const previousMutation = inFlightAssignmentByFolder.get(folderUuid);
      // Serialize operations per folder to avoid add/remove races.
      const queuedMutation =
        previousMutation != null
          ? previousMutation.catch(() => null).then(runMutation)
          : runMutation();
      inFlightAssignmentByFolder.set(folderUuid, queuedMutation);
      void queuedMutation.finally(() => {
        if (inFlightAssignmentByFolder.get(folderUuid) === queuedMutation) {
          inFlightAssignmentByFolder.delete(folderUuid);
        }
      });
      return queuedMutation;
    },

    applyLocallyCreatedFolder(folder) {
      const instanceId = get().instanceId;
      if (instanceId == null) {
        return;
      }
      const id = folder.id.trim();
      if (id.length === 0) {
        return;
      }
      logStoreAction("folderSync", "applyLocallyCreatedFolder", { folderId: id });
      const titleTrimmed = folder.title.trim();
      const railFolder: WorkspaceFolderForRail = {
        id,
        label: titleTrimmed.length > 0 ? titleTrimmed : id,
        backgroundColor: folder.backgroundColor,
        systemType: "created",
      };
      set((state) => {
        if (state.folders.some((f) => f.id === id)) {
          return {};
        }
        const nextFolders = [...state.folders, railFolder];
        const nextMap = new Map(state.folderItemsByFolderId);
        if (!nextMap.has(id)) {
          nextMap.set(id, []);
        }
        schedulePersistFolders(instanceId, nextFolders);
        return {
          folders: nextFolders,
          folderItemsByFolderId: nextMap,
        };
      });
    },

    applyLocallyDeletedFolder(folderId) {
      const instanceId = get().instanceId;
      if (instanceId == null) {
        return;
      }
      const trimmed = folderId.trim();
      if (trimmed.length === 0) {
        return;
      }
      logStoreAction("folderSync", "applyLocallyDeletedFolder", { folderId: trimmed });
      set((state) => {
        const nextFolders = state.folders.filter((f) => f.id !== trimmed);
        const nextMap = new Map(state.folderItemsByFolderId);
        nextMap.delete(trimmed);
        const nextStaleFolderIds = new Set(state.staleFolderIds);
        nextStaleFolderIds.delete(trimmed);

        const resolved = resolveSelectedFolderId(nextFolders, state.selectedFolderId);
        const nextSelectedId =
          resolved ??
          (nextFolders.length > 0
            ? (nextFolders[0]?.id ?? DEFAULT_SELECTED_FOLDER_ID)
            : DEFAULT_SELECTED_FOLDER_ID);

        const shouldLoadSelectedFolderItems = shouldLoadFolderItemsForSelection(
          nextFolders,
          nextSelectedId,
        );
        const hasCachedItemsForSelectedFolder =
          shouldLoadSelectedFolderItems && nextMap.has(nextSelectedId);
        const cachedItemsForSelectedFolder = hasCachedItemsForSelectedFolder
          ? (nextMap.get(nextSelectedId) ?? [])
          : undefined;

        let selectedFolderChatIds: Set<string> | null = null;
        if (shouldLoadSelectedFolderItems) {
          selectedFolderChatIds =
            cachedItemsForSelectedFolder != null
              ? toChatIdSet(cachedItemsForSelectedFolder)
              : new Set<string>();
        }

        schedulePersistFolders(instanceId, nextFolders);

        return {
          folders: nextFolders,
          folderItemsByFolderId: nextMap,
          staleFolderIds: nextStaleFolderIds,
          selectedFolderId: nextSelectedId,
          selectedFolderChatIds,
        };
      });
    },

    syncSidebarProjection(input) {
      const state = get();
      const inputChatCount = input.chatsSortedByLastMessage.length;
      const streamsCount = input.streamsMap.size;
      const nextChats = buildSelectedFolderSidebarChats({
        selectedFolderId: state.selectedFolderId,
        folderChatIds: state.selectedFolderChatIds,
        folderItemsByFolderId: state.folderItemsByFolderId,
        chatsSortedByLastMessage: input.chatsSortedByLastMessage,
        streamsMap: input.streamsMap,
        usersMapForChatInfo: input.usersMapForChatInfo,
        currentUserId: input.currentUserId,
        hideUnknownArchivedStreams: input.hideUnknownArchivedStreams,
        isStreamMuted: input.isStreamMuted,
      });
      const nextFolders = applyFolderUnreadBadges(state.folders, {
        folderItemsByFolderId: state.folderItemsByFolderId,
        chatsSortedByLastMessage: input.chatsSortedByLastMessage,
        streamsMap: input.streamsMap,
        usersMapForChatInfo: input.usersMapForChatInfo,
        currentUserId: input.currentUserId,
        hideUnknownArchivedStreams: input.hideUnknownArchivedStreams,
        isStreamMuted: input.isStreamMuted,
      });
      set({
        selectedFolderSidebarChats: nextChats,
        folders: [...nextFolders],
      });

      folderSyncLog.debug("sidebarProjection", {
        selectedFolderId: state.selectedFolderId,
        folderChatIds: describeFolderChatIds(state.selectedFolderChatIds),
        loading: state.loading,
        inputChatCount,
        streamsCount,
        sidebarChatCount: nextChats.length,
        folderItemsForSelectedCount:
          state.folderItemsByFolderId.get(state.selectedFolderId)?.length ?? 0,
      });

      if (inputChatCount > 0 && nextChats.length === 0) {
        folderSyncLog.warn("sidebarProjection:emptyDespiteInputChats", {
          selectedFolderId: state.selectedFolderId,
          folderChatIds: describeFolderChatIds(state.selectedFolderChatIds),
          loading: state.loading,
          inputChatCount,
          streamsCount,
        });
      }
    },

    syncDerived(showSystemFolders, labels) {
      logStoreAction("folderSync", "syncDerived", { showSystemFolders });
      const state = get();
      // Recompute presentation only — no network.
      const nextFolders = withDefaultSystemFolders(state.folders, labels, showSystemFolders);
      const selectedFolderId =
        resolveSelectedFolderId(nextFolders, state.selectedFolderId) ?? state.selectedFolderId;
      const selectedFolderItems = state.folderItemsByFolderId.get(selectedFolderId);
      const selectedFolderChatIds = resolveSelectedFolderChatIdsOnSyncDerived({
        shouldLoadItems: shouldLoadFolderItemsForSelection(nextFolders, selectedFolderId),
        selectedFolderItems,
      });
      set({
        folders: nextFolders,
        selectedFolderId,
        selectedFolderChatIds,
        showSystemFolders,
        labels,
      });

      folderSyncLog.debug("syncDerived:applied", {
        folderCount: nextFolders.length,
        selectedFolderId,
        folderChatIds: describeFolderChatIds(selectedFolderChatIds),
      });
    },

    clear() {
      logStoreAction("folderSync", "clear", {});
      inFlightRefreshByInstance.clear();
      inFlightAssignmentByFolder.clear();
      usePinStore.getState().clear();
      set((state) => ({
        folders: [],
        selectedFolderId: DEFAULT_SELECTED_FOLDER_ID,
        selectedFolderChatIds: null,
        selectedFolderSidebarChats: [],
        loading: false,
        error: null,
        // Version bump blocks stale in-flight responses from applying.
        requestVersion: state.requestVersion + 1,
        instanceId: null,
        folderItemsByFolderId: new Map(),
        allFolderApiUuid: null,
        staleFolderIds: new Set(),
      }));
    },
  };
});
