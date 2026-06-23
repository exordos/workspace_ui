import { describe, expect, it } from "vitest";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import {
  buildPinnedChatSortIndexLookup,
  lookupPinnedSortIndex,
  orderChatsWithPinnedFirst,
} from "./pin-chat-order.lib";

const STREAM_A: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  streamUuid: "00000000-0000-4000-8000-000000000011",
  name: "Engineering",
  lastMessage: "",
  topics: [],
};

const STREAM_B: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  streamUuid: "00000000-0000-4000-8000-000000000012",
  name: "Marketing",
  lastMessage: "",
  topics: [],
};

const DM_CHAT: Extract<SidebarChat, { type: "dm" }> = {
  type: "dm",
  id: 42,
  slug: "42-alice",
  name: "Alice",
  lastMessage: "",
  userIds: [42],
};

describe("buildPinnedChatSortIndexLookup", () => {
  it("maps stream sidebar id to pinned index for folder chat_id", () => {
    const lookup = buildPinnedChatSortIndexLookup([`stream:${STREAM_A.streamUuid}:general`]);
    expect(lookupPinnedSortIndex(lookup, `stream:${STREAM_A.streamUuid}:general`)).toBe(0);
    expect(lookupPinnedSortIndex(lookup, "dm:99")).toBe(-1);
  });
});

describe("orderChatsWithPinnedFirst", () => {
  it("places pinned chats first in pinned_at order", () => {
    const chats = [STREAM_B, DM_CHAT, STREAM_A];
    const ordered = orderChatsWithPinnedFirst(chats, [
      `stream:${STREAM_B.streamUuid}:general`,
      `stream:${STREAM_A.streamUuid}:general`,
    ]);

    expect(ordered.map((c) => (c.type === "stream" ? c.streamUuid : c.id))).toEqual([
      STREAM_B.streamUuid,
      STREAM_A.streamUuid,
      42,
    ]);
  });

  it("returns input order when nothing is pinned", () => {
    const chats = [STREAM_A, STREAM_B];
    expect(orderChatsWithPinnedFirst(chats, [])).toEqual(chats);
  });

  it("keeps pinned muted chats below unmuted chats", () => {
    const chats = [STREAM_B, DM_CHAT, STREAM_A];
    const ordered = orderChatsWithPinnedFirst(chats, [`stream:${STREAM_B.streamUuid}:general`], {
      isMuted: (chat) => chat.type === "stream" && chat.streamUuid === STREAM_B.streamUuid,
    });

    expect(ordered.map((c) => (c.type === "stream" ? c.streamUuid : c.id))).toEqual([
      42,
      STREAM_A.streamUuid,
      STREAM_B.streamUuid,
    ]);
  });
});
