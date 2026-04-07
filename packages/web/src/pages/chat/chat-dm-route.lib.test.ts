import { describe, expect, it } from "vitest";
import {
  computeIsGroupDmView,
  effectiveDmIsGroupFromSlug,
  normalizeDmRouteUserIds,
  routeImpliesGroupDm,
} from "./chat-dm-route.lib";

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

describe("routeImpliesGroupDm", () => {
  it("treats two ids in slug as 1:1 when current user is not known yet", () => {
    expect(routeImpliesGroupDm([10, 20], null)).toBe(false);
  });

  it("treats three ids in slug as huddle when current user is not known", () => {
    expect(routeImpliesGroupDm([10, 20, 30], null)).toBe(true);
  });

  it("treats one normalized peer as 1:1 when current user is set", () => {
    expect(routeImpliesGroupDm([42], 7)).toBe(false);
  });

  it("treats two normalized peers as huddle when current user is set", () => {
    expect(routeImpliesGroupDm([42, 51], 7)).toBe(true);
  });
});

describe("computeIsGroupDmView", () => {
  it("ignores sidebar isGroup true when route shows a single peer (stale row)", () => {
    expect(computeIsGroupDmView({ isGroup: true }, [42], 7)).toBe(false);
  });

  it("honors sidebar isGroup false even if route temporarily has extra ids", () => {
    expect(computeIsGroupDmView({ isGroup: false }, [1, 2, 3], 7)).toBe(false);
  });

  it("is group when sidebar says group and route has two peers besides self", () => {
    expect(computeIsGroupDmView({ isGroup: true }, [42, 51], 7)).toBe(true);
  });

  it("uses route only when dm row is missing", () => {
    expect(computeIsGroupDmView(undefined, [10, 20], null)).toBe(false);
    expect(computeIsGroupDmView(undefined, [10, 20, 30], null)).toBe(true);
  });
});

describe("effectiveDmIsGroupFromSlug", () => {
  it("treats two-participant slug as 1:1 when API row has isGroup true (stale)", () => {
    expect(effectiveDmIsGroupFromSlug(true, [7, 42], null)).toBe(false);
  });

  it("delegates to computeIsGroupDmView after normalizing slug ids", () => {
    expect(effectiveDmIsGroupFromSlug(true, [7, 42, 51], 7)).toBe(true);
    expect(effectiveDmIsGroupFromSlug(true, [7, 42], 7)).toBe(false);
  });
});
