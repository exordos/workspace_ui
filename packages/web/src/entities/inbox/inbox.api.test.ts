import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import {
  fetchInboxEntries,
  fetchInboxEntriesWithSnapshot,
  hydrateInboxEntriesFromCache,
} from "./inbox.api";

const getInstanceMessagesAscending = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/message-cache-db", async () => {
  const actual = await vi.importActual<typeof import("~/shared/lib/message-cache-db")>(
    "~/shared/lib/message-cache-db",
  );
  return {
    ...actual,
    getInstanceMessagesAscending,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  getInstanceMessagesAscending.mockReset();
});

function msg(overrides: Parameters<typeof createMessage>[0] = {}): MockMessage {
  return createMessage(overrides);
}

function dmMsg(overrides: Parameters<typeof createMessage>[0] = {}): MockMessage {
  const message = createMessage(overrides) as MockMessage;
  message.stream_id = null;
  message.channel = undefined;
  return message;
}

describe("fetchInboxEntries", () => {
  it("returns an empty result without a server request", async () => {
    await expect(fetchInboxEntries()).resolves.toEqual([]);
  });

  it("returns an empty complete unread snapshot without a server request", async () => {
    const result = await fetchInboxEntriesWithSnapshot(7);

    expect(result).toEqual({
      entries: [],
      unreadSnapshot: {
        streams: [],
        dms: [],
        totalCount: 0,
        mentionMessageIds: [],
      },
      unreadSnapshotComplete: true,
      unreadMessages: [],
    });
  });

  it("keeps abort behavior explicit", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(fetchInboxEntries(null, {}, { signal: controller.signal })).rejects.toThrow(
      "Aborted",
    );
  });
});

describe("hydrateInboxEntriesFromCache", () => {
  it("groups unread cached stream and DM messages", async () => {
    getInstanceMessagesAscending.mockResolvedValue([
      msg({
        id: 1,
        stream_id: 10,
        channel: "engineering",
        subject: "bugs",
        timestamp: 100,
      }),
      msg({
        id: 2,
        stream_id: 10,
        channel: "engineering",
        subject: "bugs",
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

    const entries = await hydrateInboxEntriesFromCache("instance-1", 7);

    expect(entries.map((entry) => entry.key)).toEqual(["dm:42", "stream:10:bugs"]);
    expect(entries.find((entry) => entry.key === "stream:10:bugs")?.messageIds).toEqual([1, 2]);
  });

  it("ignores cached read messages", async () => {
    getInstanceMessagesAscending.mockResolvedValue([
      msg({
        id: 1,
        stream_id: 10,
        channel: "engineering",
        subject: "bugs",
        timestamp: 100,
        flags: ["read"],
      }),
      msg({
        id: 2,
        stream_id: 10,
        channel: "engineering",
        subject: "bugs",
        timestamp: 200,
      }),
    ]);

    const entries = await hydrateInboxEntriesFromCache("instance-1", 7);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.messageIds).toEqual([2]);
  });

  it("returns empty entries when there is no local instance cache", async () => {
    const entries = await hydrateInboxEntriesFromCache(null, 7);

    expect(entries).toEqual([]);
    expect(getInstanceMessagesAscending).not.toHaveBeenCalled();
  });
});
