import { describe, expect, it } from "vitest";
import {
  canAutoLoadNewer,
  canAutoLoadOlder,
  isElementNearViewportBottom,
} from "./message-list-pagination-policy.lib";

describe("canAutoLoadOlder", () => {
  const base = {
    scrollTop: 50,
    loadMoreThreshold: 100,
    isLoadingMore: false,
    hasOnLoadMore: true,
  };

  it("returns false until user has scrolled", () => {
    expect(
      canAutoLoadOlder({
        ...base,
        userScrollSeen: false,
        programmaticScroll: false,
      }),
    ).toBe(false);
  });

  it("returns false during programmatic scroll", () => {
    expect(
      canAutoLoadOlder({
        ...base,
        userScrollSeen: true,
        programmaticScroll: true,
      }),
    ).toBe(false);
  });

  it("returns true when user scrolled to top band", () => {
    expect(
      canAutoLoadOlder({
        ...base,
        userScrollSeen: true,
        programmaticScroll: false,
      }),
    ).toBe(true);
  });

  it("returns false when scrollTop is below threshold", () => {
    expect(
      canAutoLoadOlder({
        ...base,
        scrollTop: 150,
        userScrollSeen: true,
        programmaticScroll: false,
      }),
    ).toBe(false);
  });
});

describe("canAutoLoadNewer", () => {
  const base = {
    atBottom: true,
    hasNewerMessages: true,
    isLoadingMore: false,
    hasOnLoadNewer: true,
    lastUnreadNearViewportBottom: true,
  };

  it("returns false until user has scrolled", () => {
    expect(
      canAutoLoadNewer({
        ...base,
        userScrollSeen: false,
        programmaticScroll: false,
      }),
    ).toBe(false);
  });

  it("returns false when last unread is not near viewport bottom", () => {
    expect(
      canAutoLoadNewer({
        ...base,
        userScrollSeen: true,
        programmaticScroll: false,
        lastUnreadNearViewportBottom: false,
      }),
    ).toBe(false);
  });

  it("returns true when user reached bottom and unread tail is ready", () => {
    expect(
      canAutoLoadNewer({
        ...base,
        userScrollSeen: true,
        programmaticScroll: false,
      }),
    ).toBe(true);
  });
});

describe("isElementNearViewportBottom", () => {
  it("returns true when element bottom is within threshold of root bottom", () => {
    expect(
      isElementNearViewportBottom({
        rootTop: 0,
        rootBottom: 400,
        elementBottom: 450,
        bottomThreshold: 80,
      }),
    ).toBe(true);
  });

  it("returns false when element is far above root bottom", () => {
    expect(
      isElementNearViewportBottom({
        rootTop: 0,
        rootBottom: 400,
        elementBottom: 500,
        bottomThreshold: 80,
      }),
    ).toBe(false);
  });
});
