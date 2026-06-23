/** Canonical topic key for store, routes, and API narrow. Empty string is the only empty topic. */
export function normalizeTopicForIdentity(topic: string): string {
  return topic.trim();
}

/** True when the topic is explicitly empty. */
export function isEmptyTopicIdentity(topic: string): boolean {
  return normalizeTopicForIdentity(topic).length === 0;
}

export function topicToApiOperand(topic: string): string {
  return normalizeTopicForIdentity(topic);
}

export function encodeTopicForRoute(topic: string): string {
  return normalizeTopicForIdentity(topic);
}

export function decodeTopicFromRoute(topicSegment: string): string {
  return normalizeTopicForIdentity(topicSegment);
}
