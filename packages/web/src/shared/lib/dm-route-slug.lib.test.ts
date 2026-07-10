import { describe, expect, it } from "vitest";
import { isDmRouteSlugActive, parseDmRouteParticipantIds } from "./dm-route-slug.lib";

describe("parseDmRouteParticipantIds", () => {
  it("parses single-user slug with display name suffix", () => {
    expect(parseDmRouteParticipantIds("42-alice")).toEqual([42]);
  });

  it("parses numeric-only route segment", () => {
    expect(parseDmRouteParticipantIds("42")).toEqual([42]);
  });

  it("parses comma-separated group slug", () => {
    expect(parseDmRouteParticipantIds("7-bob,8-carol")).toEqual([7, 8]);
  });
});

describe("isDmRouteSlugActive", () => {
  it("matches sidebar slug when route uses numeric ids only", () => {
    expect(isDmRouteSlugActive("42-alice", "42", 7)).toBe(true);
  });

  it("returns false for different conversations", () => {
    expect(isDmRouteSlugActive("42-alice", "77", 7)).toBe(false);
  });

  it("matches exact slug strings", () => {
    expect(isDmRouteSlugActive("42-alice", "42-alice", 7)).toBe(true);
  });
});
