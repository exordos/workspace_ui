import {
  getSelectedWorkspaceMessageStore,
  getWorkspaceMessageStoreForOwner,
} from "./message.model";
import { applyActiveCreatedMessages } from "./messages-accept-created.lib";
import { applyConversationHistory } from "./messages-accept-history.lib";
import { applySentMessage } from "./messages-accept-sent.lib";
import { settleMessengerOutgoingMessage } from "./outgoing/messenger-outbox.model";

type HistoryInput = Parameters<typeof applyConversationHistory>[0] & { source: "history" };
type SendInput = Parameters<typeof applySentMessage>[0] & { source: "send-response" };
type CreatedInput = Parameters<typeof applyActiveCreatedMessages>[0] & { source: "realtime" };
type ServerMessagesInput = HistoryInput | SendInput | CreatedInput;
// Запрос или сеанс утратили право на запись.
interface StaleOwner {
  status: "stale-owner";
}

// Тело POST и события, а также окно истории используют разные операции хранилища.
function applyMessages(input: ServerMessagesInput) {
  switch (input.source) {
    case "history":
      return applyConversationHistory(input);
    case "send-response":
      return applySentMessage(input);
    case "realtime":
      return applyActiveCreatedMessages(input);
  }
}

// Принимает сообщения и согласует исходящие для всех активных источников.
export function acceptServerMessages(
  input: HistoryInput,
): ReturnType<typeof applyConversationHistory> | StaleOwner;
export function acceptServerMessages(
  input: SendInput,
): ReturnType<typeof applySentMessage> | StaleOwner;
export function acceptServerMessages(
  input: CreatedInput,
): ReturnType<typeof applyActiveCreatedMessages> | StaleOwner;
export function acceptServerMessages(input: ServerMessagesInput) {
  const scopedInput =
    input.source === "realtime"
      ? {
          ...input,
          store:
            input.store ??
            getWorkspaceMessageStoreForOwner(input.ownerKey) ??
            getSelectedWorkspaceMessageStore(),
        }
      : input;
  const { store } = scopedInput;
  const initialOwner = store.getState().ownerKey;
  const isCurrent = () => input.isCurrent() && store.getState().ownerKey === initialOwner;
  const stale: StaleOwner = { status: "stale-owner" };
  if (!isCurrent() || (initialOwner != null && initialOwner !== input.ownerKey)) return stale;

  const applied = applyMessages({ ...scopedInput, isCurrent });
  if (!isCurrent()) return stale;
  if (applied.status !== "applied") return applied;

  // Пачка realtime публикует указатели по снимку после записи, до уведомления очереди.
  const projectBeforeSettlement = input.source === "realtime" && input.mode === "batch";
  if (projectBeforeSettlement) {
    applied.project?.();
    if (!isCurrent()) return stale;
  }
  for (const message of applied.evidence) {
    if (settleMessengerOutgoingMessage(input.ownerKey, message) && !isCurrent()) return stale;
  }
  if (!projectBeforeSettlement) applied.project?.();
  if (!isCurrent()) return stale;
  applied.persist?.();
  return applied;
}
