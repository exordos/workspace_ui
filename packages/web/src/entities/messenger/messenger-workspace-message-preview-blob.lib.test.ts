import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHeicPreview } from "~/shared/lib/heic-preview.lib";
import {
  buildWorkspaceMediaDisplayBlob,
  normalizeWorkspacePreviewBlob,
} from "./messenger-workspace-message-preview-blob.lib";

vi.mock("~/shared/lib/heic-preview.lib", { spy: true });

describe("normalizeWorkspacePreviewBlob", () => {
  it("keeps blob when response already has a concrete image MIME type", () => {
    const blob = new Blob(["pixels"], { type: "image/png" });

    const normalized = normalizeWorkspacePreviewBlob(blob, "image/jpeg");

    expect(normalized).toBe(blob);
    expect(normalized.type).toBe("image/png");
  });

  it("retypes octet-stream blobs using parsed file contentType", () => {
    const blob = new Blob(["pixels"], { type: "application/octet-stream" });

    const normalized = normalizeWorkspacePreviewBlob(blob, "image/png");

    expect(normalized).not.toBe(blob);
    expect(normalized.type).toBe("image/png");
    expect(normalized.size).toBe(blob.size);
  });

  it("retypes empty-type blobs using parsed file contentType", () => {
    const blob = new Blob(["pixels"]);

    const normalized = normalizeWorkspacePreviewBlob(blob, "image/webp");

    expect(normalized.type).toBe("image/webp");
  });

  it("returns original blob when no fallback content type is available", () => {
    const blob = new Blob(["pixels"], { type: "application/octet-stream" });

    const normalized = normalizeWorkspacePreviewBlob(blob);

    expect(normalized).toBe(blob);
    expect(normalized.type).toBe("application/octet-stream");
  });
});

describe("buildWorkspaceMediaDisplayBlob", () => {
  beforeEach(() => {
    vi.mocked(createHeicPreview).mockClear();
  });

  it.each([undefined, "application/octet-stream", "image/heic"])(
    "uses a JPEG response directly despite a HEIC filename and a link MIME of %s",
    async (contentType) => {
      const jpeg = new Blob(["original pixels"], { type: "image/jpeg" });
      const reference = { mediaKind: "image", name: "photo.HEIC", contentType } as const;

      await expect(
        buildWorkspaceMediaDisplayBlob(jpeg, reference, new AbortController().signal),
      ).resolves.toBe(jpeg);
      expect(createHeicPreview).not.toHaveBeenCalled();
    },
  );

  it("decodes an explicit HEIC response with an outdated JPEG MIME in the link", async () => {
    const original = new Blob(["original"], { type: "image/heic" });
    const jpeg = new Blob(["preview"], { type: "image/jpeg" });
    const reference = { mediaKind: "image", name: "photo.jpg", contentType: "image/jpeg" } as const;
    const signal = new AbortController().signal;
    vi.mocked(createHeicPreview).mockResolvedValueOnce(jpeg);

    await expect(buildWorkspaceMediaDisplayBlob(original, reference, signal)).resolves.toBe(jpeg);
    expect(createHeicPreview).toHaveBeenCalledExactlyOnceWith(original, { signal });
  });

  it("reuses a HEIC display conversion while keeping the original blob intact", async () => {
    const original = new Blob(["original"], { type: "application/octet-stream" });
    const reference = {
      mediaKind: "image",
      name: "photo.HEIC",
      contentType: "application/octet-stream",
    } as const;
    const jpeg = new Blob(["preview"], { type: "image/jpeg" });
    const signal = new AbortController().signal;
    vi.mocked(createHeicPreview).mockResolvedValueOnce(jpeg);
    expect(normalizeWorkspacePreviewBlob(original, reference.contentType)).toBe(original);

    await expect(buildWorkspaceMediaDisplayBlob(original, reference, signal)).resolves.toBe(jpeg);
    await expect(buildWorkspaceMediaDisplayBlob(original, reference, signal)).resolves.toBe(jpeg);
    expect(createHeicPreview).toHaveBeenCalledExactlyOnceWith(original, { signal });
    expect(await original.text()).toBe("original");
  });
});
