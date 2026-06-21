import { describe, expect, it } from "vitest";
import { normalizeDmRouteUserIds } from "./dm-route.lib";

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

  it("removes IAM current user from UUID peer route", () => {
    const currentUuid = "00000000-0000-0000-0000-000000000001";
    const peerUuid = "00000000-0000-0000-0000-000000000002";
    expect(normalizeDmRouteUserIds([currentUuid, peerUuid], currentUuid)).toEqual([peerUuid]);
  });
});
