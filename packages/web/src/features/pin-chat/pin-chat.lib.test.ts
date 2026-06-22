import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import type * as WorkspaceClientModule from "~/shared/api/workspace-client";

const unpinChatInFolderMock = vi.fn();
const pinChatInFolderMock = vi.fn();
const getFoldersMock = vi.fn();
const addChatToFolderMock = vi.fn();

vi.mock("~/features/pin-chat/pin-chat.api", () => ({
  pinChatInFolder: (...args: unknown[]) => pinChatInFolderMock(...args),
  unpinChatInFolder: (...args: unknown[]) => unpinChatInFolderMock(...args),
}));

vi.mock("~/shared/api/workspace-client", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceClientModule>();
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

  it("unpins via the server all-folder uuid", async () => {
    const apiAllUuid = "api-all-folder-uuid";
    useFolderSyncStore.setState({
      folderItemsByFolderId: new Map([
        [
          apiAllUuid,
          [
            {
              uuid: "item-all",
              chatId: "stream:42:general",
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
        chatId: "stream:42:general",
        orderIndex: 0,
        pinnedAt: "2026-03-14T10:00:00Z",
      },
    ]);
    unpinChatInFolderMock.mockResolvedValue(true);
    getFoldersMock.mockResolvedValue([]);

    const { runFolderPinToggle } = await import("./pin-chat.lib");
    await runFolderPinToggle({
      apiFolderUuid: apiAllUuid,
      scopeFolderId: apiAllUuid,
      chatId: "stream:42:general",
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
              chatId: "stream:42:general",
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
      chatId: "stream:42:general",
      isPinned: true,
    });

    expect(unpinChatInFolderMock).toHaveBeenCalledWith("folder-api", "item-99");
    expect(getFoldersMock).not.toHaveBeenCalled();
  });

  it("pins in server all-folder by adding chat when folder item is missing", async () => {
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
          unread_count: 0,
          system_type: "all",
          folder_items: [],
        },
      ])
      .mockResolvedValue([
        {
          uuid: apiAllUuid,
          title: "All",
          created_at: "",
          updated_at: "",
          background_color_value: 0,
          unread_count: 0,
          system_type: "all",
          folder_items: [
            {
              uuid: "item-new",
              stream_uuid: "42",
              chat_type: "private",
              folder: apiAllUuid,
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
      scopeFolderId: apiAllUuid,
      chatId: "stream:42:general",
      isPinned: false,
    });

    expect(addChatToFolderMock).toHaveBeenCalledWith(apiAllUuid, "stream:42:general");
    expect(pinChatInFolderMock).toHaveBeenCalledWith(apiAllUuid, "item-new");
  });

  it("fetches folders to resolve folder item when server all-folder cache is empty", async () => {
    const apiAllUuid = "api-all-folder-uuid";
    useFolderSyncStore.setState({ allFolderApiUuid: apiAllUuid });
    getFoldersMock.mockResolvedValue([
      {
        uuid: apiAllUuid,
        title: "All",
        created_at: "",
        updated_at: "",
        background_color_value: 0,
        unread_count: 0,
        system_type: "all",
        folder_items: [
          {
            uuid: "item-net",
            stream_uuid: "42",
            chat_type: "private",
            folder: apiAllUuid,
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
      scopeFolderId: apiAllUuid,
      chatId: "stream:42:general",
      isPinned: false,
    });

    expect(getFoldersMock).toHaveBeenCalledTimes(1);
    expect(pinChatInFolderMock).toHaveBeenCalledWith(apiAllUuid, "item-net");
  });

  it("unpins when server all-folder items are cached", async () => {
    const apiAllUuid = "api-all-folder-uuid";
    useFolderSyncStore.setState({
      allFolderApiUuid: apiAllUuid,
      folderItemsByFolderId: new Map([
        [
          apiAllUuid,
          [
            {
              uuid: "item-legacy",
              chatId: "stream:11:general",
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
      scopeFolderId: apiAllUuid,
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
              chatId: "stream:42:general",
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
        chatId: "stream:42:general",
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
      chatId: "stream:42:general",
      isPinned: true,
    });

    expect(unpinChatInFolderMock).not.toHaveBeenCalled();
    expect(usePinStore.getState().isPinned(apiAllUuid, "stream:42:general")).toBe(true);
  });
});
