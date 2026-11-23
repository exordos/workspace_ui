import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
  type WorkspaceRuntimeContextGetter,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  selectMessengerFolders,
  useMessengerStore,
  type MessengerStoreState,
} from "./messenger.model";
import type { MessengerFolder } from "./messenger.types";

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
let latestCatalog = EMPTY_CHATS_CATALOG;

// Повторное чтение и внутренние изменения store сохраняют ссылку на публичный снимок.
function readCatalog(state: MessengerStoreState): ChatsCatalogSnapshot {
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
  const getSnapshot = (): ChatsCatalogSnapshot => {
    const state = useMessengerStore.getState();
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
      const unsubscribeCatalog = useMessengerStore.subscribe(publish);
      const unsubscribeRuntime = useWorkspaceAuthStore.subscribe(publish);
      return () => {
        unsubscribeCatalog();
        unsubscribeRuntime();
      };
    },
  };
}
