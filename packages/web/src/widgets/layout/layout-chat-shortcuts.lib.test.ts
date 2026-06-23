import { describe, expect, it } from "vitest";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { resolveChatShortcutRoute } from "./layout-chat-shortcuts.lib";

const chats: SidebarChat[] = [
  {
    type: "stream",
    streamUuid: "00000000-0000-4000-8000-000000000010",
    name: "engineering",
  },
  {
    type: "stream",
    streamUuid: "00000000-0000-4000-8000-000000000011",
    name: "design",
  },
];

const STREAM_UUID_10 = "00000000-0000-4000-8000-000000000010";
const STREAM_UUID_11 = "00000000-0000-4000-8000-000000000011";

describe("layout-chat-shortcuts", () => {
  it("moves to next chat with wrap-around", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: STREAM_UUID_10,
      }),
    ).toBe(`/stream/${STREAM_UUID_11}`);

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: STREAM_UUID_11,
      }),
    ).toBe(`/stream/${STREAM_UUID_10}`);
  });

  it("moves to previous chat with wrap-around", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: STREAM_UUID_10,
      }),
    ).toBe(`/stream/${STREAM_UUID_11}`);

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: null,
      }),
    ).toBe(`/stream/${STREAM_UUID_11}`);
  });

  it("falls back to first or last chat when active chat is missing", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: null,
      }),
    ).toBe(`/stream/${STREAM_UUID_10}`);

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: null,
      }),
    ).toBe(`/stream/${STREAM_UUID_11}`);
  });

  it("returns null for empty chat list", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: [],
        direction: "next",
        activeStreamSlug: null,
      }),
    ).toBeNull();
  });
});
