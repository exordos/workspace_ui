import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import {
  useLayoutFolderSyncOrchestration,
  type UseLayoutFolderSyncOrchestrationParams,
} from "./layout-folder-sync-orchestration.hook";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface HookProps {
  currentUserStatus: "loading" | "ready";
}

function StrictModeWrapper({ children }: Readonly<PropsWithChildren>) {
  return <StrictMode>{children}</StrictMode>;
}

describe("useLayoutFolderSyncOrchestration", () => {
  beforeEach(() => {
    useFolderSyncStore.getState().clear();
  });

  afterEach(() => {
    useFolderSyncStore.getState().clear();
    vi.clearAllMocks();
  });

  it("requests one bootstrap across StrictMode and loading-to-ready lifecycle overlap", async () => {
    const firstBootstrapRequest = deferred<void>();
    const secondBootstrapRequest = deferred<void>();
    const bootstrapFolderSync = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstBootstrapRequest.promise)
      .mockReturnValueOnce(secondBootstrapRequest.promise);
    const baseParams: Omit<UseLayoutFolderSyncOrchestrationParams, "currentUserStatus"> = {
      currentInstanceId: "inst-a",
      showSystemFolders: true,
      language: "en",
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [],
      streamsMap: new Map(),
      dmsMapSize: 0,
      usersMapForChatInfo: new Map(),
      currentUserId: null,
      selectedFolderId: "",
      selectedFolderChatIds: null,
      bootstrapFolderSync,
      syncFolderSyncSidebarProjection: vi.fn(),
      hideUnknownArchivedStreams: false,
      syncFolderSyncDerived: vi.fn(),
      refreshFolderSync: vi.fn(() => Promise.resolve()),
      online: true,
    };

    const { rerender } = renderHook<void, HookProps>(
      ({ currentUserStatus }) =>
        useLayoutFolderSyncOrchestration({
          ...baseParams,
          currentUserStatus,
        }),
      {
        initialProps: { currentUserStatus: "loading" },
        wrapper: StrictModeWrapper,
      },
    );

    await waitFor(() => {
      expect(bootstrapFolderSync).toHaveBeenCalledTimes(1);
    });

    rerender({ currentUserStatus: "ready" });
    expect(bootstrapFolderSync).toHaveBeenCalledTimes(1);

    firstBootstrapRequest.resolve();
    await firstBootstrapRequest.promise;

    // An auth/cache reset can clear folder state without changing the current instance.
    useFolderSyncStore.setState({ instanceId: null });
    rerender({ currentUserStatus: "loading" });
    await waitFor(() => {
      expect(bootstrapFolderSync).toHaveBeenCalledTimes(2);
    });

    secondBootstrapRequest.resolve();
    await secondBootstrapRequest.promise;
  });
});
