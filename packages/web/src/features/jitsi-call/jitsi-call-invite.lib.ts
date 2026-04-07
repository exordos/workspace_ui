import type { ZulipRawMessage } from "~/shared/api/zulip";
import { getJitsiMeetingUrl, parseJitsiUrl } from "~/shared/lib/jitsi";
import { parseJitsiMeetingUrlLoose } from "./jitsi-call-url.lib";
import type { IncomingDmCallInvite } from "./jitsi-call.model";

const DM_ROOM_PREFIX = "zulip-dm-";

function isOneToOneDmForCurrentUser(message: ZulipRawMessage, currentUserId: number): boolean {
  if (!Array.isArray(message.display_recipient)) return false;
  const participantIds = message.display_recipient
    .map((recipient) => recipient.id)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (participantIds.length !== 2) return false;
  return participantIds.includes(currentUserId);
}

/**
 * Извлекает входящее приглашение в звонок только для 1:1 DM.
 * Возвращает null, если событие не подходит под сценарий входящего звонка.
 */
export function resolveIncomingDmCallInvite(
  message: ZulipRawMessage,
  currentUserId: number | null,
): IncomingDmCallInvite | null {
  if (currentUserId == null) return null;
  if (message.type !== "private") return null;
  if (message.sender_id === currentUserId) return null;
  if (!isOneToOneDmForCurrentUser(message, currentUserId)) return null;

  const meetingUrl = getJitsiMeetingUrl(message.content);
  if (meetingUrl == null) return null;

  const parsed = parseJitsiUrl(meetingUrl) ?? parseJitsiMeetingUrlLoose(meetingUrl);
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
