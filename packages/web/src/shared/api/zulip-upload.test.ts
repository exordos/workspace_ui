/**
 * Tests for Zulip API (zulip-upload module).
 */
import "./zulip.test.setup";
import { describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import { uploadFile } from "./zulip-upload";
import {
  getMockRefreshZulipApiBase,
  getMockZulipApi,
  jsonResponse,
  mockFetch,
} from "./zulip.test.setup";

const mockZulipApi = getMockZulipApi();
const mockRefreshZulipApiBase = getMockRefreshZulipApiBase();

describe("uploadFile", () => {
  it("returns URI on success", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uri: "/user_uploads/1/test.png" },
      raw: { statusText: "OK" },
    });
    const file = new File(["data"], "test.png", { type: "image/png" });
    const result = await uploadFile(file);
    expect(result).toBe("/user_uploads/1/test.png");
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.postFormData).toHaveBeenCalledWith("/user_uploads", expect.any(FormData));
  });

  it("falls back to url field", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { url: "/uploads/2/file.pdf" },
      raw: { statusText: "OK" },
    });
    const file = new File(["data"], "file.pdf");
    expect(await uploadFile(file)).toBe("/uploads/2/file.pdf");
  });

  it("passes abort signal to multipart upload when provided", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uri: "/user_uploads/2/cancellable.txt" },
      raw: { statusText: "OK" },
    });
    const file = new File(["data"], "cancellable.txt", { type: "text/plain" });
    const controller = new AbortController();
    const uploadWithOptions = uploadFile;

    const result = await uploadWithOptions(file, { signal: controller.signal });
    expect(result).toBe("/user_uploads/2/cancellable.txt");
    expect(mockZulipApi.postFormData).toHaveBeenCalledWith(
      "/user_uploads",
      expect.any(FormData),
      controller.signal,
    );
  });

  it("uses TUS flow for large files and resolves uploaded URI from attachments", async () => {
    const sixteenMb = 16 * 1024 * 1024;
    const largeFile = new File([new Uint8Array(sixteenMb)], "large-video.mp4", {
      type: "video/mp4",
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ Location: "/api/v1/tus/upload-1" }),
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "Upload-Offset": "0" }),
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ "Upload-Offset": "5242880" }),
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ "Upload-Offset": "10485760" }),
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ "Upload-Offset": "15728640" }),
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ "Upload-Offset": String(sixteenMb) }),
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce(
        jsonResponse({
          attachments: [
            {
              name: "large-video.mp4",
              size: sixteenMb,
              path_id: "1/large-video.mp4",
              create_time: 1710012345,
            },
          ],
        }),
      );

    const uri = await uploadFile(largeFile);

    expect(uri).toBe("/user_uploads/1/large-video.mp4");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://zulip.example.com/api/v1/tus",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mockZulipApi.postFormData).not.toHaveBeenCalled();
  });

  it("falls back to multipart upload when TUS is unavailable", async () => {
    const sixteenMb = 16 * 1024 * 1024;
    const largeFile = new File([new Uint8Array(sixteenMb)], "large.zip", {
      type: "application/zip",
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: () => Promise.resolve({ msg: "Not found" }),
    });
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uri: "/user_uploads/legacy/large.zip" },
      raw: { statusText: "OK" },
    });

    const uri = await uploadFile(largeFile);

    expect(uri).toBe("/user_uploads/legacy/large.zip");
    expect(mockZulipApi.postFormData).toHaveBeenCalledWith("/user_uploads", expect.any(FormData));
  });

  it("throws when no instance", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    const file = new File(["data"], "test.png");
    await expect(uploadFile(file)).rejects.toThrow();
  });

  it("throws on non-ok response", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: false,
      status: 413,
      data: { msg: "Too large" },
      raw: { statusText: "Payload Too Large" },
    });
    const file = new File(["data"], "big.zip");
    await expect(uploadFile(file)).rejects.toThrow("Too large");
  });

  it("throws when no URI returned", async () => {
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: {},
      raw: { statusText: "OK" },
    });
    const file = new File(["data"], "test.png");
    await expect(uploadFile(file)).rejects.toThrow("No URI returned");
  });

  it("throws when file is empty before upload request", async () => {
    const file = new File([], "empty.txt", { type: "text/plain" });
    await expect(uploadFile(file)).rejects.toThrow("File is empty");
    expect(mockZulipApi.postFormData).not.toHaveBeenCalled();
  });
});
