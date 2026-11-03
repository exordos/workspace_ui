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

const directStreamGroups = new WeakMap<
  Readonly<Record<string, MessengerStream>>,
  Map<string, string[]>
>();

/** Visible direct streams share a person, while each topic keeps its provider route. */
export function selectWorkspaceDirectStreamUuids(
  streamsById: Readonly<Record<string, MessengerStream>>,
  streamUuid: string,
  currentUserUuid: string | null,
): string[] {
  const selected = streamsById[streamUuid];
  if (
    selected == null ||
    !selected.isPrivate ||
    selected.directUserUuid == null ||
    selected.encryption
  )
    return [streamUuid];
  const viewer = currentUserUuid ?? selected.userUuid;
  if (selected.userUuid !== viewer) return [streamUuid];
  let groups = directStreamGroups.get(streamsById);
  if (groups == null) {
    groups = new Map();
    for (const stream of Object.values(streamsById)) {
      if (
        !stream.isPrivate ||
        stream.encryption ||
        stream.isArchived ||
        stream.directUserUuid == null
      )
        continue;
      const key = `${stream.projectId}:${stream.userUuid}:${stream.directUserUuid}`;
      const group = groups.get(key);
      if (group == null) groups.set(key, [stream.uuid]);
      else group.push(stream.uuid);
    }
    directStreamGroups.set(streamsById, groups);
  }
  return [...(groups.get(`${selected.projectId}:${viewer}:${selected.directUserUuid}`) ?? [])];
}
