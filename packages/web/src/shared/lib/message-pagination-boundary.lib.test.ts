import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  computeHasNewerAfterLoadNewerIdbPage,
  computeHasNewerAfterLoadNewerMemoryPage,
  computeHasOlderAfterLoadOlderIdbPage,
  computeHasOlderAfterLoadOlderMemoryPage,
  mergeOlderLoadAnchor,
  resolveHasOlderAfterLoadOlderPage,
  resolveOldestMessageId,
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

describe("resolveHasOlderAfterLoadOlderPage", () => {
  it("returns false when foundOldest", () => {
    expect(
      resolveHasOlderAfterLoadOlderPage({
        foundOldest: true,
        withoutAnchorCount: 50,
        pageSize: 50,
        toUpsertCount: 0,
      }),
    ).toBe(false);
  });

  it("returns false on full duplicate page with no store progress", () => {
    expect(
      resolveHasOlderAfterLoadOlderPage({
        foundOldest: false,
        withoutAnchorCount: 50,
        pageSize: 50,
        toUpsertCount: 0,
      }),
    ).toBe(false);
  });

  it("returns true when fresh rows were prepended", () => {
    expect(
      resolveHasOlderAfterLoadOlderPage({
        foundOldest: false,
        withoutAnchorCount: 50,
        pageSize: 50,
        toUpsertCount: 50,
      }),
    ).toBe(true);
  });

  it("returns false on partial page without foundOldest", () => {
    expect(
      resolveHasOlderAfterLoadOlderPage({
        foundOldest: false,
        withoutAnchorCount: 12,
        pageSize: 50,
        toUpsertCount: 12,
      }),
    ).toBe(false);
  });
});

describe("resolveOldestMessageId", () => {
  it("returns first ordered id", () => {
    expect(
      resolveOldestMessageId([
        { id: testMessageId(105) },
        { id: testMessageId(100) },
        { id: testMessageId(102) },
      ]),
    ).toBe(testMessageId(105));
  });

  it("returns null for empty list", () => {
    expect(resolveOldestMessageId([])).toBe(null);
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
  it("prefers store anchor when store is ahead of idb", () => {
    expect(
      mergeOlderLoadAnchor(
        "00000000-0000-4000-8000-000004154137",
        "00000000-0000-4000-8000-000004288890",
      ),
    ).toBe("00000000-0000-4000-8000-000004154137");
  });

  it("uses idb when store is empty", () => {
    expect(mergeOlderLoadAnchor(null, "00000000-0000-4000-8000-000004288890")).toBe(
      "00000000-0000-4000-8000-000004288890",
    );
  });

  it("uses store when idb has no oldest", () => {
    expect(mergeOlderLoadAnchor("00000000-0000-4000-8000-000000000100", null)).toBe(
      "00000000-0000-4000-8000-000000000100",
    );
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
