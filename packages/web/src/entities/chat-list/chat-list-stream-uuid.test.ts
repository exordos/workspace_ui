/**
 * Tests for the pure stream-uuid resolver used to route chat message fetches to `/messages/`.
 */
import { describe, expect, it } from "vitest";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { resolveStreamUuidForContext, type ChatListUuidMaps } from "./chat-list-stream-uuid.lib";

const STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const PEER_UUID = "55555555-5555-4555-8555-555555555555";

function streamEntry(overrides: Partial<StreamEntryInternal>): StreamEntryInternal {
  return {
    stream_id: 5,
    name: "general",
    lastMessage: "",
    time: "",
    ts: 0,
    topics: new Map(),
    ...overrides,
  };
}

function dmEntry(overrides: Partial<DmEntryInternal>): DmEntryInternal {
  return {
    id: 1,
    name: "Alice",
    slug: STREAM_UUID,
    lastMessage: "",
    time: "",
    ts: 0,
    unreadCount: 0,
    ...overrides,
  };
}

function maps(partial: Partial<ChatListUuidMaps>): ChatListUuidMaps {
  return {
    streamsMap: partial.streamsMap ?? new Map(),
    dmsMap: partial.dmsMap ?? new Map(),
  };
}

describe("resolveStreamUuidForContext — channels", () => {
  const ctx: CurrentChatContext = { type: "stream", streamId: 5, streamName: "general", topic: "" };

  it("returns the stream uuid from stream metadata", () => {
    const streamsMap = new Map([[5, streamEntry({ streamUuid: STREAM_UUID })]]);
    expect(resolveStreamUuidForContext(ctx, null, maps({ streamsMap }))).toBe(STREAM_UUID);
  });

  it("returns null when the stream entry has no uuid", () => {
    const streamsMap = new Map([[5, streamEntry({})]]);
    expect(resolveStreamUuidForContext(ctx, null, maps({ streamsMap }))).toBeNull();
  });

  it("returns null when the stream is unknown", () => {
    expect(resolveStreamUuidForContext(ctx, null, maps({}))).toBeNull();
  });
});

describe("resolveStreamUuidForContext — DMs", () => {
  it("resolves via the `stream:<uuid>` map key when the dmKey carries the stream uuid", () => {
    const dmsMap = new Map([
      [`stream:${STREAM_UUID}`, dmEntry({ streamUuid: STREAM_UUID, userUuid: PEER_UUID })],
    ]);
    const ctx: CurrentChatContext = { type: "dm", dmKey: STREAM_UUID };
    expect(resolveStreamUuidForContext(ctx, null, maps({ dmsMap }))).toBe(STREAM_UUID);
  });

  it("falls back to matching the peer userUuid", () => {
    const dmsMap = new Map([
      [`stream:${STREAM_UUID}`, dmEntry({ streamUuid: STREAM_UUID, userUuid: PEER_UUID })],
    ]);
    const ctx: CurrentChatContext = { type: "dm", dmKey: PEER_UUID };
    expect(resolveStreamUuidForContext(ctx, null, maps({ dmsMap }))).toBe(STREAM_UUID);
  });

  it("falls back to matching numeric participant ids", () => {
    const dmsMap = new Map([["7,42", dmEntry({ streamUuid: STREAM_UUID, userIds: [7, 42] })]]);
    const ctx: CurrentChatContext = { type: "dm", dmKey: "7,42" };
    expect(resolveStreamUuidForContext(ctx, 7, maps({ dmsMap }))).toBe(STREAM_UUID);
  });

  it("returns null when no DM entry matches", () => {
    const dmsMap = new Map([
      [`stream:${STREAM_UUID}`, dmEntry({ streamUuid: STREAM_UUID, userUuid: PEER_UUID })],
    ]);
    const ctx: CurrentChatContext = { type: "dm", dmKey: "99,100" };
    expect(resolveStreamUuidForContext(ctx, 99, maps({ dmsMap }))).toBeNull();
  });
});
