import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  buildMessageRedirectRouteFromWorkspacePermalink,
  buildPushClickUrl,
  buildRouteFromMessage,
  findInstanceIdByRealmUri,
  buildRouteFromPushNotificationClick,
} from "./push-click";

describe("buildPushClickUrl", () => {
  it("builds a canonical stream topic URL when stream id is present", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamId: 15,
      streamName: "General Discussion",
      topic: "Release Notes",
    });

    expect(url).toBe("/stream/15-general-discussion/topic/Release%20Notes");
  });

  it("appends ?msg= when message id is provided", () => {
    const messageId = testMessageId(123);
    const url = buildPushClickUrl({
      type: "stream",
      streamId: 15,
      streamName: "General Discussion",
      topic: "Release Notes",
      messageId,
    });

    expect(url).toBe(`/stream/15-general-discussion/topic/Release%20Notes?msg=${messageId}`);
  });

  it("falls back to legacy stream-name URL when stream id is missing", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamName: "general",
      topic: "bugs",
    });

    expect(url).toBe("/stream/general/topic/bugs");
  });

  it("encodes legacy stream-name segment to avoid route/query pollution", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamName: "eng/ops?tab=all",
      topic: "bugs",
    });

    expect(url).toBe("/stream/eng%2Fops%3Ftab%3Dall/topic/bugs");
  });

  it("uses explicit empty-topic route token when topic is whitespace-only", () => {
    const messageId = testMessageId(42);
    const url = buildPushClickUrl({
      type: "stream",
      streamName: "general",
      topic: "   ",
      messageId,
    });

    expect(url).toBe(`/stream/general/topic/__empty__?msg=${messageId}`);
  });

  it("builds a private DM URL from sender id", () => {
    const messageId = testMessageId(99);
    const url = buildPushClickUrl({
      type: "private",
      senderId: 42,
      messageId,
    });

    expect(url).toBe(`/dm/42?msg=${messageId}`);
  });

  it("returns root when payload lacks enough routing data", () => {
    const url = buildPushClickUrl({});
    expect(url).toBe("/");
  });
});

describe("findInstanceIdByRealmUri", () => {
  const instances = [
    {
      id: "1",
      realm: "https://chat.example.com",
      login: "a@test.com",
      authType: "iam",
      iamAccessToken: "k1",
    },
    {
      id: "2",
      realm: "https://chat.example.com",
      login: "b@test.com",
      authType: "iam",
      iamAccessToken: "k2",
    },
  ];

  it("matches exact realm url", () => {
    expect(findInstanceIdByRealmUri(instances, "https://chat.example.com")).toBe("1");
  });

  it("matches normalized realm url with api suffix and trailing slash", () => {
    expect(findInstanceIdByRealmUri(instances, "https://chat.example.com/api/messenger/v1/")).toBe(
      "1",
    );
  });

  it("returns null when no realm matches", () => {
    expect(findInstanceIdByRealmUri(instances, "https://other.example.com")).toBeNull();
  });

  it("returns null when realm is missing", () => {
    expect(findInstanceIdByRealmUri(instances, undefined)).toBeNull();
  });
});

describe("buildRouteFromMessage", () => {
  it("builds a canonical stream route with message focus", () => {
    const messageId = testMessageId(55);
    const route = buildRouteFromMessage(
      {
        id: messageId,
        stream_id: 10,
        channel: "General Discussion",
        subject: "Bugs",
      },
      7,
    );

    expect(route).toBe(`/stream/10-general-discussion/topic/Bugs?msg=${messageId}`);
  });

  it("builds explicit empty-topic route when topic is empty", () => {
    const messageId = testMessageId(56);
    const route = buildRouteFromMessage(
      {
        id: messageId,
        stream_id: 10,
        channel: "General Discussion",
        subject: "   ",
      },
      7,
    );

    expect(route).toBe(`/stream/10-general-discussion/topic/__empty__?msg=${messageId}`);
  });

  it("builds a DM route using recipients other than current user", () => {
    const messageId = testMessageId(77);
    const route = buildRouteFromMessage(
      {
        id: messageId,
        stream_id: null,
        display_recipient: [
          { id: 7, full_name: "You" },
          { id: 42, full_name: "Alice" },
        ],
        subject: "",
      },
      7,
    );

    expect(route).toBe(`/dm/42-alice?msg=${messageId}`);
  });

  it("builds a group-DM route from all non-self recipients", () => {
    const messageId = testMessageId(99);
    const route = buildRouteFromMessage(
      {
        id: messageId,
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

    expect(route).toBe(`/dm/42-alice,51-bob?msg=${messageId}`);
  });
});

describe("buildMessageRedirectRoute", () => {
  it("builds a redirect route with encoded realm query", async () => {
    const { buildMessageRedirectRoute } = await import("./push-click");
    const messageId = testMessageId(123);
    expect(buildMessageRedirectRoute(messageId, "https://chat.example.com")).toBe(
      `/message/${messageId}?realm=https%3A%2F%2Fchat.example.com`,
    );
  });

  it("omits realm query when missing", async () => {
    const { buildMessageRedirectRoute } = await import("./push-click");
    const messageId = testMessageId(123);
    expect(buildMessageRedirectRoute(messageId)).toBe(`/message/${messageId}`);
  });
});

describe("buildMessageRedirectRouteFromWorkspacePermalink", () => {
  it("maps absolute messenger narrow permalink to internal message redirect route", () => {
    const messageId = testMessageId(5743236);
    expect(
      buildMessageRedirectRouteFromWorkspacePermalink(
        `https://chat.example.com/#narrow/channel/33-InternalServicesDev/topic/Workspace/near/${messageId}`,
      ),
    ).toBe(`/message/${messageId}?realm=https%3A%2F%2Fchat.example.com`);
  });

  it("maps hash-only narrow permalink to current-instance redirect route", () => {
    const messageId = testMessageId(123);
    expect(
      buildMessageRedirectRouteFromWorkspacePermalink(`#narrow/dm/7,42-dm/near/${messageId}`),
    ).toBe(`/message/${messageId}`);
  });

  it("returns null for non-message permalinks", () => {
    expect(
      buildMessageRedirectRouteFromWorkspacePermalink(
        "https://chat.example.com/#narrow/channel/1-a",
      ),
    ).toBeNull();
  });
});

describe("buildNavigableRouteFromMessage", () => {
  it("builds an exact stream route with focused message query", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    const messageId = testMessageId(15);
    expect(
      buildNavigableRouteFromMessage(
        {
          id: messageId,
          stream_id: 10,
          channel: "Engineering",
          subject: "Bugs",
          sender_id: 7,
        },
        7,
      ),
    ).toBe(`/stream/10-engineering/topic/Bugs?msg=${messageId}`);
  });

  it("builds explicit empty-topic route for empty stream topic", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    const messageId = testMessageId(16);
    expect(
      buildNavigableRouteFromMessage(
        {
          id: messageId,
          stream_id: 10,
          channel: "Engineering",
          subject: "",
          sender_id: 7,
        },
        7,
      ),
    ).toBe(`/stream/10-engineering/topic/__empty__?msg=${messageId}`);
  });

  it("falls back to sender-based DM routing when recipients are unavailable", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    const messageId = testMessageId(77);
    expect(
      buildNavigableRouteFromMessage(
        {
          id: messageId,
          stream_id: null,
          subject: "",
          sender_id: 42,
        },
        7,
      ),
    ).toBe(`/dm/42?msg=${messageId}`);
  });

  it("returns null when recipients are unavailable and sender is current user", async () => {
    const { buildNavigableRouteFromMessage } = await import("./push-click");
    expect(
      buildNavigableRouteFromMessage(
        {
          id: "00000000-0000-4000-8000-000000000088",
          stream_id: null,
          subject: "",
          sender_id: 7,
        },
        7,
      ),
    ).toBeNull();
  });
});

describe("buildRouteFromPushNotificationClick", () => {
  it("prefers redirect route when messageId is present", () => {
    const messageId = testMessageId(321);
    expect(
      buildRouteFromPushNotificationClick({
        messageId,
        realmUri: "https://chat.example.com",
        messageType: "stream",
      }),
    ).toBe(`/message/${messageId}?realm=https%3A%2F%2Fchat.example.com`);
  });

  it("ignores non-decimal messageId and falls back to stream route", () => {
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

  it("derives stream fallback route without reading raw url", () => {
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
    ).toBe("/");
  });

  it("returns root when payload is incomplete", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageType: "private",
      }),
    ).toBe("/");
  });
});
