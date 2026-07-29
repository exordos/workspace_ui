import { describe, expect, it } from "vitest";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import { resolveDirectProfileChatNavigation } from "./right-panel-user-profile-direct-navigation.lib";

const PARTNER_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const DEFAULT_TOPIC_UUID = "33333333-3333-4333-8333-333333333333";
const OTHER_TOPIC_UUID = "44444444-4444-4444-8444-444444444444";

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: "project-a",
    ownerUuid: "owner",
    userUuid: "owner",
    role: "member",
    notificationMode: "all_messages",
    name: "dm",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "private",
    isPrivate: true,
    inviteOnly: true,
    announce: false,
    isArchived: false,
    directUserUuid: PARTNER_UUID,
    lastMessageUuid: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function createTopic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: DEFAULT_TOPIC_UUID,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    userUuid: "owner",
    name: "general",
    unreadCount: 0,
    isDefault: true,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveDirectProfileChatNavigation", () => {
  const streamsById = {
    [STREAM_UUID]: createStream(),
    [OTHER_STREAM_UUID]: createStream({
      uuid: OTHER_STREAM_UUID,
      directUserUuid: OTHER_UUID,
    }),
  };
  const topicsById = {
    [DEFAULT_TOPIC_UUID]: createTopic(),
    [OTHER_TOPIC_UUID]: createTopic({
      uuid: OTHER_TOPIC_UUID,
      name: "side-topic",
      isDefault: false,
    }),
  };

  it("returns stream-missing when no DM stream exists for the partner", () => {
    expect(
      resolveDirectProfileChatNavigation({
        directUserUuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        streamsById,
        topicsById,
        currentRoute: null,
      }),
    ).toEqual({ status: "stream-missing" });
  });

  it("stays put when current route is any topic of the partner DM stream", () => {
    const route: WorkspaceMessengerRouteMatch = {
      kind: "topic",
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: STREAM_UUID,
      topicUuid: OTHER_TOPIC_UUID,
    };

    expect(
      resolveDirectProfileChatNavigation({
        directUserUuid: PARTNER_UUID,
        streamsById,
        topicsById,
        currentRoute: route,
      }),
    ).toEqual({ status: "already-open", streamUuid: STREAM_UUID });
  });

  it("stays put when current route is the partner DM stream view", () => {
    const route: WorkspaceMessengerRouteMatch = {
      kind: "stream",
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: STREAM_UUID,
    };

    expect(
      resolveDirectProfileChatNavigation({
        directUserUuid: PARTNER_UUID,
        streamsById,
        topicsById,
        currentRoute: route,
      }),
    ).toEqual({ status: "already-open", streamUuid: STREAM_UUID });
  });

  it("opens the default topic when the user is outside the partner DM stream", () => {
    const route: WorkspaceMessengerRouteMatch = {
      kind: "stream",
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: OTHER_STREAM_UUID,
    };

    expect(
      resolveDirectProfileChatNavigation({
        directUserUuid: PARTNER_UUID,
        streamsById,
        topicsById,
        currentRoute: route,
      }),
    ).toEqual({
      status: "open-default-topic",
      streamUuid: STREAM_UUID,
      topicUuid: DEFAULT_TOPIC_UUID,
    });
  });

  it("opens the default topic when there is no messenger route", () => {
    expect(
      resolveDirectProfileChatNavigation({
        directUserUuid: PARTNER_UUID,
        streamsById,
        topicsById,
        currentRoute: null,
      }),
    ).toEqual({
      status: "open-default-topic",
      streamUuid: STREAM_UUID,
      topicUuid: DEFAULT_TOPIC_UUID,
    });
  });

  it("returns missing-default-topic when the DM stream has no default topic", () => {
    expect(
      resolveDirectProfileChatNavigation({
        directUserUuid: PARTNER_UUID,
        streamsById,
        topicsById: {
          [OTHER_TOPIC_UUID]: createTopic({
            uuid: OTHER_TOPIC_UUID,
            isDefault: false,
          }),
        },
        currentRoute: null,
      }),
    ).toEqual({ status: "missing-default-topic", streamUuid: STREAM_UUID });
  });
});
