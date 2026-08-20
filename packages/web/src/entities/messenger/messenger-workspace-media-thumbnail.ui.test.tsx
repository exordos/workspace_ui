import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { WorkspaceMessageMediaThumbnail } from "./messenger-workspace-media-thumbnail.ui";

const IMAGE_REFERENCE: WorkspaceMessageFileReference = {
  kind: "media",
  mediaKind: "image",
  href: "urn:image:11111111-1111-4111-8111-111111111111",
  fileUuid: "11111111-1111-4111-8111-111111111111",
  name: "image.png",
  contentType: "image/png",
};

const VIDEO_REFERENCE: WorkspaceMessageFileReference = {
  ...IMAGE_REFERENCE,
  mediaKind: "video",
  href: "urn:video:22222222-2222-4222-8222-222222222222",
  fileUuid: "22222222-2222-4222-8222-222222222222",
  name: "clip.mp4",
  contentType: "video/mp4",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("WorkspaceMessageMediaThumbnail", () => {
  it("loads an image and revokes its Blob URL on unmount", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quote-image");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi
      .fn()
      .mockResolvedValue(new Blob(["image"], { type: "image/png" }));

    const { container, unmount } = render(
      <WorkspaceMessageMediaThumbnail
        reference={IMAGE_REFERENCE}
        onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("img")).not.toBeNull();
    });
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "blob:quote-image");
    expect(image).toHaveClass("absolute", "inset-0", "object-cover", "pointer-events-none");
    expect(image?.parentElement).toHaveClass("min-h-12", "w-12", "self-stretch");
    expect(onLoadWorkspaceFilePreview).toHaveBeenCalledWith(
      IMAGE_REFERENCE,
      expect.any(AbortSignal),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:quote-image");
  });

  it("renders a non-interactive video thumbnail", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quote-video");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const { container } = render(
      <WorkspaceMessageMediaThumbnail
        reference={VIDEO_REFERENCE}
        onLoadWorkspaceFilePreview={vi.fn().mockResolvedValue(new Blob(["video"]))}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("video")).toHaveAttribute("src", "blob:quote-video");
    });
    const video = container.querySelector("video");
    expect(video).not.toHaveAttribute("controls");
    expect(video).toHaveAttribute("tabindex", "-1");
  });

  it("aborts replacement loads and removes a failed media element", async () => {
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first-image")
      .mockReturnValueOnce("blob:second-image");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const signals: AbortSignal[] = [];
    const onLoadWorkspaceFilePreview = vi.fn(
      (_: WorkspaceMessageFileReference, signal: AbortSignal) => {
        signals.push(signal);
        return Promise.resolve(new Blob(["image"]));
      },
    );

    const { container, rerender } = render(
      <WorkspaceMessageMediaThumbnail
        reference={IMAGE_REFERENCE}
        onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector("img")).not.toBeNull();
    });

    rerender(
      <WorkspaceMessageMediaThumbnail
        reference={{ ...IMAGE_REFERENCE, fileUuid: "66666666-6666-4666-8666-666666666666" }}
        onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
      />,
    );

    expect(signals[0]?.aborted).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first-image");
    await waitFor(() => {
      expect(container.querySelector("img[src='blob:second-image']")).not.toBeNull();
    });
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second-image");
  });

  it("keeps the surface free of broken media when loading fails", async () => {
    const { container } = render(
      <WorkspaceMessageMediaThumbnail
        reference={IMAGE_REFERENCE}
        onLoadWorkspaceFilePreview={vi.fn().mockRejectedValue(new Error("preview failed"))}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-workspace-quote-media-thumbnail='true']")).toBeNull();
    });
  });

  it("does not create an object URL when a late load resolves after unmount", async () => {
    let resolvePreview: ((blob: Blob) => void) | undefined;
    const previewPromise = new Promise<Blob>((resolve) => {
      resolvePreview = resolve;
    });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:late-image");

    const { unmount } = render(
      <WorkspaceMessageMediaThumbnail
        reference={IMAGE_REFERENCE}
        onLoadWorkspaceFilePreview={vi.fn(() => previewPromise)}
      />,
    );
    unmount();
    resolvePreview?.(new Blob(["late image"]));

    await Promise.resolve();
    await Promise.resolve();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("defers loading until the thumbnail is near the viewport", async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback;
        }

        observe = observe;
        disconnect = disconnect;
      },
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:deferred-image");
    const onLoadWorkspaceFilePreview = vi
      .fn()
      .mockResolvedValue(new Blob(["image"], { type: "image/png" }));

    const { container } = render(
      <WorkspaceMessageMediaThumbnail
        reference={IMAGE_REFERENCE}
        onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
      />,
    );

    expect(observe).toHaveBeenCalledTimes(1);
    expect(onLoadWorkspaceFilePreview).not.toHaveBeenCalled();
    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => {
      expect(container.querySelector("img[src='blob:deferred-image']")).not.toBeNull();
    });
    expect(onLoadWorkspaceFilePreview).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
