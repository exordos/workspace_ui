import {
  computeInstanceDmUnreadCount,
  computeInstanceUnreadCount,
  hasPersonalDmUnreadForActiveInstance,
  hasPersonalUnreadIndicator,
  isPersonalDmUnreadEntry,
  toSafeUnreadCount,
} from "~/entities/unread-sync/unread-instance-count.lib";
import type { LayoutBuildActiveChatWindowTitleInput } from "./layout-instance-unread.types";

export {
  computeInstanceDmUnreadCount,
  computeInstanceUnreadCount,
  hasPersonalDmUnreadForActiveInstance,
  hasPersonalUnreadIndicator,
  isPersonalDmUnreadEntry,
};

function sumUnreadCountsByInstance(
  countsByInstance: Record<string, number>,
  liveCurrent?: { instanceId: string; unreadCount: number } | null,
): number {
  const merged =
    liveCurrent != null
      ? { ...countsByInstance, [liveCurrent.instanceId]: liveCurrent.unreadCount }
      : countsByInstance;

  let total = 0;
  for (const count of Object.values(merged)) {
    total += toSafeUnreadCount(count);
  }
  return total;
}

/** Sums per-instance unread counts (streams + DMs) for org switcher and window title. */
export function computeTotalUnreadAcrossInstances(
  unreadCountsByInstance: Record<string, number>,
  liveCurrent?: { instanceId: string; unreadCount: number } | null,
): number {
  return sumUnreadCountsByInstance(unreadCountsByInstance, liveCurrent);
}

/** Sums per-instance DM unread for app icon badges (dock, tray, favicon). */
export function computeTotalDmUnreadAcrossInstances(
  dmUnreadCountsByInstance: Record<string, number>,
  liveCurrent?: { instanceId: string; unreadCount: number } | null,
): number {
  return sumUnreadCountsByInstance(dmUnreadCountsByInstance, liveCurrent);
}

function toSafeTitleSegment(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildDmTitleSegment(dmName: string | null | undefined): string | null {
  const safeDmName = toSafeTitleSegment(dmName);
  return safeDmName != null ? `@${safeDmName}` : null;
}

function buildStreamTitleSegment(
  streamName: string | null | undefined,
  topicName: string | null | undefined,
): string | null {
  const safeStreamName = toSafeTitleSegment(streamName);
  if (safeStreamName == null) return null;
  const safeTopicName = toSafeTitleSegment(topicName);
  return safeTopicName != null ? `#${safeStreamName} | ${safeTopicName}` : `#${safeStreamName}`;
}

export function buildActiveChatWindowTitle({
  dmName,
  streamName,
  topicName,
}: LayoutBuildActiveChatWindowTitleInput): string | null {
  return buildDmTitleSegment(dmName) ?? buildStreamTitleSegment(streamName, topicName);
}

export function formatWebWindowTitleWithUnreadCount(
  unreadCount: number,
  appName: string,
  activeChatTitle?: string | null,
): string {
  const safeUnreadCount = toSafeUnreadCount(unreadCount);
  const safeChatTitle = toSafeTitleSegment(activeChatTitle);
  const appTitle = safeChatTitle != null ? `${safeChatTitle} - ${appName}` : appName;
  return safeUnreadCount > 0 ? `(${safeUnreadCount}) ${appTitle}` : appTitle;
}
