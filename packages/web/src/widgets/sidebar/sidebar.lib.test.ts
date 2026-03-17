import { describe, expect, it } from "vitest";
import { parseDmSlugToUserIds, parseStreamSlug } from "./sidebar.lib";

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
