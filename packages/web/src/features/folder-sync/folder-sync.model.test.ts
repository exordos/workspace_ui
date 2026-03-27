import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFolderItemsForSelection, loadFolderSyncSnapshot } from "./folder-sync.api";
import { useFolderSyncStore } from "./folder-sync.model";

vi.mock("./folder-sync.api", () => ({
  loadFolderSyncSnapshot: vi.fn(),
  loadFolderItemsForSelection: vi.fn(),
}));

vi.mock("~/shared/lib/offline-folders", () => ({
  loadOfflineFolders: vi.fn(() => []),
  saveOfflineFolders: vi.fn(),
}));

vi.mock("~/shared/api/workspace-client", () => ({
  mapWorkspaceFoldersToRail: (
    folders: {
      uuid: string;
      title: string;
      background_color_value: number;
      system_type: "created" | "all";
    }[],
  ) =>
    folders.map((folder) => ({
      id: folder.uuid,
      label: folder.title,
      backgroundColor: folder.background_color_value,
      systemType: folder.system_type,
    })),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeFolderSnapshot(options: {
  folderId?: string;
  selectedItemsOk?: boolean;
  selectedChatId?: string;
}) {
  const folderId = options.folderId ?? "folder-1";
  const selectedItemsOk = options.selectedItemsOk ?? true;
  const selectedChatId = options.selectedChatId ?? "dm:42";
  return {
    folders: [
      {
        uuid: folderId,
        title: "All",
        background_color_value: 0,
        unread_messages: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "created" as const,
      },
    ],
    itemsByFolderId: new Map([
      [
        folderId,
        selectedItemsOk
          ? {
              ok: true,
              items: [
                {
                  uuid: "item-1",
                  chatId: selectedChatId,
                  folderUuid: folderId,
                  orderIndex: 0,
                  pinnedAt: null,
                  createdAt: "2026-01-01T00:00:00Z",
                  updatedAt: "2026-01-01T00:00:00Z",
                },
              ],
            }
          : { ok: false, items: [] },
      ],
    ]),
    loadedAt: Date.now(),
  };
}

describe("folder-sync model orchestration", () => {
  beforeEach(() => {
    useFolderSyncStore.getState().clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useFolderSyncStore.getState().clear();
  });

  it("refresh does not trigger extra selected-folder fetch when snapshot already has selected items", async () => {
    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      selectedFolderId: "folder-1",
    });
    vi.mocked(loadFolderSyncSnapshot).mockResolvedValue(makeFolderSnapshot({}));

    await useFolderSyncStore.getState().refresh("mutation");

    expect(loadFolderSyncSnapshot).toHaveBeenCalledTimes(1);
    expect(loadFolderItemsForSelection).not.toHaveBeenCalled();
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.has("dm:42")).toBe(true);
  });

  it("normalizes numeric folder chat ids for sidebar matching", async () => {
    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      selectedFolderId: "folder-1",
    });
    vi.mocked(loadFolderSyncSnapshot).mockResolvedValue(
      makeFolderSnapshot({ selectedChatId: "11" }),
    );

    await useFolderSyncStore.getState().refresh("mutation");

    const selectedIds = useFolderSyncStore.getState().selectedFolderChatIds;
    expect(selectedIds?.has("11")).toBe(true);
    expect(selectedIds?.has("stream:11:general")).toBe(true);
  });

  it("selectFolder refreshes selected folder from network even when cache exists", async () => {
    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
    });
    vi.mocked(loadFolderSyncSnapshot).mockResolvedValue(
      makeFolderSnapshot({ folderId: "folder-7" }),
    );
    vi.mocked(loadFolderItemsForSelection).mockResolvedValue([
      {
        uuid: "item-net",
        chatId: "dm:net",
        folderUuid: "folder-7",
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    await useFolderSyncStore.getState().refresh("mutation");
    await useFolderSyncStore.getState().selectFolder("folder-7");

    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(1);
    expect(loadFolderItemsForSelection).toHaveBeenCalledWith("folder-7");
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.has("dm:net")).toBe(true);
  });

  it("performs exactly one fallback fetch when selected folder items failed in snapshot", async () => {
    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      selectedFolderId: "folder-1",
      folderItemsByFolderId: new Map([
        [
          "folder-1",
          [
            {
              uuid: "item-stale",
              chatId: "dm:stale",
              folderUuid: "folder-1",
              orderIndex: 0,
              pinnedAt: null,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
          ],
        ],
      ]),
    });
    vi.mocked(loadFolderSyncSnapshot).mockResolvedValue(
      makeFolderSnapshot({ selectedItemsOk: false, selectedChatId: "dm:ignored" }),
    );
    vi.mocked(loadFolderItemsForSelection).mockResolvedValue([
      {
        uuid: "item-fallback",
        chatId: "dm:fallback",
        folderUuid: "folder-1",
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    await useFolderSyncStore.getState().refresh("mutation");

    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(1);
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.has("dm:fallback")).toBe(true);
  });

  it("ignores stale refresh response after instance switch", async () => {
    const stale = deferred<ReturnType<typeof makeFolderSnapshot>>();
    vi.mocked(loadFolderSyncSnapshot).mockImplementation(async (instanceId: string) => {
      if (instanceId === "inst-a") {
        return stale.promise;
      }
      return makeFolderSnapshot({ folderId: "folder-b", selectedChatId: "dm:b" });
    });

    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
    });
    const firstRefresh = useFolderSyncStore.getState().refresh("mutation");

    const bootstrapSecond = useFolderSyncStore.getState().bootstrap({
      instanceId: "inst-b",
      showSystemFolders: false,
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
    });

    stale.resolve(makeFolderSnapshot({ folderId: "folder-a", selectedChatId: "dm:a" }));
    await bootstrapSecond;
    await firstRefresh;

    const finalState = useFolderSyncStore.getState();
    expect(finalState.instanceId).toBe("inst-b");
    expect(finalState.folders.some((folder) => folder.id === "folder-b")).toBe(true);
    expect(finalState.folderItemsByFolderId.has("folder-b")).toBe(true);
    expect(finalState.folderItemsByFolderId.has("folder-a")).toBe(false);
  });
});
