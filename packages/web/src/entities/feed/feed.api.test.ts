/**
 * Tests for the Feed API — fetches all messages for the chronological feed view.
 *
 * fetchFeedMessages delegates to an all-messages page fetch with metadata.
 * Tests cover success/error paths and verify correct parameters are forwarded.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllMessagesPage } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage, createMessages } from "~/test/factories";
import { fetchFeedMessages } from "./feed.api";

const logApiCall = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-messages", () => ({
  fetchAllMessagesPage: vi.fn(),
}));

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: logError,
    debug: vi.fn(),
  }),
  logApiCall,
}));

afterEach(() => {
  vi.restoreAllMocks();
  logApiCall.mockReset();
  logError.mockReset();
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
    await fetchFeedMessages(42, 100);
    expect(fetchAllMessagesPage).toHaveBeenCalledWith(42, 100, undefined);
  });

  it("propagates errors from the page fetch", async () => {
    vi.mocked(fetchAllMessagesPage).mockRejectedValue(new Error("API failure"));
    await expect(fetchFeedMessages()).rejects.toThrow("API failure");
  });

  it("does not log abort as an error", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetchAllMessagesPage).mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(fetchFeedMessages("newest", 50, { signal: controller.signal })).rejects.toThrow();

    expect(logApiCall).toHaveBeenCalledWith("GET", "/messages?narrow=all", {
      durationMs: expect.any(Number),
      aborted: true,
    });
    expect(logError).not.toHaveBeenCalled();
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

  it("passes numeric anchor for pagination", async () => {
    const msg = createMessage({ id: 500 }) as MockMessage;
    vi.mocked(fetchAllMessagesPage).mockResolvedValue({
      messages: [msg],
      foundOldest: true,
      foundNewest: false,
    });
    const result = await fetchFeedMessages(500, 25);
    expect(result).toEqual({ messages: [msg], foundOldest: true, foundNewest: false });
    expect(fetchAllMessagesPage).toHaveBeenCalledWith(500, 25, undefined);
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
