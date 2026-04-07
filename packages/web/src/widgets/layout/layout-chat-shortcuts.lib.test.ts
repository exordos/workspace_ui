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
    type: "dm",
    id: 42,
    name: "Alice",
    slug: "42-alice",
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
        activeDmIdParam: null,
      }),
    ).toBe("/dm/42-alice");

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: "11-design",
        activeDmIdParam: null,
      }),
    ).toBe("/stream/10-engineering");
  });

  it("moves to previous chat with wrap-around", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: "10-engineering",
        activeDmIdParam: null,
      }),
    ).toBe("/stream/11-design");

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: null,
        activeDmIdParam: "42-alice",
      }),
    ).toBe("/stream/10-engineering");
  });

  it("falls back to first or last chat when active chat is missing", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: null,
        activeDmIdParam: null,
      }),
    ).toBe("/stream/10-engineering");

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: null,
        activeDmIdParam: null,
      }),
    ).toBe("/stream/11-design");
  });

  it("returns null for empty chat list", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: [],
        direction: "next",
        activeStreamSlug: null,
        activeDmIdParam: null,
      }),
    ).toBeNull();
  });
});
