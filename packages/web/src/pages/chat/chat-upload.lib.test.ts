import { describe, expect, it, vi } from "vitest";
import { uploadComposerFiles } from "./chat-upload.lib";

const STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const FILE_A_URI = "/api/messenger/v1/files/33333333-3333-4333-8333-333333333333/actions/download";
const FILE_B_URI = "/api/messenger/v1/files/44444444-4444-4444-8444-444444444444/actions/download";

describe("uploadComposerFiles", () => {
  it("uploads valid files and returns markdown links with sanitized filenames", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const files = [
      new File(["report"], 'quarterly<>:"report?.txt', { type: "text/plain" }),
      new File([pngBytes], "image.png", { type: "image/png" }),
    ];
    const uploadFile = vi
      .fn<(file: File) => Promise<string>>()
      .mockResolvedValueOnce(FILE_A_URI)
      .mockResolvedValueOnce(FILE_B_URI);

    const links = await uploadComposerFiles(files, uploadFile, { streamUuid: STREAM_UUID });

    expect(links).toEqual([
      `[quarterly____report_.txt](${FILE_A_URI})`,
      `[image.png](${FILE_B_URI})`,
    ]);
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile).toHaveBeenNthCalledWith(1, files[0], { streamUuid: STREAM_UUID });
    expect(uploadFile).toHaveBeenNthCalledWith(2, files[1], { streamUuid: STREAM_UUID });
  });

  it("rejects empty files before upload starts", async () => {
    const files = [new File([""], "empty.txt", { type: "text/plain" })];
    const uploadFile = vi.fn<(file: File) => Promise<string>>();

    await expect(uploadComposerFiles(files, uploadFile)).rejects.toThrow("File is empty");
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("rejects oversized files before upload starts", async () => {
    const oversizedPayload = new Uint8Array(51 * 1024 * 1024);
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
    const uploadFile = vi.fn<(file: File) => Promise<string>>().mockResolvedValue(FILE_A_URI);

    const links = await uploadComposerFiles(files, uploadFile);

    expect(links).toEqual([`[icon.svg](${FILE_A_URI})`]);
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
      .mockResolvedValueOnce(FILE_A_URI)
      .mockResolvedValueOnce(FILE_B_URI);
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
      .mockResolvedValue(FILE_A_URI);

    await uploadComposerFiles([file], uploadFile, {
      signal: controller.signal,
      streamUuid: STREAM_UUID,
    });

    expect(uploadFile).toHaveBeenCalledWith(file, {
      signal: controller.signal,
      streamUuid: STREAM_UUID,
    });
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
        return Promise.resolve(FILE_A_URI);
      });

    await expect(
      uploadComposerFiles([file], uploadFile, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("Aborted");
  });
});
