/**
 * Zulip GET /messages (and flags/narrow) topic operands for the default channel topic.
 *
 * The app normalizes an empty message subject to `"general"` for routes and cache keys
 * (`stream:ID:general`). Zulip's API expects an empty string in the `topic` narrow operand
 * when `allow_empty_topic_name` is true.
 *
 * Usage:
 *   import { zulipTopicNarrowOperandForApi, normalizeZulipMessagesNarrowForApi } from "~/shared/lib/zulip-topic-narrow.lib";
 */
import { normalizeStreamTopicForMessageCache } from "~/shared/lib/message-cache-keys.lib";
import { toUnresolvedTopicName } from "~/shared/lib/topic-resolve";

export function zulipTopicNarrowOperandForApi(topic: string): string {
  const trimmed = topic.trim();
  const unresolved = toUnresolvedTopicName(trimmed);
  const canonical = normalizeStreamTopicForMessageCache(unresolved);
  if (canonical.toLowerCase() === "general") {
    return "";
  }
  return trimmed;
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
