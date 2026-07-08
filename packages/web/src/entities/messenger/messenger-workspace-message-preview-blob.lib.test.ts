import { describe, expect, it } from "vitest";
import { normalizeWorkspacePreviewBlob } from "./messenger-workspace-message-preview-blob.lib";

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

    const normalized = normalizeWorkspacePreviewBlob(blob, undefined);

    expect(normalized).toBe(blob);
    expect(normalized.type).toBe("application/octet-stream");
  });
});
