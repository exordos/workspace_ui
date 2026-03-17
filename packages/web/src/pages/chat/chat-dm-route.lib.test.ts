import { describe, expect, it } from "vitest";
import { normalizeDmRouteUserIds } from "./chat-dm-route.lib";

describe("normalizeDmRouteUserIds", () => {
  it("removes current user id when opening multi-user private chat route", () => {
    expect(normalizeDmRouteUserIds([7, 42, 51], 7)).toEqual([42, 51]);
  });

  it("keeps only recipient in one-to-one route that also contains current user", () => {
    expect(normalizeDmRouteUserIds([7, 42], 7)).toEqual([42]);
  });

  it("keeps self id for self-DM", () => {
    expect(normalizeDmRouteUserIds([7], 7)).toEqual([7]);
  });

  it("deduplicates ids and ignores invalid values", () => {
    expect(normalizeDmRouteUserIds([0, 42, 42, -5, 51], 7)).toEqual([42, 51]);
  });
});
