import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { deriveFocusedPaginationFlags, shouldLoadBoundaryPage } from "./chat-pagination.lib";

describe("deriveFocusedPaginationFlags", () => {
  it("defaults to older=true/newer=false without focused message", () => {
    expect(
      deriveFocusedPaginationFlags([{ id: testMessageId(10) }, { id: testMessageId(20) }], null),
    ).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("detects both older and newer messages around focused anchor", () => {
    expect(
      deriveFocusedPaginationFlags(
        [{ id: testMessageId(10) }, { id: testMessageId(20) }, { id: testMessageId(30) }],
        testMessageId(20),
      ),
    ).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: true,
    });
  });

  it("keeps older open when focused anchor is outside the batch", () => {
    expect(
      deriveFocusedPaginationFlags(
        [{ id: testMessageId(21) }, { id: testMessageId(22) }, { id: testMessageId(23) }],
        testMessageId(20),
      ),
    ).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("detects only newer messages when focused anchor is first in the batch", () => {
    expect(
      deriveFocusedPaginationFlags(
        [{ id: testMessageId(20) }, { id: testMessageId(21) }, { id: testMessageId(22) }],
        testMessageId(20),
      ),
    ).toEqual({
      hasOlderMessages: false,
      hasNewerMessages: true,
    });
  });

  it("detects only older messages when focused anchor is last in the batch", () => {
    expect(
      deriveFocusedPaginationFlags(
        [{ id: testMessageId(10) }, { id: testMessageId(11) }, { id: testMessageId(20) }],
        testMessageId(20),
      ),
    ).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("returns both flags false for focused anchor with empty batch", () => {
    expect(deriveFocusedPaginationFlags([], testMessageId(20))).toEqual({
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
