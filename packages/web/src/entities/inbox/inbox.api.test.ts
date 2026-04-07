/**
 * Tests for the Inbox API — fetches unread messages and groups into inbox entries.
 *
 * fetchInboxEntries uses fetchMessagesWithNarrow with `is:unread` narrow,
 * then groups results by stream+topic or DM conversation. Tests cover the grouping
 * logic, sorting, and error handling.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMessagesWithNarrow } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { fetchInboxEntries } from "./inbox.api";

const upsertChatMessages = vi.hoisted(() => vi.fn());
const getCurrentInstance = vi.hoisted(() => vi.fn());
const persistChatMessagesToIndexedDb = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-messages", () => ({
  fetchMessagesWithNarrow: vi.fn(),
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
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logApiCall: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  upsertChatMessages.mockReset();
  getCurrentInstance.mockReset();
  persistChatMessagesToIndexedDb.mockReset();
  getCurrentInstance.mockReturnValue(null);
  persistChatMessagesToIndexedDb.mockReturnValue(false);
});

function msg(overrides: Parameters<typeof createMessage>[0] = {}): MockMessage {
  return createMessage(overrides) as MockMessage;
}

function dmMsg(overrides: Parameters<typeof createMessage>[0] = {}): MockMessage {
  const m = createMessage(overrides) as MockMessage;
  m.stream_id = null;
  m.channel = undefined;
  return m;
}

// ---------------------------------------------------------------------------
// fetchInboxEntries
// ---------------------------------------------------------------------------

describe("fetchInboxEntries", () => {
  it("passes unread narrow to fetchMessagesWithNarrow", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([]);
    await fetchInboxEntries();
    expect(fetchMessagesWithNarrow).toHaveBeenCalledWith(
      [{ operator: "is", operand: "unread" }],
      "newest",
      5000,
      0,
    );
  });

  it("groups stream messages by stream+topic", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      msg({ id: 1, stream_id: 10, channel: "engineering", subject: "bugs", timestamp: 100 }),
      msg({ id: 2, stream_id: 10, channel: "engineering", subject: "bugs", timestamp: 200 }),
      msg({ id: 3, stream_id: 10, channel: "engineering", subject: "features", timestamp: 300 }),
    ]);

    const entries = await fetchInboxEntries();
    expect(entries).toHaveLength(2);

    const bugsEntry = entries.find((e) => e.topic === "bugs");
    expect(bugsEntry).toBeDefined();
    expect(bugsEntry!.unreadCount).toBe(2);
    expect(bugsEntry!.messageIds).toEqual([1, 2]);
    expect(bugsEntry!.streamName).toBe("engineering");
  });

  it("groups DM messages by sender", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      dmMsg({ id: 10, sender_id: 42, sender_full_name: "Alice", timestamp: 100 }),
      dmMsg({ id: 11, sender_id: 42, sender_full_name: "Alice", timestamp: 200 }),
      dmMsg({ id: 12, sender_id: 99, sender_full_name: "Bob", timestamp: 300 }),
    ]);

    const entries = await fetchInboxEntries();
    expect(entries).toHaveLength(2);

    const aliceEntry = entries.find((e) => e.senderId === 42);
    expect(aliceEntry).toBeDefined();
    expect(aliceEntry!.unreadCount).toBe(2);
    expect(aliceEntry!.senderName).toBe("Alice");
  });

  it("sorts entries by most recent timestamp descending", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      msg({ id: 1, stream_id: 10, subject: "old", timestamp: 100 }),
      dmMsg({ id: 2, sender_id: 42, sender_full_name: "Alice", timestamp: 500 }),
      msg({ id: 3, stream_id: 20, subject: "mid", timestamp: 300 }),
    ]);

    const entries = await fetchInboxEntries();
    expect(entries[0]!.lastMessageTimestamp).toBe(500);
    expect(entries[1]!.lastMessageTimestamp).toBe(300);
    expect(entries[2]!.lastMessageTimestamp).toBe(100);
  });

  it("tracks lastMessageTimestamp as max within group", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      msg({ id: 1, stream_id: 10, subject: "topic", timestamp: 100 }),
      msg({ id: 2, stream_id: 10, subject: "topic", timestamp: 300 }),
      msg({ id: 3, stream_id: 10, subject: "topic", timestamp: 200 }),
    ]);

    const entries = await fetchInboxEntries();
    expect(entries[0]!.lastMessageTimestamp).toBe(300);
  });

  it("returns empty array when no unread messages", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([]);
    const entries = await fetchInboxEntries();
    expect(entries).toEqual([]);
  });

  it("keeps empty subject as empty topic for all-messages navigation", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      msg({ id: 1, stream_id: 10, subject: "", timestamp: 100 }),
    ]);

    const entries = await fetchInboxEntries();
    expect(entries[0]!.topic).toBe("");
    expect(entries[0]!.key).toBe("stream:10:");
  });

  it("propagates errors from fetchMessagesWithNarrow", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockRejectedValue(new Error("API failure"));
    await expect(fetchInboxEntries()).rejects.toThrow("API failure");
  });

  it("sets correct key format for stream entries", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      msg({ id: 1, stream_id: 10, subject: "bugs", timestamp: 100 }),
    ]);
    const entries = await fetchInboxEntries();
    expect(entries[0]!.key).toBe("stream:10:bugs");
  });

  it("sets correct key format for DM entries", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      dmMsg({ id: 1, sender_id: 42, sender_full_name: "A", timestamp: 100 }),
    ]);
    const entries = await fetchInboxEntries();
    expect(entries[0]!.key).toBe("dm:42");
  });

  it("sets null fields correctly for stream vs DM entries", async () => {
    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      msg({ id: 1, stream_id: 10, channel: "eng", subject: "t", timestamp: 100, sender_id: 5 }),
      dmMsg({ id: 2, sender_id: 42, sender_full_name: "Al", timestamp: 200 }),
    ]);

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

    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
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
    ]);

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

    vi.mocked(fetchMessagesWithNarrow).mockResolvedValue([
      msg({
        id: 1,
        stream_id: 10,
        channel: "engineering",
        subject: "general",
        timestamp: 100,
      }),
    ]);

    const entries = await fetchInboxEntries(7);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe("stream:10:general");
    expect(upsertChatMessages).toHaveBeenCalledTimes(1);
  });
});
