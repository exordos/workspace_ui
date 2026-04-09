import { describe, expect, it } from "vitest";
import {
  chatToWorkspaceChatId,
  parseDmSlugToUserIds,
  parseStreamSlug,
  resolveStreamRouteFromSlug,
} from "./sidebar.lib";

describe("parseStreamSlug", () => {
  it("parses numeric slug prefix into stream id", () => {
    expect(parseStreamSlug("5-general")).toEqual({ stream_id: 5, stream_name: "general" });
  });

  it("decodes fallback stream slug values", () => {
    expect(parseStreamSlug("general%20team")).toEqual({ stream_name: "general team" });
  });

  it("does not throw on malformed encoded stream slug", () => {
    expect(() => parseStreamSlug("%E0%A4%A")).not.toThrow();
    expect(parseStreamSlug("%E0%A4%A")).toEqual({ stream_name: "%E0%A4%A" });
  });
});

describe("resolveStreamRouteFromSlug", () => {
  it("resolves id and name from numeric slug using map when present", () => {
    const map = new Map<number, { name: string }>([[5, { name: "general" }]]);
    expect(resolveStreamRouteFromSlug(parseStreamSlug("5-general"), map)).toEqual({
      resolvedStreamName: "general",
      resolvedStreamId: 5,
    });
  });

  it("resolves stream id for legacy slug by exact stream name in map", () => {
    const map = new Map<number, { name: string }>([[12, { name: "marketing" }]]);
    expect(resolveStreamRouteFromSlug(parseStreamSlug("marketing"), map)).toEqual({
      resolvedStreamName: "marketing",
      resolvedStreamId: 12,
    });
  });

  it("returns null id when legacy name is not in map", () => {
    const map = new Map<number, { name: string }>();
    expect(resolveStreamRouteFromSlug(parseStreamSlug("unknown"), map)).toEqual({
      resolvedStreamName: "unknown",
      resolvedStreamId: null,
    });
  });
});

describe("parseDmSlugToUserIds", () => {
  it("parses standard DM slug user IDs", () => {
    expect(parseDmSlugToUserIds("422-vasya,507-petya")).toEqual([422, 507]);
  });

  it("returns stable array reference for identical slug", () => {
    const first = parseDmSlugToUserIds("422-vasya,507-petya");
    const second = parseDmSlugToUserIds("422-vasya,507-petya");
    expect(second).toBe(first);
  });

  it("ignores exponent-form user ids", () => {
    expect(parseDmSlugToUserIds("1e3-user")).toEqual([]);
  });

  it("ignores hex-form user ids", () => {
    expect(parseDmSlugToUserIds("0x10-user")).toEqual([]);
  });
});

describe("chatToWorkspaceChatId", () => {
  it("prefers dm userIds over slug parsing when userIds are present", () => {
    expect(
      chatToWorkspaceChatId({
        type: "dm",
        id: 42,
        name: "Bob",
        slug: "999-stale",
        isGroup: false,
        userIds: [7, 42],
      }),
    ).toBe("dm:7,42");
  });

  it("falls back to dm slug parsing when userIds are missing", () => {
    expect(
      chatToWorkspaceChatId({
        type: "dm",
        id: 42,
        name: "Bob",
        slug: "42-bob",
        isGroup: false,
      }),
    ).toBe("dm:42");
  });
});
