/**
 * Tests for the Inbox API — fetches unread messages and groups into inbox entries.
 *
 * fetchInboxEntries uses fetchMessagesWithNarrowPage with `is:unread` narrow,
 * then groups results by stream+topic or DM conversation. Tests cover the grouping
 * logic, sorting, and error handling.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMessagesWithNarrowPage } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { fetchInboxEntries, fetchInboxEntriesWithSnapshot } from "./inbox.api";

const upsertChatMessages = vi.hoisted(() => vi.fn());
const getCurrentInstance = vi.hoisted(() => vi.fn());
const persistChatMessagesToIndexedDb = vi.hoisted(() => vi.fn());
const logApiCall = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-messages", () => ({
  fetchMessagesWithNarrowPage: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance,
}));

vi.mock("~/entities/message/message-local-cache.lib", () => ({
  persistChatMessagesToIndexedDb,
}));

vi.mock("~/shared/lib/message-cache-db", async () => {
  const actual = await vi.importActual<typeof import("~/shared/lib/message-cache-db")>(
    "~/shared/lib/message-cache-db",
  );
  return {
    ...actual,
    upsertChatMessages,
  };
});

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
  upsertChatMessages.mockReset();
  getCurrentInstance.mockReset();
  persistChatMessagesToIndexedDb.mockReset();
  logApiCall.mockReset();
  logError.mockReset();
  getCurrentInstance.mockReturnValue(null);
  persistChatMessagesToIndexedDb.mockReturnValue(false);
});

function msg(overrides: Parameters<typeof createMessage>[0] = {}): MockMessage {
  return createMessage(overrides);
}

function dmMsg(overrides: Parameters<typeof createMessage>[0] = {}): MockMessage {
  const m = createMessage(overrides) as MockMessage;
  m.stream_id = null;
  m.channel = undefined;
  return m;
}

function unreadPage(messages: MockMessage[], foundOldest = true) {
  return { messages, foundOldest, foundNewest: false };
}

// ---------------------------------------------------------------------------
// fetchInboxEntries
// ---------------------------------------------------------------------------

describe("fetchInboxEntries", () => {
  it("passes unread narrow to fetchMessagesWithNarrowPage", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(unreadPage([]));
    await fetchInboxEntries();
    expect(fetchMessagesWithNarrowPage).toHaveBeenCalledWith(
      [{ operator: "is", operand: "unread" }],
      "newest",
      5000,
      0,
      { signal: undefined },
    );
  });

  it("groups stream messages by stream+topic", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        msg({ id: 1, stream_id: 10, channel: "engineering", subject: "bugs", timestamp: 100 }),
        msg({ id: 2, stream_id: 10, channel: "engineering", subject: "bugs", timestamp: 200 }),
        msg({ id: 3, stream_id: 10, channel: "engineering", subject: "features", timestamp: 300 }),
      ]),
    );

    const entries = await fetchInboxEntries();
    expect(entries).toHaveLength(2);

    const bugsEntry = entries.find((e) => e.topic === "bugs");
    expect(bugsEntry).toBeDefined();
    expect(bugsEntry!.unreadCount).toBe(2);
    expect(bugsEntry!.messageIds).toEqual([1, 2]);
    expect(bugsEntry!.streamName).toBe("engineering");
  });

  it("groups DM messages by sender", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        dmMsg({ id: 10, sender_id: 42, sender_full_name: "Alice", timestamp: 100 }),
        dmMsg({ id: 11, sender_id: 42, sender_full_name: "Alice", timestamp: 200 }),
        dmMsg({ id: 12, sender_id: 99, sender_full_name: "Bob", timestamp: 300 }),
      ]),
    );

    const entries = await fetchInboxEntries();
    expect(entries).toHaveLength(2);

    const aliceEntry = entries.find((e) => e.senderId === 42);
    expect(aliceEntry).toBeDefined();
    expect(aliceEntry!.unreadCount).toBe(2);
    expect(aliceEntry!.senderName).toBe("Alice");
  });

  it("sorts entries by most recent timestamp descending", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        msg({ id: 1, stream_id: 10, subject: "old", timestamp: 100 }),
        dmMsg({ id: 2, sender_id: 42, sender_full_name: "Alice", timestamp: 500 }),
        msg({ id: 3, stream_id: 20, subject: "mid", timestamp: 300 }),
      ]),
    );

    const entries = await fetchInboxEntries();
    expect(entries[0]!.lastMessageTimestamp).toBe(500);
    expect(entries[1]!.lastMessageTimestamp).toBe(300);
    expect(entries[2]!.lastMessageTimestamp).toBe(100);
  });

  it("tracks lastMessageTimestamp as max within group", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        msg({ id: 1, stream_id: 10, subject: "topic", timestamp: 100 }),
        msg({ id: 2, stream_id: 10, subject: "topic", timestamp: 300 }),
        msg({ id: 3, stream_id: 10, subject: "topic", timestamp: 200 }),
      ]),
    );

    const entries = await fetchInboxEntries();
    expect(entries[0]!.lastMessageTimestamp).toBe(300);
  });

  it("returns empty array when no unread messages", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(unreadPage([]));
    const entries = await fetchInboxEntries();
    expect(entries).toEqual([]);
  });

  it("keeps empty subject as empty topic for all-messages navigation", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([msg({ id: 1, stream_id: 10, subject: "", timestamp: 100 })]),
    );

    const entries = await fetchInboxEntries();
    expect(entries[0]!.topic).toBe("");
    expect(entries[0]!.key).toBe("stream:10:");
  });

  it("propagates errors from fetchMessagesWithNarrowPage", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockRejectedValue(new Error("API failure"));
    await expect(fetchInboxEntries()).rejects.toThrow("API failure");
  });

  it("does not log abort as an error", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetchMessagesWithNarrowPage).mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    );

    await expect(fetchInboxEntries(null, {}, { signal: controller.signal })).rejects.toThrow();

    expect(logApiCall).toHaveBeenCalledWith("GET", "/messages?narrow=is:unread", {
      durationMs: expect.any(Number),
      aborted: true,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it("sets correct key format for stream entries", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([msg({ id: 1, stream_id: 10, subject: "bugs", timestamp: 100 })]),
    );
    const entries = await fetchInboxEntries();
    expect(entries[0]!.key).toBe("stream:10:bugs");
  });

  it("sets correct key format for DM entries", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([dmMsg({ id: 1, sender_id: 42, sender_full_name: "A", timestamp: 100 })]),
    );
    const entries = await fetchInboxEntries();
    expect(entries[0]!.key).toBe("dm:42");
  });

  it("sets null fields correctly for stream vs DM entries", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        msg({ id: 1, stream_id: 10, channel: "eng", subject: "t", timestamp: 100, sender_id: 5 }),
        dmMsg({ id: 2, sender_id: 42, sender_full_name: "Al", timestamp: 200 }),
      ]),
    );

    const entries = await fetchInboxEntries();
    const streamEntry = entries.find((e) => e.streamId != null);
    const dmEntry = entries.find((e) => e.senderId != null);

    expect(streamEntry!.senderId).toBeNull();
    expect(streamEntry!.senderName).toBeNull();
    expect(dmEntry!.streamId).toBeNull();
    expect(dmEntry!.streamName).toBeNull();
    expect(dmEntry!.topic).toBeNull();
  });

  it("persists unread snapshot to IDB per chat key when persistence is enabled", async () => {
    persistChatMessagesToIndexedDb.mockReturnValue(true);
    getCurrentInstance.mockReturnValue({
      id: "instance-1",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "api-key",
    });
    upsertChatMessages.mockResolvedValue(undefined);

    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        msg({
          id: 1,
          stream_id: 10,
          channel: "engineering",
          subject: "general",
          timestamp: 100,
        }),
        msg({
          id: 2,
          stream_id: 10,
          channel: "engineering",
          subject: "general",
          timestamp: 200,
        }),
        dmMsg({
          id: 3,
          sender_id: 42,
          sender_full_name: "Alice",
          timestamp: 300,
          display_recipient: [
            { id: 7, full_name: "Me" },
            { id: 42, full_name: "Alice" },
          ],
        }),
      ]),
    );

    await fetchInboxEntries(7);

    expect(upsertChatMessages).toHaveBeenCalledTimes(2);
    expect(upsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: "instance-1",
        chatKey: "stream:10:general",
        messages: expect.arrayContaining([
          expect.objectContaining({ id: 1 }),
          expect.objectContaining({ id: 2 }),
        ]),
      }),
    );
    expect(upsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: "instance-1",
        chatKey: "dm:7,42",
        messages: expect.arrayContaining([expect.objectContaining({ id: 3 })]),
      }),
    );
  });

  it("does not fail fetchInboxEntries when IDB persistence errors", async () => {
    persistChatMessagesToIndexedDb.mockReturnValue(true);
    getCurrentInstance.mockReturnValue({
      id: "instance-1",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "api-key",
    });
    upsertChatMessages.mockRejectedValue(new Error("idb failure"));

    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        msg({
          id: 1,
          stream_id: 10,
          channel: "engineering",
          subject: "general",
          timestamp: 100,
        }),
      ]),
    );

    const entries = await fetchInboxEntries(7);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe("stream:10:general");
    expect(upsertChatMessages).toHaveBeenCalledTimes(1);
  });
});

describe("fetchInboxEntriesWithSnapshot", () => {
  it("returns entries with an authoritative unread snapshot", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        msg({
          id: 1,
          stream_id: 10,
          channel: "engineering",
          subject: "general",
          timestamp: 100,
        }),
        dmMsg({
          id: 2,
          sender_id: 42,
          sender_full_name: "Alice",
          timestamp: 200,
          display_recipient: [
            { id: 7, full_name: "Me" },
            { id: 42, full_name: "Alice" },
          ],
        }),
      ]),
    );

    const result = await fetchInboxEntriesWithSnapshot(7);

    expect(result.entries).toHaveLength(2);
    expect(result.unreadMessages).toHaveLength(2);
    expect(result.unreadSnapshot.totalCount).toBe(2);
    expect(result.unreadSnapshot.streams).toEqual([
      { streamId: 10, topic: "general", unreadMessageIds: [1] },
    ]);
    expect(result.unreadSnapshot.dms).toEqual([
      { userIds: [7, 42], unreadMessageIds: [2], isGroup: false },
    ]);
    expect(result.unreadSnapshotComplete).toBe(true);
  });

  it("includes mention ids except own messages", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage([
        msg({
          id: 1,
          sender_id: 42,
          stream_id: 10,
          channel: "engineering",
          subject: "general",
          flags: ["mentioned"],
        }),
        msg({
          id: 2,
          sender_id: 7,
          stream_id: 10,
          channel: "engineering",
          subject: "general",
          flags: ["mentioned"],
        }),
      ]),
    );

    const result = await fetchInboxEntriesWithSnapshot(7);

    expect(result.unreadSnapshot.mentionMessageIds).toEqual([1]);
  });

  it("marks unread snapshot incomplete when the unread page is capped", async () => {
    vi.mocked(fetchMessagesWithNarrowPage).mockResolvedValue(
      unreadPage(
        [
          msg({
            id: 1,
            stream_id: 10,
            channel: "engineering",
            subject: "general",
          }),
        ],
        false,
      ),
    );

    const result = await fetchInboxEntriesWithSnapshot(7);

    expect(result.entries).toHaveLength(1);
    expect(result.unreadSnapshotComplete).toBe(false);
  });
});
