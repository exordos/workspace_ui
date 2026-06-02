import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ALL_FOLDER_ID } from "~/features/folder-sync/folder-sync-constants.lib";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";

const unpinChatInFolderMock = vi.fn();
const pinChatInFolderMock = vi.fn();
const getFoldersMock = vi.fn();
const addChatToFolderMock = vi.fn();

vi.mock("~/features/pin-chat/pin-chat.api", () => ({
  pinChatInFolder: (...args: unknown[]) => pinChatInFolderMock(...args),
  unpinChatInFolder: (...args: unknown[]) => unpinChatInFolderMock(...args),
}));

vi.mock("~/shared/api/workspace-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/workspace-client")>();
  return {
    ...actual,
    getFolders: (...args: unknown[]) => getFoldersMock(...args),
    addChatToFolder: (...args: unknown[]) => addChatToFolderMock(...args),
  };
});

describe("runFolderPinToggle", () => {
  beforeEach(() => {
    unpinChatInFolderMock.mockReset();
    pinChatInFolderMock.mockReset();
    getFoldersMock.mockReset();
    addChatToFolderMock.mockReset();
    usePinStore.getState().clear();
    useFolderSyncStore.setState({
      folderItemsByFolderId: new Map([
        [
          "folder-api",
          [
            {
              uuid: "item-1",
              chatId: "11",
              folderUuid: "folder-api",
              orderIndex: 0,
              pinnedAt: "2026-03-14T10:00:00Z",
              createdAt: "",
              updatedAt: "",
            },
          ],
        ],
      ]),
    });
  });

  afterEach(() => {
    usePinStore.getState().clear();
    useFolderSyncStore.getState().clear();
  });

  it("unpins via API folder uuid and clears local pinned_at cache", async () => {
    usePinStore.getState().setFromServer([
      {
        folderUuid: "folder-api",
        folderItemUuid: "item-1",
        chatId: "11",
        orderIndex: 0,
        pinnedAt: "2026-03-14T10:00:00Z",
      },
    ]);
    unpinChatInFolderMock.mockResolvedValue(true);
    getFoldersMock.mockResolvedValue([]);

    const { runFolderPinToggle } = await import("./pin-chat.lib");
    await runFolderPinToggle({
      apiFolderUuid: "folder-api",
      chatId: "stream:11:general",
      isPinned: true,
    });

    expect(unpinChatInFolderMock).toHaveBeenCalledWith("folder-api", "item-1");
    expect(usePinStore.getState().isPinned("folder-api", "stream:11:general")).toBe(false);
    expect(
      useFolderSyncStore.getState().folderItemsByFolderId.get("folder-api")?.[0]?.pinnedAt,
    ).toBe(null);
  });

  it("unpins via API all-folder uuid when scope is virtual system:all", async () => {
    const apiAllUuid = "api-all-folder-uuid";
    useFolderSyncStore.setState({
      folderItemsByFolderId: new Map([
        [
          apiAllUuid,
          [
            {
              uuid: "item-all",
              chatId: "dm:42",
              folderUuid: apiAllUuid,
              orderIndex: 0,
              pinnedAt: "2026-03-14T10:00:00Z",
              createdAt: "",
              updatedAt: "",
            },
          ],
        ],
      ]),
    });
    usePinStore.getState().setFromServer([
      {
        folderUuid: apiAllUuid,
        folderItemUuid: "item-all",
        chatId: "dm:42",
        orderIndex: 0,
        pinnedAt: "2026-03-14T10:00:00Z",
      },
    ]);
    unpinChatInFolderMock.mockResolvedValue(true);
    getFoldersMock.mockResolvedValue([]);

    const { runFolderPinToggle } = await import("./pin-chat.lib");
    await runFolderPinToggle({
      apiFolderUuid: apiAllUuid,
      scopeFolderId: SYSTEM_ALL_FOLDER_ID,
      chatId: "dm:42",
      isPinned: true,
    });

    expect(unpinChatInFolderMock).toHaveBeenCalledWith(apiAllUuid, "item-all");
    expect(getFoldersMock).not.toHaveBeenCalled();
  });

  it("unpins using folder item uuid from cached items with pinned_at", async () => {
    useFolderSyncStore.setState({
      folderItemsByFolderId: new Map([
        [
          "folder-api",
          [
            {
              uuid: "item-99",
              chatId: "dm:42",
              folderUuid: "folder-api",
              orderIndex: 0,
              pinnedAt: "2026-03-14T10:00:00Z",
              createdAt: "",
              updatedAt: "",
            },
          ],
        ],
      ]),
    });
    unpinChatInFolderMock.mockResolvedValue(true);
    getFoldersMock.mockResolvedValue([]);

    const { runFolderPinToggle } = await import("./pin-chat.lib");
    await runFolderPinToggle({
      apiFolderUuid: "folder-api",
      chatId: "dm:42",
      isPinned: true,
    });

    expect(unpinChatInFolderMock).toHaveBeenCalledWith("folder-api", "item-99");
    expect(getFoldersMock).not.toHaveBeenCalled();
  });

  it("pins in system:all by adding chat to all folder when folder item is missing", async () => {
    const apiAllUuid = "api-all-folder-uuid";
    useFolderSyncStore.setState({
      instanceId: "inst-pin",
      allFolderApiUuid: apiAllUuid,
      folderItemsByFolderId: new Map(),
    });
    addChatToFolderMock.mockResolvedValue(true);
    getFoldersMock
      .mockResolvedValueOnce([
        {
          uuid: apiAllUuid,
          title: "All",
          created_at: "",
          updated_at: "",
          background_color_value: 0,
          unread_messages: [],
          system_type: "all",
          items: [],
        },
      ])
      .mockResolvedValue([
        {
          uuid: apiAllUuid,
          title: "All",
          created_at: "",
          updated_at: "",
          background_color_value: 0,
          unread_messages: [],
          system_type: "all",
          items: [
            {
              uuid: "item-new",
              chat_id: "dm:42",
              chat_type: "private",
              folder_uuid: apiAllUuid,
              order_index: 0,
              pinned_at: null,
              created_at: "",
              updated_at: "",
            },
          ],
        },
      ]);
    pinChatInFolderMock.mockResolvedValue(true);

    const { runFolderPinToggle } = await import("./pin-chat.lib");
    await runFolderPinToggle({
      apiFolderUuid: apiAllUuid,
      scopeFolderId: SYSTEM_ALL_FOLDER_ID,
      chatId: "dm:42",
      isPinned: false,
    });

    expect(addChatToFolderMock).toHaveBeenCalledWith(apiAllUuid, "dm:42");
    expect(pinChatInFolderMock).toHaveBeenCalledWith(apiAllUuid, "item-new");
  });

  it("fetches folders to resolve folder item when scope is system:all and cache is empty", async () => {
    const apiAllUuid = "api-all-folder-uuid";
    useFolderSyncStore.setState({ allFolderApiUuid: apiAllUuid });
    getFoldersMock.mockResolvedValue([
      {
        uuid: apiAllUuid,
        title: "All",
        created_at: "",
        updated_at: "",
        background_color_value: 0,
        unread_messages: [],
        system_type: "all",
        items: [
          {
            uuid: "item-net",
            chat_id: "dm:42",
            chat_type: "private",
            folder_uuid: apiAllUuid,
            order_index: 0,
            pinned_at: null,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ]);
    pinChatInFolderMock.mockResolvedValue(true);

    const { runFolderPinToggle } = await import("./pin-chat.lib");
    await runFolderPinToggle({
      apiFolderUuid: apiAllUuid,
      scopeFolderId: SYSTEM_ALL_FOLDER_ID,
      chatId: "dm:42",
      isPinned: false,
    });

    expect(getFoldersMock).toHaveBeenCalledTimes(1);
    expect(pinChatInFolderMock).toHaveBeenCalledWith(apiAllUuid, "item-net");
  });

  it("unpins when folder items are cached under system:all key in all-folder context", async () => {
    const apiAllUuid = "api-all-folder-uuid";
    useFolderSyncStore.setState({
      allFolderApiUuid: apiAllUuid,
      folderItemsByFolderId: new Map([
        [
          SYSTEM_ALL_FOLDER_ID,
          [
            {
              uuid: "item-legacy",
              chatId: "11",
              folderUuid: apiAllUuid,
              orderIndex: 0,
              pinnedAt: "2026-03-14T10:00:00Z",
              createdAt: "",
              updatedAt: "",
            },
          ],
        ],
      ]),
    });
    unpinChatInFolderMock.mockResolvedValue(true);
    getFoldersMock.mockResolvedValue([]);

    const { runFolderPinToggle } = await import("./pin-chat.lib");
    await runFolderPinToggle({
      apiFolderUuid: apiAllUuid,
      scopeFolderId: SYSTEM_ALL_FOLDER_ID,
      chatId: "stream:11:general",
      isPinned: true,
    });

    expect(unpinChatInFolderMock).toHaveBeenCalledWith(apiAllUuid, "item-legacy");
    expect(getFoldersMock).not.toHaveBeenCalled();
  });

  it("does not use all-folder pin when unpinning in a custom folder", async () => {
    const apiAllUuid = "api-all-folder-uuid";
    const customUuid = "folder-custom";
    useFolderSyncStore.setState({
      allFolderApiUuid: apiAllUuid,
      folderItemsByFolderId: new Map([
        [
          apiAllUuid,
          [
            {
              uuid: "item-all-only",
              chatId: "dm:42",
              folderUuid: apiAllUuid,
              orderIndex: 0,
              pinnedAt: "2026-03-14T10:00:00Z",
              createdAt: "",
              updatedAt: "",
            },
          ],
        ],
      ]),
    });
    usePinStore.getState().setFromServer([
      {
        folderUuid: apiAllUuid,
        folderItemUuid: "item-all-only",
        chatId: "dm:42",
        orderIndex: 0,
        pinnedAt: "2026-03-14T10:00:00Z",
      },
    ]);
    unpinChatInFolderMock.mockResolvedValue(true);
    getFoldersMock.mockResolvedValue([]);

    const { runFolderPinToggle } = await import("./pin-chat.lib");
    await runFolderPinToggle({
      apiFolderUuid: customUuid,
      scopeFolderId: customUuid,
      chatId: "dm:42",
      isPinned: true,
    });

    expect(unpinChatInFolderMock).not.toHaveBeenCalled();
    expect(usePinStore.getState().isPinned(apiAllUuid, "dm:42")).toBe(true);
  });
});
