import { describe, expect, it } from "vitest";
import { hasMatchingChatId, toChatIdSet } from "./folder-sync.lib";

const BASE_ITEM = {
  uuid: "item-1",
  folderUuid: "folder-1",
  orderIndex: 0,
  pinnedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} as const;

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
