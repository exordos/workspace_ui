import {
  compareUserIds,
  isUserIdentityReady,
  userIdStorageKey,
  type UserId,
} from "~/shared/lib/user-id.lib";

export interface ResolveCallMessageTargetParamsInput {
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeStream: string | null;
  activeStreamUuid: string | null;
  activeTopic: string | null;
  activeTopicUuid: string | null;
}

export type CallMessageTargetParams =
  | {
      mode: "dm";
      to: UserId[];
      streamUuid: string;
    }
  | {
      mode: "stream";
      stream: string;
      streamUuid: string;
      subject: string;
      topicUuid?: string;
    };

export interface BuildCallRoomNameInput {
  target: CallMessageTargetParams;
  currentUserId: UserId | null;
  chatLabel?: string | null;
  nowMs?: number;
}

export interface CanStartCallFromHeaderInput {
  target: CallMessageTargetParams | null;
  currentUserId: UserId | null;
}

const DEFAULT_TOPIC = "";
const NON_ROOM_SYMBOLS = /[^\p{L}\p{N}-]+/gu;

function normalizeDmUserIds(userIds: UserId[] | null): UserId[] {
  if (userIds == null || userIds.length === 0) {
    return [];
  }
  const byKey = new Map<string, UserId>();
  for (const userId of userIds) {
    if (!isUserIdentityReady(userId)) {
      return [];
    }
    byKey.set(userIdStorageKey(userId), userId);
  }
  return Array.from(byKey.values()).sort(compareUserIds);
}

function sanitizeRoomSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(NON_ROOM_SYMBOLS, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized : "room";
}

export function resolveCallMessageTargetParams(
  input: ResolveCallMessageTargetParamsInput,
): CallMessageTargetParams | null {
  if (input.isDmView) {
    const normalizedRecipientIds = normalizeDmUserIds(input.activeDmUserIds);
    const streamUuid = input.activeStreamUuid?.trim();
    if (normalizedRecipientIds.length === 0 || streamUuid == null || streamUuid.length === 0) {
      return null;
    }
    return {
      mode: "dm",
      to: normalizedRecipientIds,
      streamUuid,
    };
  }

  const streamName = input.activeStream?.trim();
  const streamUuid = input.activeStreamUuid?.trim();
  if (
    streamName == null ||
    streamName.length === 0 ||
    streamUuid == null ||
    streamUuid.length === 0
  ) {
    return null;
  }

  const topic = input.activeTopic?.trim();
  return {
    mode: "stream",
    stream: streamName,
    streamUuid,
    subject: topic != null && topic.length > 0 ? topic : DEFAULT_TOPIC,
    ...(input.activeTopicUuid != null ? { topicUuid: input.activeTopicUuid } : {}),
  };
}

export function buildCallRoomName(input: BuildCallRoomNameInput): string {
  const nowMs = input.nowMs ?? Date.now();
  const trimmedChatLabel = input.chatLabel?.trim();
  const chatLabelPart =
    trimmedChatLabel != null && trimmedChatLabel.length > 0
      ? sanitizeRoomSegment(trimmedChatLabel)
      : null;
  if (input.target.mode === "dm") {
    const byKey = new Map<string, UserId>();
    for (const userId of input.target.to) {
      byKey.set(userIdStorageKey(userId), userId);
    }
    if (input.currentUserId != null) {
      byKey.set(userIdStorageKey(input.currentUserId), input.currentUserId);
    }
    const sortedParticipantIds = Array.from(byKey.values()).sort(compareUserIds);
    const participantFallback =
      sortedParticipantIds.length > 0
        ? sortedParticipantIds.map(userIdStorageKey).join("-")
        : "chat";
    const dmRoomPart = chatLabelPart ?? participantFallback;
    return `messenger-dm-${dmRoomPart}-${nowMs}`;
  }

  const streamPart = sanitizeRoomSegment(input.target.stream);
  const topicPart = sanitizeRoomSegment(input.target.subject);
  return `messenger-stream-${streamPart}-${topicPart}-${nowMs}`;
}

export function canStartCallFromHeader(input: CanStartCallFromHeaderInput): boolean {
  if (input.target == null) {
    return false;
  }
  return isUserIdentityReady(input.currentUserId);
}
