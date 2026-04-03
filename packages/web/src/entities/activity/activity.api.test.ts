import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchActivityMessagesPage } from "~/shared/api/zulip-messages";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { fetchActivityMessagesPageWithPersist } from "./activity.api";

const upsertChatMessages = vi.hoisted(() => vi.fn());
const getCurrentInstance = vi.hoisted(() => vi.fn());
const persistChatMessagesToIndexedDb = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-messages", async () => {
  const actual = await vi.importActual<typeof import("~/shared/api/zulip-messages")>(
    "~/shared/api/zulip-messages",
  );
  return {
    ...actual,
    fetchActivityMessagesPage: vi.fn(),
  };
});

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

function streamMessage(overrides: Parameters<typeof createMessage>[0] = {}): ZulipRawMessage {
  return createMessage(overrides) as ZulipRawMessage;
}

function dmMessage(overrides: Parameters<typeof createMessage>[0] = {}): ZulipRawMessage {
  const message = createMessage(overrides) as ZulipRawMessage;
  message.stream_id = null;
  message.display_recipient = overrides.display_recipient ?? [
    { id: 7, full_name: "Me" },
    { id: 42, full_name: "Alice" },
  ];
  message.type = "private";
  return message;
}

describe("fetchActivityMessagesPageWithPersist", () => {
  it("persists fetched activity snapshot by chat key when persistence is enabled", async () => {
    persistChatMessagesToIndexedDb.mockReturnValue(true);
    getCurrentInstance.mockReturnValue({
      id: "instance-1",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "api-key",
    });
    upsertChatMessages.mockResolvedValue(undefined);
    vi.mocked(fetchActivityMessagesPage).mockResolvedValue({
      messages: [
        streamMessage({
          id: 1,
          stream_id: 10,
          subject: "general",
          display_recipient: "engineering",
          timestamp: 100,
        }),
        streamMessage({
          id: 2,
          stream_id: 10,
          subject: "general",
          display_recipient: "engineering",
          timestamp: 200,
        }),
        dmMessage({
          id: 3,
          sender_id: 42,
          sender_full_name: "Alice",
          timestamp: 300,
        }),
      ],
      foundOldest: true,
    });

    const result = await fetchActivityMessagesPageWithPersist("reactions", 7);

    expect(result.foundOldest).toBe(true);
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

  it("does not fail when IDB persistence errors", async () => {
    persistChatMessagesToIndexedDb.mockReturnValue(true);
    getCurrentInstance.mockReturnValue({
      id: "instance-1",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "api-key",
    });
    upsertChatMessages.mockRejectedValue(new Error("idb failure"));
    vi.mocked(fetchActivityMessagesPage).mockResolvedValue({
      messages: [
        streamMessage({
          id: 1,
          stream_id: 10,
          subject: "general",
          display_recipient: "engineering",
          timestamp: 100,
        }),
      ],
      foundOldest: true,
    });

    const result = await fetchActivityMessagesPageWithPersist("reactions", 7);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.id).toBe(1);
    expect(upsertChatMessages).toHaveBeenCalledTimes(1);
  });
});
