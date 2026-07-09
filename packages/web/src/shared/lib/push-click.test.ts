import { describe, expect, it } from "vitest";
import {
  buildMessageRedirectRouteFromZulipPermalink,
  buildPushClickUrl,
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
