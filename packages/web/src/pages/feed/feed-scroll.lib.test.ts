import { describe, expect, it } from "vitest";
import { shouldRequestOlderFeedPage } from "./feed-scroll.lib";

describe("shouldRequestOlderFeedPage", () => {
  it("returns true when user is near top and pagination is available", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 24,
        isLoadingMore: false,
        hasMore: true,
        nextPageMarker: "cursor-a",
      }),
    ).toBe(true);
  });

  it("returns false when user is not near top", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 140,
        isLoadingMore: false,
        hasMore: true,
        nextPageMarker: "cursor-a",
      }),
    ).toBe(false);
  });

  it("returns false while loading", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 10,
        isLoadingMore: true,
        hasMore: true,
        nextPageMarker: "cursor-a",
      }),
    ).toBe(false);
  });

  it("returns false when no next page is available", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 10,
        isLoadingMore: false,
        hasMore: false,
        nextPageMarker: null,
      }),
    ).toBe(false);
  });

  it("returns false when page marker is unavailable", () => {
    expect(
      shouldRequestOlderFeedPage({
        scrollTop: 10,
        isLoadingMore: false,
        hasMore: true,
        nextPageMarker: null,
      }),
    ).toBe(false);
  });
});
