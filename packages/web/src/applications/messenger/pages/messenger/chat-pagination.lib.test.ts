import { describe, expect, it } from "vitest";
import { deriveFocusedPaginationFlags, shouldLoadBoundaryPage } from "./chat-pagination.lib";

describe("deriveFocusedPaginationFlags", () => {
  it("defaults to older=true/newer=false without focused message", () => {
    expect(deriveFocusedPaginationFlags([{ id: 10 }, { id: 20 }], null)).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("detects both older and newer messages around focused anchor", () => {
    expect(deriveFocusedPaginationFlags([{ id: 10 }, { id: 20 }, { id: 30 }], 20)).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: true,
    });
  });

  it("detects only newer messages when all fetched ids are above anchor", () => {
    expect(deriveFocusedPaginationFlags([{ id: 21 }, { id: 22 }, { id: 23 }], 20)).toEqual({
      hasOlderMessages: false,
      hasNewerMessages: true,
    });
  });

  it("detects only older messages when all fetched ids are below anchor", () => {
    expect(deriveFocusedPaginationFlags([{ id: 10 }, { id: 11 }, { id: 12 }], 20)).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("returns both flags false for focused anchor with empty batch", () => {
    expect(deriveFocusedPaginationFlags([], 20)).toEqual({
      hasOlderMessages: false,
      hasNewerMessages: false,
    });
  });
});

describe("shouldLoadBoundaryPage", () => {
  it("returns true only when boundary loading is currently allowed", () => {
    expect(
      shouldLoadBoundaryPage({
        isLoadingMore: false,
        hasBoundaryMessages: true,
        messagesLength: 5,
      }),
    ).toBe(true);
  });

  it("returns false when already loading", () => {
    expect(
      shouldLoadBoundaryPage({
        isLoadingMore: true,
        hasBoundaryMessages: true,
        messagesLength: 5,
      }),
    ).toBe(false);
  });

  it("returns false when boundary flag is false", () => {
    expect(
      shouldLoadBoundaryPage({
        isLoadingMore: false,
        hasBoundaryMessages: false,
        messagesLength: 5,
      }),
    ).toBe(false);
  });

  it("returns false when there are no messages to anchor pagination", () => {
    expect(
      shouldLoadBoundaryPage({
        isLoadingMore: false,
        hasBoundaryMessages: true,
        messagesLength: 0,
      }),
    ).toBe(false);
  });
});
