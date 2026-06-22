import { afterEach, describe, expect, it, vi } from "vitest";
import { getFolders } from "~/shared/api/workspace-client";
import type * as WorkspaceClient from "~/shared/api/workspace-client";
import { loadFolderSyncSnapshot, resetFolderSyncApiCacheForTests } from "./folder-sync.api";

vi.mock("~/shared/api/workspace-client", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceClient>();
  return {
    ...actual,
    getFolders: vi.fn(),
  };
});

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

  it("loads folders and builds items map from folders list", async () => {
    vi.mocked(getFolders).mockResolvedValue([
      {
        uuid: "folder-1",
        title: "All",
        background_color_value: 0,
        unread_count: 7,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "all",
        folder_items: [
          {
            uuid: "item-all",
            folder: "folder-1",
            stream_uuid: "6738f91a-4fd1-416e-807f-cb4ae00ec1d3",
            chat_type: "private",
            unread_count: 7,
            order_index: 0,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      {
        uuid: "folder-2",
        title: "Team",
        background_color_value: 4,
        unread_count: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "created",
        folder_items: [
          {
            uuid: "item-1",
            folder: "folder-2",
            stream_uuid: "815890be-9819-46b1-9291-880602e62b96",
            chat_type: "stream",
            unread_count: 0,
            order_index: 0,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    ]);

    const snapshot = await loadFolderSyncSnapshot("inst-a");

    expect(getFolders).toHaveBeenCalledTimes(1);
    expect(snapshot.itemsByFolderId.get("folder-2")).toEqual({
      ok: true,
      items: [
        {
          uuid: "item-1",
          chatId: "stream:815890be-9819-46b1-9291-880602e62b96:general",
          folderUuid: "folder-2",
          streamUuid: "815890be-9819-46b1-9291-880602e62b96",
          chatType: "stream",
          unreadCount: 0,
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
        unread_count: number;
        created_at: string;
        updated_at: string;
        system_type: "all" | "created" | "personal" | "channels";
        folder_items?: unknown;
      }[]
    >();
    vi.mocked(getFolders).mockImplementation(
      () => foldersRequest.promise as ReturnType<typeof getFolders>,
    );

    const first = loadFolderSyncSnapshot("inst-a");
    const second = loadFolderSyncSnapshot("inst-a");
    expect(getFolders).toHaveBeenCalledTimes(1);

    foldersRequest.resolve([
      {
        uuid: "folder-1",
        title: "All",
        background_color_value: 0,
        unread_count: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        system_type: "all",
      },
    ]);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(getFolders).toHaveBeenCalledTimes(1);
  });
});
