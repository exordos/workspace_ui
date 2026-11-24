import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerPollAction } from "~/shared/api/messenger-messages.api";
import {
  openMessengerMessageWindow,
  type MessengerMessageWindowOpenResult,
} from "./history/messages-window-opening.lib";
import {
  loadMessengerConversationMessages,
  loadMessengerMessageWindowPage,
} from "./history/messenger-messages-loader.lib";
import {
  captureWorkspaceConversationWindowBoundary,
  getSelectedWorkspaceMessageStore,
  getWorkspaceMessageStoreForOwner,
  selectWorkspaceConversationWindow,
  selectWorkspaceMessagesForConversation,
  selectWorkspaceMessageStatusForConversation,
} from "./message.model";
import { sendMessengerDraft } from "./outgoing/messages-send-draft.lib";
import { deliverMessengerOutgoingMessage } from "./outgoing/messenger-outbox-delivery.lib";
import { useMessengerOutboxStore } from "./outgoing/messenger-outbox.model";
import { getMessengerPollVoters, mutateMessengerPoll } from "./polls/messenger-poll-actions.lib";
export { MessagesDraftSendError } from "./outgoing/messages-send-draft.lib";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "../messenger.types";
import type {
  MessengerConversationMessagesResult,
  MessengerMessageWindowPageResult,
} from "./history/messenger-messages-loader.lib";

// Снимок загруженного участка истории одного разговора для отрисовки и подписки.
export interface MessageWindowSnapshot {
  readonly messages: readonly MessengerMessage[]; // Сообщения окна в порядке ленты.
  readonly mode: "tail" | "around-anchor" | null; // Хвост, окно вокруг сообщения или отсутствие окна.
  readonly loading: boolean; // При показе кеша может быть false до ответа сервера.
  readonly error: string | null; // Ошибка загрузки из состояния разговора.
  readonly hasOlder: boolean; // У окна есть граница для догрузки более старых сообщений.
  readonly hasNewer: boolean; // У окна есть граница для догрузки более новых сообщений.
}

// Общий снимок для недоступной сессии. По его ссылке UI распознаёт потерю контекста.
export const EMPTY_MESSAGE_WINDOW: MessageWindowSnapshot = {
  messages: [],
  mode: null,
  loading: false,
  error: null,
  hasOlder: false,
  hasNewer: false,
};

// Параметры обычного открытия разговора с учётом позиции читателя.
interface OpenWindowOptions {
  conversationId: MessengerConversationId; // Разговор, чьё окно нужно открыть.
  at: "latest"; // Обычное открытие. Участок истории выбирает загрузчик.
  signal: AbortSignal; // Отмена при уходе из разговора.
  // Без сохранённой позиции загрузчик ищет границу непрочитанного.
  savedPosition?: { messageUuid: MessengerUuid } | null; // Сообщение сохранённой позиции.
  retainCurrentWindow?: () => boolean; // true сохраняет непустое окно при применении ответа.
  onServerWindowApplied?: () => void; // Окно с сервера применено, можно догружать.
}

// Явное открытие по UUID с промежуточным результатом для предварительного показа.
interface OpenAroundMessageOptions {
  messageUuid: MessengerUuid; // Сообщение, указанное в ссылке.
  conversationHint: MessengerConversationId | null; // Разговор из URL или текущей строки.
  signal: AbortSignal; // Отмена намерения просмотра.
  isRequestCurrent: () => boolean; // Актуальность UI-намерения при применении.
  allowLoadedWindow?: boolean; // Сохранить готовое окно после подтверждения ссылки.
  onResolved?: (
    conversationId: MessengerConversationId,
    message: MessengerMessage,
    usesLoadedWindow: boolean,
  ) => void; // Готово доступное тело.
}

// Установка хвоста вокруг выбранного последнего сообщения.
interface OpenTailOptions {
  conversationId: MessengerConversationId; // Разговор, в конец которого переходят.
  messageUuid: MessengerUuid; // Последнее известное сообщение этого разговора.
  signal: AbortSignal; // Отмена перехода.
  isRequestCurrent: () => boolean; // Актуальность цели перехода при применении.
}

// Параметры добавления страницы к текущему окну.
interface LoadMoreOptions {
  conversationId: MessengerConversationId; // Разговор, из окна которого берём маркер.
  direction: "before" | "after"; // Сторона догрузки.
  signal: AbortSignal; // Отмена при уходе из текущего окна.
  view?: "message-anchor"; // Явный якорь может использовать уже готовый хвост без замены окна.
}

type UnavailableReason = "cancelled" | "stale-owner"; // Причина потери актуальности запроса.

// Итог операции после проверки актуальности результата.
export type MessagesOperationResult =
  | { status: "applied" } // Загрузчик применил результат.
  | { status: "failed"; error: string } // Загрузчик вернул ошибку.
  | {
      status: "skipped";
      // cancelled — сработал сигнал отмены.
      // stale-owner — сменилась сессия или запрос уступил место новому.
      // invalid-conversation — загрузчик отклонил ID разговора.
      // stale-window — страница больше не подходит к текущему окну.
      // busy — идёт открытие или другая загрузка.
      // no-boundary — у окна сейчас нет границы с выбранной стороны.
      reason: UnavailableReason | "invalid-conversation" | "stale-window" | "busy" | "no-boundary";
    };

export type MessagesPollAction = MessengerPollAction;

// Команды опроса одной сессии. Подтверждённое состояние приходит в снимке сообщения.
interface MessagesPolls {
  mutate(options: {
    messageUuid: MessengerUuid; // Публичный UUID размещения опроса.
    action: MessagesPollAction; // Голос, вариант, настройки или закрытие.
    signal?: AbortSignal; // Отмена владельцем запроса.
  }): ReturnType<typeof mutateMessengerPoll>;
  getVoters(options: {
    messageUuid: MessengerUuid; // Опрос, которому принадлежит вариант.
    questionUuid: MessengerUuid; // Вопрос в этом опросе.
    optionUuid: MessengerUuid; // Вариант, для которого загружается страница.
    pageMarker?: string; // Маркер продолжения списка.
    pageLimit?: number; // Запрошенный размер страницы.
    signal?: AbortSignal; // Отмена при смене видимой страницы.
  }): ReturnType<typeof getMessengerPollVoters>;
}

// Публичный доступ к сообщениям для одной сессии.
export interface Messages {
  polls: MessagesPolls; // Команды опроса и чтение страницы голосовавших.
  sendDraft(
    options: Parameters<typeof sendMessengerDraft>[2],
  ): ReturnType<typeof sendMessengerDraft>; // Предлагает версии черновика очереди.
  retryOutgoing(placementUuid: MessengerUuid): Promise<boolean>; // Повтор той же операции доставки.
  dismissOutgoing(placementUuid: MessengerUuid): void; // Удаление локальной строки этой сессии.
  getMessage(messageUuid: MessengerUuid): MessengerMessage | null; // Уже индексированное тело этой сессии.
  getWindow(conversationId: MessengerConversationId): MessageWindowSnapshot; // Стабильный снимок окна.
  // Вызывает обработчик при смене снимка и возвращает функцию отписки.
  subscribeWindow(conversationId: MessengerConversationId, listener: () => void): () => void;
  openWindow(options: OpenWindowOptions): Promise<MessagesOperationResult>; // Кеш и обновление с сервера.
  openAroundMessage(options: OpenAroundMessageOptions): Promise<MessengerMessageWindowOpenResult>; // Ссылка на сообщение.
  openTail(options: OpenTailOptions): Promise<MessengerMessageWindowOpenResult>; // Явный переход в конец.
  loadMore(options: LoadMoreOptions): Promise<MessagesOperationResult>; // Догрузка по границе окна.
}

// Openings are shared by facades of the same model, including its current view generation.
const openingsByOwnerStore = new WeakMap<
  ReturnType<typeof getSelectedWorkspaceMessageStore>,
  Map<MessengerConversationId, { runtimeGeneration: number }>
>();

function getPendingWindowOpenings(store: ReturnType<typeof getSelectedWorkspaceMessageStore>) {
  let openings = openingsByOwnerStore.get(store);
  if (openings == null) {
    openings = new Map();
    openingsByOwnerStore.set(store, openings);
  }
  return openings;
}

// Realtime может обновить общий словарь без изменений в текущем окне. Сравниваем
// порядок и ссылки сообщений, чтобы сохранить прежний массив для подписчиков.
function sameMessages(
  previous: readonly MessengerMessage[],
  current: readonly MessengerMessage[],
): boolean {
  return (
    previous === current ||
    (previous.length === current.length &&
      current.every((message, index) => message === previous[index]))
  );
}

// Создаёт доступ к общему хранилищу для владельца и поколения текущей сессии.
export function createMessages({
  runtimeContext,
  getRuntimeContext,
}: {
  runtimeContext: WorkspaceRuntimeContext; // Контекст сессии при создании фасада.
  getRuntimeContext: WorkspaceRuntimeContextGetter; // Текущая сессия для проверки актуальности.
}): Messages {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const store = getWorkspaceMessageStoreForOwner(ownerKey) ?? getSelectedWorkspaceMessageStore();
  const pendingWindowOpenings = getPendingWindowOpenings(store);
  const snapshots = new Map<MessengerConversationId, MessageWindowSnapshot>();
  // Сессия и хранилище могут переключиться в разное время. Проверяем владельца обоих.
  const getOwnedRuntimeContext: WorkspaceRuntimeContextGetter = () =>
    store.getState().ownerKey === ownerKey ? getRuntimeContext() : null;

  function getWindow(conversationId: MessengerConversationId): MessageWindowSnapshot {
    if (!isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getOwnedRuntimeContext)) {
      snapshots.delete(conversationId);
      return EMPTY_MESSAGE_WINDOW;
    }

    const state = store.getState();
    const window = selectWorkspaceConversationWindow(state, conversationId);
    const status = selectWorkspaceMessageStatusForConversation(state, conversationId);
    const selected = selectWorkspaceMessagesForConversation(state, conversationId);
    const previous = snapshots.get(conversationId);
    const messages =
      previous != null && sameMessages(previous.messages, selected) ? previous.messages : selected;
    const mode = window?.mode ?? null;
    const hasOlder = status.hasMore;
    const hasNewer = window?.afterPageMarker != null;
    if (
      previous?.messages === messages &&
      previous.mode === mode &&
      previous.loading === status.loading &&
      previous.error === status.error &&
      previous.hasOlder === hasOlder &&
      previous.hasNewer === hasNewer
    ) {
      return previous;
    }

    const snapshot = {
      messages,
      mode,
      loading: status.loading,
      error: status.error,
      hasOlder,
      hasNewer,
    };
    snapshots.set(conversationId, snapshot);
    return snapshot;
  }

  // Проверяет, осталась ли операция актуальной для сессии и текущего просмотра.
  function unavailableReason(signal: AbortSignal): UnavailableReason | null {
    if (signal.aborted) return "cancelled";
    if (!isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getOwnedRuntimeContext))
      return "stale-owner";
    return null;
  }

  // Прямой URL может появиться до того, как shell установит владельца message store.
  function waitForMessageStore(
    signal: AbortSignal,
    isRequestCurrent: () => boolean,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const finish = (ready: boolean): void => {
        unsubscribe();
        signal.removeEventListener("abort", onAbort);
        resolve(ready);
      };
      const onAbort = () => finish(false);
      const checkStore = (): void => {
        if (
          signal.aborted ||
          !isRequestCurrent() ||
          !isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getRuntimeContext)
        ) {
          finish(false);
        } else if (store.getState().ownerKey === ownerKey) {
          finish(true);
        }
      };
      const unsubscribe = store.subscribe(checkStore);
      signal.addEventListener("abort", onAbort, { once: true });
      checkStore();
    });
  }

  // Повторно проверяет сессию после ожидания и возвращает итог для вызывающего кода.
  async function toOperationResult(
    request: Promise<MessengerConversationMessagesResult | MessengerMessageWindowPageResult>,
    signal: AbortSignal,
  ): Promise<MessagesOperationResult> {
    const result = await request;
    const unavailable = unavailableReason(signal);
    if (unavailable != null) return { status: "skipped", reason: unavailable };
    if (result.status === "applied") return { status: "applied" };
    if (result.status === "failed") return { status: "failed", error: result.error };
    return {
      status: "skipped",
      reason: result.reason === "missing-context" ? "stale-owner" : result.reason,
    };
  }

  const isRuntimeCurrent = () =>
    isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getRuntimeContext);
  const getOwnedOutgoing = (placementUuid: MessengerUuid) => {
    if (!isRuntimeCurrent()) return null;
    const outgoing =
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[placementUuid];
    return outgoing?.ownerKey === ownerKey ? outgoing : null;
  };

  return {
    polls: {
      mutate: (options) =>
        mutateMessengerPoll({ ...options, runtimeContext, getRuntimeContext, store }),
      getVoters: (options) =>
        getMessengerPollVoters({ ...options, runtimeContext, getRuntimeContext, store }),
    },
    sendDraft: (options) => sendMessengerDraft(runtimeContext, isRuntimeCurrent, options),
    retryOutgoing(placementUuid) {
      return getOwnedOutgoing(placementUuid) == null
        ? Promise.resolve(false)
        : deliverMessengerOutgoingMessage(runtimeContext, placementUuid);
    },
    dismissOutgoing(placementUuid) {
      if (getOwnedOutgoing(placementUuid) != null)
        useMessengerOutboxStore.getState().removeOutgoingMessage(placementUuid);
    },
    getMessage(messageUuid) {
      return isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getOwnedRuntimeContext)
        ? (store.getState().messagesById[messageUuid] ?? null)
        : null;
    },
    getWindow,
    subscribeWindow(conversationId, listener) {
      let previous = getWindow(conversationId);
      return store.subscribe(() => {
        const current = getWindow(conversationId);
        if (previous === current) return;
        previous = current;
        listener();
      });
    },
    async openWindow({
      conversationId,
      signal,
      savedPosition,
      retainCurrentWindow,
      onServerWindowApplied,
    }) {
      const unavailable = unavailableReason(signal);
      if (unavailable != null) return { status: "skipped", reason: unavailable };

      const opening = { runtimeGeneration: runtimeContext.runtimeGeneration };
      pendingWindowOpenings.set(conversationId, opening);
      // Позднее завершение или отмена старого открытия сохраняет запись нового.
      const clearOpening = (): boolean =>
        pendingWindowOpenings.get(conversationId) === opening &&
        pendingWindowOpenings.delete(conversationId);
      signal.addEventListener("abort", clearOpening, { once: true });

      try {
        return await toOperationResult(
          loadMessengerConversationMessages({
            runtimeContext,
            getRuntimeContext: getOwnedRuntimeContext,
            store,
            conversationId,
            signal,
            resolveUnreadBoundary: savedPosition == null,
            openingAnchorUuid: savedPosition?.messageUuid,
            retainCurrentWindow,
            onServerWindowApplied: () => {
              // Догрузка может начаться из callback, пока ещё синхронизируются реакции.
              if (clearOpening() && unavailableReason(signal) == null) onServerWindowApplied?.();
            },
          }),
          signal,
        );
      } finally {
        signal.removeEventListener("abort", clearOpening);
        clearOpening();
      }
    },
    async openAroundMessage({
      messageUuid,
      conversationHint,
      signal,
      isRequestCurrent,
      allowLoadedWindow,
      onResolved,
    }) {
      if (
        store.getState().ownerKey !== ownerKey &&
        !(await waitForMessageStore(signal, isRequestCurrent))
      ) {
        return { status: "skipped", ownerKey, reason: "stale-owner" };
      }
      return openMessengerMessageWindow({
        runtimeContext,
        getRuntimeContext: getOwnedRuntimeContext,
        store,
        messageUuid,
        signal,
        isRequestCurrent,
        target: { mode: "around-anchor", conversationHint, allowLoadedWindow, onResolved },
      });
    },
    openTail({ conversationId, messageUuid, signal, isRequestCurrent }) {
      return openMessengerMessageWindow({
        runtimeContext,
        getRuntimeContext: getOwnedRuntimeContext,
        store,
        messageUuid,
        signal,
        isRequestCurrent,
        target: { mode: "tail", conversationId },
      });
    },
    async loadMore({ conversationId, direction, signal, view }) {
      const unavailable = unavailableReason(signal);
      if (unavailable != null) return { status: "skipped", reason: unavailable };

      // До ответа сервера догрузка с границы предварительного окна прервала бы открытие.
      const opening = pendingWindowOpenings.get(conversationId);
      if (opening?.runtimeGeneration === runtimeContext.runtimeGeneration)
        return { status: "skipped", reason: "busy" };

      const state = store.getState();
      const window = selectWorkspaceConversationWindow(state, conversationId);
      const boundary = captureWorkspaceConversationWindowBoundary(window, direction);
      if (window == null || boundary == null) return { status: "skipped", reason: "no-boundary" };
      if (selectWorkspaceMessageStatusForConversation(state, conversationId).loading)
        return { status: "skipped", reason: "busy" };

      const options = {
        runtimeContext,
        getRuntimeContext: getOwnedRuntimeContext,
        store,
        conversationId,
        boundary,
        signal,
      };
      // Оба загрузчика получают снимок одной стороны до запуска асинхронных действий.
      const request =
        window.mode === "around-anchor" || direction === "after" || view === "message-anchor"
          ? loadMessengerMessageWindowPage(options)
          : loadMessengerConversationMessages(options);
      return toOperationResult(request, signal);
    },
  };
}
