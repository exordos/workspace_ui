import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { getJitsiMeetingUrl, parseJitsiUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import { isMessageFromCurrentUser } from "~/shared/lib/message-author.lib";
import { isUserIdentityReady, userIdsEqual, type UserId } from "~/shared/lib/user-id.lib";
import { parseJitsiMeetingUrlLoose } from "./jitsi-call-url.lib";
import type { IncomingDmCallInvite } from "./jitsi-call.model";

const DM_ROOM_PREFIX = "messenger-dm-";

function isOneToOneDmForCurrentUser(message: WorkspaceRawMessage, currentUserId: UserId): boolean {
  if (!Array.isArray(message.display_recipient)) return false;
  const participantIds = message.display_recipient
    .map((recipient) => recipient.id)
    .filter(isUserIdentityReady);
  if (participantIds.length !== 2) return false;
  return participantIds.some((id) => userIdsEqual(id, currentUserId));
}

/**
 * Resolves an incoming call invite for 1:1 DMs only.
 * Returns null when the event is not an incoming call scenario.
 */
export function resolveIncomingDmCallInvite(
  message: WorkspaceRawMessage,
  currentUserId: UserId | null,
  jitsiLinkOptions?: JitsiLinkOptions,
): IncomingDmCallInvite | null {
  if (currentUserId == null || !isUserIdentityReady(currentUserId)) return null;
  if (message.type !== "private") return null;
  if (isMessageFromCurrentUser(message, currentUserId)) return null;
  if (!isOneToOneDmForCurrentUser(message, currentUserId)) return null;

  const meetingUrl = getJitsiMeetingUrl(message.content, jitsiLinkOptions);
  if (meetingUrl == null) return null;

  const parsed =
    parseJitsiUrl(meetingUrl, jitsiLinkOptions) ?? parseJitsiMeetingUrlLoose(meetingUrl);
  if (parsed == null) return null;
  if (!parsed.roomName.startsWith(DM_ROOM_PREFIX)) return null;

  const callerName = message.sender_full_name?.trim() ?? "";
  const locationName = callerName.length > 0 ? callerName : "";
  const trimmedAvatarUrl = message.avatar_url?.trim();
  const avatarUrl =
    trimmedAvatarUrl != null && trimmedAvatarUrl.length > 0 ? trimmedAvatarUrl : undefined;
  return {
    messageId: message.id,
    meetingUrl,
    callerName,
    locationName,
    avatarUrl,
    timestamp: message.timestamp,
  };
}
