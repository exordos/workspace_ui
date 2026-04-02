import { create } from "zustand";
import {
  mapWorkspaceFoldersToRail,
  type FolderItemForClient,
  type WorkspaceFolderForRail,
} from "~/shared/api/workspace-client";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import { loadOfflineFolders, saveOfflineFolders } from "~/shared/lib/offline-folders";
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
    showSystemFolders: false,
    labels: DEFAULT_LABELS,
    folderItemsByFolderId: new Map(),

    async bootstrap({ instanceId, showSystemFolders, labels }) {
      logStoreAction("folderSync", "bootstrap", { instanceId });
      const previousInstanceId = get().instanceId;
      const isInstanceChanged = previousInstanceId !== instanceId;
      // Сначала поднимаем offline-кэш, чтобы UI не мигал пустым состоянием.
      const cachedFolders = withDefaultSystemFolders(
        loadOfflineFolders(instanceId),
        labels,
        showSystemFolders,
      );
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

      // После загрузки кэша всегда запускаем сетевой refresh для актуализации данных.
      await get().refresh("bootstrap");
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
        // Anti-overlap для polling/mutation: возвращаем текущий in-flight промис.
        return inFlight;
      }

      const refreshPromise = (async () => {
        const requestVersion = get().requestVersion + 1;
        logStoreAction("folderSync", "refresh:start", { reason, requestVersion, instanceId });
        set({
          error: null,
          requestVersion,
          ...(shouldToggleLoading ? { loading: true } : {}),
        });

        try {
          const snapshot = await loadFolderSyncSnapshot(instanceId, {
            force: reason === "bootstrap",
          });
          const latestState = get();
          if (!isCurrentRequest(latestState, instanceId, requestVersion)) {
            // Пришёл ответ от старой версии запроса — пропускаем.
            return;
          }

          const foldersWithSystemDefaults = normalizeFoldersForPresentation(
            snapshot,
            latestState.labels,
            latestState.showSystemFolders,
          );
          saveOfflineFolders(instanceId, foldersWithSystemDefaults);

          const selectedFolderId =
            resolveSelectedFolderId(foldersWithSystemDefaults, latestState.selectedFolderId) ??
            latestState.selectedFolderId;
          const nextFolderItemsByFolderId = mergeFolderItemsSnapshot(
            latestState.folderItemsByFolderId,
            snapshot,
          );
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

          // На общей ошибке refresh откатываемся к offline-папкам текущего инстанса.
          const offlineFolders = withDefaultSystemFolders(
            loadOfflineFolders(instanceId),
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
        ? selectedFolderItems
          ? toChatIdSet(selectedFolderItems)
          : null
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
