import { useShallow } from "zustand/react/shallow";
import {
  selectWorkspaceMessageById,
  useWorkspaceMessageStore,
  type WorkspaceMessageStoreState,
} from "~/entities/message/message.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
  type WorkspaceRuntimeContextGetter,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useMessengerOutboxStore } from "./messenger-outbox.model";
import type { MessengerOutgoingMessage } from "./messenger-outbox.types";
import type { MessengerConversationId, MessengerUuid } from "./messenger.types";

// Чтение известных сообщений и статуса их окон для потребителей поверх ленты.
export interface MessagesIndexSnapshot {
  readonly ownerKey: WorkspaceMessageStoreState["ownerKey"];
  readonly messagesById: Readonly<WorkspaceMessageStoreState["messagesById"]>;
  readonly conversationWindowsById: Readonly<WorkspaceMessageStoreState["conversationWindowsById"]>;
  readonly messagesLoadingByConversationId: Readonly<
    WorkspaceMessageStoreState["messagesLoadingByConversationId"]
  >;
}
const EMPTY_INDEX: MessagesIndexSnapshot = {
  ownerKey: null,
  messagesById: {},
  conversationWindowsById: {},
  messagesLoadingByConversationId: {},
};
const getRuntime = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
// Timeline fields exclude delivery requests and their prepared crypto payloads.
export type OutgoingMessageView = Readonly<
  Pick<
    MessengerOutgoingMessage,
    | "placementUuid"
    | "authorUuid"
    | "createdAt"
    | "streamUuid"
    | "topicUuid"
    | "markdown"
    | "status"
    | "error"
  >
>;
const EMPTY_OUTGOING: readonly OutgoingMessageView[] = [];
const outgoingViews = new WeakMap<MessengerOutgoingMessage, OutgoingMessageView>();

// A store row keeps its view until the delivery state replaces that row.
function readOutgoingMessageView(message: MessengerOutgoingMessage): OutgoingMessageView {
  const cached = outgoingViews.get(message);
  if (cached != null) return cached;
  const { placementUuid, authorUuid, createdAt, streamUuid, topicUuid, markdown, status, error } =
    message;
  const view = {
    placementUuid,
    authorUuid,
    createdAt,
    streamUuid,
    topicUuid,
    markdown,
    status,
    error,
  };
  outgoingViews.set(message, view);
  return view;
}
let latestIndex = EMPTY_INDEX;

// Смена внутренних ревизий сама по себе не публикует новый снимок для потребителя.
function readIndex(state: WorkspaceMessageStoreState): MessagesIndexSnapshot {
  const { ownerKey, messagesById, conversationWindowsById, messagesLoadingByConversationId } =
    state;
  if (
    latestIndex.ownerKey !== ownerKey ||
    latestIndex.messagesById !== messagesById ||
    latestIndex.conversationWindowsById !== conversationWindowsById ||
    latestIndex.messagesLoadingByConversationId !== messagesLoadingByConversationId
  ) {
    latestIndex = {
      ownerKey,
      messagesById,
      conversationWindowsById,
      messagesLoadingByConversationId,
    };
  }
  return latestIndex;
}

// Синхронный снимок текущего владельца для действий интерфейса.
export function readActiveMessageIndex(): MessagesIndexSnapshot {
  const runtime = getRuntime();
  const state = useWorkspaceMessageStore.getState();
  return runtime != null && state.ownerKey === workspaceRuntimeOwnerKey(runtime)
    ? readIndex(state)
    : EMPTY_INDEX;
}

export function useMessageIndex<T>(select: (snapshot: MessagesIndexSnapshot) => T): T {
  useWorkspaceAuthStore((state) => state.runtimeGeneration);
  return useWorkspaceMessageStore((state) => {
    const runtime = getRuntime();
    return select(
      runtime != null && state.ownerKey === workspaceRuntimeOwnerKey(runtime)
        ? readIndex(state)
        : EMPTY_INDEX,
    );
  });
}

// Точное чтение сообщения не подписывает представление на состояние соседних строк.
export function useKnownMessage(messageUuid: MessengerUuid) {
  return useMessageIndex((index) => selectWorkspaceMessageById(index, messageUuid));
}

// Разрешает UUID внутри уже прочитанного снимка без повторной подписки.
export function selectKnownMessage(
  snapshot: Pick<MessagesIndexSnapshot, "messagesById">,
  messageUuid: MessengerUuid,
) {
  return selectWorkspaceMessageById(snapshot, messageUuid);
}

// Стабильная проекция исходящих именно этого разговора и текущего владельца.
export function useOutgoingMessages(
  conversationId: MessengerConversationId | null,
): readonly OutgoingMessageView[] {
  useWorkspaceAuthStore((state) => state.runtimeGeneration);
  return useMessengerOutboxStore(
    useShallow((state) => {
      const runtime = getRuntime();
      if (runtime == null || conversationId == null) return EMPTY_OUTGOING;
      const ids = state.outgoingMessagePlacementUuidsByConversationId[conversationId];
      if (ids == null || ids.length === 0) return EMPTY_OUTGOING;
      const ownerKey = workspaceRuntimeOwnerKey(runtime);
      return ids
        .map((uuid) => state.outgoingMessagesByPlacementUuid[uuid])
        .filter((message): message is MessengerOutgoingMessage => message?.ownerKey === ownerKey)
        .map(readOutgoingMessageView);
    }),
  );
}

// Снимок для потребителя, который координирует подписку сам.
export function createMessagesIndexSource(
  runtime: WorkspaceRuntimeContext | null,
  getCurrentRuntime: WorkspaceRuntimeContextGetter = getRuntime,
) {
  const ownerKey = runtime == null ? null : workspaceRuntimeOwnerKey(runtime);
  const getSnapshot = (): MessagesIndexSnapshot => {
    const state = useWorkspaceMessageStore.getState();
    return state.ownerKey === ownerKey &&
      isWorkspaceRuntimeRequestContextCurrent(runtime, getCurrentRuntime)
      ? readIndex(state)
      : EMPTY_INDEX;
  };
  const subscribe = (listener: (next: MessagesIndexSnapshot) => void) => {
    let previous = getSnapshot();
    const publish = () => {
      const next = getSnapshot();
      if (next === previous) return;
      previous = next;
      listener(next);
    };
    const unsubscribeMessages = useWorkspaceMessageStore.subscribe(publish);
    const unsubscribeRuntime = useWorkspaceAuthStore.subscribe(publish);
    return () => {
      unsubscribeMessages();
      unsubscribeRuntime();
    };
  };
  return { getSnapshot, subscribe };
}

// Подписывает текущий экран, сохраняя поколение, с которым он начал работу.
export function subscribeActiveMessageIndex(listener: (next: MessagesIndexSnapshot) => void) {
  return createMessagesIndexSource(getRuntime()).subscribe(listener);
}
