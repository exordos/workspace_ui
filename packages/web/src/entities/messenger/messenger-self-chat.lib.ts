import type { MessengerStream, MessengerTopic, MessengerUuid } from "./messenger.types";

interface WorkspaceSelfChatCandidate {
  isPrivate: boolean;
  directUserUuid?: MessengerUuid | null;
}

export function isWorkspaceSelfChat(
  candidate: WorkspaceSelfChatCandidate | null | undefined,
  currentUserUuid: MessengerUuid | null | undefined,
): boolean {
  return (
    candidate != null &&
    currentUserUuid != null &&
    candidate.isPrivate &&
    candidate.directUserUuid === currentUserUuid
  );
}

export function findWorkspaceSelfChatStream(input: {
  streamIds: readonly MessengerUuid[];
  streamsById: Readonly<Record<MessengerUuid, MessengerStream>>;
  currentUserUuid: MessengerUuid | null | undefined;
}): MessengerStream | null {
  for (const streamUuid of input.streamIds) {
    const stream = input.streamsById[streamUuid];
    if (stream != null && isWorkspaceSelfChat(stream, input.currentUserUuid)) {
      return stream;
    }
  }
  return null;
}

export function findWorkspaceDefaultTopic(input: {
  topicIds: readonly MessengerUuid[];
  topicsById: Readonly<Record<MessengerUuid, MessengerTopic>>;
  streamUuid: MessengerUuid;
}): MessengerTopic | null {
  for (const topicUuid of input.topicIds) {
    const topic = input.topicsById[topicUuid];
    if (topic?.streamUuid === input.streamUuid && topic.isDefault) {
      return topic;
    }
  }
  return null;
}
