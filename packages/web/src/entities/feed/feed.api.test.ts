/**
 * Tests for the Feed API — fetches all messages for the chronological feed view.
 *
 * fetchFeedMessages delegates to an all-messages page fetch with metadata.
 * Tests cover success/error paths and verify correct parameters are forwarded.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllMessagesPage } from "~/shared/api/messenger-messages";
import type { MockMessage } from "~/shared/api/messenger.types";
import { createMessage, createMessages, testMessageId } from "~/test/factories";
import { fetchFeedMessages } from "./feed.api";

vi.mock("~/shared/api/messenger-messages", () => ({
  fetchAllMessagesPage: vi.fn(),
}));

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logApiCall: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// fetchFeedMessages
// ---------------------------------------------------------------------------

describe("fetchFeedMessages", () => {
  it("returns messages from fetchAllMessagesPage", async () => {
    const msgs = createMessages(3) as MockMessage[];
    vi.mocked(fetchAllMessagesPage).mockResolvedValue({
      messages: msgs,
      foundOldest: false,
      foundNewest: false,
    });

    const result = await fetchFeedMessages();
    expect(result).toEqual({ messages: msgs, foundOldest: false, foundNewest: false });
  });

  it("passes default anchor and numBefore", async () => {
    vi.mocked(fetchAllMessagesPage).mockResolvedValue({
      messages: [],
      foundOldest: false,
      foundNewest: false,
    });
    await fetchFeedMessages();
    expect(fetchAllMessagesPage).toHaveBeenCalledWith("newest", 50, undefined);
  });

  it("forwards custom anchor and numBefore", async () => {
    vi.mocked(fetchAllMessagesPage).mockResolvedValue({
      messages: [],
      foundOldest: false,
      foundNewest: false,
    });
    const anchor = testMessageId(42);
    await fetchFeedMessages(anchor, 100);
    expect(fetchAllMessagesPage).toHaveBeenCalledWith(anchor, 100, undefined);
  });

  it("propagates errors from the page fetch", async () => {
    vi.mocked(fetchAllMessagesPage).mockRejectedValue(new Error("API failure"));
    await expect(fetchFeedMessages()).rejects.toThrow("API failure");
  });

  it("returns empty array when API returns no messages", async () => {
    vi.mocked(fetchAllMessagesPage).mockResolvedValue({
      messages: [],
      foundOldest: true,
      foundNewest: false,
    });
    const result = await fetchFeedMessages();
    expect(result).toEqual({ messages: [], foundOldest: true, foundNewest: false });
  });

  it("passes UUID anchor for pagination", async () => {
    const msg = createMessage({ id: 500 }) as MockMessage;
    vi.mocked(fetchAllMessagesPage).mockResolvedValue({
      messages: [msg],
      foundOldest: true,
      foundNewest: false,
    });
    const anchor = testMessageId(500);
    const result = await fetchFeedMessages(anchor, 25);
    expect(result).toEqual({ messages: [msg], foundOldest: true, foundNewest: false });
    expect(fetchAllMessagesPage).toHaveBeenCalledWith(anchor, 25, undefined);
  });

  it("preserves the foundOldest metadata from the server", async () => {
    vi.mocked(fetchAllMessagesPage).mockResolvedValue({
      messages: [],
      foundOldest: true,
      foundNewest: false,
    });

    const result = await fetchFeedMessages();

    expect(result.foundOldest).toBe(true);
  });
});
