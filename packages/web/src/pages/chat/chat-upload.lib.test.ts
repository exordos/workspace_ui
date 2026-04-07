import { describe, expect, it, vi } from "vitest";
import { uploadComposerFiles } from "./chat-upload.lib";

describe("uploadComposerFiles", () => {
  it("uploads valid files and returns markdown links with sanitized filenames", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const files = [
      new File(["report"], 'quarterly<>:"report?.txt', { type: "text/plain" }),
      new File([pngBytes], "image.png", { type: "image/png" }),
    ];
    const uploadFile = vi
      .fn<(file: File) => Promise<string>>()
      .mockResolvedValueOnce("/user_uploads/1/report.txt")
      .mockResolvedValueOnce("/user_uploads/1/image.png");

    const links = await uploadComposerFiles(files, uploadFile);

    expect(links).toEqual([
      "[quarterly____report_.txt](/user_uploads/1/report.txt)",
      "[image.png](/user_uploads/1/image.png)",
    ]);
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile).toHaveBeenNthCalledWith(1, files[0]);
    expect(uploadFile).toHaveBeenNthCalledWith(2, files[1]);
  });

  it("rejects empty files before upload starts", async () => {
    const files = [new File([""], "empty.txt", { type: "text/plain" })];
    const uploadFile = vi.fn<(file: File) => Promise<string>>();

    await expect(uploadComposerFiles(files, uploadFile)).rejects.toThrow("File is empty");
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("rejects oversized files before upload starts", async () => {
    const oversizedPayload = new Uint8Array(26 * 1024 * 1024);
    const files = [new File([oversizedPayload], "large.bin", { type: "application/octet-stream" })];
    const uploadFile = vi.fn<(file: File) => Promise<string>>();

    await expect(uploadComposerFiles(files, uploadFile)).rejects.toThrow("File is too large");
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("rejects files that claim image mime but have invalid bytes", async () => {
    const files = [new File(["not-an-image"], "avatar.png", { type: "image/png" })];
    const uploadFile = vi.fn<(file: File) => Promise<string>>();

    await expect(uploadComposerFiles(files, uploadFile)).rejects.toThrow(
      "Image file type is invalid",
    );
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("allows image types without known magic-byte signature", async () => {
    const files = [
      new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "icon.svg", {
        type: "image/svg+xml",
      }),
    ];
    const uploadFile = vi
      .fn<(file: File) => Promise<string>>()
      .mockResolvedValue("/user_uploads/1/icon.svg");

    const links = await uploadComposerFiles(files, uploadFile);

    expect(links).toEqual(["[icon.svg](/user_uploads/1/icon.svg)"]);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledWith(files[0]);
  });

  it("reports upload progress while uploading composer files", async () => {
    const files = [
      new File(["a"], "one.txt", { type: "text/plain" }),
      new File(["b"], "two.txt", { type: "text/plain" }),
    ];
    const uploadFile = vi
      .fn<(file: File) => Promise<string>>()
      .mockResolvedValueOnce("/user_uploads/1/one.txt")
      .mockResolvedValueOnce("/user_uploads/1/two.txt");
    const onProgress = vi.fn();

    await uploadComposerFiles(files, uploadFile, { onProgress });

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

  it("forwards abort signal to upload function", async () => {
    const file = new File(["doc"], "spec.txt", { type: "text/plain" });
    const controller = new AbortController();
    const uploadFile = vi
      .fn<(file: File, options?: { signal?: AbortSignal }) => Promise<string>>()
      .mockResolvedValue("/user_uploads/1/spec.txt");

    await uploadComposerFiles([file], uploadFile, {
      signal: controller.signal,
    } as unknown as Parameters<typeof uploadComposerFiles>[2]);

    expect(uploadFile).toHaveBeenCalledWith(file, { signal: controller.signal });
  });

  it("rejects with abort error when upload signal is already aborted", async () => {
    const file = new File(["doc"], "aborted.txt", { type: "text/plain" });
    const controller = new AbortController();
    controller.abort();
    const uploadFile = vi
      .fn<(file: File, options?: { signal?: AbortSignal }) => Promise<string>>()
      .mockImplementation((_file, options) => {
        if (options?.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return Promise.resolve("/user_uploads/1/aborted.txt");
      });

    await expect(
      uploadComposerFiles([file], uploadFile, {
        signal: controller.signal,
      } as unknown as Parameters<typeof uploadComposerFiles>[2]),
    ).rejects.toThrow("Aborted");
  });
});
