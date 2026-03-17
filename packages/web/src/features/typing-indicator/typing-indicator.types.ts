/**
 * Typing indicator types — tracks which users are currently typing in a conversation.
 */

export interface TypingUser {
  userId: number;
  /** Timestamp (ms) when we last received a "typing start" for this user */
  startedAt: number;
}

export interface TypingEvent {
  op: "start" | "stop";
  sender: { user_id: number; email: string };
  recipients: { user_id: number }[];
}
