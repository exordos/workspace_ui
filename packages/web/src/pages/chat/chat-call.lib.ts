export interface ResolveCallMessageTargetParamsInput {
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStream: string | null;
  activeStreamId: number | null;
  activeTopic: string | null;
}

export type CallMessageTargetParams =
  | {
      mode: "dm";
      to: number[];
    }
  | {
      mode: "stream";
      stream: string;
      streamId?: number;
      subject: string;
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

const GENERAL_TOPIC = "general";
const NON_ROOM_SYMBOLS = /[^\p{L}\p{N}-]+/gu;

function normalizeDmUserIds(userIds: number[] | null): number[] {
  if (userIds == null || userIds.length === 0) {
    return [];
  }
  const normalized = [...new Set(userIds)];
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
    if (normalizedRecipientIds.length === 0) {
      return null;
    }
    return {
      mode: "dm",
      to: normalizedRecipientIds,
    };
  }

  const streamName = input.activeStream?.trim();
  if (streamName == null || streamName.length === 0) {
    return null;
  }

  const topic = input.activeTopic?.trim();
  return {
    mode: "stream",
    stream: streamName,
    streamId: input.activeStreamId ?? undefined,
    subject: topic != null && topic.length > 0 ? topic : GENERAL_TOPIC,
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
    return `zulip-dm-${dmRoomPart}-${nowMs}`;
  }

  const streamPart = sanitizeRoomSegment(input.target.stream);
  const topicPart = sanitizeRoomSegment(input.target.subject);
  return `zulip-stream-${streamPart}-${topicPart}-${nowMs}`;
}

export function canStartCallFromHeader(input: CanStartCallFromHeaderInput): boolean {
  if (input.target == null) {
    return false;
  }
  return Number.isInteger(input.currentUserId) && (input.currentUserId ?? 0) > 0;
}
