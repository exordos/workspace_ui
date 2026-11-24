import { isLaterMessageTimestamp } from "~/shared/lib/workspace-messenger-message-time";
import { getSelectedWorkspaceMessageStore } from "./message.model";
import type { AppliedServerMessages } from "./messages-server-state.lib";
import type { MessengerMessage, MessengerUuid } from "../messenger.types";

// Вход активного realtime. Сообщения уже нормализованы, пачка приходит из проверенного буфера.
type AcceptActiveCreatedMessagesInput = {
  ownerKey: string; // Владелец сообщений и исходящих операций.
  isCurrent: () => boolean; // Проверка владельца, поколения и отмены на момент записи.
  store?: ReturnType<typeof getSelectedWorkspaceMessageStore>;
  // Каталог обновляет указатели по снимку тел, который соответствует режиму приёма.
  updatePointers: (
    messages: readonly MessengerMessage[],
    messagesById: Readonly<Record<MessengerUuid, MessengerMessage>>,
  ) => void;
} & (
  | { mode: "single"; messages: readonly [MessengerMessage] }
  | { mode: "batch"; messages: readonly MessengerMessage[] }
);

// Каноническое сообщение могло быть отредактировано или перенесено после создания.
function conflictsWithKnownBody(
  known: MessengerMessage | undefined,
  incoming: MessengerMessage,
): boolean {
  return (
    known != null &&
    (known.conversationId !== incoming.conversationId ||
      isLaterMessageTimestamp(known.updatedAt, incoming.updatedAt))
  );
}

// Применяет актуальные тела, сохраняя исходные события как подтверждения доставки.
export function applyActiveCreatedMessages({
  mode,
  messages,
  updatePointers,
  store: ownerStore = getSelectedWorkspaceMessageStore(),
}: AcceptActiveCreatedMessagesInput): AppliedServerMessages & {
  currentMessages: () => readonly MessengerMessage[]; // Тела, которые допустимо проецировать и кешировать.
} {
  const store = ownerStore.getState();
  const newestById = new Map<MessengerUuid, MessengerMessage>();
  for (const message of messages) {
    const known = newestById.get(message.uuid) ?? store.messagesById[message.uuid];
    if (
      store.deletedMessageRevisionById[message.uuid] != null ||
      conflictsWithKnownBody(known, message)
    )
      continue;
    newestById.set(message.uuid, message);
  }
  const accepted = [...newestById.values()];
  if (mode === "batch") store.applyLiveCreatedMessages(accepted);
  else if (accepted[0] != null) store.applyLiveCreatedMessage(accepted[0]);

  const currentMessages = () => {
    const current = ownerStore.getState();
    return accepted.filter((message) => {
      const known = current.messagesById[message.uuid];
      return known != null && !conflictsWithKnownBody(known, message);
    });
  };
  return {
    status: "applied",
    evidence: messages,
    currentMessages,
    project: () => {
      const current = currentMessages();
      if (current.length === 0) return;
      // Одиночный указатель использует снимок до записи, пакет видит тела всей пачки.
      updatePointers(
        current,
        mode === "single" ? store.messagesById : ownerStore.getState().messagesById,
      );
    },
  };
}
