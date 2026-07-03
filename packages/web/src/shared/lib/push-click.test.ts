import { describe, expect, it } from "vitest";
import {
  buildMessageRedirectRouteFromZulipPermalink,
  buildPushClickUrl,
  buildRouteFromMessage,
  findInstanceIdByRealmUri,
  buildRouteFromPushNotificationClick,
} from "./push-click";

describe("buildPushClickUrl", () => {
  it("builds a Workspace message route when message UUID and project are present", () => {
    const url = buildPushClickUrl({
      messageUuid: "message-uuid",
      orgId: "chat.example.com",
      projectId: "project-uuid",
      messageId: 123,
    });

    expect(url).toBe("/org/chat.example.com/project/project-uuid/message/message-uuid");
  });

  it("builds a Workspace stream topic route when UUIDs and project are present", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamUuid: "stream-uuid",
      topicUuid: "topic-uuid",
      streamId: 15,
      streamName: "General Discussion",
      topic: "Release Notes",
      orgId: "chat.example.com",
      projectId: "project-uuid",
    });

    expect(url).toBe(
      "/org/chat.example.com/project/project-uuid/stream/stream-uuid/topic/topic-uuid",
    );
  });

  it("builds legacy stream topic route when only numeric stream id is present", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamId: 15,
      streamName: "General Discussion",
      topic: "Release Notes",
    });

    expect(url).toBe("/stream/15-general-discussion/topic/Release%20Notes");
  });

  it("appends numeric message focus for legacy stream routes", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamId: 15,
      streamName: "General Discussion",
      topic: "Release Notes",
      messageId: 123,
    });

    expect(url).toBe("/stream/15-general-discussion/topic/Release%20Notes?msg=123");
  });

  it("builds legacy name-only stream route when stream id is missing", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamName: "general",
      topic: "bugs",
    });

    expect(url).toBe("/stream/general/topic/bugs");
  });

  it("encodes legacy stream-name route from unsafe source text", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamName: "eng/ops?tab=all",
      topic: "bugs",
    });

    expect(url).toBe("/stream/eng%2Fops%3Ftab%3Dall/topic/bugs");
  });

  it("falls back to Inbox when topic UUID is missing for a topic click", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamUuid: "stream-uuid",
      topic: "   ",
      messageId: 42,
      orgId: "chat.example.com",
      projectId: "project-uuid",
    });

    expect(url).toBe("/org/chat.example.com/inbox");
  });

  it("builds legacy DM route when only numeric sender id is present", () => {
    const url = buildPushClickUrl({
      type: "private",
      senderId: 42,
      messageId: 99,
    });

    expect(url).toBe("/dm/42?msg=99");
  });

  it("returns root when payload lacks enough routing data", () => {
    const url = buildPushClickUrl({});
    expect(url).toBe("/inbox");
  });
});

describe("findInstanceIdByRealmUri", () => {
  const instances = [
    { id: "1", realm: "https://zulip.example.com", email: "a@test.com", apiKey: "k1" },
    { id: "2", realm: "https://chat.example.com", email: "b@test.com", apiKey: "k2" },
  ];

  it("matches exact realm url", () => {
    expect(findInstanceIdByRealmUri(instances, "https://zulip.example.com")).toBe("1");
  });

  it("matches normalized realm url with api suffix and trailing slash", () => {
    expect(findInstanceIdByRealmUri(instances, "https://zulip.example.com/api/v1/")).toBe("1");
  });

  it("returns null when no realm matches", () => {
    expect(findInstanceIdByRealmUri(instances, "https://other.example.com")).toBeNull();
  });

  it("returns null when realm is missing", () => {
    expect(findInstanceIdByRealmUri(instances)).toBeNull();
  });
});

describe("buildRouteFromMessage", () => {
  it("builds a Workspace message route from message UUID and project", () => {
    const route = buildRouteFromMessage(
      {
        id: 55,
        stream_id: 10,
        channel: "General Discussion",
        subject: "Bugs",
        uuid: "message-uuid",
        stream_uuid: "stream-uuid",
        topic_uuid: "topic-uuid",
        org_id: "chat.example.com",
        project_id: "project-uuid",
      },
      7,
    );

    expect(route).toBe("/org/chat.example.com/project/project-uuid/message/message-uuid");
  });

  it("builds legacy stream route with numeric Zulip ids", () => {
    const route = buildRouteFromMessage(
      {
        id: 55,
        stream_id: 10,
        channel: "General Discussion",
        subject: "Bugs",
      },
      7,
    );

    expect(route).toBe("/stream/10-general-discussion/topic/Bugs?msg=55");
  });

  it("builds explicit empty-topic legacy route when topic is empty", () => {
    const route = buildRouteFromMessage(
      {
        id: 56,
        stream_id: 10,
        channel: "General Discussion",
        subject: "   ",
      },
      7,
    );

    expect(route).toBe("/stream/10-general-discussion/topic/__empty__?msg=56");
  });

  it("builds legacy DM route from numeric recipients", () => {
    const route = buildRouteFromMessage(
      {
        id: 77,
        stream_id: null,
        display_recipient: [
          { id: 7, full_name: "You" },
          { id: 42, full_name: "Alice" },
        ],
        subject: "",
      },
      7,
    );

    expect(route).toBe("/dm/42-alice?msg=77");
  });

  it("builds legacy group-DM route from numeric recipients", () => {
    const route = buildRouteFromMessage(
      {
        id: 99,
        stream_id: null,
        display_recipient: [
          { id: 7, full_name: "You" },
          { id: 42, full_name: "Alice" },
          { id: 51, full_name: "Bob" },
        ],
        subject: "",
      },
      7,
    );

    expect(route).toBe("/dm/42-alice,51-bob?msg=99");
  });
});

describe("buildMessageRedirectRoute", () => {
  it("builds legacy message redirect for numeric message id with realm", async () => {
    const { buildMessageRedirectRoute } = await import("./push-click");
    expect(buildMessageRedirectRoute(123, "https://zulip.example.com")).toBe(
      "/message/123?realm=https%3A%2F%2Fzulip.example.com",
    );
  });

  it("builds legacy message redirect for numeric message id without realm", async () => {
    const { buildMessageRedirectRoute } = await import("./push-click");
    expect(buildMessageRedirectRoute(123)).toBe("/message/123");
  });

  it("builds Workspace message route when message UUID and project are present", async () => {
    const { buildMessageRedirectRoute } = await import("./push-click");
    expect(
      buildMessageRedirectRoute(123, "https://zulip.example.com", {
        messageUuid: "message-uuid",
        orgId: "chat.example.com",
        projectId: "project-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/message/message-uuid");
  });
});

describe("buildMessageRedirectRouteFromZulipPermalink", () => {
  it("maps absolute Zulip narrow permalink to legacy message redirect", () => {
    expect(
      buildMessageRedirectRouteFromZulipPermalink(
        "https://zulip.example.com/#narrow/channel/33-InternalServicesDev/topic/Workspace/near/5743236",
      ),
    ).toBe("/message/5743236?realm=https%3A%2F%2Fzulip.example.com");
  });

  it("maps hash-only narrow permalink to legacy message redirect", () => {
    expect(buildMessageRedirectRouteFromZulipPermalink("#narrow/dm/7,42-dm/near/123")).toBe(
      "/message/123",
    );
  });

  it("returns null for non-message permalinks", () => {
    expect(
      buildMessageRedirectRouteFromZulipPermalink("https://zulip.example.com/#narrow/channel/1-a"),
    ).toBeNull();
  });
});

describe("buildNavigableRouteFromMessage", () => {
  it("builds a Workspace message route when UUID and project are present", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    expect(
      buildNavigableRouteFromMessage(
        {
          id: 15,
          stream_id: 10,
          channel: "Engineering",
          subject: "Bugs",
          sender_id: 7,
          uuid: "message-uuid",
          orgId: "chat.example.com",
          projectId: "project-uuid",
        },
        7,
      ),
    ).toBe("/org/chat.example.com/project/project-uuid/message/message-uuid");
  });

  it("builds exact legacy stream route with numeric ids", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    expect(
      buildNavigableRouteFromMessage(
        {
          id: 15,
          stream_id: 10,
          channel: "Engineering",
          subject: "Bugs",
          sender_id: 7,
        },
        7,
      ),
    ).toBe("/stream/10-engineering/topic/Bugs?msg=15");
  });

  it("builds empty-topic legacy route", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    expect(
      buildNavigableRouteFromMessage(
        {
          id: 16,
          stream_id: 10,
          channel: "Engineering",
          subject: "",
          sender_id: 7,
        },
        7,
      ),
    ).toBe("/stream/10-engineering/topic/__empty__?msg=16");
  });

  it("falls back to Inbox instead of sender-based DM routing", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    expect(
      buildNavigableRouteFromMessage(
        {
          id: 77,
          stream_id: null,
          subject: "",
          sender_id: 42,
        },
        7,
      ),
    ).toBe("/inbox");
  });

  it("falls back to Inbox when recipients are unavailable and sender is current user", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    expect(
      buildNavigableRouteFromMessage(
        {
          id: 88,
          stream_id: null,
          subject: "",
          sender_id: 7,
        },
        7,
      ),
    ).toBe("/inbox");
  });
});

describe("buildRouteFromPushNotificationClick", () => {
  it("prefers Workspace message route when message UUID and project are present", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageId: "321",
        messageUuid: "message-uuid",
        realmUri: "https://zulip.example.com",
        messageType: "stream",
        orgId: "chat.example.com",
        projectId: "project-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/message/message-uuid");
  });

  it("builds legacy message redirect when only numeric messageId is present", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageId: "321",
        realmUri: "https://zulip.example.com",
        messageType: "stream",
      }),
    ).toBe("/message/321?realm=https%3A%2F%2Fzulip.example.com");
  });

  it("ignores non-decimal messageId and builds numeric stream fallback route", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageId: "1e3",
        messageType: "stream",
        streamId: "15",
        streamName: "General Discussion",
        topic: "Release Notes",
      }),
    ).toBe("/stream/15-general-discussion/topic/Release%20Notes");
  });

  it("derives Workspace topic fallback route from UUID payload", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageType: "stream",
        streamId: "15",
        streamUuid: "stream-uuid",
        streamName: "General Discussion",
        topicUuid: "topic-uuid",
        topic: "Release Notes",
        orgId: "chat.example.com",
        projectId: "project-uuid",
      }),
    ).toBe("/org/chat.example.com/project/project-uuid/stream/stream-uuid/topic/topic-uuid");
  });

  it("derives stream fallback route from numeric stream id", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageType: "stream",
        streamId: "15",
        streamName: "General Discussion",
        topic: "Release Notes",
      }),
    ).toBe("/stream/15-general-discussion/topic/Release%20Notes");
  });

  it("rejects non-decimal senderId for private fallback routing", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageType: "private",
        senderId: "0x10",
      }),
    ).toBe("/inbox");
  });

  it("returns root when payload is incomplete", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageType: "private",
      }),
    ).toBe("/inbox");
  });
});
