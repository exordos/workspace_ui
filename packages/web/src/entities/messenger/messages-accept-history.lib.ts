import type {
  WorkspaceConversationWindow,
  WorkspaceConversationWindowBoundary,
  WorkspaceMessageStoreState,
} from "~/entities/message/message.model";
import {
  applyMessengerReadBoundaries,
  compareMessengerMessageOrder,
} from "./messenger-read-boundary.lib";
import type { AppliedServerMessages } from "./messages-server-state.lib";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

// Нормализованное окно или страница, выбранные загрузчиком по ответу сервера.
export interface ResolvedConversationHistoryWindow {
  messages: MessengerMessage[]; // Кандидаты на запись в окно и подтверждение исходящих.
  mode: WorkspaceConversationWindow["mode"]; // Режим окна при открытии.
  anchorMessageUuid: MessengerUuid | null; // Якорь выбранного окна.
  nextPageMarker: string | null; // Верхняя граница после применения результата.
  afterPageMarker: string | null; // Нижняя граница выбранного окна.
  unreadMessage: MessengerMessage | null; // Граница непрочитанного для проверки при записи.
}

// Часть текущего состояния, нужная для согласования результата с окном.
type HistoryStoreState = Pick<
  WorkspaceMessageStoreState,
  | "ownerKey"
  | "conversationWindowsById"
  | "messagesById"
  | "replaceConversationWindow"
  | "mergeConversationWindowPage"
>;

// Открытие проверяет всю ревизию, а догрузка проверяет выбранную сторону.
type HistoryTarget =
  | {
      kind: "opening";
      expectedRevision: number | null; // Ревизия окна на момент запроса либо отсутствие окна.
      shouldRetainWindow: () => boolean; // Текущее намерение читателя к моменту записи.
      serverTail: readonly MessengerMessage[]; // Исходный хвост для проверки продолжения снизу.
    }
  | { kind: "before"; boundary: WorkspaceConversationWindowBoundary }; // Запрошенная верхняя граница.

// Контекст запроса и выбранный результат для синхронного приёма истории.
interface AcceptConversationHistoryInput {
  resolved: ResolvedConversationHistoryWindow; // Выбранный серверный результат.
  store: { getState: () => HistoryStoreState }; // Хранилище окна для текущего запроса.
  conversationId: MessengerConversationId; // Разговор, для которого запрашивали историю.
  capturedMutationRevision: number; // Ревизия тел сообщений на момент запроса.
  ownerKey: string; // Владелец окна, границ прочтения и исходящих операций.
  isCurrent: () => boolean; // Проверка токена, поколения сессии и отмены.
  target: HistoryTarget; // Открытие или расширение окна сверху.
}

// Результат приёма, по которому загрузчик продолжает эффекты или решает, нужен ли повтор.
type AcceptConversationHistoryResult =
  | (AppliedServerMessages & {
      appliedWindow: WorkspaceConversationWindow; // Установленное окно для проверки записи в кеш.
      messages: MessengerMessage[]; // Сообщения для синхронизации реакций.
      nextPageMarker: string | null; // Следующая верхняя граница.
      hasMore: boolean; // Сервер сообщил о продолжении сверху.
    })
  | { status: "stale-owner" } // Запрос или сессия потеряли актуальность.
  | { status: "stale-window" } // Окно или граница не совпали с ожидаемыми.
  | { status: "changed-boundary" }; // Выбранная граница непрочитанного изменилась.

// Удерживает видимый участок и открывает догрузку вниз, если серверный хвост ушёл вперёд.
function retainConversationWindow(
  state: HistoryStoreState,
  window: WorkspaceConversationWindow,
  freshMessages: readonly MessengerMessage[],
  serverTail: readonly MessengerMessage[],
  ownerKey: string,
): { messages: MessengerMessage[]; afterPageMarker: string | null } {
  const freshById = new Map(freshMessages.map((message) => [message.uuid, message]));
  const messages = applyMessengerReadBoundaries(
    window.messageUuids
      .map((uuid) => freshById.get(uuid) ?? state.messagesById[uuid])
      .filter((message): message is MessengerMessage => message != null),
    ownerKey,
  );
  const retainedTail = messages.at(-1);
  const serverHasNewer =
    retainedTail != null &&
    serverTail.some(
      (message) =>
        compareMessengerMessageOrder(
          { createdAt: message.createdAt, messageUuid: message.uuid },
          { createdAt: retainedTail.createdAt, messageUuid: retainedTail.uuid },
        ) > 0,
    );
  return {
    messages,
    afterPageMarker: serverHasNewer ? (retainedTail?.uuid ?? null) : window.afterPageMarker,
  };
}

// Применяет выбранную историю в окно и возвращает сообщения, наблюдённые в истории.
export function applyConversationHistory({
  resolved,
  store,
  conversationId,
  capturedMutationRevision,
  ownerKey,
  isCurrent,
  target,
}: AcceptConversationHistoryInput): AcceptConversationHistoryResult {
  let { messages, mode, anchorMessageUuid, nextPageMarker, afterPageMarker } = resolved;
  const { unreadMessage } = resolved;
  const retainWindow = target.kind === "opening" && target.shouldRetainWindow();
  // Проверка нужна после вызова внешнего обработчика, который может отменить запрос.
  if (!isCurrent()) return { status: "stale-owner" };
  const currentState = store.getState();
  const currentWindow = currentState.conversationWindowsById[conversationId];
  if (retainWindow && currentWindow != null) {
    const retained = retainConversationWindow(
      currentState,
      currentWindow,
      messages,
      target.serverTail,
      ownerKey,
    );
    messages = retained.messages;
    mode = "around-anchor";
    anchorMessageUuid = currentWindow.anchorMessageUuid ?? messages[0]?.uuid ?? null;
    nextPageMarker = currentWindow.beforePageMarker;
    afterPageMarker = retained.afterPageMarker;
  }
  messages = applyMessengerReadBoundaries(messages, ownerKey);
  if (
    unreadMessage != null &&
    !retainWindow &&
    applyMessengerReadBoundaries([unreadMessage], ownerKey)[0]?.read
  ) {
    return { status: "changed-boundary" };
  }
  const appliedWindow =
    target.kind === "opening"
      ? currentState.replaceConversationWindow({
          conversationId,
          expectedRevision: target.expectedRevision,
          capturedMutationRevision,
          mode,
          anchorMessageUuid,
          messages,
          markers: { beforePageMarker: nextPageMarker, afterPageMarker },
        })
      : currentState.mergeConversationWindowPage({
          conversationId,
          boundary: target.boundary,
          capturedMutationRevision,
          messages,
          pageMarker: nextPageMarker,
        });
  if (appliedWindow == null) return { status: "stale-window" };
  const appliedState = store.getState();
  if (
    unreadMessage != null &&
    !retainWindow &&
    (appliedState.messagesById[unreadMessage.uuid]?.read !== false ||
      !appliedState.conversationWindowsById[conversationId]?.messageUuids.includes(
        unreadMessage.uuid,
      ))
  ) {
    return { status: "changed-boundary" };
  }

  return {
    status: "applied",
    evidence: messages,
    appliedWindow,
    messages,
    nextPageMarker,
    hasMore: nextPageMarker != null,
  };
}
