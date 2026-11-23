import {
  selectWorkspaceConversationWindow,
  selectWorkspaceMessagesForConversation,
  selectWorkspaceMessageStatusForConversation,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerPollAction } from "~/shared/api/messenger-messages.api";
import {
  loadMessengerConversationMessages,
  loadMessengerMessageWindowPage,
} from "./messenger-messages-loader.lib";
import { getMessengerPollVoters, mutateMessengerPoll } from "./messenger-poll-actions.lib";
import type {
  MessengerConversationMessagesResult,
  MessengerMessageWindowPageResult,
} from "./messenger-messages-loader.lib";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

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

// Параметры добавления страницы к текущему окну.
interface LoadMoreOptions {
  conversationId: MessengerConversationId; // Разговор, из окна которого берём маркер.
  direction: "before"; // Догрузка сверху, к более старым сообщениям.
  signal: AbortSignal; // Отмена при уходе из текущего окна.
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
      // no-boundary — у окна сейчас нет границы сверху.
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
  getWindow(conversationId: MessengerConversationId): MessageWindowSnapshot; // Стабильный снимок окна.
  // Вызывает обработчик при смене снимка и возвращает функцию отписки.
  subscribeWindow(conversationId: MessengerConversationId, listener: () => void): () => void;
  openWindow(options: OpenWindowOptions): Promise<MessagesOperationResult>; // Кеш и обновление с сервера.
  loadMore(options: LoadMoreOptions): Promise<MessagesOperationResult>; // Догрузка по границе окна.
}

// Все фасады общего хранилища учитывают одно текущее открытие на разговор.
const pendingWindowOpenings = new Map<
  MessengerConversationId,
  { ownerKey: string; runtimeGeneration: number }
>();

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
  const snapshots = new Map<MessengerConversationId, MessageWindowSnapshot>();
  // Сессия и хранилище могут переключиться в разное время. Проверяем владельца обоих.
  const getOwnedRuntimeContext: WorkspaceRuntimeContextGetter = () =>
    useWorkspaceMessageStore.getState().ownerKey === ownerKey ? getRuntimeContext() : null;

  function getWindow(conversationId: MessengerConversationId): MessageWindowSnapshot {
    if (!isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getOwnedRuntimeContext)) {
      snapshots.delete(conversationId);
      return EMPTY_MESSAGE_WINDOW;
    }

    const state = useWorkspaceMessageStore.getState();
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

  return {
    polls: {
      mutate: (options) => mutateMessengerPoll({ ...options, runtimeContext, getRuntimeContext }),
      getVoters: (options) =>
        getMessengerPollVoters({ ...options, runtimeContext, getRuntimeContext }),
    },
    getWindow,
    subscribeWindow(conversationId, listener) {
      let previous = getWindow(conversationId);
      return useWorkspaceMessageStore.subscribe(() => {
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

      const opening = { ownerKey, runtimeGeneration: runtimeContext.runtimeGeneration };
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
    async loadMore({ conversationId, direction, signal }) {
      const unavailable = unavailableReason(signal);
      if (unavailable != null) return { status: "skipped", reason: unavailable };

      // До ответа сервера догрузка с границы предварительного окна прервала бы открытие.
      const opening = pendingWindowOpenings.get(conversationId);
      if (
        opening?.ownerKey === ownerKey &&
        opening.runtimeGeneration === runtimeContext.runtimeGeneration
      )
        return { status: "skipped", reason: "busy" };

      const state = useWorkspaceMessageStore.getState();
      const window = selectWorkspaceConversationWindow(state, conversationId);
      if (window?.beforePageMarker == null) return { status: "skipped", reason: "no-boundary" };
      if (selectWorkspaceMessageStatusForConversation(state, conversationId).loading)
        return { status: "skipped", reason: "busy" };

      const options = {
        runtimeContext,
        getRuntimeContext: getOwnedRuntimeContext,
        conversationId,
        pageMarker: window.beforePageMarker,
        signal,
      };
      // Загрузчику окна вокруг сообщения передаём его ревизию для проверки ответа.
      const request =
        window.mode === "around-anchor"
          ? loadMessengerMessageWindowPage({
              ...options,
              direction,
              expectedRevision: window.revision,
            })
          : loadMessengerConversationMessages(options);
      return toOperationResult(request, signal);
    },
  };
}
