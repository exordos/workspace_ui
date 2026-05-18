import { effectiveDmIsGroupFromSlug } from "~/shared/lib/dm-route.lib";
import { parseDmSlugToUserIds } from "~/widgets/sidebar/sidebar.lib";
import type {
  LayoutBuildActiveChatWindowTitleInput,
  LayoutComputeInstanceUnreadInput,
  LayoutDmBadgeHolder,
} from "./layout-instance-unread.types";

function toSafeUnreadCount(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  if (value == null) return 0;
  return Math.max(0, Math.floor(value));
}

export function computeInstanceUnreadCount({
  streams,
  dms,
}: LayoutComputeInstanceUnreadInput): number {
  const streamUnread = streams.reduce((sum, stream) => sum + toSafeUnreadCount(stream.badge), 0);
  const dmUnread = computeInstanceDmUnreadCount({ dms });
  return streamUnread + dmUnread;
}

function resolveDmSlugUserIds(dm: LayoutDmBadgeHolder): number[] {
  if (Array.isArray(dm.userIds) && dm.userIds.length > 0) {
    return [...dm.userIds];
  }
  if (typeof dm.slug === "string" && dm.slug.length > 0) {
    return parseDmSlugToUserIds(dm.slug);
  }
  return [];
}

/** Same personal-DM rule as sidebar DM list (`effectiveDmIsGroupFromSlug`). */
export function isPersonalDmUnreadEntry(
  dm: LayoutDmBadgeHolder,
  currentUserId: number | null,
): boolean {
  return !effectiveDmIsGroupFromSlug(dm.isGroup, resolveDmSlugUserIds(dm), currentUserId);
}

/** Sums 1:1 DM unread badges for one instance (excludes group / huddle DMs). */
export function computeInstanceDmUnreadCount({
  dms,
  currentUserId = null,
}: Pick<LayoutComputeInstanceUnreadInput, "dms"> & {
  currentUserId?: number | null;
}): number {
  return dms
    .filter((dm) => isPersonalDmUnreadEntry(dm, currentUserId))
    .reduce((sum, dm) => sum + toSafeUnreadCount(dm.badge), 0);
}

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

/** App icon dot: personal DM unread on the active org only (same source as sidebar). */
export function hasPersonalDmUnreadForActiveInstance(currentInstanceDmUnread: number): boolean {
  return toSafeUnreadCount(currentInstanceDmUnread) > 0;
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
  return safeTopicName != null ? `#${safeStreamName} | #${safeTopicName}` : `#${safeStreamName}`;
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
