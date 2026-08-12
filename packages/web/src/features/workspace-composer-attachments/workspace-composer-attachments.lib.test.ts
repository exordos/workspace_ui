import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceComposerAttachmentMarkdown,
  buildWorkspaceComposerAttachmentMetadata,
} from "./workspace-composer-attachments.lib";
import { createWorkspaceComposerAttachmentsController } from "./workspace-composer-attachments.model";
import type { WorkspaceComposerAttachmentUploadContext } from "./workspace-composer-attachments.types";

interface TestImage {
  naturalWidth: number;
  naturalHeight: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
}

const SCOPE = { ownerKey: "owner-a", runtimeGeneration: 1, scopeKey: "topic-a" };

function installImage(width: number, height: number): () => TestImage | null {
  const instances: TestImage[] = [];
  class ImageStub implements TestImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = "";

    constructor() {
      instances.push(this);
    }
  }
  vi.stubGlobal("Image", ImageStub);
  return () => instances.at(-1) ?? null;
}

function installObjectUrl(): void {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:composer-media");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workspace composer attachment metadata", () => {
  it("preserves portrait image dimensions in the image URN", async () => {
    const getImage = installImage(720, 1280);
    installObjectUrl();
    const file = new File(["png"], "portrait.png", { type: "image/png" });

    const metadataPromise = buildWorkspaceComposerAttachmentMetadata(file, {
      uuid: "image-uuid",
      content_type: "image/png",
    });
    getImage()?.onload?.();
    const metadata = await metadataPromise;

    expect(metadata).toEqual(
      expect.objectContaining({ width: 720, height: 1280, contentType: "image/png" }),
    );
    expect(buildWorkspaceComposerAttachmentMarkdown(metadata)).toBe(
      "![portrait.png](urn:image:image-uuid?name=portrait.png&content_type=image%2Fpng&w=720&h=1280&size=3)",
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:composer-media");
  });

  it("reads video dimensions and omits them for an unknown file type", async () => {
    installObjectUrl();
    const originalCreateElement = document.createElement.bind(document);
    let video: HTMLVideoElement | null = null;
    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "video") {
        video = element as HTMLVideoElement;
        Object.defineProperties(video, {
          videoWidth: { configurable: true, value: 1920 },
          videoHeight: { configurable: true, value: 1080 },
        });
      }
      return element;
    });
    const videoFile = new File(["video"], "clip.mp4", { type: "video/mp4" });

    const videoMetadataPromise = buildWorkspaceComposerAttachmentMetadata(videoFile, {
      uuid: "video-uuid",
      content_type: "video/mp4",
    });
    const loadedVideo = video as HTMLVideoElement | null;
    loadedVideo?.dispatchEvent(new Event("loadedmetadata"));
    const videoMetadata = await videoMetadataPromise;

    expect(videoMetadata).toEqual(expect.objectContaining({ width: 1920, height: 1080 }));
    expect(videoMetadata.markdownLink).toContain("w=1920&h=1080");

    const unknownMetadata = await buildWorkspaceComposerAttachmentMetadata(
      new File(["data"], "archive.bin"),
      { uuid: "file-uuid", content_type: "" },
    );
    expect(unknownMetadata).not.toHaveProperty("width");
    expect(unknownMetadata).not.toHaveProperty("height");
    expect(unknownMetadata.markdownLink).toBe(
      "[archive.bin](urn:file:file-uuid?name=archive.bin&size=4)",
    );
  });

  it("finishes with fallback metadata when dimension reading is aborted", async () => {
    installImage(640, 480);
    installObjectUrl();
    const abortController = new AbortController();

    const metadataPromise = buildWorkspaceComposerAttachmentMetadata(
      new File(["png"], "cancelled.png", { type: "image/png" }),
      { uuid: "cancelled-uuid", content_type: "image/png" },
      { signal: abortController.signal },
    );
    abortController.abort();
    const metadata = await metadataPromise;

    expect(metadata).not.toHaveProperty("width");
    expect(metadata).not.toHaveProperty("height");
    expect(metadata.markdownLink).not.toContain("w=");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:composer-media");
  });

  it("deletes an uploaded UUID when the scope becomes stale after dimensions resolve", async () => {
    const getImage = installImage(800, 1200);
    installObjectUrl();
    const deleteAttachment = vi.fn(() => Promise.resolve());
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: {
        upload: (file: File, context: WorkspaceComposerAttachmentUploadContext) =>
          buildWorkspaceComposerAttachmentMetadata(
            file,
            { uuid: "stale-uuid", content_type: "image/png" },
            { signal: context.signal },
          ),
        delete: deleteAttachment,
      },
    });
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "stale.png",
      { type: "image/png" },
    );

    controller.add([png]);
    await vi.waitFor(() => expect(getImage()).not.toBeNull());
    getImage()?.onload?.();
    controller.updateScope({ ownerKey: "owner-b", runtimeGeneration: 2, scopeKey: "topic-b" });

    await vi.waitFor(() =>
      expect(deleteAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: "stale-uuid", width: 800, height: 1200 }),
        expect.objectContaining({ scope: SCOPE }),
      ),
    );
    expect(controller.store.getState().attachments).toEqual([]);
  });
});
