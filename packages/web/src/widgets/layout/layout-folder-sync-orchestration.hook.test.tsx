import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { useLayoutFolderSyncOrchestration } from "./layout-folder-sync-orchestration.hook";

vi.mock("./layout-folder-polling.lib", () => ({
  startFolderPolling: vi.fn(() => vi.fn()),
}));

vi.mock("./layout-pin-folder-items-sync.hook", () => ({
  useLayoutPinFolderItemsSync: vi.fn(),
}));

describe("useLayoutFolderSyncOrchestration", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useFolderSyncStore.getState().clear();
  });

  it("does not sync sidebar projection when folder-sync belongs to another instance", () => {
    useFolderSyncStore.setState({ instanceId: "inst-old" });
    const syncFolderSyncSidebarProjection = vi.fn();

    renderHook(() =>
      useLayoutFolderSyncOrchestration({
        currentInstanceId: "inst-new",
        currentUserStatus: "ready",
        showSystemFolders: true,
        language: "en",
        folderItemsByFolderId: new Map(),
        chatsSortedByLastMessage: [],
        streamsMap: new Map(),
        dmsMapSize: 0,
        usersMapForChatInfo: new Map(),
        currentUserId: 7,
        selectedFolderId: "all",
        selectedFolderChatIds: null,
        bootstrapFolderSync: vi.fn(() => Promise.resolve()),
        syncFolderSyncSidebarProjection,
        hideUnknownArchivedStreams: false,
        syncFolderSyncDerived: vi.fn(),
        refreshFolderSync: vi.fn(() => Promise.resolve()),
        online: true,
      }),
    );

    expect(syncFolderSyncSidebarProjection).not.toHaveBeenCalled();
  });
});
