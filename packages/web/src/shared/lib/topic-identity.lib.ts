import { toUnresolvedTopicName } from "~/shared/lib/topic-resolve";

export const EMPTY_TOPIC_ROUTE_TOKEN = "__empty__";
export const ESCAPED_EMPTY_TOPIC_ROUTE_TOKEN = "~__empty__";

/**
 * Legacy / display names that some Zulip realms (or older clients) use instead of an empty subject.
 * Must stay distinct from a literal topic named `general` — only multi-word / UI labels here.
 */
const DEFAULT_TOPIC_ALIASES = new Set(["general chat", "общий чат", "(no topic)"]);

function isDefaultTopicAlias(topic: string): boolean {
  const lower = topic.trim().toLowerCase();
  return lower.length === 0 || DEFAULT_TOPIC_ALIASES.has(lower);
}

/** Canonical topic key for store, routes, and API narrow (empty string = default topic). */
export function normalizeTopicForIdentity(topic: string): string {
  const trimmed = topic.trim();
  if (isDefaultTopicAlias(trimmed)) {
    return "";
  }
  return trimmed;
}

/** True when the topic is the default/empty channel topic (including legacy alias names). */
export function isEmptyTopicIdentity(topic: string): boolean {
  return normalizeTopicForIdentity(topic).length === 0;
}

export function topicToApiOperand(topic: string): string {
  const trimmed = normalizeTopicForIdentity(topic);
  const unresolved = toUnresolvedTopicName(trimmed);
  return unresolved.length === 0 ? "" : trimmed;
}

export function encodeTopicForRoute(topic: string): string {
  const normalized = normalizeTopicForIdentity(topic);
  if (normalized.length === 0) return EMPTY_TOPIC_ROUTE_TOKEN;
  if (normalized === EMPTY_TOPIC_ROUTE_TOKEN) return ESCAPED_EMPTY_TOPIC_ROUTE_TOKEN;
  return normalized;
}

export function decodeTopicFromRoute(topicSegment: string): string {
  const normalized = normalizeTopicForIdentity(topicSegment);
  if (normalized === EMPTY_TOPIC_ROUTE_TOKEN) return "";
  if (normalized === ESCAPED_EMPTY_TOPIC_ROUTE_TOKEN) return EMPTY_TOPIC_ROUTE_TOKEN;
  return normalized;
}
