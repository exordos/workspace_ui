/**
 * Merges realm stream list with user subscriptions for the browse-channels tab.
 */
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";

export type BrowseChannelSubscriptionFilter = "unsubscribed" | "subscribed" | "all";

export interface BrowseChannelRow {
  streamId: number;
  name: string;
  description: string;
  isSubscribed: boolean;
  isMuted: boolean;
  inviteOnly: boolean | null;
  historyPublicToSubscribers: boolean | null;
  isAnnouncementOnly: boolean;
  isWebPublic: boolean;
  streamPostPolicy: number | null;
  subscriberCount: number | null;
  weeklyMessageCount: number | null;
  creatorId: number | null;
  dateCreated: number | null;
  folderId: number | null;
  isDefault: boolean | null;
  isRecentlyActive: boolean | null;
  messageRetentionDays: number | null;
  desktopNotifications: boolean | null;
  audibleNotifications: boolean | null;
  canSubscribeGroup?: ZulipGroupSettingValue;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  canResolveTopicsGroup?: ZulipGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: ZulipGroupSettingValue;
}

export interface BrowseChannelStreamLike {
  stream_id: number;
  name: string;
  description: string;
  invite_only?: boolean;
  is_announcement_only?: boolean;
  history_public_to_subscribers?: boolean;
  is_web_public?: boolean;
  subscriber_count?: number | null;
  stream_weekly_traffic?: number | null;
  stream_post_policy?: number | null;
  creator_id?: number | null;
  date_created?: number | null;
  folder_id?: number | null;
  is_default?: boolean;
  is_recently_active?: boolean;
  message_retention_days?: number | null;
  can_subscribe_group?: ZulipGroupSettingValue;
  can_add_subscribers_group?: ZulipGroupSettingValue;
  can_remove_subscribers_group?: ZulipGroupSettingValue;
  can_administer_channel_group?: ZulipGroupSettingValue;
  can_resolve_topics_group?: ZulipGroupSettingValue;
  can_move_messages_out_of_channel_group?: ZulipGroupSettingValue;
}

export interface BrowseChannelSubscriptionLike {
  stream_id: number;
  is_archived?: boolean;
  invite_only?: boolean;
  is_muted?: boolean;
  creator_id?: number;
  desktop_notifications?: boolean | null;
  audible_notifications?: boolean | null;
  can_add_subscribers_group?: ZulipGroupSettingValue;
  can_remove_subscribers_group?: ZulipGroupSettingValue;
  can_administer_channel_group?: ZulipGroupSettingValue;
  can_resolve_topics_group?: ZulipGroupSettingValue;
  can_move_messages_out_of_channel_group?: ZulipGroupSettingValue;
}

export interface BuildBrowseChannelRowsInput {
  streams: readonly BrowseChannelStreamLike[];
  subscriptions: readonly BrowseChannelSubscriptionLike[];
  searchQuery: string;
  subscriptionFilter: BrowseChannelSubscriptionFilter;
}

function isArchivedSubscription(subscription: BrowseChannelSubscriptionLike | undefined): boolean {
  return subscription?.is_archived === true;
}

function normalizeCount(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

function mergeOptionalBoolean(
  subscriptionValue: boolean | undefined,
  streamValue: boolean | undefined,
): boolean | null {
  if (subscriptionValue != null) {
    return subscriptionValue;
  }
  if (streamValue != null) {
    return streamValue;
  }
  return null;
}

function mergeCreatorId(
  subscription: BrowseChannelSubscriptionLike | undefined,
  streamCreatorId: number | null | undefined,
): number | null {
  if (
    subscription?.creator_id != null &&
    Number.isInteger(subscription.creator_id) &&
    subscription.creator_id > 0
  ) {
    return subscription.creator_id;
  }
  if (streamCreatorId != null && streamCreatorId > 0) {
    return streamCreatorId;
  }
  return null;
}

function pickGroupField(
  subscriptionValue: ZulipGroupSettingValue | undefined,
  streamValue: ZulipGroupSettingValue | undefined,
): ZulipGroupSettingValue | undefined {
  return subscriptionValue ?? streamValue;
}

type BrowseChannelGroupFieldKey =
  | "canSubscribeGroup"
  | "canAddSubscribersGroup"
  | "canRemoveSubscribersGroup"
  | "canAdministerChannelGroup"
  | "canResolveTopicsGroup"
  | "canMoveMessagesOutOfChannelGroup";

const BROWSE_CHANNEL_GROUP_FIELDS: readonly {
  rowKey: BrowseChannelGroupFieldKey;
  streamKey: keyof BrowseChannelStreamLike;
  subscriptionKey?: keyof BrowseChannelSubscriptionLike;
}[] = [
  { rowKey: "canSubscribeGroup", streamKey: "can_subscribe_group" },
  {
    rowKey: "canAddSubscribersGroup",
    streamKey: "can_add_subscribers_group",
    subscriptionKey: "can_add_subscribers_group",
  },
  {
    rowKey: "canRemoveSubscribersGroup",
    streamKey: "can_remove_subscribers_group",
    subscriptionKey: "can_remove_subscribers_group",
  },
  {
    rowKey: "canAdministerChannelGroup",
    streamKey: "can_administer_channel_group",
    subscriptionKey: "can_administer_channel_group",
  },
  {
    rowKey: "canResolveTopicsGroup",
    streamKey: "can_resolve_topics_group",
    subscriptionKey: "can_resolve_topics_group",
  },
  {
    rowKey: "canMoveMessagesOutOfChannelGroup",
    streamKey: "can_move_messages_out_of_channel_group",
    subscriptionKey: "can_move_messages_out_of_channel_group",
  },
];

function appendBrowseChannelGroupFields(
  row: BrowseChannelRow,
  stream: BrowseChannelStreamLike,
  subscription: BrowseChannelSubscriptionLike | undefined,
): BrowseChannelRow {
  let result = row;
  for (const field of BROWSE_CHANNEL_GROUP_FIELDS) {
    const subscriptionValue = field.subscriptionKey
      ? (subscription?.[field.subscriptionKey] as ZulipGroupSettingValue | undefined)
      : undefined;
    const streamValue = stream[field.streamKey] as ZulipGroupSettingValue | undefined;
    const merged = pickGroupField(subscriptionValue, streamValue);
    if (merged != null) {
      result = { ...result, [field.rowKey]: merged };
    }
  }
  return result;
}

function buildBrowseChannelRowCore(
  stream: BrowseChannelStreamLike,
  subscription: BrowseChannelSubscriptionLike | undefined,
): BrowseChannelRow {
  const isSubscribed = subscription != null;
  return {
    streamId: stream.stream_id,
    name: stream.name,
    description: stream.description,
    isSubscribed,
    isMuted: subscription?.is_muted === true,
    inviteOnly: mergeOptionalBoolean(subscription?.invite_only, stream.invite_only),
    historyPublicToSubscribers: mergeOptionalBoolean(
      undefined,
      stream.history_public_to_subscribers,
    ),
    isAnnouncementOnly: stream.is_announcement_only === true,
    isWebPublic: stream.is_web_public === true,
    streamPostPolicy:
      typeof stream.stream_post_policy === "number" ? stream.stream_post_policy : null,
    subscriberCount: normalizeCount(stream.subscriber_count),
    weeklyMessageCount: normalizeCount(stream.stream_weekly_traffic),
    creatorId: mergeCreatorId(subscription, stream.creator_id),
    dateCreated:
      typeof stream.date_created === "number" && stream.date_created > 0
        ? stream.date_created
        : null,
    folderId: normalizeCount(stream.folder_id),
    isDefault: mergeOptionalBoolean(undefined, stream.is_default),
    isRecentlyActive: mergeOptionalBoolean(undefined, stream.is_recently_active),
    messageRetentionDays: normalizeCount(stream.message_retention_days),
    desktopNotifications: isSubscribed
      ? mergeNotificationOverride(subscription?.desktop_notifications)
      : null,
    audibleNotifications: isSubscribed
      ? mergeNotificationOverride(subscription?.audible_notifications)
      : null,
  };
}

function compareByName(left: BrowseChannelRow, right: BrowseChannelRow): number {
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function mergeNotificationOverride(subscriptionValue: boolean | null | undefined): boolean | null {
  if (subscriptionValue === true || subscriptionValue === false) {
    return subscriptionValue;
  }
  return null;
}

export function matchesBrowseChannelSubscriptionFilter(
  row: BrowseChannelRow,
  filter: BrowseChannelSubscriptionFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "subscribed") {
    return row.isSubscribed;
  }
  return !row.isSubscribed;
}

export function filterBrowseChannelRows(
  rows: readonly BrowseChannelRow[],
  filter: BrowseChannelSubscriptionFilter,
): BrowseChannelRow[] {
  return rows.filter((row) => matchesBrowseChannelSubscriptionFilter(row, filter));
}

export function buildBrowseChannelRows(input: BuildBrowseChannelRowsInput): BrowseChannelRow[] {
  const { streams, subscriptions, searchQuery, subscriptionFilter } = input;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const subscriptionByStreamId = new Map<number, BrowseChannelSubscriptionLike>();
  for (const subscription of subscriptions) {
    subscriptionByStreamId.set(subscription.stream_id, subscription);
  }

  const rows: BrowseChannelRow[] = [];
  for (const stream of streams) {
    const subscription = subscriptionByStreamId.get(stream.stream_id);
    if (isArchivedSubscription(subscription)) {
      continue;
    }
    if (normalizedQuery.length > 0 && !stream.name.toLowerCase().includes(normalizedQuery)) {
      continue;
    }

    const coreRow = buildBrowseChannelRowCore(stream, subscription);
    rows.push(appendBrowseChannelGroupFields(coreRow, stream, subscription));
  }

  const filtered = filterBrowseChannelRows(rows, subscriptionFilter);
  return [...filtered].sort(compareByName);
}

/** Keeps selection stable when the filtered list changes. */
export function resolveBrowseChannelSelection(
  channels: readonly BrowseChannelRow[],
  currentId: number | null,
): number | null {
  if (channels.length === 0) {
    return null;
  }
  if (currentId != null && channels.some((channel) => channel.streamId === currentId)) {
    return currentId;
  }
  return channels[0]?.streamId ?? null;
}
