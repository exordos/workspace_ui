import { describe, expect, it } from "vitest";
import {
  conversationIdForStream,
  conversationIdForTopic,
  isMessengerUuid,
  parseMessengerConversationId,
  selectMessengerConversationFromWorkspaceRoute,
} from "./messenger-ids.lib";

// Conversation ids must reject old Zulip-style ids during the migration.
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";

describe("messenger conversation ids", () => {
  it("accepts canonical backend UUIDs including fixed and newer version identifiers", () => {
    expect(isMessengerUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isMessengerUuid("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isMessengerUuid("0195c3aa-3918-7000-8000-000000000001")).toBe(true);
    expect(isMessengerUuid("75309057-419c-8b12-a7c1-3932429ec4a6")).toBe(true);
  });

  it("rejects incomplete and malformed backend UUIDs", () => {
    expect(isMessengerUuid(null)).toBe(false);
    expect(isMessengerUuid("123")).toBe(false);
    expect(isMessengerUuid("00000000-0000-0000-0000-00000000000g")).toBe(false);
    expect(isMessengerUuid(` ${STREAM_UUID}`)).toBe(false);
  });

  it("builds and parses stream conversation ids from UUIDs", () => {
    const id = conversationIdForStream(STREAM_UUID);

    expect(id).toBe(`stream:${STREAM_UUID}`);
    expect(parseMessengerConversationId(id)).toEqual({
      kind: "stream",
      streamUuid: STREAM_UUID,
    });
  });

  it("builds and parses topic conversation ids from UUIDs", () => {
    const id = conversationIdForTopic(STREAM_UUID, TOPIC_UUID);

    expect(id).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    expect(parseMessengerConversationId(id)).toEqual({
      kind: "topic",
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
    });
  });

  it("rejects legacy and malformed conversation ids", () => {
    expect(parseMessengerConversationId("dm:123")).toBeNull();
    expect(parseMessengerConversationId("stream:123")).toBeNull();
    expect(parseMessengerConversationId(`topic:${STREAM_UUID}`)).toBeNull();
    expect(() => conversationIdForStream("123")).toThrow("Invalid stream uuid");
    expect(() => conversationIdForTopic(STREAM_UUID, "123")).toThrow("Invalid topic uuid");
  });

  it("selects stream and topic conversations from Workspace routes", () => {
    expect(
      selectMessengerConversationFromWorkspaceRoute({
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      }),
    ).toEqual({
      status: "conversation",
      kind: "stream",
      conversationId: `stream:${STREAM_UUID}`,
      streamUuid: STREAM_UUID,
    });

    expect(
      selectMessengerConversationFromWorkspaceRoute({
        kind: "topic",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      }),
    ).toEqual({
      status: "conversation",
      kind: "topic",
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
    });
  });

  it("selects message routes for Workspace message window resolution", () => {
    expect(
      selectMessengerConversationFromWorkspaceRoute({
        kind: "message",
        orgId: "org-a",
        projectId: "project-a",
        messageUuid: TOPIC_UUID,
      }),
    ).toEqual({ status: "message", messageUuid: TOPIC_UUID });
  });

  it("rejects invalid Workspace conversation route UUIDs", () => {
    expect(
      selectMessengerConversationFromWorkspaceRoute({
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: "general",
      }),
    ).toEqual({ status: "invalid-route" });
    expect(
      selectMessengerConversationFromWorkspaceRoute({
        kind: "root",
        orgId: "org-a",
        projectId: "project-a",
      }),
    ).toEqual({ status: "none", reason: "root" });
    expect(
      selectMessengerConversationFromWorkspaceRoute({
        kind: "message",
        orgId: "org-a",
        projectId: "project-a",
        messageUuid: "not-a-message-uuid",
      }),
    ).toEqual({ status: "invalid-route" });
  });
});
