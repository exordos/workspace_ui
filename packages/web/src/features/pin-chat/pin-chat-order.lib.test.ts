import { describe, expect, it } from "vitest";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import {
  buildPinnedChatSortIndexLookup,
  lookupPinnedSortIndex,
  orderChatsWithPinnedFirst,
} from "./pin-chat-order.lib";

const STREAM_A: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  stream_id: 11,
  name: "Engineering",
  lastMessage: "",
  topics: [],
};

const STREAM_B: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  stream_id: 12,
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
  it("maps stream sidebar id to pinned index for numeric folder chat_id", () => {
    const lookup = buildPinnedChatSortIndexLookup(["11"]);
    expect(lookupPinnedSortIndex(lookup, "stream:11:general")).toBe(0);
    expect(lookupPinnedSortIndex(lookup, "dm:99")).toBe(-1);
  });
});

describe("orderChatsWithPinnedFirst", () => {
  it("places pinned chats first in pinned_at order", () => {
    const chats = [STREAM_B, DM_CHAT, STREAM_A];
    const ordered = orderChatsWithPinnedFirst(chats, ["12", "11"]);

    expect(ordered.map((c) => (c.type === "stream" ? c.stream_id : c.id))).toEqual([12, 11, 42]);
  });

  it("returns input order when nothing is pinned", () => {
    const chats = [STREAM_A, STREAM_B];
    expect(orderChatsWithPinnedFirst(chats, [])).toEqual(chats);
  });

  it("keeps pinned muted chats below unmuted chats", () => {
    const chats = [STREAM_B, DM_CHAT, STREAM_A];
    const ordered = orderChatsWithPinnedFirst(chats, ["12"], {
      isMuted: (chat) => chat.type === "stream" && chat.stream_id === 12,
    });

    expect(ordered.map((c) => (c.type === "stream" ? c.stream_id : c.id))).toEqual([42, 11, 12]);
  });
});
