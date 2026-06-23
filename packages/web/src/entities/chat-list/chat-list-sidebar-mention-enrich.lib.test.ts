import { describe, expect, it } from "vitest";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { enrichSidebarChatsWithMentionFlags } from "./chat-list-sidebar-mention-enrich.lib";

describe("enrichSidebarChatsWithMentionFlags", () => {
  it("adds hasMention to stream and topic rows when locations are indexed", () => {
    const chats: SidebarChat[] = [
      {
        type: "stream",
        streamUuid: "00000000-0000-4000-8000-000000000005",
        name: "general",
        topics: [{ subject: "bugs", badge: 2 }],
        badge: 2,
      },
    ];

    const enriched = enrichSidebarChatsWithMentionFlags(
      chats,
      new Set(["00000000-0000-4000-8000-000000000100"]),
      new Map([
        [
          "00000000-0000-4000-8000-000000000100",
          { type: "stream", streamUuid: "00000000-0000-4000-8000-000000000005", topic: "bugs" },
        ],
      ]),
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
        userIds: [10, 20],
        badge: 1,
      },
    ];

    const enriched = enrichSidebarChatsWithMentionFlags(
      chats,
      new Set(["00000000-0000-4000-8000-000000000200"]),
      new Map([["00000000-0000-4000-8000-000000000200", { type: "dm", dmKey: "10,20" }]]),
    );

    expect(enriched[0]?.type === "dm" && enriched[0].hasMention).toBeUndefined();
  });
});
