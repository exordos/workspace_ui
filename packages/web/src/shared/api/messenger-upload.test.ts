/**
 * Tests for Workspace file upload API.
 */
import "./messenger.test.setup";
import { describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import { buildWorkspaceFileDownloadUri, uploadFile } from "./messenger-upload";
import { getMockMessengerApi } from "./messenger.test.setup";

const mockMessengerApi = getMockMessengerApi();
const STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const FILE_UUID = "33333333-3333-4333-8333-333333333333";
const FILE_DOWNLOAD_URI = `/api/messenger/v1/files/${FILE_UUID}/actions/download`;

describe("uploadFile", () => {
  it("uploads file to workspace files endpoint and returns download action URI", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: { uuid: FILE_UUID, name: "test.png", size_bytes: 4 },
      raw: { statusText: "Created" },
    });
    const file = new File(["data"], "test.png", { type: "image/png" });

    const result = await uploadFile(file, { streamUuid: STREAM_UUID });

    expect(result).toBe(FILE_DOWNLOAD_URI);
    expect(mockMessengerApi.postFormDataWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/files/",
      expect.any(FormData),
      undefined,
    );
    const form = mockMessengerApi.postFormDataWithBase.mock.calls[0]?.[2] as FormData;
    expect(form.get("stream_uuid")).toBe(STREAM_UUID);
    expect(form.get("file")).toBe(file);
  });

  it("passes abort signal to multipart upload when provided", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: { uuid: FILE_UUID },
      raw: { statusText: "Created" },
    });
    const file = new File(["data"], "cancellable.txt", { type: "text/plain" });
    const controller = new AbortController();

    const result = await uploadFile(file, {
      streamUuid: STREAM_UUID,
      signal: controller.signal,
    });

    expect(result).toBe(FILE_DOWNLOAD_URI);
    expect(mockMessengerApi.postFormDataWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/files/",
      expect.any(FormData),
      controller.signal,
    );
  });

  it("throws when stream uuid is missing", async () => {
    const file = new File(["data"], "test.png", { type: "image/png" });

    await expect(uploadFile(file)).rejects.toThrow("Invalid streamUuid");
    expect(mockMessengerApi.postFormDataWithBase).not.toHaveBeenCalled();
  });

  it("throws when no instance", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue(null);
    const file = new File(["data"], "test.png", { type: "image/png" });

    await expect(uploadFile(file, { streamUuid: STREAM_UUID })).rejects.toThrow();
    expect(mockMessengerApi.postFormDataWithBase).not.toHaveBeenCalled();
  });

  it("throws on non-ok response", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: false,
      status: 413,
      data: { msg: "Too large" },
      raw: { statusText: "Payload Too Large" },
    });
    const file = new File(["data"], "big.zip");

    await expect(uploadFile(file, { streamUuid: STREAM_UUID })).rejects.toThrow("Too large");
  });

  it("throws when upload response has no file uuid", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: {},
      raw: { statusText: "Created" },
    });
    const file = new File(["data"], "test.png", { type: "image/png" });

    await expect(uploadFile(file, { streamUuid: STREAM_UUID })).rejects.toThrow(
      "No file UUID returned from upload",
    );
  });

  it("throws when file is empty before upload request", async () => {
    const file = new File([], "empty.txt", { type: "text/plain" });

    await expect(uploadFile(file, { streamUuid: STREAM_UUID })).rejects.toThrow("File is empty");
    expect(mockMessengerApi.postFormDataWithBase).not.toHaveBeenCalled();
  });
});

describe("buildWorkspaceFileDownloadUri", () => {
  it("builds workspace file download action URI", () => {
    expect(buildWorkspaceFileDownloadUri(FILE_UUID.toUpperCase())).toBe(FILE_DOWNLOAD_URI);
  });

  it("rejects invalid file uuid", () => {
    expect(() => buildWorkspaceFileDownloadUri("not-a-uuid")).toThrow("Invalid uploaded file UUID");
  });
});
