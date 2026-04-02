import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFolderItemsForSelection, loadFolderSyncSnapshot } from "./folder-sync.api";
import { SYSTEM_ALL_FOLDER_ID } from "./folder-sync-constants.lib";
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

  it("clear resets selected folder to synthetic «all chats» id", () => {
    useFolderSyncStore.setState({ selectedFolderId: "custom-folder" });
    useFolderSyncStore.getState().clear();
    expect(useFolderSyncStore.getState().selectedFolderId).toBe(SYSTEM_ALL_FOLDER_ID);
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

  it("selectFolder uses cached folder items and skips network fetch", async () => {
    // Cache-first: если items уже есть (даже если они старые), переключаемся без запроса.
    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      folders: [
        {
          id: "folder-7",
          label: "Team",
          backgroundColor: 0,
          systemType: "created",
        },
      ],
      folderItemsByFolderId: new Map([
        [
          "folder-7",
          [
            {
              uuid: "item-cached",
              chatId: "dm:cached",
              folderUuid: "folder-7",
              orderIndex: 0,
              pinnedAt: null,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
          ],
        ],
      ]),
    });
    await useFolderSyncStore.getState().selectFolder("folder-7");

    expect(loadFolderItemsForSelection).not.toHaveBeenCalled();
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.has("dm:cached")).toBe(true);
  });

  it("selectFolder performs one fetch on cache miss and keeps loading disabled", async () => {
    // Cache miss: разрешаем ровно один fallback-запрос, но без включения loader.
    const itemsRequest = deferred<
      {
        uuid: string;
        chatId: string;
        folderUuid: string;
        orderIndex: number;
        pinnedAt: null;
        createdAt: string;
        updatedAt: string;
      }[]
    >();
    vi.mocked(loadFolderItemsForSelection).mockReturnValue(itemsRequest.promise);
    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      folders: [
        {
          id: "folder-7",
          label: "Team",
          backgroundColor: 0,
          systemType: "created",
        },
      ],
      selectedFolderId: "folder-1",
      folderItemsByFolderId: new Map(),
      loading: false,
    });

    const selectPromise = useFolderSyncStore.getState().selectFolder("folder-7");

    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(1);
    expect(loadFolderItemsForSelection).toHaveBeenCalledWith("folder-7");
    expect(useFolderSyncStore.getState().loading).toBe(false);
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.size).toBe(0);

    itemsRequest.resolve([
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
    await selectPromise;

    expect(useFolderSyncStore.getState().loading).toBe(false);
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.has("dm:net")).toBe(true);
  });

  it("selectFolder caches empty array after miss error and does not retry on repeat select", async () => {
    // Ошибка fallback фиксируется как [] в кэше, чтобы не дергать сеть при повторном выборе.
    vi.mocked(loadFolderItemsForSelection).mockRejectedValueOnce(new Error("network"));
    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      folders: [
        {
          id: "folder-7",
          label: "Team",
          backgroundColor: 0,
          systemType: "created",
        },
      ],
      folderItemsByFolderId: new Map(),
    });

    await useFolderSyncStore.getState().selectFolder("folder-7");
    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(1);
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.size).toBe(0);
    expect(useFolderSyncStore.getState().folderItemsByFolderId.get("folder-7")).toEqual([]);

    await useFolderSyncStore.getState().selectFolder("folder-7");
    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(1);
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.size).toBe(0);
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

  it("keeps loading disabled during polling refresh, including selected-folder fallback", async () => {
    const snapshotDeferred = deferred<ReturnType<typeof makeFolderSnapshot>>();
    const fallbackDeferred = deferred<
      {
        uuid: string;
        chatId: string;
        folderUuid: string;
        orderIndex: number;
        pinnedAt: null;
        createdAt: string;
        updatedAt: string;
      }[]
    >();
    vi.mocked(loadFolderSyncSnapshot).mockReturnValue(snapshotDeferred.promise);
    vi.mocked(loadFolderItemsForSelection).mockReturnValue(fallbackDeferred.promise);

    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      selectedFolderId: "folder-1",
      loading: false,
    });

    const refreshPromise = useFolderSyncStore.getState().refresh("polling");
    expect(useFolderSyncStore.getState().loading).toBe(false);

    snapshotDeferred.resolve(makeFolderSnapshot({ selectedItemsOk: false }));
    await Promise.resolve();

    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(1);
    expect(useFolderSyncStore.getState().loading).toBe(false);

    fallbackDeferred.resolve([
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

    await refreshPromise;

    const state = useFolderSyncStore.getState();
    expect(state.loading).toBe(false);
    expect(state.selectedFolderChatIds?.has("dm:fallback")).toBe(true);
  });

  it("enables loading for mutation refresh while request is in flight", async () => {
    const snapshotDeferred = deferred<ReturnType<typeof makeFolderSnapshot>>();
    vi.mocked(loadFolderSyncSnapshot).mockReturnValue(snapshotDeferred.promise);

    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      selectedFolderId: "folder-1",
      loading: false,
    });

    const refreshPromise = useFolderSyncStore.getState().refresh("mutation");

    expect(useFolderSyncStore.getState().loading).toBe(true);

    snapshotDeferred.resolve(makeFolderSnapshot({}));
    await refreshPromise;

    expect(useFolderSyncStore.getState().loading).toBe(false);
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
