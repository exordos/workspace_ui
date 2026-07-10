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
  it("does not generate a legacy route for next-chat shortcuts", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: "10-engineering",
        activeDmIdParam: null,
      }),
    ).toBeUndefined();

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: "11-design",
        activeDmIdParam: null,
      }),
    ).toBeUndefined();
  });

  it("does not generate a legacy route for previous-chat shortcuts", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: "10-engineering",
        activeDmIdParam: null,
      }),
    ).toBeUndefined();

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: null,
        activeDmIdParam: "42-alice",
      }),
    ).toBeUndefined();
  });

  it("does not fall back to a legacy route when active chat is missing", () => {
    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "next",
        activeStreamSlug: null,
        activeDmIdParam: null,
      }),
    ).toBeUndefined();

    expect(
      resolveChatShortcutRoute({
        sidebarChats: chats,
        direction: "prev",
        activeStreamSlug: null,
        activeDmIdParam: null,
      }),
    ).toBeUndefined();
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
