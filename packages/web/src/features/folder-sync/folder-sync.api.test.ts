import { afterEach, describe, expect, it, vi } from "vitest";
import { getFolderItems, getFolders } from "~/shared/api/workspace-client";
import { loadFolderSyncSnapshot, resetFolderSyncApiCacheForTests } from "./folder-sync.api";

vi.mock("~/shared/api/workspace-client", () => ({
  getFolders: vi.fn(),
  getFolderItems: vi.fn(),
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

describe("folder-sync.api", () => {
  afterEach(() => {
    resetFolderSyncApiCacheForTests();
    vi.clearAllMocks();
  });

  it("loads folders and requests items once per folder", async () => {
    vi.mocked(getFolders).mockResolvedValue([
      {
        uuid: "folder-1",
        title: "All",
        background_color_value: 0,
        unread_messages: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "all",
      },
      {
        uuid: "folder-2",
        title: "Team",
        background_color_value: 4,
        unread_messages: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "created",
      },
    ]);
    vi.mocked(getFolderItems).mockResolvedValue([
      {
        uuid: "item-1",
        chatId: "dm:42",
        folderUuid: "folder-2",
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    const snapshot = await loadFolderSyncSnapshot("inst-a");

    expect(getFolders).toHaveBeenCalledTimes(1);
    expect(getFolderItems).toHaveBeenCalledTimes(2);
    expect(snapshot.itemsByFolderId.get("folder-2")).toEqual({
      ok: true,
      items: [
        {
          uuid: "item-1",
          chatId: "dm:42",
          folderUuid: "folder-2",
          orderIndex: 0,
          pinnedAt: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
  });

  it("coalesces in-flight snapshot requests per instance", async () => {
    const foldersRequest = deferred<
      {
        uuid: string;
        title: string;
        background_color_value: number;
        unread_messages: unknown[];
        created_at: string;
        updated_at: string;
        system_type: "all" | "created";
      }[]
    >();
    vi.mocked(getFolders).mockImplementation(
      () => foldersRequest.promise as ReturnType<typeof getFolders>,
    );
    vi.mocked(getFolderItems).mockResolvedValue([]);

    const first = loadFolderSyncSnapshot("inst-a");
    const second = loadFolderSyncSnapshot("inst-a");
    expect(getFolders).toHaveBeenCalledTimes(1);

    foldersRequest.resolve([
      {
        uuid: "folder-1",
        title: "All",
        background_color_value: 0,
        unread_messages: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "all",
      },
    ]);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(getFolders).toHaveBeenCalledTimes(1);
  });

  it("requests items for priority folder before parallel batch for other folders", async () => {
    vi.mocked(getFolders).mockResolvedValue([
      {
        uuid: "folder-a",
        title: "A",
        background_color_value: 0,
        unread_messages: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "created",
      },
      {
        uuid: "folder-b",
        title: "B",
        background_color_value: 0,
        unread_messages: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "created",
      },
    ]);
    const callOrder: string[] = [];
    vi.mocked(getFolderItems).mockImplementation((uuid: string) => {
      callOrder.push(uuid);
      return Promise.resolve([]);
    });

    await loadFolderSyncSnapshot("inst-a", { priorityFolderUuid: "folder-b" });

    expect(callOrder[0]).toBe("folder-b");
    expect(callOrder).toContain("folder-a");
    expect(callOrder).toHaveLength(2);
  });

  it("marks failed folder-items requests without failing full snapshot", async () => {
    vi.mocked(getFolders).mockResolvedValue([
      {
        uuid: "folder-1",
        title: "All",
        background_color_value: 0,
        unread_messages: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "all",
      },
    ]);
    vi.mocked(getFolderItems).mockRejectedValue(new Error("network"));

    const snapshot = await loadFolderSyncSnapshot("inst-a");
    expect(snapshot.itemsByFolderId.get("folder-1")).toEqual({
      ok: false,
      items: [],
    });
  });
});
