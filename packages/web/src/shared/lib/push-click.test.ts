import { describe, expect, it } from "vitest";
import {
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
    const url = buildPushClickUrl({
      type: "stream",
      streamId: 15,
      streamName: "General Discussion",
      topic: "Release Notes",
      messageId: 123,
    });

    expect(url).toBe("/stream/15-general-discussion/topic/Release%20Notes?msg=123");
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

  it("omits topic segment when topic is whitespace-only", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamName: "general",
      topic: "   ",
      messageId: 42,
    });

    expect(url).toBe("/stream/general?msg=42");
  });

  it("builds a private DM URL from sender id", () => {
    const url = buildPushClickUrl({
      type: "private",
      senderId: 42,
      messageId: 99,
    });

    expect(url).toBe("/dm/42?msg=99");
  });

  it("returns root when payload lacks enough routing data", () => {
    const url = buildPushClickUrl({});
    expect(url).toBe("/");
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
    expect(findInstanceIdByRealmUri(instances, undefined)).toBeNull();
  });
});

describe("buildRouteFromMessage", () => {
  it("builds a canonical stream route with message focus", () => {
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

  it("builds stream root route when topic is empty", () => {
    const route = buildRouteFromMessage(
      {
        id: 56,
        stream_id: 10,
        channel: "General Discussion",
        subject: "   ",
      },
      7,
    );

    expect(route).toBe("/stream/10-general-discussion?msg=56");
  });

  it("builds a DM route using recipients other than current user", () => {
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

    expect(route).toBe("/dm/42?msg=77");
  });

  it("builds a group-DM route from all non-self recipients", () => {
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

    expect(route).toBe("/dm/42,51?msg=99");
  });
});

describe("buildMessageRedirectRoute", () => {
  it("builds a redirect route with encoded realm query", async () => {
    const { buildMessageRedirectRoute } = await import("./push-click");
    expect(buildMessageRedirectRoute(123, "https://zulip.example.com")).toBe(
      "/message/123?realm=https%3A%2F%2Fzulip.example.com",
    );
  });

  it("omits realm query when missing", async () => {
    const { buildMessageRedirectRoute } = await import("./push-click");
    expect(buildMessageRedirectRoute(123)).toBe("/message/123");
  });
});

describe("buildNavigableRouteFromMessage", () => {
  it("builds an exact stream route with focused message query", async () => {
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

  it("builds stream root route for empty stream topic", async () => {
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
    ).toBe("/stream/10-engineering?msg=16");
  });

  it("falls back to sender-based DM routing when recipients are unavailable", async () => {
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
    ).toBe("/dm/42?msg=77");
  });

  it("returns null when recipients are unavailable and sender is current user", async () => {
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
    ).toBeNull();
  });
});

describe("buildRouteFromPushNotificationClick", () => {
  it("prefers redirect route when messageId is present", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageId: "321",
        realmUri: "https://zulip.example.com",
        messageType: "stream",
      }),
    ).toBe("/message/321?realm=https%3A%2F%2Fzulip.example.com");
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
