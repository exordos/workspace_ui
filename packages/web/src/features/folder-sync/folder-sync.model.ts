import { create } from "zustand";
import {
  mapWorkspaceFoldersToRail,
  type FolderItemForClient,
  type WorkspaceFolderForRail,
} from "~/shared/api/workspace-client";
import {
  loadFoldersSnapshotRow,
  persistFoldersSnapshotRow,
} from "~/shared/lib/folders-snapshot-db";
import { logFolderFlow } from "~/shared/lib/message-flow-debug.lib";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  loadFolderItemsForSelection,
  loadFolderSyncSnapshot,
  type FolderSyncSnapshot,
} from "./folder-sync.api";
import { SYSTEM_ALL_FOLDER_ID } from "./folder-sync-constants.lib";
import { buildSelectedFolderSidebarChats, toChatIdSet } from "./folder-sync-sidebar-chats.lib";
import {
  mergeFolderItemsSnapshot,
  resolveSelectedFolderId,
  shouldLoadFolderItemsForSelection,
  withDefaultSystemFolders,
  type FolderSyncSystemLabels,
} from "./folder-sync.lib";

export type FolderRefreshReason = "bootstrap" | "polling" | "mutation";

const folderSyncLog = createLogger("folderSync");

async function loadFolderRailCache(instanceId: string): Promise<WorkspaceFolderForRail[]> {
  const row = await loadFoldersSnapshotRow(instanceId).catch(() => null);
  return row?.folders ?? [];
}

function schedulePersistFolders(instanceId: string, folders: WorkspaceFolderForRail[]): void {
  void persistFoldersSnapshotRow({ instanceId, folders, version: 1 });
}

function describeFolderChatIds(value: Set<string> | null): "null" | "empty" | `size:${number}` {
  if (value === null) {
    return "null";
  }
  if (value.size === 0) {
    return "empty";
  }
  return `size:${value.size}`;
}

interface FolderSyncBootstrapOptions {
  instanceId: string;
  showSystemFolders: boolean;
  labels: FolderSyncSystemLabels;
}

interface FolderSyncState {
  folders: WorkspaceFolderForRail[];
  // Текущая выбранная папка в rail/sidebar.
  selectedFolderId: string;
  // Набор chat_id выбранной папки в нормализованном виде.
  selectedFolderChatIds: Set<string> | null;
  // Готовая проекция чатов для рендера sidebar в выбранной папке.
  selectedFolderSidebarChats: SidebarChat[];
  loading: boolean;
  error: string | null;
  // Версия запроса для anti-stale защиты (гонки async-ответов).
  requestVersion: number;
  instanceId: string | null;
  showSystemFolders: boolean;
  labels: FolderSyncSystemLabels;
  // Кэш items по папкам (нужен для fallback и быстрого select).
  folderItemsByFolderId: Map<string, FolderItemForClient[]>;
  bootstrap: (options: FolderSyncBootstrapOptions) => Promise<void>;
  selectFolder: (folderId: string) => Promise<void>;
  refresh: (reason: FolderRefreshReason) => Promise<void>;
  /** Reloads items for one folder after add/remove chat assignment (avoids full snapshot refresh). */
  refreshFolderItemsCache: (folderUuid: string) => Promise<void>;
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
  // Ответ применяем только если он относится к актуальному инстансу и версии запроса.
  return state.instanceId === instanceId && state.requestVersion === requestVersion;
}

function normalizeFoldersForPresentation(
  snapshot: FolderSyncSnapshot,
  labels: FolderSyncSystemLabels,
  showSystemFolders: boolean,
): WorkspaceFolderForRail[] {
  // Приводим backend-папки к rail-модели и добавляем системные при необходимости.
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

export const useFolderSyncStore = create<FolderSyncState>((set, get) => {
  // Не даем стартовать двум refresh одновременно для одного instanceId.
  const inFlightRefreshByInstance = new Map<string, Promise<void>>();

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

    async bootstrap({ instanceId, showSystemFolders, labels }) {
      logStoreAction("folderSync", "bootstrap", { instanceId });
      const previousInstanceId = get().instanceId;
      const isInstanceChanged = previousInstanceId !== instanceId;
      logFolderFlow("bootstrap:start", { instanceId, isInstanceChanged });
      // Сначала поднимаем кеш из IndexedDB, чтобы UI не мигал.
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
        // При смене инстанса очищаем кэш items, иначе переиспользуем текущий.
        folderItemsByFolderId: isInstanceChanged ? new Map() : state.folderItemsByFolderId,
      }));

      const afterBootstrap = get();
      folderSyncLog.debug("bootstrap:cacheApplied", {
        instanceId,
        folderCount: afterBootstrap.folders.length,
        selectedFolderId: afterBootstrap.selectedFolderId,
        folderChatIds: describeFolderChatIds(afterBootstrap.selectedFolderChatIds),
        shouldLoadItems: shouldLoadFolderItemsForSelection(
          cachedFolders,
          resolvedSelectedFolderId,
        ),
      });

      logFolderFlow("bootstrap:await refresh(api)", { instanceId, reason: "bootstrap" });
      // После загрузки кэша всегда запускаем сетевой refresh для актуализации данных.
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
      // Cache hit определяем через Map.has, чтобы отличать "нет данных" от "кэшировано пусто".
      const hasCachedItemsForSelectedFolder =
        shouldLoadSelectedFolderItems && stateBeforeSelect.folderItemsByFolderId.has(nextFolderId);
      const cachedItemsForSelectedFolder = hasCachedItemsForSelectedFolder
        ? (stateBeforeSelect.folderItemsByFolderId.get(nextFolderId) ?? [])
        : undefined;

      set({
        selectedFolderId: nextFolderId,
        error: null,
        selectedFolderChatIds:
          shouldLoadSelectedFolderItems && cachedItemsForSelectedFolder != null
            ? toChatIdSet(cachedItemsForSelectedFolder)
            : shouldLoadSelectedFolderItems
              ? // При cache miss сразу показываем "пустую папку", чтобы не светить чаты из all.
                new Set<string>()
              : null,
        // Переключение папки всегда без loader: сначала cache-first, затем best-effort fallback.
        loading: false,
      });

      if (!shouldLoadSelectedFolderItems) {
        // Для системных папок items не нужны: список строится из общего chat-list.
        return;
      }
      // Для created-папки с кэшем сеть не трогаем.
      if (hasCachedItemsForSelectedFolder) {
        return;
      }

      try {
        const items = await loadFolderItemsForSelection(nextFolderId);
        set((state) => {
          if (state.selectedFolderId !== nextFolderId) {
            // Пользователь уже переключился в другую папку — игнорируем устаревший ответ.
            return state;
          }
          const nextFolderItemsByFolderId = new Map(state.folderItemsByFolderId);
          nextFolderItemsByFolderId.set(nextFolderId, items);
          return {
            folderItemsByFolderId: nextFolderItemsByFolderId,
            selectedFolderChatIds: toChatIdSet(items),
            loading: false,
            error: null,
          };
        });
      } catch {
        set((state) => {
          if (state.selectedFolderId !== nextFolderId) {
            return state;
          }
          const nextFolderItemsByFolderId = new Map(state.folderItemsByFolderId);
          // Фиксируем miss как пустой кэш до следующего фонового refresh.
          nextFolderItemsByFolderId.set(nextFolderId, []);
          return {
            folderItemsByFolderId: nextFolderItemsByFolderId,
            selectedFolderChatIds: new Set<string>(),
            loading: false,
            error: "folder-sync:select_failed",
          };
        });
      }
    },

    async refresh(reason) {
      const instanceId = get().instanceId;
      if (!instanceId) return;
      const shouldToggleLoading = reason !== "polling";

      const inFlight = inFlightRefreshByInstance.get(instanceId);
      if (inFlight) {
        logFolderFlow("refresh:coalesced (await in-flight)", { instanceId, reason });
        // Anti-overlap для polling/mutation: возвращаем текущий in-flight промис.
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

        try {
          const priorityFolderUuid = get().selectedFolderId;
          const snapshot = await loadFolderSyncSnapshot(instanceId, {
            force: reason === "bootstrap",
            priorityFolderUuid,
            onFoldersLoaded: async (folderRows) => {
              const phaseState = get();
              if (!isCurrentRequest(phaseState, instanceId, requestVersion)) {
                return;
              }
              // Пустой список с сервера не должен затирать rail, уже показанный из IndexedDB.
              if (folderRows.length === 0) {
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
              const nextFolderItemsByFolderId = mergeFolderItemsSnapshot(
                phaseState.folderItemsByFolderId,
                phaseSnapshot,
              );

              let selectedFolderChatIds: Set<string> | null = null;
              if (shouldLoadFolderItemsForSelection(foldersWithSystemDefaults, selectedFolderId)) {
                const stale = nextFolderItemsByFolderId.get(selectedFolderId);
                selectedFolderChatIds = stale ? toChatIdSet(stale) : new Set<string>();
              }

              set({
                folders: foldersWithSystemDefaults,
                selectedFolderId,
                selectedFolderChatIds,
                folderItemsByFolderId: nextFolderItemsByFolderId,
                error: null,
              });
            },
          });
          const latestState = get();
          if (!isCurrentRequest(latestState, instanceId, requestVersion)) {
            logFolderFlow("refresh:snapshot ignored (stale requestVersion)", {
              instanceId,
              requestVersion,
            });
            // Пришёл ответ от старой версии запроса — пропускаем.
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
          const shouldLoadSelectedItems = shouldLoadFolderItemsForSelection(
            foldersWithSystemDefaults,
            selectedFolderId,
          );

          let selectedFolderChatIds: Set<string> | null = null;
          // Если items выбранной папки в snapshot не загрузились — идем в единичный fallback.
          let needsFallbackSelectedLoad = false;
          if (shouldLoadSelectedItems) {
            const selectedLoadResult = snapshot.itemsByFolderId.get(selectedFolderId);
            if (selectedLoadResult?.ok) {
              selectedFolderChatIds = toChatIdSet(selectedLoadResult.items);
            } else {
              const staleItems = nextFolderItemsByFolderId.get(selectedFolderId);
              if (staleItems) {
                selectedFolderChatIds = toChatIdSet(staleItems);
              }
              needsFallbackSelectedLoad = true;
            }
          }

          set({
            folders: foldersWithSystemDefaults,
            selectedFolderId,
            selectedFolderChatIds,
            folderItemsByFolderId: nextFolderItemsByFolderId,
            error: null,
            ...(shouldToggleLoading ? { loading: needsFallbackSelectedLoad } : {}),
          });

          folderSyncLog.debug("refresh:snapshotApplied", {
            reason,
            instanceId,
            requestVersion,
            folderCount: foldersWithSystemDefaults.length,
            selectedFolderId,
            shouldLoadSelectedItems,
            folderChatIds: describeFolderChatIds(selectedFolderChatIds),
            needsFallbackSelectedLoad,
          });

          if (!needsFallbackSelectedLoad) {
            if (shouldToggleLoading) {
              set({ loading: false });
            }
            return;
          }

          try {
            const selectedItems = await loadFolderItemsForSelection(selectedFolderId);
            const stateAfterFallback = get();
            if (!isCurrentRequest(stateAfterFallback, instanceId, requestVersion)) {
              return;
            }
            const nextAfterFallback = new Map(stateAfterFallback.folderItemsByFolderId);
            nextAfterFallback.set(selectedFolderId, selectedItems);
            set({
              folderItemsByFolderId: nextAfterFallback,
              selectedFolderChatIds: toChatIdSet(selectedItems),
              error: null,
              ...(shouldToggleLoading ? { loading: false } : {}),
            });
          } catch {
            const stateAfterFallback = get();
            if (!isCurrentRequest(stateAfterFallback, instanceId, requestVersion)) {
              return;
            }
            // Сохраняем предыдущее состояние выбранной папки, если fallback тоже неуспешен.
            set({
              error: null,
              ...(shouldToggleLoading ? { loading: false } : {}),
            });
          }
        } catch {
          const stateOnFailure = get();
          if (!isCurrentRequest(stateOnFailure, instanceId, requestVersion)) {
            return;
          }

          // На общей ошибке refresh откатываемся к кешу папок текущего инстанса.
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
          if (
            shouldToggleLoading &&
            isCurrentRequest(stateAfterFinish, instanceId, requestVersion)
          ) {
            // Гарантированно выключаем loading для актуального запроса.
            set({ loading: false });
          }
        }
      })();

      inFlightRefreshByInstance.set(instanceId, refreshPromise);
      void refreshPromise.finally(() => {
        // Снимаем in-flight guard после завершения refresh.
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
      try {
        const items = await loadFolderItemsForSelection(trimmed);
        set((state) => {
          const nextMap = new Map(state.folderItemsByFolderId);
          nextMap.set(trimmed, items);
          const shouldPatchSelection =
            state.selectedFolderId === trimmed &&
            shouldLoadFolderItemsForSelection(state.folders, trimmed);
          return {
            folderItemsByFolderId: nextMap,
            ...(shouldPatchSelection
              ? { selectedFolderChatIds: toChatIdSet(items) }
              : {}),
          };
        });
      } catch {
        folderSyncLog.warn("refreshFolderItemsCache:failed", { folderUuid: trimmed });
      }
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
      });
      set({
        selectedFolderSidebarChats: nextChats,
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
      // Пересчитываем только presentation-часть без сетевых запросов.
      const nextFolders = withDefaultSystemFolders(state.folders, labels, showSystemFolders);
      const selectedFolderId =
        resolveSelectedFolderId(nextFolders, state.selectedFolderId) ?? state.selectedFolderId;
      const selectedFolderItems = state.folderItemsByFolderId.get(selectedFolderId);
      const selectedFolderChatIds = shouldLoadFolderItemsForSelection(nextFolders, selectedFolderId)
        ? selectedFolderItems !== undefined
          ? toChatIdSet(selectedFolderItems)
          : new Set<string>()
        : null;
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
      set((state) => ({
        folders: [],
        selectedFolderId: DEFAULT_SELECTED_FOLDER_ID,
        selectedFolderChatIds: null,
        selectedFolderSidebarChats: [],
        loading: false,
        error: null,
        // Инкремент версии блокирует применение уже летящих старых ответов.
        requestVersion: state.requestVersion + 1,
        instanceId: null,
        folderItemsByFolderId: new Map(),
      }));
    },
  };
});
