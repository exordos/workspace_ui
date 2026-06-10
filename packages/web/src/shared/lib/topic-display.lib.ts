import { t } from "~/i18n/i18n";
import { normalizeTopicForIdentity } from "./topic-identity.lib";

export interface TopicDisplayInfo {
  label: string;
  normalized: string;
  isSystem: boolean;
}

export function isEmptyTopicName(topic: string): boolean {
  return normalizeTopicForIdentity(topic).length === 0;
}

export function resolveTopicDisplayInfo(topic: string): TopicDisplayInfo {
  const normalized = normalizeTopicForIdentity(topic);
  if (normalized.length === 0) {
    return {
      label: t("chat.generalChat"),
      normalized,
      isSystem: true,
    };
  }
  return {
    label: normalized,
    normalized,
    isSystem: false,
  };
}

export function topicMatchesDisplayQuery(topic: string, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) {
    return true;
  }
  const display = resolveTopicDisplayInfo(topic);
  return (
    display.normalized.toLowerCase().includes(normalizedQuery) ||
    display.label.toLowerCase().includes(normalizedQuery)
  );
}
