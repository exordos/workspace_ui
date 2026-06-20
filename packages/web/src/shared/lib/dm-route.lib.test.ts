import { describe, expect, it } from "vitest";
import {
  computeIsGroupDmView,
  effectiveDmIsGroupFromSlug,
  normalizeDmRouteUserIds,
  routeImpliesGroupDm,
} from "./dm-route.lib";

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

describe("routeImpliesGroupDm", () => {
  it("always returns false after group DM removal", () => {
    expect(routeImpliesGroupDm([10, 20], null)).toBe(false);
    expect(routeImpliesGroupDm([10, 20, 30], null)).toBe(false);
    expect(routeImpliesGroupDm([42], 7)).toBe(false);
    expect(routeImpliesGroupDm([42, 51], 7)).toBe(false);
  });
});

describe("computeIsGroupDmView", () => {
  it("always returns false after group DM removal", () => {
    expect(computeIsGroupDmView({ isGroup: true }, [42], 7)).toBe(false);
    expect(computeIsGroupDmView({ isGroup: false }, [1, 2, 3], 7)).toBe(false);
    expect(computeIsGroupDmView({ isGroup: true }, [42, 51], 7)).toBe(false);
    expect(computeIsGroupDmView(undefined, [10, 20], null)).toBe(false);
    expect(computeIsGroupDmView(undefined, [10, 20, 30], null)).toBe(false);
  });
});

describe("effectiveDmIsGroupFromSlug", () => {
  it("always returns false after group DM removal", () => {
    expect(effectiveDmIsGroupFromSlug(true, [7, 42], null)).toBe(false);
    expect(effectiveDmIsGroupFromSlug(true, [7, 42, 51], 7)).toBe(false);
    expect(effectiveDmIsGroupFromSlug(true, [7, 42], 7)).toBe(false);
  });
});
