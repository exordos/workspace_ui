import {
  computeInstanceStreamUnreadCountWithMute,
  toSafeUnreadCount,
} from "./layout-instance-unread-stream.lib";
import type {
  LayoutBuildActiveChatWindowTitleInput,
  LayoutComputeInstanceUnreadInput,
  LayoutDmBadgeHolder,
} from "./layout-instance-unread.types";

interface LayoutMutePredicates {
  /** True when the whole stream should be treated as muted for totals. */
  isStreamMuted?: (streamId: number) => boolean;
  /** True when a stream/topic should be treated as muted for totals (should include stream-level mutes). */
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

type LayoutComputeInstanceUnreadWithMuteInput = LayoutComputeInstanceUnreadInput &
  LayoutMutePredicates;

export function computeInstanceUnreadCount({
  streams,
  dms,
  isStreamMuted,
  isEffectivelyMuted,
}: LayoutComputeInstanceUnreadWithMuteInput): number {
  const shouldApplyMuteRules = isStreamMuted != null || isEffectivelyMuted != null;
  const streamUnread = shouldApplyMuteRules
    ? computeInstanceStreamUnreadCountWithMute(streams, { isStreamMuted, isEffectivelyMuted })
    : streams.reduce((sum, stream) => sum + toSafeUnreadCount(stream.badge), 0);
  const dmUnread = computeInstanceDmUnreadCount({ dms });
  return streamUnread + dmUnread;
}

/** 1:1 and group/huddle DM unread both count toward personal indicators. */
export function isPersonalDmUnreadEntry(
  _dm: LayoutDmBadgeHolder,
  _currentUserId: number | null,
): boolean {
  return true;
}

/** Sums DM unread badges for one instance (1:1 and group/huddle). */
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

/** Personal indicator: 1:1 DM unread or unread @mentions. */
export function hasPersonalUnreadIndicator(
  personalDmUnread: number,
  mentionsUnread: number,
): boolean {
  return toSafeUnreadCount(personalDmUnread) > 0 || toSafeUnreadCount(mentionsUnread) > 0;
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
