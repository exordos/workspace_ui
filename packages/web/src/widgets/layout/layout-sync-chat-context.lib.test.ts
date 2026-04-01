import { describe, expect, it } from "vitest";
import { parseChatContextFromPathname, stripOrgSegmentFromPathname } from "./layout-sync-chat-context.lib";

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
    const ctx = parseChatContextFromPathname({
      pathname: "/org/zulip.example.com/dm/358-507",
      streamsMap,
      currentUserId: 100,
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.type).toBe("dm");
    if (ctx?.type === "dm") {
      expect(ctx.dmKey.length).toBeGreaterThan(0);
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
    expect(a?.type).toBe("dm");
    expect(b?.type).toBe("dm");
    if (a?.type === "dm" && b?.type === "dm") {
      expect(a.dmKey).toBe(b.dmKey);
    }
  });
});
