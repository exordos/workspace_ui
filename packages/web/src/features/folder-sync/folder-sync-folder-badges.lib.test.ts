import { describe, expect, it } from "vitest";
import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import { SYSTEM_CHANNELS_FOLDER_ID, SYSTEM_PERSONAL_FOLDER_ID } from "./folder-sync-constants.lib";
import {
  applyFolderUnreadBadges,
  resolveFolderChatIdsForBadge,
  sumSidebarChatUnreadBadges,
} from "./folder-sync-folder-badges.lib";

function folderItem(
  chatId: string,
  orderIndex: number,
  folderUuid = "work-folder",
): FolderItemForClient {
  return {
    uuid: `item-${chatId}-${orderIndex}`,
    chatId,
    folderUuid,
    orderIndex,
    pinnedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

const baseProjectionInput = {
  chatsSortedByLastMessage: [] as const,
  streamsMap: new Map(),
  usersMapForChatInfo: new Map(),
  currentUserId: 10 as number | null,
  hideUnknownArchivedStreams: false,
};

describe("sumSidebarChatUnreadBadges", () => {
  it("sums chat badge fields and treats missing badge as zero", () => {
    expect(
      sumSidebarChatUnreadBadges([
        { type: "dm", id: 1, name: "A", slug: "1-a", badge: 3 },
        { type: "dm", id: 2, name: "B", slug: "2-b" },
        { type: "stream", stream_id: 5, name: "General", badge: 2 },
      ]),
    ).toBe(5);
  });
});

describe("resolveFolderChatIdsForBadge", () => {
  it("returns null for system folders", () => {
    expect(
      resolveFolderChatIdsForBadge(
        {
          id: SYSTEM_PERSONAL_FOLDER_ID,
          label: "Personal",
          backgroundColor: 0,
          systemType: "personal",
        },
        new Map(),
      ),
    ).toBeNull();
  });

  it("returns undefined when created folder items are not cached", () => {
    expect(
      resolveFolderChatIdsForBadge(
        { id: "work-folder", label: "Work", backgroundColor: 0, systemType: "created", badge: 7 },
        new Map(),
      ),
    ).toBeUndefined();
  });

  it("returns chat id set when created folder items are cached", () => {
    const items = [folderItem("stream:1", 0)];
    const result = resolveFolderChatIdsForBadge(
      { id: "work-folder", label: "Work", backgroundColor: 0, systemType: "created" },
      new Map([["work-folder", items]]),
    );
    expect(result).toBeInstanceOf(Set);
    expect(result?.has("stream:1")).toBe(true);
  });
});

describe("applyFolderUnreadBadges", () => {
  const folders: WorkspaceFolderForRail[] = [
    {
      id: SYSTEM_PERSONAL_FOLDER_ID,
      label: "Personal",
      backgroundColor: 0,
      systemType: "personal",
    },
    {
      id: SYSTEM_CHANNELS_FOLDER_ID,
      label: "Channels",
      backgroundColor: 0,
      systemType: "channels",
    },
    { id: "work-folder", label: "Work", backgroundColor: 0, systemType: "created", badge: 7 },
  ];

  it("sums DM badges for personal system folder", () => {
    const result = applyFolderUnreadBadges(folders, {
      ...baseProjectionInput,
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [
        { type: "dm", id: 20, name: "Bob", slug: "20-bob", badge: 3 },
        { type: "dm", id: 30, name: "Carol", slug: "30-carol", badge: 1 },
        { type: "stream", stream_id: 1, name: "General", badge: 99 },
      ],
    });

    expect(result[0]?.badge).toBe(4);
    expect(result[1]?.badge).toBe(99);
  });

  it("keeps API badge for created folder until items are cached", () => {
    const result = applyFolderUnreadBadges(folders, {
      ...baseProjectionInput,
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [{ type: "dm", id: 20, name: "Bob", slug: "20-bob", badge: 100 }],
    });

    expect(result[2]?.badge).toBe(7);
  });

  it("computes created folder badge from folder items when cached", () => {
    const result = applyFolderUnreadBadges(folders, {
      ...baseProjectionInput,
      folderItemsByFolderId: new Map([
        ["work-folder", [folderItem("dm:20", 0), folderItem("dm:30", 1)]],
      ]),
      chatsSortedByLastMessage: [
        { type: "dm", id: 20, name: "Bob", slug: "20-bob", badge: 2 },
        { type: "dm", id: 30, name: "Carol", slug: "30-carol", badge: 4 },
        { type: "dm", id: 99, name: "Other", slug: "99-other", badge: 50 },
      ],
    });

    expect(result[2]?.badge).toBe(6);
  });

  it("clears badge when folder unread sum is zero", () => {
    const result = applyFolderUnreadBadges(
      [
        {
          id: SYSTEM_CHANNELS_FOLDER_ID,
          label: "Channels",
          backgroundColor: 0,
          systemType: "channels",
        },
      ],
      {
        ...baseProjectionInput,
        folderItemsByFolderId: new Map(),
        chatsSortedByLastMessage: [{ type: "stream", stream_id: 1, name: "General" }],
      },
    );

    expect(result[0]?.badge).toBeUndefined();
  });

  it("returns the same folders array reference when badges are unchanged", () => {
    const inputFolders: WorkspaceFolderForRail[] = [
      {
        id: SYSTEM_PERSONAL_FOLDER_ID,
        label: "Personal",
        backgroundColor: 0,
        systemType: "personal",
      },
    ];
    const first = applyFolderUnreadBadges(inputFolders, {
      ...baseProjectionInput,
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [],
    });
    const second = applyFolderUnreadBadges(first, {
      ...baseProjectionInput,
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [],
    });

    expect(second).toBe(first);
  });
});
