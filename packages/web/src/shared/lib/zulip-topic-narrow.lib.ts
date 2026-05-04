/**
 * Zulip GET /messages (and flags/narrow) topic operands for the default channel topic.
 *
 * Zulip's API expects an empty string in the `topic` narrow operand for default/empty topic
 * when `allow_empty_topic_name` is true.
 *
 * Usage:
 *   import { zulipTopicNarrowOperandForApi, normalizeZulipMessagesNarrowForApi } from "~/shared/lib/zulip-topic-narrow.lib";
 */
import { topicToApiOperand } from "~/shared/lib/topic-identity.lib";

export function zulipTopicNarrowOperandForApi(topic: string): string {
  return topicToApiOperand(topic);
}

export interface ZulipMessagesNarrowClause {
  operator: string;
  operand: string | number | number[];
  negated?: boolean;
}

/** Rewrites `topic` operands so the default topic matches Zulip's empty-topic narrow. */
export function normalizeZulipMessagesNarrowForApi<T extends ZulipMessagesNarrowClause>(
  narrow: readonly T[],
): T[] {
  return narrow.map((entry) => {
    if (entry.operator !== "topic" || typeof entry.operand !== "string") {
      return entry;
    }
    const next = zulipTopicNarrowOperandForApi(entry.operand);
    if (next === entry.operand) return entry;
    return { ...entry, operand: next } as T;
  });
}
