import { describe, expect, it } from "vitest";
import { getAttachmentCardMetadata, resolveAttachmentMediaKind } from "./attachment-card-meta.lib";

describe("attachment card metadata", () => {
  it("uses the same format and size labels for named and unnamed files", () => {
    expect(getAttachmentCardMetadata("report.pdf", "application/pdf", 1.2 * 1024 * 1024)).toEqual({
      formatLabel: "PDF",
      sizeLabel: "1.2 MB",
      iconName: "files",
    });
    expect(getAttachmentCardMetadata("archive", "application/zip")).toEqual({
      formatLabel: "ZIP",
      iconName: "files",
    });
    expect(getAttachmentCardMetadata("empty.txt", "text/plain", 0)).toEqual({
      formatLabel: "TXT",
      sizeLabel: "0 B",
      iconName: "files",
    });
  });

  it("keeps image and video classification ahead of filename guesses", () => {
    expect(resolveAttachmentMediaKind("clip.pdf", "video/mp4")).toBe("video");
    expect(resolveAttachmentMediaKind("clip.mp4", "application/pdf")).toBeNull();
    expect(resolveAttachmentMediaKind("clip.mp4", "application/octet-stream")).toBe("video");
    expect(getAttachmentCardMetadata("clip.mp4", "video/mp4").iconName).toBe("videos");
  });
});
