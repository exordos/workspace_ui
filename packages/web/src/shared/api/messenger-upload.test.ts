/**
 * Tests for Workspace file upload API.
 */
import "./messenger.test.setup";
import { describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import { buildWorkspaceFileUrn, uploadFile } from "./messenger-upload";
import { getMockMessengerApi } from "./messenger.test.setup";

const mockMessengerApi = getMockMessengerApi();
const STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const FILE_UUID = "33333333-3333-4333-8333-333333333333";
const IMAGE_FILE_URN = `urn:image:${FILE_UUID}?name=test.png&content_type=image%2Fpng&size=4`;

describe("uploadFile", () => {
  it("uploads file and returns a canonical Workspace URN with metadata", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: { uuid: FILE_UUID, name: "test.png", size_bytes: 4 },
      raw: { statusText: "Created" },
    });
    const file = new File(["data"], "test.png", { type: "image/png" });

    const result = await uploadFile(file, { streamUuid: STREAM_UUID });

    expect(result).toBe(IMAGE_FILE_URN);
    expect(mockMessengerApi.postFormDataWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
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

    expect(result).toBe(
      `urn:file:${FILE_UUID}?name=cancellable.txt&content_type=text%2Fplain&size=4`,
    );
    expect(mockMessengerApi.postFormDataWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/files/",
      expect.any(FormData),
      controller.signal,
    );
  });

  it("uploads a public file using the canonical public ACL object", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: true,
      status: 201,
      data: { uuid: FILE_UUID },
      raw: { statusText: "Created" },
    });
    const file = new File(["public"], "public.txt", { type: "text/plain" });

    const result = await uploadFile(file, { acl: { mode: "public" } });

    expect(result).toBe(`urn:file:${FILE_UUID}?name=public.txt&content_type=text%2Fplain&size=6`);
    const form = mockMessengerApi.postFormDataWithBase.mock.calls[0]?.[2] as FormData;
    expect(form.get("stream_uuid")).toBeNull();
    expect(form.get("acl")).toBe('{"mode":"public"}');
  });

  it("throws when stream uuid is missing", async () => {
    const file = new File(["data"], "test.png", { type: "image/png" });

    await expect(uploadFile(file)).rejects.toThrow("Invalid streamUuid");
    expect(mockMessengerApi.postFormDataWithBase).not.toHaveBeenCalled();
  });

  it("rejects public ACL combined with a stream UUID", async () => {
    const file = new File(["data"], "test.png", { type: "image/png" });

    await expect(
      uploadFile(file, {
        acl: { mode: "public" },
        streamUuid: STREAM_UUID,
      }),
    ).rejects.toThrow("Public file upload must not include streamUuid");
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

  it("falls back to status message for non-json upload errors", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: false,
      status: 413,
      data: null,
      raw: { statusText: "Payload Too Large" },
    });
    const file = new File(["data"], "big.zip");

    await expect(uploadFile(file, { streamUuid: STREAM_UUID })).rejects.toThrow("app.errorStatus");
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

describe("buildWorkspaceFileUrn", () => {
  it("builds canonical file, image, and video URNs", () => {
    expect(
      buildWorkspaceFileUrn(
        FILE_UUID.toUpperCase(),
        new File(["data"], "report Q3.txt", { type: "text/plain" }),
      ),
    ).toBe(`urn:file:${FILE_UUID}?name=report+Q3.txt&content_type=text%2Fplain&size=4`);
    expect(
      buildWorkspaceFileUrn(FILE_UUID, new File(["data"], "photo.png", { type: "image/png" })),
    ).toMatch(/^urn:image:/);
    expect(
      buildWorkspaceFileUrn(FILE_UUID, new File(["data"], "clip.mp4", { type: "video/mp4" })),
    ).toMatch(/^urn:video:/);
  });

  it("rejects invalid file uuid", () => {
    expect(() => buildWorkspaceFileUrn("not-a-uuid", new File(["data"], "file.txt"))).toThrow(
      "Invalid uploaded file UUID",
    );
  });
});
