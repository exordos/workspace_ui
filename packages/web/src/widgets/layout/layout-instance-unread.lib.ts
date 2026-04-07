import type { LayoutBuildActiveChatWindowTitleInput, LayoutComputeInstanceUnreadInput } from "./layout-instance-unread.types";

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
  const dmUnread = dms.reduce((sum, dm) => sum + toSafeUnreadCount(dm.badge), 0);
  return streamUnread + dmUnread;
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
