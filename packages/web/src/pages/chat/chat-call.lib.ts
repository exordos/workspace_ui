import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

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
      to: number[];
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
  currentUserId: number | null;
  chatLabel?: string | null;
  nowMs?: number;
}

export interface CanStartCallFromHeaderInput {
  target: CallMessageTargetParams | null;
  currentUserId: number | null;
}

const DEFAULT_TOPIC = "";
const NON_ROOM_SYMBOLS = /[^\p{L}\p{N}-]+/gu;

function normalizeDmUserIds(userIds: UserId[] | null): number[] {
  if (userIds == null || userIds.length === 0) {
    return [];
  }
  const normalized = [...new Set(userIds.map((userId) => numericUserIdOrNull(userId)))].filter(
    (userId): userId is number => userId != null,
  );
  const hasInvalidId = normalized.some((id) => !Number.isInteger(id) || id <= 0);
  if (hasInvalidId) {
    return [];
  }
  return normalized.sort((a, b) => a - b);
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
    const currentUserId =
      input.currentUserId != null &&
      Number.isInteger(input.currentUserId) &&
      input.currentUserId > 0
        ? input.currentUserId
        : null;
    const sortedParticipantIds = [
      ...input.target.to,
      ...(currentUserId != null ? [currentUserId] : []),
    ]
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .sort((a, b) => a - b);
    const participantFallback =
      sortedParticipantIds.length > 0 ? sortedParticipantIds.join("-") : "chat";
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
  return Number.isInteger(input.currentUserId) && (input.currentUserId ?? 0) > 0;
}
