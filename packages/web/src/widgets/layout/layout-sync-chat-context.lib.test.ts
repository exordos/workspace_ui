import { describe, expect, it } from "vitest";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import {
  isStoreContextAlignedWithParsedRoute,
  parseChatContextFromPathname,
  stripOrgSegmentFromPathname,
} from "./layout-sync-chat-context.lib";

describe("stripOrgSegmentFromPathname", () => {
  it("strips /org/:id prefix before dm", () => {
    expect(stripOrgSegmentFromPathname("/org/realm.example.com/dm/358-507")).toBe("/dm/358-507");
  });

  it("strips org prefix before stream topic", () => {
    expect(stripOrgSegmentFromPathname("/org/r/stream/general/topic/hello")).toBe(
      "/stream/general/topic/hello",
    );
  });

  it("leaves root dm path unchanged", () => {
    expect(stripOrgSegmentFromPathname("/dm/1-2")).toBe("/dm/1-2");
  });

  it("returns pathname unchanged for /org/:id only (no child segment)", () => {
    expect(stripOrgSegmentFromPathname("/org/realm")).toBe("/org/realm");
  });

  it("strips org prefix for nested non-chat paths too", () => {
    expect(stripOrgSegmentFromPathname("/org/realm/inbox")).toBe("/inbox");
  });
});

describe("parseChatContextFromPathname", () => {
  it("parses DM under /org/:orgId/dm/:dmId", () => {
    const streamsMap = new Map<number, { name: string }>();
    const parsed = parseChatContextFromPathname({
      pathname: "/org/zulip.example.com/dm/358-507",
      streamsMap,
      currentUserId: 100,
    });
    expect(parsed.context).not.toBeNull();
    expect(parsed.context?.type).toBe("dm");
    expect(parsed.streamTopicExplicitInUrl).toBe(false);
    if (parsed.context?.type === "dm") {
      expect(parsed.context.dmKey.length).toBeGreaterThan(0);
    }
  });

  it("parses DM at /dm/:dmId", () => {
    const streamsMap = new Map<number, { name: string }>();
    const a = parseChatContextFromPathname({
      pathname: "/dm/358-507",
      streamsMap,
      currentUserId: 100,
    });
    const b = parseChatContextFromPathname({
      pathname: "/org/x/dm/358-507",
      streamsMap,
      currentUserId: 100,
    });
    expect(a.context?.type).toBe("dm");
    expect(b.context?.type).toBe("dm");
    if (a.context?.type === "dm" && b.context?.type === "dm") {
      expect(a.context.dmKey).toBe(b.context.dmKey);
    }
  });

  it("marks streamWideView and explicit topic for /stream/:slug/topic/:topic", () => {
    const streamsMap = new Map<number, { name: string }>([[5, { name: "engineering" }]]);
    const parsed = parseChatContextFromPathname({
      pathname: "/stream/5-engineering/topic/bugs",
      streamsMap,
      currentUserId: 1,
    });
    expect(parsed.streamTopicExplicitInUrl).toBe(true);
    expect(parsed.context?.type).toBe("stream");
    if (parsed.context?.type === "stream") {
      expect(parsed.context.streamId).toBe(5);
      expect(parsed.context.topic).toBe("bugs");
      expect(parsed.context.streamWideView).toBe(false);
    }
  });

  it("marks stream overview without explicit topic segment", () => {
    const streamsMap = new Map<number, { name: string }>([[5, { name: "engineering" }]]);
    const parsed = parseChatContextFromPathname({
      pathname: "/stream/5-engineering",
      streamsMap,
      currentUserId: 1,
    });
    expect(parsed.streamTopicExplicitInUrl).toBe(false);
    expect(parsed.context?.type).toBe("stream");
    if (parsed.context?.type === "stream") {
      expect(parsed.context.streamWideView).toBe(true);
      expect(parsed.context.topic).toBe("general");
    }
  });
});

describe("isStoreContextAlignedWithParsedRoute", () => {
  it("treats store topic as aligned with URL overview when streamId matches", () => {
    const streamsMap = new Map<number, { name: string }>([[5, { name: "engineering" }]]);
    const parsed = parseChatContextFromPathname({
      pathname: "/stream/5-engineering",
      streamsMap,
      currentUserId: 1,
    });
    const store: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "engineering",
      topic: "incidents",
      streamWideView: true,
    };
    expect(isStoreContextAlignedWithParsedRoute(store, parsed)).toBe(true);
  });

  it("requires topic match when URL has explicit topic", () => {
    const streamsMap = new Map<number, { name: string }>([[5, { name: "engineering" }]]);
    const parsed = parseChatContextFromPathname({
      pathname: "/stream/5-engineering/topic/bugs",
      streamsMap,
      currentUserId: 1,
    });
    const aligned: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "engineering",
      topic: "bugs",
    };
    const wrongTopic: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "engineering",
      topic: "other",
    };
    expect(isStoreContextAlignedWithParsedRoute(aligned, parsed)).toBe(true);
    expect(isStoreContextAlignedWithParsedRoute(wrongTopic, parsed)).toBe(false);
  });
});
