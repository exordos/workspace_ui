/**
 * User-topic visibility snapshot cache (filled from register-queue). Internal to messenger API modules.
 */
import { getCurrentInstance } from "./client";
import { normalizeRealm } from "./messenger-realm.internal";
import type { MessengerUserTopic } from "./messenger.types";

const userTopicsByInstance = new Map<string, MessengerUserTopic[]>();

export function buildUserTopicsCacheKey(realm: string, login: string): string {
  return `${normalizeRealm(realm).toLowerCase()}::${login.trim().toLowerCase()}`;
}

export function setCachedUserTopicsForKey(cacheKey: string, topics: MessengerUserTopic[]): void {
  userTopicsByInstance.set(cacheKey, [...topics]);
}

export function getCurrentUserTopicsCacheKey(): string | null {
  const instance = getCurrentInstance();
  if (!instance) {
    return null;
  }
  return buildUserTopicsCacheKey(instance.realm, instance.login);
}

export function getCachedUserTopicsForKey(cacheKey: string): MessengerUserTopic[] {
  return [...(userTopicsByInstance.get(cacheKey) ?? [])];
}

function isMessengerUserTopic(value: unknown): value is MessengerUserTopic {
  if (typeof value !== "object" || value == null) {
    return false;
  }
  const data = value as Record<string, unknown>;
  return (
    typeof data.stream_uuid === "string" &&
    typeof data.topic_name === "string" &&
    typeof data.visibility_policy === "number"
  );
}

export function parseUserTopics(data: unknown): MessengerUserTopic[] | null {
  if (!Array.isArray(data)) {
    return null;
  }
  return data.filter(isMessengerUserTopic);
}
