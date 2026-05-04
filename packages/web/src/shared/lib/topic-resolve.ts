/**
 * Topic resolution helpers for Zulip-style "done" topics.
 *
 * Zulip marks resolved topics by prefixing topic names with a checkmark.
 * These helpers keep that transformation consistent across UI and API calls.
 *
 * Usage:
 * import { isTopicResolved, toResolvedTopicName, toUnresolvedTopicName } from "~/shared/lib/topic-resolve";
 */

export const TOPIC_RESOLVED_MARKER = "\u2714";
const VARIATION_SELECTORS = /[\uFE0E\uFE0F]+/u;

function normalizeTopicName(topic: string): string {
  return topic.trim();
}

export function isTopicResolved(topic: string): boolean {
  return normalizeTopicName(topic).startsWith(TOPIC_RESOLVED_MARKER);
}

export function toUnresolvedTopicName(topic: string): string {
  let normalized = normalizeTopicName(topic);
  while (normalized.startsWith(TOPIC_RESOLVED_MARKER)) {
    normalized = normalized.slice(TOPIC_RESOLVED_MARKER.length);
    normalized = normalized.replace(VARIATION_SELECTORS, "").trimStart();
  }
  return normalized;
}

export function toResolvedTopicName(topic: string): string {
  const unresolved = toUnresolvedTopicName(topic);
  if (unresolved.length === 0) {
    return TOPIC_RESOLVED_MARKER;
  }
  return `${TOPIC_RESOLVED_MARKER} ${unresolved}`;
}
