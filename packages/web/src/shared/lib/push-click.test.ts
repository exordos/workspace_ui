import { describe, expect, it } from "vitest";
import {
  buildPushClickUrl,
  findInstanceIdByRealmUri,
  buildRouteFromPushNotificationClick,
  resolvePushClickRoute,
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

  it("returns an unsupported result instead of building a legacy stream route", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamId: 15,
      streamName: "General Discussion",
      topic: "Release Notes",
    });

    expect(url).toBe("/");
    expect(
      resolvePushClickRoute({
        type: "stream",
        streamId: 15,
        streamName: "General Discussion",
        topic: "Release Notes",
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "workspace_route_context_missing",
      route: "/",
    });
  });

  it("does not append numeric message focus to an unsupported legacy route", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamId: 15,
      streamName: "General Discussion",
      topic: "Release Notes",
      messageId: 123,
    });

    expect(url).toBe("/");
  });

  it("does not build a stream route from a legacy name", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamName: "general",
      topic: "bugs",
    });

    expect(url).toBe("/");
  });

  it("does not encode unsafe legacy stream text into a route", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamName: "eng/ops?tab=all",
      topic: "bugs",
    });

    expect(url).toBe("/");
  });

  it("returns a scoped safe fallback when topic UUID is missing", () => {
    const url = buildPushClickUrl({
      type: "stream",
      streamUuid: "stream-uuid",
      topic: "   ",
      messageId: 42,
      orgId: "chat.example.com",
      projectId: "project-uuid",
    });

    expect(url).toBe("/org/chat.example.com");
  });

  it("returns a safe fallback instead of building a legacy DM route", () => {
    const url = buildPushClickUrl({
      type: "private",
      senderId: 42,
      messageId: 99,
    });

    expect(url).toBe("/");
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
    expect(findInstanceIdByRealmUri(instances)).toBeNull();
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

  it("returns a safe fallback when only numeric messageId is present", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageId: "321",
        realmUri: "https://zulip.example.com",
        messageType: "stream",
      }),
    ).toBe("/");
  });

  it("returns a safe fallback for non-Workspace message and stream fields", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageId: "1e3",
        messageType: "stream",
        streamId: "15",
        streamName: "General Discussion",
        topic: "Release Notes",
      }),
    ).toBe("/");
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

  it("does not derive a route from numeric stream fields", () => {
    expect(
      buildRouteFromPushNotificationClick({
        messageType: "stream",
        streamId: "15",
        streamName: "General Discussion",
        topic: "Release Notes",
      }),
    ).toBe("/");
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
