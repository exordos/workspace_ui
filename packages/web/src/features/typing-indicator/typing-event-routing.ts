import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
import { buildDmTypingChatKey, buildStreamTypingChatKey } from "./typing-key";

interface ResolveTypingEventRouteInput {
  op?: string;
  messageType?: string;
  senderUserId?: number;
  recipients?: { user_id: number }[];
  streamId?: number;
  topic?: string;
  currentUserId: UserId | null;
}

interface TypingRoute {
  chatKey: string;
  userId: number;
  isTyping: boolean;
}

function isValidTypingOp(op: string | undefined): op is "start" | "stop" {
  return op === "start" || op === "stop";
}

export function resolveTypingEventRoute(input: ResolveTypingEventRouteInput): TypingRoute | null {
  if (!isValidTypingOp(input.op) || input.senderUserId == null) {
    return null;
  }

  const numericCurrentUserId = numericUserIdOrNull(input.currentUserId);

  // Ignore self-echo typing events to avoid local indicator noise.
  if (numericCurrentUserId != null && input.senderUserId === numericCurrentUserId) {
    return null;
  }

  if (input.messageType === "stream") {
    if (input.streamId == null) {
      return null;
    }
    return {
      chatKey: buildStreamTypingChatKey(input.streamId, input.topic ?? ""),
      userId: input.senderUserId,
      isTyping: input.op === "start",
    };
  }

  if (!input.recipients || input.recipients.length === 0) {
    return null;
  }

  const chatKey = buildDmTypingChatKey(
    input.recipients.map((r) => r.user_id),
    input.currentUserId,
  );
  if (!chatKey) return null;

  return {
    chatKey,
    userId: input.senderUserId,
    isTyping: input.op === "start",
  };
}
