import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ALL_FOLDER_ID } from "./folder-sync-constants.lib";
import { loadFolderItemsForSelection, loadFolderSyncSnapshot } from "./folder-sync.api";
import { useFolderSyncStore } from "./folder-sync.model";

const getFoldersMock = vi.fn().mockResolvedValue([]);
const addChatToFolderMock = vi.fn().mockResolvedValue(true);
const removeChatFromFolderMock = vi.fn().mockResolvedValue(true);

vi.mock("./folder-sync.api", () => ({
  loadFolderSyncSnapshot: vi.fn(),
  loadFolderItemsForSelection: vi.fn(),
}));

vi.mock("~/shared/lib/folders-snapshot-db", () => ({
  loadFoldersSnapshotRow: vi.fn().mockResolvedValue(null),
  persistFoldersSnapshotRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/shared/api/workspace-client", () => ({
  getFolders: (...args: unknown[]) => getFoldersMock(...args),
  addChatToFolder: (...args: unknown[]) => addChatToFolderMock(...args),
  removeChatFromFolder: (...args: unknown[]) => removeChatFromFolderMock(...args),
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

beforeEach(() => {
  getFoldersMock.mockResolvedValue([]);
  addChatToFolderMock.mockResolvedValue(true);
  removeChatFromFolderMock.mockResolvedValue(true);
});

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

  it("preserves rail and folder items when snapshot returns empty folder list (IDB cache)", async () => {
    const cachedItem = {
      uuid: "it-1",
      chatId: "dm:99",
      folderUuid: "f-cached",
      orderIndex: 0,
      pinnedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: "f-cached", label: "Cached", backgroundColor: 2, systemType: "created" },
      ],
      selectedFolderId: "f-cached",
      folderItemsByFolderId: new Map([["f-cached", [cachedItem]]]),
    });
    vi.mocked(loadFolderSyncSnapshot).mockResolvedValue({
      folders: [],
      itemsByFolderId: new Map(),
      loadedAt: Date.now(),
    });
    vi.mocked(loadFolderItemsForSelection).mockResolvedValue([cachedItem]);

    await useFolderSyncStore.getState().refresh("mutation");

    const state = useFolderSyncStore.getState();
    expect(state.folders.some((f) => f.id === "f-cached")).toBe(true);
    expect(state.folderItemsByFolderId.get("f-cached")).toEqual([cachedItem]);
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
    expect(loadFolderItemsForSelection).toHaveBeenCalledWith("folder-7", {
      allFolderApiUuid: null,
    });
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

  it("marks folder stale on select miss and retries on repeat select", async () => {
    vi.mocked(loadFolderItemsForSelection)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([
        {
          uuid: "item-retry",
          chatId: "dm:retry",
          folderUuid: "folder-7",
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ]);
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
    expect(useFolderSyncStore.getState().staleFolderIds.has("folder-7")).toBe(true);

    await useFolderSyncStore.getState().selectFolder("folder-7");
    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(2);
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.has("dm:retry")).toBe(true);
    expect(useFolderSyncStore.getState().staleFolderIds.has("folder-7")).toBe(false);
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

  it("onFoldersLoaded updates rail only and keeps cached folder items until snapshot completes", async () => {
    const fullSnapshot = makeFolderSnapshot({ folderId: "folder-7" });
    const folders = fullSnapshot.folders;
    const folderEntry = fullSnapshot.itemsByFolderId.get("folder-7");
    const cachedItems = folderEntry?.ok === true ? folderEntry.items : [];

    let stateAfterFoldersLoaded: ReturnType<typeof useFolderSyncStore.getState> | null = null;

    vi.mocked(loadFolderSyncSnapshot).mockImplementation(
      async (_instanceId: string, options?: Parameters<typeof loadFolderSyncSnapshot>[1]) => {
        await options?.onFoldersLoaded?.(folders);
        stateAfterFoldersLoaded = useFolderSyncStore.getState();
        return makeFolderSnapshot({ folderId: "folder-7", selectedChatId: "dm:final" });
      },
    );

    useFolderSyncStore.setState({
      instanceId: "inst-a",
      labels: { allChats: "All", personal: "Personal", channels: "Channels" },
      showSystemFolders: false,
      selectedFolderId: "folder-7",
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: "folder-7", label: "Team", backgroundColor: 0, systemType: "created" },
      ],
      folderItemsByFolderId: new Map([["folder-7", cachedItems]]),
      selectedFolderChatIds: new Set(["dm:42"]),
    });

    await useFolderSyncStore.getState().refresh("polling");

    expect(stateAfterFoldersLoaded).not.toBeNull();
    expect(stateAfterFoldersLoaded!.folderItemsByFolderId.get("folder-7")).toEqual(cachedItems);
    expect(stateAfterFoldersLoaded!.selectedFolderChatIds?.has("dm:42")).toBe(true);
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.has("dm:final")).toBe(true);
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

describe("refreshFolderItemsCache", () => {
  beforeEach(() => {
    useFolderSyncStore.getState().clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useFolderSyncStore.getState().clear();
  });

  it("reloads one folder into folderItemsByFolderId and patches selectedFolderChatIds", async () => {
    const folderId = "folder-work";
    const items = [
      {
        uuid: "item-1",
        chatId: "dm:99",
        folderUuid: folderId,
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    vi.mocked(loadFolderItemsForSelection).mockResolvedValue(items);

    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: folderId, label: "Work", backgroundColor: 1, systemType: "created" },
      ],
      selectedFolderId: folderId,
      selectedFolderChatIds: new Set<string>(),
      folderItemsByFolderId: new Map([[folderId, []]]),
    });

    await useFolderSyncStore.getState().refreshFolderItemsCache(folderId);

    expect(loadFolderItemsForSelection).toHaveBeenCalledWith(folderId, {
      allFolderApiUuid: null,
    });
    const state = useFolderSyncStore.getState();
    expect(state.folderItemsByFolderId.get(folderId)).toEqual(items);
    expect(state.selectedFolderChatIds?.has("dm:99")).toBe(true);
  });

  it("does not call API when instanceId is null", async () => {
    await useFolderSyncStore.getState().refreshFolderItemsCache("any");
    expect(loadFolderItemsForSelection).not.toHaveBeenCalled();
  });

  it("updates items map only when a different folder is selected", async () => {
    const folderId = "folder-work";
    const items = [
      {
        uuid: "i",
        chatId: "dm:1",
        folderUuid: folderId,
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    vi.mocked(loadFolderItemsForSelection).mockResolvedValue(items);
    const previousSelection = new Set(["dm:2"]);
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: "folder-other", label: "Other", backgroundColor: 1, systemType: "created" },
        { id: folderId, label: "Work", backgroundColor: 2, systemType: "created" },
      ],
      selectedFolderId: "folder-other",
      selectedFolderChatIds: previousSelection,
      folderItemsByFolderId: new Map(),
    });

    await useFolderSyncStore.getState().refreshFolderItemsCache(folderId);

    const state = useFolderSyncStore.getState();
    expect(state.folderItemsByFolderId.get(folderId)).toEqual(items);
    expect(state.selectedFolderChatIds).toBe(previousSelection);
  });

  it("clears stale flag on successful refresh", async () => {
    const folderId = "folder-work";
    vi.mocked(loadFolderItemsForSelection).mockResolvedValue([
      {
        uuid: "i",
        chatId: "dm:1",
        folderUuid: folderId,
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [{ id: folderId, label: "Work", backgroundColor: 2, systemType: "created" }],
      staleFolderIds: new Set([folderId]),
      folderItemsByFolderId: new Map(),
    });

    await useFolderSyncStore.getState().refreshFolderItemsCache(folderId);

    expect(useFolderSyncStore.getState().staleFolderIds.has(folderId)).toBe(false);
  });

  it("marks folder stale when refresh fails", async () => {
    const folderId = "folder-work";
    vi.mocked(loadFolderItemsForSelection).mockRejectedValueOnce(new Error("network"));
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [{ id: folderId, label: "Work", backgroundColor: 2, systemType: "created" }],
      staleFolderIds: new Set(),
    });

    await useFolderSyncStore.getState().refreshFolderItemsCache(folderId);

    expect(useFolderSyncStore.getState().staleFolderIds.has(folderId)).toBe(true);
  });
});

describe("folder assignment orchestration", () => {
  beforeEach(() => {
    useFolderSyncStore.getState().clear();
    vi.clearAllMocks();
    getFoldersMock.mockResolvedValue([]);
    addChatToFolderMock.mockResolvedValue(true);
    removeChatFromFolderMock.mockResolvedValue(true);
  });

  afterEach(() => {
    useFolderSyncStore.getState().clear();
  });

  it("loadAssignmentsForChat uses cache-first and refetches stale folders", async () => {
    const staleFolder = "folder-stale";
    const warmFolder = "folder-warm";
    vi.mocked(loadFolderItemsForSelection).mockResolvedValueOnce([
      {
        uuid: "item-stale",
        chatId: "dm:10",
        folderUuid: staleFolder,
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [
        { id: warmFolder, label: "Warm", backgroundColor: 1, systemType: "created" },
        { id: staleFolder, label: "Stale", backgroundColor: 2, systemType: "created" },
      ],
      folderItemsByFolderId: new Map([
        [
          warmFolder,
          [
            {
              uuid: "item-warm",
              chatId: "dm:10",
              folderUuid: warmFolder,
              orderIndex: 0,
              pinnedAt: null,
              createdAt: "",
              updatedAt: "",
            },
          ],
        ],
        [staleFolder, []],
      ]),
      staleFolderIds: new Set([staleFolder]),
    });

    const rows = await useFolderSyncStore.getState().loadAssignmentsForChat("dm:10");

    expect(rows).toEqual([
      { folderUuid: warmFolder, label: "Warm", itemUuid: "item-warm" },
      { folderUuid: staleFolder, label: "Stale", itemUuid: "item-stale" },
    ]);
    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(1);
    expect(loadFolderItemsForSelection).toHaveBeenCalledWith(staleFolder, {
      allFolderApiUuid: null,
    });
    expect(useFolderSyncStore.getState().staleFolderIds.has(staleFolder)).toBe(false);
  });

  it("toggleAssignment(add) applies optimistic item immediately and then reconciles", async () => {
    const folderId = "folder-a";
    const reconcileDeferred = deferred<
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
    vi.mocked(loadFolderItemsForSelection).mockReturnValue(reconcileDeferred.promise);

    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [{ id: folderId, label: "Work", backgroundColor: 2, systemType: "created" }],
      selectedFolderId: folderId,
      selectedFolderChatIds: new Set<string>(),
      folderItemsByFolderId: new Map([[folderId, []]]),
    });

    const togglePromise = useFolderSyncStore.getState().toggleAssignment({
      chatId: "dm:42",
      folderUuid: folderId,
      itemUuid: null,
    });

    const optimisticItems = useFolderSyncStore.getState().folderItemsByFolderId.get(folderId) ?? [];
    expect(optimisticItems.some((item) => item.chatId === "dm:42")).toBe(true);

    reconcileDeferred.resolve([
      {
        uuid: "item-real",
        chatId: "dm:42",
        folderUuid: folderId,
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const result = await togglePromise;

    expect(result.ok).toBe(true);
    expect(result.rolledBack).toBe(false);
    expect(result.nextItemUuid).toBe("item-real");
    expect(addChatToFolderMock).toHaveBeenCalledWith(folderId, "dm:42");
    expect(useFolderSyncStore.getState().folderItemsByFolderId.get(folderId)?.[0]?.uuid).toBe(
      "item-real",
    );
  });

  it("toggleAssignment(remove) removes item optimistically and keeps server state on reconcile", async () => {
    const folderId = "folder-a";
    vi.mocked(loadFolderItemsForSelection).mockResolvedValueOnce([]);

    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [{ id: folderId, label: "Work", backgroundColor: 2, systemType: "created" }],
      selectedFolderId: folderId,
      selectedFolderChatIds: new Set(["dm:42"]),
      folderItemsByFolderId: new Map([
        [
          folderId,
          [
            {
              uuid: "item-1",
              chatId: "dm:42",
              folderUuid: folderId,
              orderIndex: 0,
              pinnedAt: null,
              createdAt: "",
              updatedAt: "",
            },
          ],
        ],
      ]),
    });

    const togglePromise = useFolderSyncStore.getState().toggleAssignment({
      chatId: "dm:42",
      folderUuid: folderId,
      itemUuid: "item-1",
    });

    expect(useFolderSyncStore.getState().folderItemsByFolderId.get(folderId)).toEqual([]);

    const result = await togglePromise;
    expect(result.ok).toBe(true);
    expect(result.removed).toBe(true);
    expect(removeChatFromFolderMock).toHaveBeenCalledWith(folderId, "item-1");
    expect(useFolderSyncStore.getState().selectedFolderChatIds?.size).toBe(0);
  });

  it("retries reconcile when first fetch misses newly added item", async () => {
    vi.useFakeTimers();
    const folderId = "folder-a";
    vi.mocked(loadFolderItemsForSelection)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          uuid: "item-2",
          chatId: "dm:42",
          folderUuid: folderId,
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ]);
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [{ id: folderId, label: "Work", backgroundColor: 2, systemType: "created" }],
      selectedFolderId: folderId,
      folderItemsByFolderId: new Map([[folderId, []]]),
    });

    const togglePromise = useFolderSyncStore.getState().toggleAssignment({
      chatId: "dm:42",
      folderUuid: folderId,
      itemUuid: null,
    });

    await vi.runAllTimersAsync();
    const result = await togglePromise;
    expect(result.ok).toBe(true);
    expect(loadFolderItemsForSelection).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("rolls back optimistic change and marks folder stale when reconcile fails", async () => {
    const folderId = "folder-a";
    vi.mocked(loadFolderItemsForSelection).mockRejectedValue(new Error("network"));
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [{ id: folderId, label: "Work", backgroundColor: 2, systemType: "created" }],
      selectedFolderId: folderId,
      folderItemsByFolderId: new Map(),
      staleFolderIds: new Set(),
    });

    const result = await useFolderSyncStore.getState().toggleAssignment({
      chatId: "dm:42",
      folderUuid: folderId,
      itemUuid: null,
    });

    const state = useFolderSyncStore.getState();
    expect(result.ok).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(state.folderItemsByFolderId.has(folderId)).toBe(false);
    expect(state.staleFolderIds.has(folderId)).toBe(true);
  });
});

describe("applyLocallyCreatedFolder", () => {
  beforeEach(() => {
    useFolderSyncStore.getState().clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useFolderSyncStore.getState().clear();
  });

  it("appends folder to rail and seeds empty items without calling loadFolderSyncSnapshot", () => {
    vi.mocked(loadFolderSyncSnapshot).mockClear();

    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [{ id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" }],
      folderItemsByFolderId: new Map(),
    });

    useFolderSyncStore.getState().applyLocallyCreatedFolder({
      id: "new-folder-uuid",
      title: "Sprint",
      backgroundColor: 0xff00aa,
    });

    expect(loadFolderSyncSnapshot).not.toHaveBeenCalled();
    const state = useFolderSyncStore.getState();
    expect(state.folders.some((f) => f.id === "new-folder-uuid")).toBe(true);
    const created = state.folders.find((f) => f.id === "new-folder-uuid");
    expect(created?.label).toBe("Sprint");
    expect(created?.systemType).toBe("created");
    expect(state.folderItemsByFolderId.get("new-folder-uuid")).toEqual([]);
  });

  it("is a no-op when folder id already exists", () => {
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: "dup", label: "First", backgroundColor: 1, systemType: "created" },
      ],
      folderItemsByFolderId: new Map([["dup", []]]),
    });

    useFolderSyncStore.getState().applyLocallyCreatedFolder({
      id: "dup",
      title: "Second",
      backgroundColor: 2,
    });

    const dup = useFolderSyncStore.getState().folders.filter((f) => f.id === "dup");
    expect(dup).toHaveLength(1);
    expect(dup[0]?.label).toBe("First");
  });
});

describe("applyLocallyDeletedFolder", () => {
  beforeEach(() => {
    useFolderSyncStore.getState().clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useFolderSyncStore.getState().clear();
  });

  it("removes folder and items cache without loadFolderSyncSnapshot", () => {
    vi.mocked(loadFolderSyncSnapshot).mockClear();
    const victim = "folder-to-delete";
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: victim, label: "Trash me", backgroundColor: 3, systemType: "created" },
      ],
      selectedFolderId: victim,
      selectedFolderChatIds: new Set(["dm:1"]),
      folderItemsByFolderId: new Map([
        [
          victim,
          [
            {
              uuid: "i",
              chatId: "dm:1",
              folderUuid: victim,
              orderIndex: 0,
              pinnedAt: null,
              createdAt: "",
              updatedAt: "",
            },
          ],
        ],
      ]),
    });

    useFolderSyncStore.getState().applyLocallyDeletedFolder(victim);

    expect(loadFolderSyncSnapshot).not.toHaveBeenCalled();
    const state = useFolderSyncStore.getState();
    expect(state.folders.some((f) => f.id === victim)).toBe(false);
    expect(state.folderItemsByFolderId.has(victim)).toBe(false);
    expect(state.selectedFolderId).toBe(SYSTEM_ALL_FOLDER_ID);
    expect(state.selectedFolderChatIds).toBeNull();
  });

  it("does not change selected folder when deleted folder was not selected", () => {
    const victim = "other";
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: victim, label: "X", backgroundColor: 1, systemType: "created" },
        { id: "current", label: "Current", backgroundColor: 2, systemType: "created" },
      ],
      selectedFolderId: "current",
      selectedFolderChatIds: new Set<string>(),
      folderItemsByFolderId: new Map([
        [victim, []],
        ["current", []],
      ]),
    });

    useFolderSyncStore.getState().applyLocallyDeletedFolder(victim);

    const state = useFolderSyncStore.getState();
    expect(state.selectedFolderId).toBe("current");
    expect(state.folders.some((f) => f.id === victim)).toBe(false);
  });
});

describe("syncDerived", () => {
  const labels = { allChats: "All", personal: "Personal", channels: "Channels" };

  beforeEach(() => {
    useFolderSyncStore.getState().clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useFolderSyncStore.getState().clear();
  });

  it("uses empty chat id set for created folder when items not yet in map (not null)", () => {
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      labels,
      showSystemFolders: false,
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: "folder-1", label: "Work", backgroundColor: 1, systemType: "created" },
      ],
      selectedFolderId: "folder-1",
      folderItemsByFolderId: new Map(),
    });

    useFolderSyncStore.getState().syncDerived(false, labels);

    const { selectedFolderChatIds } = useFolderSyncStore.getState();
    expect(selectedFolderChatIds).not.toBeNull();
    expect(selectedFolderChatIds?.size).toBe(0);
  });

  it("keeps null selectedFolderChatIds for system «all» folder", () => {
    useFolderSyncStore.setState({
      instanceId: "inst-1",
      labels,
      showSystemFolders: false,
      folders: [
        { id: SYSTEM_ALL_FOLDER_ID, label: "All", backgroundColor: 0, systemType: "all" },
        { id: "folder-1", label: "Work", backgroundColor: 1, systemType: "created" },
      ],
      selectedFolderId: SYSTEM_ALL_FOLDER_ID,
      selectedFolderChatIds: null,
      folderItemsByFolderId: new Map(),
    });

    useFolderSyncStore.getState().syncDerived(false, labels);

    expect(useFolderSyncStore.getState().selectedFolderChatIds).toBeNull();
  });
});
