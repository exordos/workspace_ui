import type { MessengerMessage, MessengerStream } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import type { UsersById } from "~/entities/user/user.types";
import { getJitsiMeetingUrl } from "~/shared/lib/jitsi";
import type { IncomingDmCallInvite } from "./jitsi-call.model";

interface BuildWorkspaceIncomingDmCallInviteInput {
  ownerKey: string;
  message: MessengerMessage;
  stream: MessengerStream | null | undefined;
  usersById: UsersById;
  currentUserUuid: string;
  currentUserDisplayName: string;
  meetUrl: string | null | undefined;
}

function trimToOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function resolveCallerName(
  message: MessengerMessage,
  stream: MessengerStream,
  usersById: UsersById,
): string {
  const author = usersById[message.authorUuid];
  const displayName = selectUserDisplayName(author, "").trim();
  if (displayName.length > 0) return displayName;

  const streamName = stream.name.trim();
  if (streamName.length > 0) return streamName;

  return message.authorUuid.trim().slice(0, 8);
}

export function buildWorkspaceIncomingDmCallInvite(
  input: BuildWorkspaceIncomingDmCallInviteInput,
): IncomingDmCallInvite | null {
  if (
    input.message.read ||
    input.message.isOwn ||
    input.message.authorUuid === input.currentUserUuid
  ) {
    return null;
  }

  const stream = input.stream;
  if (stream == null || !stream.isPrivate || stream.directUserUuid == null) {
    return null;
  }

  const meetingUrl = getJitsiMeetingUrl(input.message.payload.content, {
    serverBaseUrl: input.meetUrl,
  });
  if (meetingUrl == null) {
    return null;
  }

  const caller = input.usersById[input.message.authorUuid];
  return {
    messageId: input.message.uuid,
    meetingUrl,
    callerName: resolveCallerName(input.message, stream, input.usersById),
    locationName: stream.name.trim(),
    ownerKey: input.ownerKey,
    meetUrl: trimToOptional(input.meetUrl) ?? undefined,
    displayName: trimToOptional(input.currentUserDisplayName) ?? undefined,
    avatarUrl: trimToOptional(caller?.avatarUrl) ?? undefined,
    timestamp: Date.parse(input.message.createdAt) || Date.now(),
  };
}
