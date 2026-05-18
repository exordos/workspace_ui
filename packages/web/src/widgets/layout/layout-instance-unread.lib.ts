import type {
  LayoutBuildActiveChatWindowTitleInput,
  LayoutComputeInstanceUnreadInput,
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

/** Sums 1:1 DM unread badges for one instance (excludes group / huddle DMs). */
export function computeInstanceDmUnreadCount({
  dms,
}: Pick<LayoutComputeInstanceUnreadInput, "dms">): number {
  return dms
    .filter((dm) => dm.isGroup !== true)
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

export interface HasPersonalDmUnreadAcrossInstancesInput {
  instances: readonly { id: string }[];
  currentInstanceId: string | null;
  currentInstanceDmUnread: number;
  dmUnreadCountsByInstance: Record<string, number>;
}

/** App icon dot: any registered org has personal DM unread (sidebar for active, polling for others). */
export function hasPersonalDmUnreadAcrossInstances(
  input: HasPersonalDmUnreadAcrossInstancesInput,
): boolean {
  const { instances, currentInstanceId, currentInstanceDmUnread, dmUnreadCountsByInstance } = input;

  if (toSafeUnreadCount(currentInstanceDmUnread) > 0) {
    return true;
  }

  for (const instance of instances) {
    if (instance.id === currentInstanceId) continue;
    if (toSafeUnreadCount(dmUnreadCountsByInstance[instance.id]) > 0) {
      return true;
    }
  }

  return false;
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
