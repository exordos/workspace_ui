import { describe, expect, it } from "vitest";
import { SYSTEM_ALL_FOLDER_ID } from "./folder-sync-constants.lib";
import { hasMatchingChatId, toChatIdSet } from "./folder-sync-sidebar-chats.lib";
import { withDefaultSystemFolders } from "./folder-sync.lib";

const BASE_ITEM = {
  uuid: "item-1",
  folderUuid: "folder-1",
  orderIndex: 0,
  pinnedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} as const;

const LABELS = { allChats: "All", personal: "Personal", channels: "Channels" };

describe("withDefaultSystemFolders", () => {
  it("keeps virtual «all chats» id when API returns system all folder with its own uuid", () => {
    const apiAllUuid = "550e8400-e29b-41d4-a716-446655440000";
    const result = withDefaultSystemFolders(
      [
        {
          id: apiAllUuid,
          label: "All from API",
          backgroundColor: 2,
          systemType: "all",
          badge: 3,
        },
        {
          id: "other-created",
          label: "Team",
          backgroundColor: 0,
          systemType: "created",
        },
      ],
      LABELS,
      false,
    );

    expect(result[0]?.id).toBe(SYSTEM_ALL_FOLDER_ID);
    expect(result[0]?.label).toBe(LABELS.allChats);
    expect(result[0]?.badge).toBe(3);
    expect(result.some((f) => f.id === apiAllUuid)).toBe(false);
    expect(result.find((f) => f.id === "other-created")).toBeDefined();
  });
});

describe("folder-sync chat id matching", () => {
  it("matches dm ids regardless of participant order", () => {
    const chatIdSet = toChatIdSet([{ ...BASE_ITEM, chatId: "dm:21,7" }]);
    expect(hasMatchingChatId(chatIdSet, "dm:7,21")).toBe(true);
  });

  it("matches numeric folder ids against canonical stream id", () => {
    const chatIdSet = toChatIdSet([{ ...BASE_ITEM, chatId: "11" }]);
    expect(hasMatchingChatId(chatIdSet, "stream:11:general")).toBe(true);
  });
});
