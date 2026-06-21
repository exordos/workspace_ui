import { describe, expect, it } from "vitest";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { resolveChatShortcutRoute } from "./layout-chat-shortcuts.lib";

const chats: SidebarChat[] = [
  {
    type: "stream",
    stream_id: 10,
    name: "engineering",
  },
  {
    type: "stream",
    stream_id: 11,
    name: "design",
  },
];

describe("layout-chat-shortcuts", () => {
  it("moves to next chat with wrap-around", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: "10-engineering",
      }),
    ).toBe("/stream/11-design");

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: "11-design",
      }),
    ).toBe("/stream/10-engineering");
  });

  it("moves to previous chat with wrap-around", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: "10-engineering",
      }),
    ).toBe("/stream/11-design");

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: null,
      }),
    ).toBe("/stream/11-design");
  });

  it("falls back to first or last chat when active chat is missing", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: null,
      }),
    ).toBe("/stream/10-engineering");

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: null,
      }),
    ).toBe("/stream/11-design");
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
