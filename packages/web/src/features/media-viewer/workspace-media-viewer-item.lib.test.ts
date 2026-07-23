import { describe, expect, it, vi } from "vitest";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { buildWorkspaceMediaViewerItem } from "./workspace-media-viewer-item.lib";

const IMAGE_FILE: WorkspaceMessageFileReference = {
  kind: "media",
  mediaKind: "image",
  href: "urn:image:11111111-1111-4111-8111-111111111111",
  fileUuid: "11111111-1111-4111-8111-111111111111",
  name: "photo.png",
  contentType: "image/png",
  width: 800,
  height: 600,
};

describe("buildWorkspaceMediaViewerItem", () => {
  it("maps Workspace image metadata without using the protected URL", () => {
    const item = buildWorkspaceMediaViewerItem({
      file: IMAGE_FILE,
      downloadFileName: "photo.png",
      blob: new Blob(["image"], { type: "image/png" }),
      objectUrl: "blob:workspace-image",
      onDownload: vi.fn(),
    });

    expect(item).toMatchObject({
      url: "blob:workspace-image",
      type: "image",
      resourceState: "ready",
      width: 800,
      height: 600,
      workspaceFile: {
        fileUuid: IMAGE_FILE.fileUuid,
        contentType: "image/png",
        objectUrl: "blob:workspace-image",
      },
    });
  });

  it("maps Workspace video as video and uses Blob content type as fallback", () => {
    const item = buildWorkspaceMediaViewerItem({
      file: {
        ...IMAGE_FILE,
        mediaKind: "video",
        href: "urn:video:22222222-2222-4222-8222-222222222222",
        fileUuid: "22222222-2222-4222-8222-222222222222",
        name: "clip.mp4",
        contentType: undefined,
      },
      downloadFileName: "clip.mp4",
      blob: new Blob(["video"], { type: "video/mp4" }),
      objectUrl: "blob:workspace-video",
      onDownload: vi.fn(),
    });

    expect(item).toMatchObject({
      url: "blob:workspace-video",
      type: "video",
      resourceState: "ready",
      workspaceFile: {
        contentType: "video/mp4",
        objectUrl: "blob:workspace-video",
      },
    });
  });

  it("creates an explicit loading item without inventing a display URL", () => {
    const item = buildWorkspaceMediaViewerItem({
      file: { ...IMAGE_FILE, mediaKind: "video" },
      downloadFileName: "clip.mp4",
      onDownload: vi.fn(),
    });

    expect(item).toMatchObject({
      url: "",
      type: "video",
      resourceState: "loading",
    });
    expect(item?.workspaceFile?.objectUrl).toBeUndefined();
  });

  it("does not mask attachments or unknown media as images", () => {
    expect(
      buildWorkspaceMediaViewerItem({
        file: { ...IMAGE_FILE, kind: "attachment", mediaKind: undefined },
        downloadFileName: "file.bin",
        onDownload: vi.fn(),
      }),
    ).toBeNull();
  });

  it("rejects non-Blob display URLs for protected Workspace media", () => {
    const item = buildWorkspaceMediaViewerItem({
      file: IMAGE_FILE,
      downloadFileName: "photo.png",
      objectUrl: "https://api.example.test/files/protected",
      onDownload: vi.fn(),
    });

    expect(item).toMatchObject({ url: "", resourceState: "loading" });
    expect(item?.workspaceFile?.objectUrl).toBeUndefined();
  });
});
