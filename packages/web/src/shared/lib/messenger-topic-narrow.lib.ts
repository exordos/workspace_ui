/**
 * Workspace GET /messages (and flags/narrow) topic operands for the default channel topic.
 *
 * the messenger API's API expects an empty string in the `topic` narrow operand for default/empty topic
 * when `allow_empty_topic_name` is true.
 *
 * Usage:
 *   import { messengerTopicNarrowOperandForApi, normalizeMessengerMessagesNarrowForApi } from "~/shared/lib/messenger-topic-narrow.lib";
 */
import { topicToApiOperand } from "~/shared/lib/topic-identity.lib";

export function messengerTopicNarrowOperandForApi(topic: string): string {
  return topicToApiOperand(topic);
}

export interface MessengerMessagesNarrowClause {
  operator: string;
  operand: string | number | number[];
  negated?: boolean;
}

/** Rewrites `topic` operands so the default topic matches the messenger API's empty-topic narrow. */
export function normalizeMessengerMessagesNarrowForApi<T extends MessengerMessagesNarrowClause>(
  narrow: readonly T[],
): T[] {
  return narrow.map((entry) => {
    if (entry.operator !== "topic" || typeof entry.operand !== "string") {
      return entry;
    }
    const next = messengerTopicNarrowOperandForApi(entry.operand);
    if (next === entry.operand) return entry;
    return { ...entry, operand: next };
  });
}
