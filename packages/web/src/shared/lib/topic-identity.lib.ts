import { toUnresolvedTopicName } from "~/shared/lib/topic-resolve";

export const EMPTY_TOPIC_ROUTE_TOKEN = "__empty__";
export const ESCAPED_EMPTY_TOPIC_ROUTE_TOKEN = "~__empty__";

export function normalizeTopicForIdentity(topic: string): string {
  return topic.trim();
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
