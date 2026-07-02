import type {
  MessengerConversation,
  MessengerStream,
  MessengerUuid,
  WorkspaceConversationUiKind,
} from "./messenger.types";

interface WorkspaceConversationUiKindInput {
  isPrivate: boolean;
  directUserUuid?: MessengerUuid | null;
}

function resolveWorkspaceConversationUiKind(
  input: WorkspaceConversationUiKindInput,
): WorkspaceConversationUiKind {
  // Одной приватности недостаточно, чтобы считать стрим личным диалогом.
  // Сервер помечает личные чаты связкой private + directUserUuid; без обоих признаков UI должен
  // сохранять поведение канала, а не угадывать тип по сырым полям ответа.
  return input.isPrivate === true && input.directUserUuid != null ? "directPrivate" : "channel";
}

export function selectWorkspaceStreamConversationUiKind(
  stream: Pick<MessengerStream, "isPrivate" | "directUserUuid">,
): WorkspaceConversationUiKind {
  return resolveWorkspaceConversationUiKind(stream);
}

export function selectWorkspaceConversationUiKind(
  conversation: Pick<MessengerConversation, "isPrivate" | "directUserUuid">,
): WorkspaceConversationUiKind {
  return resolveWorkspaceConversationUiKind(conversation);
}
