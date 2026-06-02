import { describe, expect, it } from "vitest";
import {
  canAutoBulkMarkAsRead,
  collectViewportVisibleUnreadIds,
  computeReadTailReady,
  filterMessageIdsToViewportAllowlist,
  shouldDeferAutoMarkUnreadUntilUserScroll,
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

  describe("collectViewportVisibleUnreadIds", () => {
    it("returns unread ids with at least half of the bubble visible in the scroll root", () => {
      const root = document.createElement("div");
      Object.defineProperty(root, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400 }),
      });

      const visible = document.createElement("div");
      visible.setAttribute("data-message-id", "42");
      Object.defineProperty(visible, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: 100, bottom: 200, left: 0, right: 300, width: 300, height: 100 }),
      });

      const hidden = document.createElement("div");
      hidden.setAttribute("data-message-id", "99");
      Object.defineProperty(hidden, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: -50, bottom: -10, left: 0, right: 300, width: 300, height: 40 }),
      });

      root.append(visible, hidden);

      expect(collectViewportVisibleUnreadIds(root, new Set([42, 99]))).toEqual([42]);
    });
  });

  describe("shouldDeferAutoMarkUnreadUntilUserScroll", () => {
    it("defers when chat opened with unreads before user scroll", () => {
      expect(
        shouldDeferAutoMarkUnreadUntilUserScroll({
          firstUnreadId: 10,
          unreadCount: 3,
          userScrollSeen: false,
        }),
      ).toBe(true);
    });

    it("does not defer after user scroll or without unreads", () => {
      expect(
        shouldDeferAutoMarkUnreadUntilUserScroll({
          firstUnreadId: 10,
          unreadCount: 3,
          userScrollSeen: true,
        }),
      ).toBe(false);
      expect(
        shouldDeferAutoMarkUnreadUntilUserScroll({
          firstUnreadId: null,
          unreadCount: 0,
          userScrollSeen: false,
        }),
      ).toBe(false);
    });
  });
});
