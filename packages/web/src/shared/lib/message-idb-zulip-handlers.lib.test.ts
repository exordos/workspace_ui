import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { putSingleMessage } from "~/shared/lib/message-cache-db";
import { mirrorZulipMessageEventToIndexedDb } from "./message-idb-zulip-handlers.lib";

vi.mock("~/shared/lib/message-cache-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/message-cache-db")>();
  return {
    ...actual,
    putSingleMessage: vi.fn(),
  };
});

const putSingleMessageMock = vi.mocked(putSingleMessage);

function streamRawMessage(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 42,
    sender_id: 7,
    sender_full_name: "Sender",
    content: "hello **world**",
    timestamp: 1234,
    type: "stream",
    stream_id: 5,
    display_recipient: "general",
    subject: "topic",
    flags: ["read"],
    reactions: [],
    ...overrides,
  };
}

describe("message-idb-zulip-handlers", () => {
  beforeEach(() => {
    putSingleMessageMock.mockReset();
  });

  it("mirrors message events with local raw-message mapping", async () => {
    await mirrorZulipMessageEventToIndexedDb({
      instanceId: "inst-1",
      currentUserId: 7,
      raw: streamRawMessage(),
    });

    expect(putSingleMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: "inst-1",
        chatKey: "stream:5:topic",
        message: expect.objectContaining({
          id: 42,
          sender_id: 7,
          sender_full_name: "Sender",
          stream_id: 5,
          channel: "general",
          subject: "topic",
          content: "hello **world**",
          markdown_source: "hello **world**",
        }),
      }),
    );
  });

  it("skips messages without cache chat key", async () => {
    await mirrorZulipMessageEventToIndexedDb({
      instanceId: "inst-1",
      currentUserId: null,
      raw: streamRawMessage({ stream_id: null, display_recipient: undefined, subject: undefined }),
    });

    expect(putSingleMessageMock).not.toHaveBeenCalled();
  });
});
