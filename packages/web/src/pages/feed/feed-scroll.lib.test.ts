import { describe, expect, it } from "vitest";
import { shouldRequestOlderFeedPage } from "./feed-scroll.lib";

describe("shouldRequestOlderFeedPage", () => {
  it("returns true when user is near top and pagination is available", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 24,
        isLoadingMore: false,
        isAllLoaded: false,
        lastMessageId: 120,
      }),
    ).toBe(true);
  });

  it("returns false when user is not near top", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 140,
        isLoadingMore: false,
        isAllLoaded: false,
        lastMessageId: 120,
      }),
    ).toBe(false);
  });

  it("returns false while loading", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 10,
        isLoadingMore: true,
        isAllLoaded: false,
        lastMessageId: 120,
      }),
    ).toBe(false);
  });

  it("returns false when all messages are loaded", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 10,
        isLoadingMore: false,
        isAllLoaded: true,
        lastMessageId: 120,
      }),
    ).toBe(false);
  });

  it("returns false when oldest anchor is unavailable", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 10,
        isLoadingMore: false,
        isAllLoaded: false,
        lastMessageId: null,
      }),
    ).toBe(false);
  });
});
