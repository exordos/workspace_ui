import { describe, expect, it } from "vitest";
import {
  computeHasNewerAfterLoadNewerIdbPage,
  computeHasNewerAfterLoadNewerMemoryPage,
  computeHasOlderAfterLoadOlderIdbPage,
  computeHasOlderAfterLoadOlderMemoryPage,
  mergeOlderLoadAnchor,
} from "./message-pagination-boundary.lib";

describe("computeHasOlderAfterLoadOlderIdbPage", () => {
  it("returns false when server reports foundOldest", () => {
    expect(
      computeHasOlderAfterLoadOlderIdbPage({
        foundOldest: true,
        withoutAnchorCount: 50,
        pageSize: 50,
        toUpsertCount: 50,
      }),
    ).toBe(false);
  });

  it("returns false when partial page (end of older history)", () => {
    expect(
      computeHasOlderAfterLoadOlderIdbPage({
        foundOldest: false,
        withoutAnchorCount: 12,
        pageSize: 50,
        toUpsertCount: 12,
      }),
    ).toBe(false);
  });

  it("returns true on full page even when all rows were already in IndexedDB (overlap)", () => {
    expect(
      computeHasOlderAfterLoadOlderIdbPage({
        foundOldest: false,
        withoutAnchorCount: 50,
        pageSize: 50,
        toUpsertCount: 0,
      }),
    ).toBe(true);
  });

  it("returns true when full page with new ids", () => {
    expect(
      computeHasOlderAfterLoadOlderIdbPage({
        foundOldest: false,
        withoutAnchorCount: 50,
        pageSize: 50,
        toUpsertCount: 50,
      }),
    ).toBe(true);
  });
});

describe("computeHasNewerAfterLoadNewerIdbPage", () => {
  it("returns false when foundNewest", () => {
    expect(
      computeHasNewerAfterLoadNewerIdbPage({
        foundNewest: true,
        withoutAnchorCount: 10,
        pageSize: 50,
        toUpsertCount: 10,
      }),
    ).toBe(false);
  });

  it("returns true on full duplicate-only page when not foundNewest", () => {
    expect(
      computeHasNewerAfterLoadNewerIdbPage({
        foundNewest: false,
        withoutAnchorCount: 50,
        pageSize: 50,
        toUpsertCount: 0,
      }),
    ).toBe(true);
  });
});

describe("mergeOlderLoadAnchor", () => {
  it("prefers lower id when store is ahead of idb", () => {
    expect(mergeOlderLoadAnchor(4154137, 4288890)).toBe(4154137);
  });

  it("uses idb when store is empty", () => {
    expect(mergeOlderLoadAnchor(null, 4288890)).toBe(4288890);
  });

  it("uses store when idb has no oldest", () => {
    expect(mergeOlderLoadAnchor(100, null)).toBe(100);
  });

  it("returns null when both missing", () => {
    expect(mergeOlderLoadAnchor(null, null)).toBe(null);
  });
});

describe("computeHasOlderAfterLoadOlderMemoryPage", () => {
  it("returns false when foundOldest", () => {
    expect(
      computeHasOlderAfterLoadOlderMemoryPage({
        foundOldest: true,
        withoutAnchorCount: 50,
        pageSize: 50,
      }),
    ).toBe(false);
  });

  it("returns true for full page without foundOldest", () => {
    expect(
      computeHasOlderAfterLoadOlderMemoryPage({
        foundOldest: false,
        withoutAnchorCount: 50,
        pageSize: 50,
      }),
    ).toBe(true);
  });
});

describe("computeHasNewerAfterLoadNewerMemoryPage", () => {
  it("returns false when foundNewest", () => {
    expect(
      computeHasNewerAfterLoadNewerMemoryPage({
        foundNewest: true,
        withoutAnchorCount: 50,
        pageSize: 50,
      }),
    ).toBe(false);
  });
});
