import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MessageComposerAttachmentView } from "~/applications/messenger/features/composer/message-composer.types";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { useComposerMediaViewer } from "./composer-media-viewer.hook";

const attachment = (
  localId: string,
  contentType: string,
  mediaUrl: string | null,
): MessageComposerAttachmentView => ({
  localId,
  fileName: localId,
  contentType,
  mediaUrl,
  previewUrl: null,
  sizeBytes: 4,
  status: "uploading",
  loadedBytes: 0,
  totalBytes: 4,
  error: null,
  retryable: false,
});

afterEach(() => useMediaViewerStore.getState().close());

describe("composer media viewer", () => {
  it("opens only composer images and videos at the selected index and closes when one is removed", () => {
    const list = [
      attachment("doc.pdf", "application/pdf", null),
      attachment("first.png", "image/png", "blob:image"),
      attachment("clip.mp4", "video/mp4", "blob:video"),
    ];
    const { result } = renderHook(() => useComposerMediaViewer());
    act(() => result.current.open("clip.mp4", list));
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
    expect(useMediaViewerStore.getState().items).toMatchObject([
      { type: "image", url: "blob:image" },
      { type: "video", url: "blob:video" },
    ]);
    act(() => result.current.sync(list.slice(0, 2)));
    expect(useMediaViewerStore.getState().isOpen).toBe(false);
  });

  it("closes its viewer after a video display error replaces the item", () => {
    const list = [attachment("clip.mp4", "video/mp4", "blob:video")];
    const { result } = renderHook(() => useComposerMediaViewer());
    act(() => result.current.open("clip.mp4", list));
    act(() =>
      useMediaViewerStore
        .getState()
        .replaceItem(0, { url: "", type: "video", resourceState: "display-error" }),
    );
    act(() => result.current.sync([]));
    expect(useMediaViewerStore.getState().isOpen).toBe(false);
  });

  it("does not close a viewer opened by another owner", () => {
    const list = [attachment("first.png", "image/png", "blob:image")];
    const { result, unmount } = renderHook(() => useComposerMediaViewer());
    act(() => result.current.open("first.png", list));
    act(() => useMediaViewerStore.getState().open([{ type: "image", url: "blob:other" }]));
    act(() => result.current.sync([]));
    expect(useMediaViewerStore.getState().items[0]?.url).toBe("blob:other");
    unmount();
    expect(useMediaViewerStore.getState().isOpen).toBe(true);
  });
});
