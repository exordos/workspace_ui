import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { useMediaViewerStore } from "./media-viewer.model";
import {
  useWorkspaceMediaViewer,
  type WorkspaceMediaViewerResource,
} from "./workspace-media-viewer.hook";

const IMAGE_FILE: WorkspaceMessageFileReference = {
  kind: "media",
  href: "urn:image:11111111-1111-4111-8111-111111111111?name=image.png",
  fileUuid: "11111111-1111-4111-8111-111111111111",
  name: "image.png",
  contentType: "image/png",
  mediaKind: "image",
};

const VIDEO_FILE: WorkspaceMessageFileReference = {
  kind: "media",
  href: "urn:video:22222222-2222-4222-8222-222222222222?name=video.mp4",
  fileUuid: "22222222-2222-4222-8222-222222222222",
  name: "video.mp4",
  contentType: "video/mp4",
  mediaKind: "video",
};

function resource(file: WorkspaceMessageFileReference): WorkspaceMediaViewerResource {
  return {
    blob: new Blob([file.fileUuid], { type: file.contentType }),
    headers: new Headers(),
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useWorkspaceMediaViewer", () => {
  beforeEach(() => {
    useMediaViewerStore.setState({ isOpen: false, currentIndex: 0, items: [] });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    useMediaViewerStore.getState().close();
    vi.restoreAllMocks();
  });

  it("loads an unselected video only after viewer navigation", async () => {
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:selected-image")
      .mockReturnValueOnce("blob:lazy-video");
    const loadResource = vi.fn((file: WorkspaceMessageFileReference) =>
      Promise.resolve(resource(file)),
    );
    const { result } = renderHook(() =>
      useWorkspaceMediaViewer({
        scope: { ownerKey: "owner", runtimeGeneration: 1, conversationId: "conversation" },
        enabled: true,
        loadResource,
        runAction: (action) => action(new AbortController().signal),
        onDownload: vi.fn(),
        deriveDownloadFileName: ({ fileNameHint, fileUuid }) => fileNameHint ?? fileUuid,
        onOpenStart: vi.fn(),
        onRuntimeUnavailable: vi.fn(),
        onUnsupported: vi.fn(),
        onLoadError: vi.fn(),
      }),
    );

    act(() => {
      result.current.openWorkspaceMedia(IMAGE_FILE, {
        startIndex: 0,
        items: [{ file: IMAGE_FILE }, { file: VIDEO_FILE }],
      });
    });

    await waitFor(() => expect(useMediaViewerStore.getState().isOpen).toBe(true));
    expect(loadResource).toHaveBeenCalledTimes(1);
    expect(useMediaViewerStore.getState().items[1]).toMatchObject({
      type: "video",
      resourceState: "loading",
      url: "",
    });

    act(() => {
      useMediaViewerStore.getState().goTo(1);
    });

    await waitFor(() => expect(loadResource).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(useMediaViewerStore.getState().items[1]).toMatchObject({
        resourceState: "ready",
        url: "blob:lazy-video",
      }),
    );
  });

  it("drops a result after the conversation scope changes", async () => {
    const deferred = createDeferred<WorkspaceMediaViewerResource>();
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const onLoadError = vi.fn();
    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useWorkspaceMediaViewer({
          scope: { ownerKey: "owner", runtimeGeneration: 1, conversationId },
          enabled: true,
          loadResource: () => deferred.promise,
          runAction: (action) => action(new AbortController().signal),
          onDownload: vi.fn(),
          deriveDownloadFileName: ({ fileNameHint, fileUuid }) => fileNameHint ?? fileUuid,
          onOpenStart: vi.fn(),
          onRuntimeUnavailable: vi.fn(),
          onUnsupported: vi.fn(),
          onLoadError,
        }),
      { initialProps: { conversationId: "first" } },
    );

    act(() => {
      result.current.openWorkspaceMedia(IMAGE_FILE);
    });
    rerender({ conversationId: "second" });
    await act(async () => {
      deferred.resolve(resource(IMAGE_FILE));
      await deferred.promise;
    });

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(onLoadError).not.toHaveBeenCalled();
  });

  it("does not reopen the viewer when a pending open resolves after manual close", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:opened-image");
    const pendingOpen = createDeferred<WorkspaceMediaViewerResource>();
    const loadResource = vi
      .fn<(file: WorkspaceMessageFileReference) => Promise<WorkspaceMediaViewerResource>>()
      .mockResolvedValueOnce(resource(IMAGE_FILE))
      .mockReturnValueOnce(pendingOpen.promise);
    const { result } = renderHook(() =>
      useWorkspaceMediaViewer({
        scope: { ownerKey: "owner", runtimeGeneration: 1, conversationId: "conversation" },
        enabled: true,
        loadResource,
        runAction: (action) => action(new AbortController().signal),
        onDownload: vi.fn(),
        deriveDownloadFileName: ({ fileNameHint, fileUuid }) => fileNameHint ?? fileUuid,
        onOpenStart: vi.fn(),
        onRuntimeUnavailable: vi.fn(),
        onUnsupported: vi.fn(),
        onLoadError: vi.fn(),
      }),
    );

    act(() => {
      result.current.openWorkspaceMedia(IMAGE_FILE);
    });
    await waitFor(() => expect(useMediaViewerStore.getState().isOpen).toBe(true));

    act(() => {
      result.current.openWorkspaceMedia(VIDEO_FILE);
      useMediaViewerStore.getState().close();
    });
    await act(async () => {
      pendingOpen.resolve(resource(VIDEO_FILE));
      await pendingOpen.promise;
    });

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("marks an eager image preload as failed when it rejects after navigation", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:selected-image");
    const adjacentImage: WorkspaceMessageFileReference = {
      ...IMAGE_FILE,
      href: "urn:image:33333333-3333-4333-8333-333333333333?name=adjacent.png",
      fileUuid: "33333333-3333-4333-8333-333333333333",
      name: "adjacent.png",
    };
    const selectedLoad = createDeferred<WorkspaceMediaViewerResource>();
    const adjacentLoad = createDeferred<WorkspaceMediaViewerResource>();
    const loadResource = vi.fn((file: WorkspaceMessageFileReference) =>
      file.fileUuid === IMAGE_FILE.fileUuid ? selectedLoad.promise : adjacentLoad.promise,
    );
    const { result } = renderHook(() =>
      useWorkspaceMediaViewer({
        scope: { ownerKey: "owner", runtimeGeneration: 1, conversationId: "conversation" },
        enabled: true,
        loadResource,
        runAction: (action) => action(new AbortController().signal),
        onDownload: vi.fn(),
        deriveDownloadFileName: ({ fileNameHint, fileUuid }) => fileNameHint ?? fileUuid,
        onOpenStart: vi.fn(),
        onRuntimeUnavailable: vi.fn(),
        onUnsupported: vi.fn(),
        onLoadError: vi.fn(),
      }),
    );

    act(() => {
      result.current.openWorkspaceMedia(IMAGE_FILE, {
        startIndex: 0,
        items: [{ file: IMAGE_FILE }, { file: adjacentImage }],
      });
    });
    await waitFor(() => expect(loadResource).toHaveBeenCalledTimes(2));
    await act(async () => {
      selectedLoad.resolve(resource(IMAGE_FILE));
      await selectedLoad.promise;
    });
    await waitFor(() => expect(useMediaViewerStore.getState().isOpen).toBe(true));

    act(() => {
      useMediaViewerStore.getState().goTo(1);
    });
    await act(async () => {
      adjacentLoad.reject(new Error("network failed"));
      await expect(adjacentLoad.promise).rejects.toThrow("network failed");
    });

    await waitFor(() =>
      expect(useMediaViewerStore.getState().items[1]).toMatchObject({
        resourceState: "load-error",
        url: "",
      }),
    );
  });
});
