/**
 * User-topic visibility snapshot cache (filled from register-queue). Internal to zulip API modules.
 */
import { getCurrentInstance } from "./client";
import { normalizeRealm } from "./zulip-realm.internal";
import type { ZulipUserTopic } from "./zulip.types";

const userTopicsByInstance = new Map<string, ZulipUserTopic[]>();

export function buildUserTopicsCacheKey(realm: string, email: string): string {
  return `${normalizeRealm(realm).toLowerCase()}::${email.trim().toLowerCase()}`;
}

export function setCachedUserTopicsForKey(cacheKey: string, topics: ZulipUserTopic[]): void {
  userTopicsByInstance.set(cacheKey, [...topics]);
}

export function getCurrentUserTopicsCacheKey(): string | null {
  const instance = getCurrentInstance();
  if (!instance) {
    return null;
  }
  return buildUserTopicsCacheKey(instance.realm, instance.email);
}

export function getCachedUserTopicsForKey(cacheKey: string): ZulipUserTopic[] {
  return [...(userTopicsByInstance.get(cacheKey) ?? [])];
}

function isZulipUserTopic(value: unknown): value is ZulipUserTopic {
  if (typeof value !== "object" || value == null) {
    return false;
  }
  const data = value as Record<string, unknown>;
  return (
    typeof data.stream_id === "number" &&
    typeof data.topic_name === "string" &&
    typeof data.visibility_policy === "number"
  );
}

export function parseUserTopics(data: unknown): ZulipUserTopic[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  return data.filter(isZulipUserTopic);
}
