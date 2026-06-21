import { describe, expect, it } from "vitest";
import {
  canAutoBulkMarkAsRead,
  collectViewportVisibleUnreadIds,
  computeReadTailReady,
  filterMessageIdsToViewportAllowlist,
  shouldDeferAutoMarkUnreadUntilUserScroll,
} from "./read-receipts-policy.lib";

const MESSAGE_ID_1 = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID_2 = "00000000-0000-4000-8000-000000000002";
const MESSAGE_ID_3 = "00000000-0000-4000-8000-000000000003";
const MESSAGE_ID_9 = "00000000-0000-4000-8000-000000000009";
const MESSAGE_ID_10 = "00000000-0000-4000-8000-000000000010";
const MESSAGE_ID_42 = "00000000-0000-4000-8000-000000000042";
const MESSAGE_ID_99 = "00000000-0000-4000-8000-000000000099";

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
      expect(
        filterMessageIdsToViewportAllowlist([MESSAGE_ID_1, MESSAGE_ID_2, MESSAGE_ID_3], new Set()),
      ).toEqual([]);
    });

    it("filters to ids present in allowlist", () => {
      expect(
        filterMessageIdsToViewportAllowlist(
          [MESSAGE_ID_1, MESSAGE_ID_2, MESSAGE_ID_3],
          new Set([MESSAGE_ID_2, MESSAGE_ID_9]),
        ),
      ).toEqual([MESSAGE_ID_2]);
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
      visible.setAttribute("data-message-id", MESSAGE_ID_42);
      Object.defineProperty(visible, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: 100, bottom: 200, left: 0, right: 300, width: 300, height: 100 }),
      });

      const hidden = document.createElement("div");
      hidden.setAttribute("data-message-id", MESSAGE_ID_99);
      Object.defineProperty(hidden, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: -50, bottom: -10, left: 0, right: 300, width: 300, height: 40 }),
      });

      root.append(visible, hidden);

      expect(
        collectViewportVisibleUnreadIds(root, new Set([MESSAGE_ID_42, MESSAGE_ID_99])),
      ).toEqual([MESSAGE_ID_42]);
    });
  });

  describe("shouldDeferAutoMarkUnreadUntilUserScroll", () => {
    it("defers when chat opened with unreads before user scroll", () => {
      expect(
        shouldDeferAutoMarkUnreadUntilUserScroll({
          firstUnreadId: MESSAGE_ID_10,
          unreadCount: 3,
          userScrollSeen: false,
        }),
      ).toBe(true);
    });

    it("does not defer after user scroll or without unreads", () => {
      expect(
        shouldDeferAutoMarkUnreadUntilUserScroll({
          firstUnreadId: MESSAGE_ID_10,
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
