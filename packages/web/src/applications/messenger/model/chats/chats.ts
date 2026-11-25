import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
  type WorkspaceRuntimeContextGetter,
} from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import {
  selectMessengerFolders,
  getMessengerStoreForOwner,
  getSelectedMessengerStore,
  useMessengerStore,
  type MessengerStoreState,
} from "./messenger.model";
import type { MessengerFolder } from "../messenger.types";

// Данные каталога и индикаторы его готовности. Методы записи и realtime-курсор здесь недоступны.
const FIELDS = [
  "ownerKey",
  "isLoading",
  "error",
  "lastLoadedAt",
  "bootstrapRequestVersion",
  "realtimeReadyOwnerKey",
  "realtimeReadyRuntimeGeneration",
  "streamsById",
  "streamIds",
  "streamBindingsById",
  "streamBindingIdsByStreamId",
  "streamBindingsLoadedByStreamId",
  "topicsById",
  "topicIds",
  "conversationsById",
  "conversationIds",
  "foldersById",
  "folderIds",
] as const;

type ReadonlyCatalogField<Value> =
  Value extends Record<string, (infer Item)[]>
    ? Readonly<Record<string, readonly Item[]>>
    : Value extends object
      ? Readonly<Value>
      : Value;

export type ChatsCatalogSnapshot = {
  readonly [Field in (typeof FIELDS)[number]]: ReadonlyCatalogField<MessengerStoreState[Field]>;
};

export const EMPTY_CHATS_CATALOG: ChatsCatalogSnapshot = {
  ownerKey: null,
  isLoading: false,
  error: null,
  lastLoadedAt: null,
  bootstrapRequestVersion: 0,
  realtimeReadyOwnerKey: null,
  realtimeReadyRuntimeGeneration: null,
  streamsById: {},
  streamIds: [],
  streamBindingsById: {},
  streamBindingIdsByStreamId: {},
  streamBindingsLoadedByStreamId: {},
  topicsById: {},
  topicIds: [],
  conversationsById: {},
  conversationIds: [],
  foldersById: {},
  folderIds: [],
};
const PENDING_CHATS_CATALOG: ChatsCatalogSnapshot = { ...EMPTY_CHATS_CATALOG, isLoading: true };
const getRuntime = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
const latestCatalogs = new WeakMap<MessengerStoreState["startBootstrap"], ChatsCatalogSnapshot>();

// The legacy WebView and idle logout clear only the currently visible chat catalog.
export function clearSelectedChatCatalogForLegacyLogout(): void {
  getSelectedMessengerStore().getState().clear();
}

// Повторное чтение и внутренние изменения store сохраняют ссылку на публичный снимок.
function readCatalog(state: MessengerStoreState): ChatsCatalogSnapshot {
  let latestCatalog = latestCatalogs.get(state.startBootstrap) ?? EMPTY_CHATS_CATALOG;
  if (FIELDS.some((field) => latestCatalog[field] !== state[field])) {
    const {
      ownerKey,
      isLoading,
      error,
      lastLoadedAt,
      bootstrapRequestVersion,
      realtimeReadyOwnerKey,
      realtimeReadyRuntimeGeneration,
      streamsById,
      streamIds,
      streamBindingsById,
      streamBindingIdsByStreamId,
      streamBindingsLoadedByStreamId,
      topicsById,
      topicIds,
      conversationsById,
      conversationIds,
      foldersById,
      folderIds,
    } = state;
    latestCatalog = {
      ownerKey,
      isLoading,
      error,
      lastLoadedAt,
      bootstrapRequestVersion,
      realtimeReadyOwnerKey,
      realtimeReadyRuntimeGeneration,
      streamsById,
      streamIds,
      streamBindingsById,
      streamBindingIdsByStreamId,
      streamBindingsLoadedByStreamId,
      topicsById,
      topicIds,
      conversationsById,
      conversationIds,
      foldersById,
      folderIds,
    };
    latestCatalogs.set(state.startBootstrap, latestCatalog);
  }
  return latestCatalog;
}

// Для синхронного UI-действия читаем только владельца текущей сессии.
export function readActiveChats(): ChatsCatalogSnapshot {
  const runtime = getRuntime();
  const state = useMessengerStore.getState();
  if (runtime == null) return EMPTY_CHATS_CATALOG;
  return state.ownerKey === workspaceRuntimeOwnerKey(runtime)
    ? readCatalog(state)
    : PENDING_CHATS_CATALOG;
}

// Console diagnostics include the selected owner's epoch and skipped-event reasons.
export function readChatCatalogDiagnostics() {
  const catalog = readActiveChats();
  const state =
    catalog.ownerKey == null ? null : getMessengerStoreForOwner(catalog.ownerKey)?.getState();
  return {
    ...catalog,
    lastEpochVersion: state?.lastEpochVersion ?? null,
    skippedRealtimeEvents: state?.skippedRealtimeEvents ?? [],
  };
}

// Read a warm owner catalog for Workspace effects such as background notifications.
export function readChatsForOwner(ownerKey: string): ChatsCatalogSnapshot {
  const state = getMessengerStoreForOwner(ownerKey)?.getState();
  return state?.ownerKey === ownerKey ? readCatalog(state) : EMPTY_CHATS_CATALOG;
}

// Подписка на выбранную часть каталога с немедленным сбросом на смене сессии.
export function useChatsCatalog<T>(select: (catalog: ChatsCatalogSnapshot) => T): T {
  useWorkspaceAuthStore((state) => state.runtimeGeneration);
  return useMessengerStore((state) => {
    const runtime = getRuntime();
    if (runtime == null) return select(EMPTY_CHATS_CATALOG);
    return select(
      state.ownerKey === workspaceRuntimeOwnerKey(runtime)
        ? readCatalog(state)
        : PENDING_CHATS_CATALOG,
    );
  });
}

// Invalidates cached sidebar projections when the catalog starts another scope or bootstrap.
export function subscribeChatsBootstrapChange(listener: () => void): () => void {
  return useMessengerStore.subscribe((state, previous) => {
    if (
      state.ownerKey !== previous.ownerKey ||
      state.bootstrapRequestVersion !== previous.bootstrapRequestVersion
    )
      listener();
  });
}

// Список папок сохраняет существующую мемоизацию по ID и записям каталога.
export function useChatFolders(): readonly MessengerFolder[] {
  return useChatsCatalog(selectMessengerFolders);
}

// Долгоживущий потребитель закрепляет владельца и поколение до формирования своей проекции.
export function createChatsCatalogSource(
  runtime: WorkspaceRuntimeContext | null,
  getCurrentRuntime: WorkspaceRuntimeContextGetter = getRuntime,
) {
  const ownerKey = runtime == null ? null : workspaceRuntimeOwnerKey(runtime);
  const store =
    ownerKey == null
      ? getSelectedMessengerStore()
      : (getMessengerStoreForOwner(ownerKey) ?? getSelectedMessengerStore());
  const getSnapshot = (): ChatsCatalogSnapshot => {
    const state = store.getState();
    return state.ownerKey === ownerKey &&
      isWorkspaceRuntimeRequestContextCurrent(runtime, getCurrentRuntime)
      ? readCatalog(state)
      : EMPTY_CHATS_CATALOG;
  };
  return {
    getSnapshot,
    subscribe(listener: () => void) {
      let previous = getSnapshot();
      const publish = () => {
        const next = getSnapshot();
        if (next === previous) return;
        previous = next;
        listener();
      };
      const unsubscribeCatalog = store.subscribe(publish);
      const unsubscribeRuntime = useWorkspaceAuthStore.subscribe(publish);
      return () => {
        unsubscribeCatalog();
        unsubscribeRuntime();
      };
    },
  };
}
