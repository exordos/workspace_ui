import { describe, expect, it, vi } from "vitest";
import { appendComposerMarkdownLinks, uploadWorkspaceComposerFiles } from "./chat-upload.lib";
import {
  buildWorkspaceFileMetadata,
  buildWorkspaceFileUrnMarkdownLink,
} from "./chat-workspace-file-urn.lib";

describe("uploadWorkspaceComposerFiles", () => {
  it("uploads files and returns Workspace markdown with encoded content types", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const files = [
      new File(["report"], 'quarterly<>:"report?.pdf', { type: "application/pdf" }),
      new File([pngBytes], "image.png", { type: "image/png" }),
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
    ];
    const uploadFile = vi
      .fn<(file: File) => Promise<{ uuid: string; content_type: string }>>()
      .mockResolvedValueOnce({
        uuid: "11111111-1111-4111-8111-111111111111",
        content_type: "application/pdf",
      })
      .mockResolvedValueOnce({
        uuid: "22222222-2222-4222-8222-222222222222",
        content_type: "image/png",
      })
      .mockResolvedValueOnce({
        uuid: "33333333-3333-4333-8333-333333333333",
        content_type: "video/mp4",
      });

    const links = await uploadWorkspaceComposerFiles(files, uploadFile);

    expect(links).toEqual([
      "[quarterly____report_.pdf](urn:file:11111111-1111-4111-8111-111111111111?name=quarterly____report_.pdf&content_type=application%2Fpdf&size=6)",
      "![image.png](urn:image:22222222-2222-4222-8222-222222222222?name=image.png&content_type=image%2Fpng&size=8)",
      "[clip.mp4](urn:video:33333333-3333-4333-8333-333333333333?name=clip.mp4&content_type=video%2Fmp4&size=5)",
    ]);
  });

  it("rejects empty files before Workspace upload starts", async () => {
    const files = [new File([""], "empty.txt", { type: "text/plain" })];
    const uploadWorkspaceFile =
      vi.fn<(file: File) => Promise<{ uuid: string; content_type: string }>>();

    await expect(uploadWorkspaceComposerFiles(files, uploadWorkspaceFile)).rejects.toThrow(
      "File is empty",
    );
    expect(uploadWorkspaceFile).not.toHaveBeenCalled();
  });

  it("rejects oversized files before Workspace upload starts", async () => {
    const oversizedPayload = new Uint8Array(26 * 1024 * 1024);
    const files = [new File([oversizedPayload], "large.bin", { type: "application/octet-stream" })];
    const uploadWorkspaceFile =
      vi.fn<(file: File) => Promise<{ uuid: string; content_type: string }>>();

    await expect(uploadWorkspaceComposerFiles(files, uploadWorkspaceFile)).rejects.toThrow(
      "File is too large",
    );
    expect(uploadWorkspaceFile).not.toHaveBeenCalled();
  });

  it("rejects files that claim image mime but have invalid bytes", async () => {
    const files = [new File(["not-an-image"], "avatar.png", { type: "image/png" })];
    const uploadWorkspaceFile =
      vi.fn<(file: File) => Promise<{ uuid: string; content_type: string }>>();

    await expect(uploadWorkspaceComposerFiles(files, uploadWorkspaceFile)).rejects.toThrow(
      "Image file type is invalid",
    );
    expect(uploadWorkspaceFile).not.toHaveBeenCalled();
  });

  it("allows image types without known magic-byte signature", async () => {
    const files = [
      new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "icon.svg", {
        type: "image/svg+xml",
      }),
    ];
    const uploadWorkspaceFile = vi
      .fn<(file: File) => Promise<{ uuid: string; content_type: string }>>()
      .mockResolvedValue({
        uuid: "66666666-6666-4666-8666-666666666666",
        content_type: "image/svg+xml",
      });

    const links = await uploadWorkspaceComposerFiles(files, uploadWorkspaceFile);

    expect(links).toEqual([
      "![icon.svg](urn:image:66666666-6666-4666-8666-666666666666?name=icon.svg&content_type=image%2Fsvg%2Bxml&size=46)",
    ]);
    expect(uploadWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(uploadWorkspaceFile).toHaveBeenCalledWith(files[0]);
  });

  it("reports upload progress while uploading Workspace composer files", async () => {
    const files = [
      new File(["a"], "one.txt", { type: "text/plain" }),
      new File(["b"], "two.txt", { type: "text/plain" }),
    ];
    const uploadWorkspaceFile = vi
      .fn<(file: File) => Promise<{ uuid: string; content_type: string }>>()
      .mockResolvedValueOnce({
        uuid: "77777777-7777-4777-8777-777777777777",
        content_type: "text/plain",
      })
      .mockResolvedValueOnce({
        uuid: "88888888-8888-4888-8888-888888888888",
        content_type: "text/plain",
      });
    const onProgress = vi.fn();

    await uploadWorkspaceComposerFiles(files, uploadWorkspaceFile, { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      completed: 0,
      total: 2,
      activeFileName: "one.txt",
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      completed: 1,
      total: 2,
      activeFileName: "two.txt",
    });
    expect(onProgress).toHaveBeenNthCalledWith(3, {
      completed: 2,
      total: 2,
      activeFileName: null,
    });
  });

  it("rejects with abort error when Workspace upload signal is already aborted", async () => {
    const file = new File(["doc"], "aborted.txt", { type: "text/plain" });
    const controller = new AbortController();
    controller.abort();
    const uploadWorkspaceFile = vi
      .fn<
        (
          file: File,
          options?: { signal?: AbortSignal },
        ) => Promise<{ uuid: string; content_type: string }>
      >()
      .mockResolvedValue({
        uuid: "99999999-9999-4999-8999-999999999999",
        content_type: "text/plain",
      });

    await expect(
      uploadWorkspaceComposerFiles([file], uploadWorkspaceFile, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("Aborted");
    expect(uploadWorkspaceFile).not.toHaveBeenCalled();
  });

  it("builds Workspace URN markdown with metadata and escaped markdown labels", () => {
    const file = new File(["payload"], "release]notes.txt", { type: "" });

    expect(
      buildWorkspaceFileUrnMarkdownLink({
        type: "file",
        uuid: "44444444-4444-4444-8444-444444444444",
        name: "release]notes.txt",
        sizeBytes: file.size,
      }),
    ).toBe(
      "[release\\]notes.txt](urn:file:44444444-4444-4444-8444-444444444444?name=release%5Dnotes.txt&size=7)",
    );
  });

  it("collects known Workspace URN metadata without requiring content type", async () => {
    const file = new File(["payload"], "release]notes.txt", { type: "" });

    await expect(
      buildWorkspaceFileMetadata(file, {
        uuid: "44444444-4444-4444-8444-444444444444",
        content_type: "",
      }),
    ).resolves.toEqual({
      type: "file",
      uuid: "44444444-4444-4444-8444-444444444444",
      name: "release]notes.txt",
      sizeBytes: 7,
    });
  });

  it("combines clean composer text and uploaded Workspace links without mutating the draft", () => {
    expect(
      appendComposerMarkdownLinks("  hello  ", [
        "[report.pdf](urn:file:11111111-1111-4111-8111-111111111111?name=report.pdf&content_type=application%2Fpdf&size=6)",
      ]),
    ).toBe(
      "hello\n[report.pdf](urn:file:11111111-1111-4111-8111-111111111111?name=report.pdf&content_type=application%2Fpdf&size=6)",
    );
  });

  it("forwards abort signal to Workspace upload function", async () => {
    const file = new File(["doc"], "spec.txt", { type: "text/plain" });
    const controller = new AbortController();
    const uploadFile = vi
      .fn<
        (
          file: File,
          options?: { signal?: AbortSignal },
        ) => Promise<{ uuid: string; content_type: string }>
      >()
      .mockResolvedValue({
        uuid: "55555555-5555-4555-8555-555555555555",
        content_type: "text/plain",
      });

    await uploadWorkspaceComposerFiles([file], uploadFile, {
      signal: controller.signal,
    });

    expect(uploadFile).toHaveBeenCalledWith(file, { signal: controller.signal });
  });
});
