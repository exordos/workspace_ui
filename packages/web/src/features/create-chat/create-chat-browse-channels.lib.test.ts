import { describe, expect, it } from "vitest";
import {
  buildBrowseChannelRows,
  filterBrowseChannelRows,
  matchesBrowseChannelSubscriptionFilter,
  resolveBrowseChannelSelection,
} from "./create-chat-browse-channels.lib";

const baseStreamFields = {
  invite_only: false,
  is_announcement_only: false,
  history_public_to_subscribers: true,
  is_web_public: false,
  subscriber_count: 10,
  stream_weekly_traffic: 25,
  stream_post_policy: 1,
};

const STREAM_UUID_1 = "00000000-0000-4000-8000-000000000001";
const STREAM_UUID_2 = "00000000-0000-4000-8000-000000000002";
const STREAM_UUID_3 = "00000000-0000-4000-8000-000000000003";

describe("buildBrowseChannelRows", () => {
  const streams = [
    {
      stream_uuid: STREAM_UUID_1,
      name: "general",
      description: "General chat",
      ...baseStreamFields,
    },
    {
      stream_uuid: STREAM_UUID_2,
      name: "engineering",
      description: "Eng team",
      ...baseStreamFields,
      subscriber_count: 50,
      stream_weekly_traffic: 100,
    },
    {
      stream_uuid: STREAM_UUID_3,
      name: "design",
      description: "",
      ...baseStreamFields,
      subscriber_count: 5,
      stream_weekly_traffic: 2,
    },
  ];

  it("filters unsubscribed channels by default and sorts alphabetically", () => {
    const rows = buildBrowseChannelRows({
      streams,
      subscriptions: [{ stream_uuid: STREAM_UUID_1, is_archived: false }],
      searchQuery: "",
      subscriptionFilter: "unsubscribed",
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_UUID_3, STREAM_UUID_2]);
    expect(rows.every((row) => !row.isSubscribed)).toBe(true);
  });

  it("shows only subscribed channels when filter is subscribed", () => {
    const rows = buildBrowseChannelRows({
      streams,
      subscriptions: [{ stream_uuid: STREAM_UUID_1, is_archived: false }],
      searchQuery: "",
      subscriptionFilter: "subscribed",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      streamUuid: STREAM_UUID_1,
      isSubscribed: true,
      inviteOnly: false,
      subscriberCount: 10,
      weeklyMessageCount: 25,
    });
  });

  it("shows all channels when filter is all", () => {
    const rows = buildBrowseChannelRows({
      streams,
      subscriptions: [{ stream_uuid: STREAM_UUID_1, is_archived: false }],
      searchQuery: "",
      subscriptionFilter: "all",
    });

    expect(rows.map((row) => row.streamUuid)).toEqual([
      STREAM_UUID_3,
      STREAM_UUID_2,
      STREAM_UUID_1,
    ]);
  });

  it("excludes archived subscriptions from the list", () => {
    const rows = buildBrowseChannelRows({
      streams,
      subscriptions: [
        { stream_uuid: STREAM_UUID_1, is_archived: true },
        { stream_uuid: STREAM_UUID_2, is_archived: false },
      ],
      searchQuery: "",
      subscriptionFilter: "all",
    });

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_UUID_3, STREAM_UUID_2]);
  });

  it("filters by search query on channel name", () => {
    const rows = buildBrowseChannelRows({
      streams,
      subscriptions: [],
      searchQuery: "eng",
      subscriptionFilter: "all",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("engineering");
  });

  it("maps invite-only flag from subscriptions and stream metadata", () => {
    const rows = buildBrowseChannelRows({
      streams: [
        {
          stream_uuid: STREAM_UUID_1,
          name: "secret",
          description: "",
          ...baseStreamFields,
          invite_only: true,
        },
      ],
      subscriptions: [
        {
          stream_uuid: STREAM_UUID_1,
          is_archived: false,
          invite_only: true,
          notification_mode: "muted",
        },
      ],
      searchQuery: "",
      subscriptionFilter: "subscribed",
    });

    expect(rows[0]?.inviteOnly).toBe(true);
    expect(rows[0]?.isMuted).toBe(true);
  });

  it("merges permission groups from stream metadata", () => {
    const rows = buildBrowseChannelRows({
      streams: [
        {
          stream_uuid: STREAM_UUID_1,
          name: "open",
          description: "",
          ...baseStreamFields,
          can_subscribe_group: 9,
          can_add_subscribers_group: 9,
        },
      ],
      subscriptions: [],
      searchQuery: "",
      subscriptionFilter: "all",
    });

    expect(rows[0]?.canSubscribeGroup).toBe(9);
    expect(rows[0]?.canAddSubscribersGroup).toBe(9);
  });

  it("matchesBrowseChannelSubscriptionFilter covers all filter modes", () => {
    const subscribed = {
      streamUuid: STREAM_UUID_1,
      name: "a",
      description: "",
      isSubscribed: true,
      isMuted: false,
      notificationMode: "all_messages" as const,
      inviteOnly: null,
      historyPublicToSubscribers: null,
      isAnnouncementOnly: false,
      isWebPublic: false,
      streamPostPolicy: null,
      subscriberCount: null,
      weeklyMessageCount: null,
      creatorUuid: null,
      dateCreated: null,
      folderId: null,
      isDefault: null,
      isRecentlyActive: null,
      messageRetentionDays: null,
    };
    const unsubscribed = {
      ...subscribed,
      streamUuid: STREAM_UUID_2,
      isSubscribed: false,
      notificationMode: null,
    };

    expect(matchesBrowseChannelSubscriptionFilter(subscribed, "subscribed")).toBe(true);
    expect(matchesBrowseChannelSubscriptionFilter(subscribed, "unsubscribed")).toBe(false);
    expect(matchesBrowseChannelSubscriptionFilter(unsubscribed, "unsubscribed")).toBe(true);
    expect(matchesBrowseChannelSubscriptionFilter(subscribed, "all")).toBe(true);
    expect(filterBrowseChannelRows([subscribed, unsubscribed], "unsubscribed")).toHaveLength(1);
  });

  it("resolveBrowseChannelSelection keeps valid id or falls back to first row", () => {
    const channels = buildBrowseChannelRows({
      streams: [
        { stream_uuid: STREAM_UUID_1, name: "a", description: "", ...baseStreamFields },
        { stream_uuid: STREAM_UUID_2, name: "b", description: "", ...baseStreamFields },
      ],
      subscriptions: [],
      searchQuery: "",
      subscriptionFilter: "all",
    });

    expect(resolveBrowseChannelSelection(channels, STREAM_UUID_2)).toBe(STREAM_UUID_2);
    expect(resolveBrowseChannelSelection(channels, "missing")).toBe(STREAM_UUID_1);
    expect(resolveBrowseChannelSelection([], STREAM_UUID_1)).toBeNull();
  });
});
