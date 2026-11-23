import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
  type WorkspaceRuntimeContextGetter,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  applyMessengerMessageWindow,
  conversationContainsAnchor,
  fetchMessengerMessageWindow,
  resolveMessengerMessageAnchor,
  type MessengerMessageAnchorResolveResult,
  type MessengerMessagesStoreApi,
  type MessengerMessageWindowApplyResult,
  type MessengerMessageWindowFetchResult,
} from "./messenger-messages-loader.lib";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

// Низкоуровневые операции, из которых собирается открытие окна по точному UUID.
export interface MessengerMessageWindowOpenLoaders {
  resolveAnchor: typeof resolveMessengerMessageAnchor; // Проверяет доступ и получает последнее тело.
  fetchWindow: typeof fetchMessengerMessageWindow; // Загружает страницы по подтверждённому размещению.
  applyWindow: typeof applyMessengerMessageWindow; // Применяет окно для текущего намерения.
}

// Возможные результаты операции без промежуточного состояния загрузчика.
export type MessengerMessageWindowOpenResult =
  | MessengerMessageWindowApplyResult
  | Exclude<MessengerMessageAnchorResolveResult, { status: "resolved" }>
  | Exclude<MessengerMessageWindowFetchResult, { status: "fetched" }>;

// Открытие ссылки допускает исправление размещения, переход в хвост привязан к разговору.
type MessengerMessageWindowOpenTarget =
  | {
      mode: "around-anchor";
      conversationHint: MessengerConversationId | null; // Разговор из ссылки или текущей строки.
      allowLoadedWindow?: boolean; // После проверки размещения разрешено использовать готовое окно.
      onResolved?: (
        conversationId: MessengerConversationId,
        message: MessengerMessage,
        usesLoadedWindow: boolean,
      ) => void; // Готово тело предварительного показа.
    }
  | { mode: "tail"; conversationId: MessengerConversationId }; // Разговор, чей хвост ожидает читатель.

// Один запрос открытия с внешним жизненным циклом намерения.
interface OpenMessengerMessageWindowOptions {
  runtimeContext: WorkspaceRuntimeContext; // Сессия, в которой открывают сообщение.
  getRuntimeContext: WorkspaceRuntimeContextGetter; // Актуальная сессия на границах запроса.
  messageUuid: MessengerUuid; // Точное сообщение или последний известный UUID разговора.
  signal: AbortSignal; // Отмена намерения просмотра.
  isRequestCurrent: () => boolean; // Проверка токена намерения перед записью.
  target: MessengerMessageWindowOpenTarget; // Режим и выбор размещения.
  loaders?: MessengerMessageWindowOpenLoaders; // Подмена транспорта в проверках жизненного цикла.
  store?: MessengerMessagesStoreApi; // Хранилище тел и окон.
}

// Выбирает подтверждённое размещение и сохраняет действительную подсказку из ссылки.
function targetConversationForAnchor(
  target: MessengerMessageWindowOpenTarget,
  message: MessengerMessage,
): MessengerConversationId {
  if (target.mode === "tail") return target.conversationId;
  const hint = target.conversationHint;
  return hint != null && conversationContainsAnchor(hint, message) ? hint : message.conversationId;
}

// Разрешает размещение, публикует доступное превью и применяет окно с одним повтором.
export async function openMessengerMessageWindow({
  runtimeContext,
  getRuntimeContext,
  messageUuid,
  signal,
  isRequestCurrent,
  target,
  loaders = {
    resolveAnchor: resolveMessengerMessageAnchor,
    fetchWindow: fetchMessengerMessageWindow,
    applyWindow: applyMessengerMessageWindow,
  },
  store = useWorkspaceMessageStore,
}: OpenMessengerMessageWindowOptions): Promise<MessengerMessageWindowOpenResult> {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const isCurrent = () =>
    isRequestCurrent() &&
    !isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal);
  const stale = { status: "skipped", ownerKey, reason: "stale-owner" } as const;
  const staleWindow = { status: "skipped", ownerKey, reason: "stale-window" } as const;
  if (!isCurrent()) return stale;

  const request = {
    runtimeContext,
    getRuntimeContext: () => (isRequestCurrent() ? getRuntimeContext() : null),
    signal,
    store,
  };
  const resolved = await loaders.resolveAnchor({ ...request, messageUuid });
  if (!isCurrent()) return stale;
  if (resolved.status !== "resolved") return resolved;

  // Одна попытка загрузки и применения окна. Повтор выбирает новое размещение и ревизию.
  async function loadWindowOnce(
    anchor: Extract<MessengerMessageAnchorResolveResult, { status: "resolved" }>,
    conversationId: MessengerConversationId,
  ): Promise<MessengerMessageWindowOpenResult> {
    if (!isCurrent()) return stale;
    const fetched = await loaders.fetchWindow({
      ...request,
      anchor,
      targetConversationId: conversationId,
    });
    if (!isCurrent()) return stale;
    const latestMessage = store.getState().messagesById[messageUuid];
    // Маркер старой темы может дать 404, если realtime уже сообщил новое размещение.
    if (
      target.mode === "around-anchor" &&
      latestMessage != null &&
      !conversationContainsAnchor(conversationId, latestMessage)
    ) {
      return staleWindow;
    }
    if (fetched.status !== "fetched") return fetched;

    const applied = await loaders.applyWindow({
      ...request,
      window: fetched.window,
      mode: target.mode,
      isRequestCurrent: isCurrent,
    });
    return isCurrent() ? applied : stale;
  }

  let publishedConversation: MessengerConversationId | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = store.getState();
    const currentMessage = state.messagesById[messageUuid];
    if (currentMessage == null && state.deletedMessageRevisionById[messageUuid] != null)
      return staleWindow;
    const message = currentMessage ?? resolved.message;
    const anchor = { ...resolved, conversationId: message.conversationId, message };
    const conversationId = targetConversationForAnchor(target, message);

    const usesLoadedWindow =
      target.mode === "around-anchor" &&
      target.allowLoadedWindow === true &&
      conversationId === target.conversationHint &&
      state.conversationWindowsById[conversationId]?.messageUuids.includes(messageUuid) === true;
    if (target.mode === "around-anchor" && publishedConversation !== conversationId) {
      publishedConversation = conversationId;
      target.onResolved?.(conversationId, message, usesLoadedWindow);
    }
    if (!isCurrent()) return stale;
    if (usesLoadedWindow)
      return { status: "applied", ownerKey, conversationId, anchorUuid: messageUuid };

    const result = await loadWindowOnce(anchor, conversationId);
    if (result.status !== "skipped" || result.reason !== "stale-window") return result;
  }
  return staleWindow;
}
