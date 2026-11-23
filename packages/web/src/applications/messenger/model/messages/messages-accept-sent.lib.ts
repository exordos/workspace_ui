import { isLaterMessageTimestamp } from "~/shared/lib/workspace-messenger-message-time";
import { useMessengerStore } from "../chats/messenger.model";
import { conversationIdForStream } from "../messenger-ids.lib";
import { applyMessengerReadBoundary } from "./messenger-read-boundary.lib";
import type { WorkspaceMessageStoreState } from "./message.model";
import type { AppliedServerMessages } from "./messages-server-state.lib";
import type { MessengerConversationId, MessengerMessage } from "../messenger.types";

// Запись канонического тела и указателей в кеш после успешной отправки.
export interface MessengerMessageActionCacheConversationPage {
  messages: readonly MessengerMessage[]; // Канонические сообщения из активного store.
  source: "message-action"; // Источник обновления кеша.
}

// Существующий контракт записи в кеш с проверкой на момент коммита.
export type SentMessageCacheWriter = (
  ownerKey: string,
  conversationId: MessengerConversationId,
  page: MessengerMessageActionCacheConversationPage,
  isWriteCurrent?: () => boolean,
) => Promise<void> | void;

// Снимок store для согласования результата отправки с realtime и историей.
type SentMessageStoreState = Pick<
  WorkspaceMessageStoreState,
  | "ownerKey"
  | "messagesById"
  | "messageMutationRevisionById"
  | "deletedMessageRevisionById"
  | "applyLiveCreatedMessage"
>;

// Ответ POST уже проверен транспортом, включая протокол E2EE и актуальность ключа.
interface SentMessageAcceptance {
  ownerKey: string; // Владелец операции, очереди и кеша.
  isCurrent: () => boolean; // Проверка сессии, отмены и специфичных условий транспорта.
  message: MessengerMessage; // Исходный серверный ответ для подтверждения доставки.
  capturedMutationRevision: number; // Ревизия изменений перед POST.
  store: { getState: () => SentMessageStoreState }; // Активные сообщения и окна.
  messengerStore?: Pick<typeof useMessengerStore, "getState">; // Каталог для обновления указателей.
  includeStreamConversation: boolean; // Запись также относится к окну стрима.
  writePage?: SentMessageCacheWriter; // Отложенное сохранение при наличии кеша.
}

// Сохраняет сообщение и указатели только пока этот снимок актуален.
async function persistSentMessage(
  ownerKey: string,
  message: MessengerMessage,
  includeStreamConversation: boolean,
  isCurrent: () => boolean,
  writePage: SentMessageCacheWriter | undefined,
): Promise<void> {
  if (writePage == null) return;
  const conversationIds = [message.conversationId];
  const streamConversationId = conversationIdForStream(message.streamUuid);
  if (includeStreamConversation && streamConversationId !== message.conversationId) {
    conversationIds.push(streamConversationId);
  }
  try {
    await Promise.all(
      conversationIds.map((conversationId) =>
        isCurrent()
          ? Promise.resolve(
              writePage(
                ownerKey,
                conversationId,
                { messages: [message], source: "message-action" },
                isCurrent,
              ),
            )
          : Promise.resolve(),
      ),
    );
  } catch {
    // Сбой кеша не меняет подтверждённый результат отправки.
  }
}

// Применяет тело отправленного сообщения и подготавливает его проекции.
export function applySentMessage({
  ownerKey,
  isCurrent,
  message,
  capturedMutationRevision,
  store,
  messengerStore = useMessengerStore,
  includeStreamConversation,
  writePage,
}: SentMessageAcceptance): AppliedServerMessages {
  const initial = store.getState();
  const previous = initial.messagesById[message.uuid];
  const hasNewerBody =
    previous != null &&
    ((initial.messageMutationRevisionById[message.uuid] ?? 0) > capturedMutationRevision ||
      isLaterMessageTimestamp(previous.updatedAt, message.updatedAt));
  // События после начала POST и история с более поздним телом выигрывают у снимка отправки.
  const mayApplyBody = initial.deletedMessageRevisionById[message.uuid] == null && !hasNewerBody;
  if (mayApplyBody) {
    // Уведомление о неизвестном сообщении резервирует ревизию без серверного тела.
    initial.applyLiveCreatedMessage(applyMessengerReadBoundary(message, ownerKey));
  }
  const afterApply = store.getState();
  const indexed = mayApplyBody ? afterApply.messagesById[message.uuid] : undefined;
  const indexedRevision = afterApply.messageMutationRevisionById[message.uuid];
  const applied: AppliedServerMessages = { status: "applied", evidence: [message] };
  if (indexed?.conversationId !== message.conversationId) return applied;

  // Локальные реакции могут заменить объект, не меняя сохраняемое серверное тело.
  const isBodyCurrent = () => {
    if (!isCurrent()) return false;
    const state = store.getState();
    const current = state.messagesById[message.uuid];
    return (
      current?.conversationId === indexed.conversationId &&
      state.messageMutationRevisionById[message.uuid] === indexedRevision &&
      current.payload === indexed.payload &&
      current.pollState === indexed.pollState &&
      current.updatedAt === indexed.updatedAt &&
      current.read === indexed.read &&
      current.starred === indexed.starred &&
      current.pinned === indexed.pinned
    );
  };
  return {
    ...applied,
    project: () => {
      if (!isBodyCurrent()) return;
      messengerStore
        .getState()
        .applyMessagePointer(ownerKey, indexed, store.getState().messagesById);
    },
    persist: () => {
      void persistSentMessage(
        ownerKey,
        indexed,
        includeStreamConversation,
        isBodyCurrent,
        writePage,
      );
    },
  };
}
