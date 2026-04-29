import { describe, expect, it } from "vitest";
import {
  canAutoBulkMarkAsRead,
  computeReadTailReady,
  filterMessageIdsToViewportAllowlist,
} from "./read-receipts-policy.lib";

describe("read-receipts-policy", () => {
  describe("computeReadTailReady", () => {
    it("is false when not at bottom", () => {
      expect(
        computeReadTailReady({
          isAtBottom: false,
          hasNewerMessages: false,
          loadingNewer: false,
        }),
      ).toBe(false);
    });

    it("is false when hasNewerMessages", () => {
      expect(
        computeReadTailReady({
          isAtBottom: true,
          hasNewerMessages: true,
          loadingNewer: false,
        }),
      ).toBe(false);
    });

    it("is false when loadingNewer", () => {
      expect(
        computeReadTailReady({
          isAtBottom: true,
          hasNewerMessages: false,
          loadingNewer: true,
        }),
      ).toBe(false);
    });

    it("is true at bottom with no newer window and not loading newer", () => {
      expect(
        computeReadTailReady({
          isAtBottom: true,
          hasNewerMessages: false,
          loadingNewer: false,
        }),
      ).toBe(true);
    });
  });

  describe("filterMessageIdsToViewportAllowlist", () => {
    it("returns empty when allowlist empty", () => {
      expect(filterMessageIdsToViewportAllowlist([1, 2, 3], new Set())).toEqual([]);
    });

    it("filters to ids present in allowlist", () => {
      expect(filterMessageIdsToViewportAllowlist([1, 2, 3], new Set([2, 9]))).toEqual([2]);
    });
  });

  describe("canAutoBulkMarkAsRead", () => {
    it("mirrors tailReady", () => {
      expect(canAutoBulkMarkAsRead(false)).toBe(false);
      expect(canAutoBulkMarkAsRead(true)).toBe(true);
    });
  });
});
