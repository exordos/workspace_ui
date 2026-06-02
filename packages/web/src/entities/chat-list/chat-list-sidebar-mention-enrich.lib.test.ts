import { describe, expect, it } from "vitest";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { enrichSidebarChatsWithMentionFlags } from "./chat-list-sidebar-mention-enrich.lib";

describe("enrichSidebarChatsWithMentionFlags", () => {
  it("adds hasMention to stream and topic rows when locations are indexed", () => {
    const chats: SidebarChat[] = [
      {
        type: "stream",
        stream_id: 5,
        name: "general",
        topics: [{ subject: "bugs", badge: 2 }],
        badge: 2,
      },
    ];

    const enriched = enrichSidebarChatsWithMentionFlags(
      chats,
      new Set([100]),
      new Map([[100, { type: "stream", stream_id: 5, topic: "bugs" }]]),
      10,
    );

    expect(enriched[0]?.hasMention).toBe(true);
    expect(enriched[0]?.type === "stream" && enriched[0].topics?.[0]?.hasMention).toBe(true);
  });

  it("does not add hasMention to personal 1:1 DM rows", () => {
    const chats: SidebarChat[] = [
      {
        type: "dm",
        id: 20,
        name: "Peer",
        slug: "20-peer",
        isGroup: false,
        userIds: [10, 20],
        badge: 1,
      },
    ];

    const enriched = enrichSidebarChatsWithMentionFlags(
      chats,
      new Set([200]),
      new Map([[200, { type: "dm", dmKey: "10,20" }]]),
      10,
    );

    expect(enriched[0]?.type === "dm" && enriched[0].hasMention).toBeUndefined();
  });

  it("adds hasMention to group DM rows", () => {
    const chats: SidebarChat[] = [
      {
        type: "dm",
        id: 20,
        name: "Team",
        slug: "20-a,30-b,10-me",
        isGroup: true,
        userIds: [10, 20, 30],
      },
    ];

    const enriched = enrichSidebarChatsWithMentionFlags(
      chats,
      new Set([300]),
      new Map([[300, { type: "dm", dmKey: "10,20,30" }]]),
      10,
    );

    expect(enriched[0]?.type === "dm" && enriched[0].hasMention).toBe(true);
  });
});
