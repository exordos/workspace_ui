import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deriveAttachmentFileName,
  downloadWorkspaceFileAttachment,
  extractWorkspaceFileDownloadPath,
} from "./message-attachment-download.lib";

const FILE_DOWNLOAD_PATH =
  "/api/workspace/v1/messenger/files/33333333-3333-4333-8333-333333333333/actions/download";

describe("extractWorkspaceFileDownloadPath", () => {
  it("returns relative path for raw workspace file download value", () => {
    expect(extractWorkspaceFileDownloadPath(FILE_DOWNLOAD_PATH)).toBe(FILE_DOWNLOAD_PATH);
  });

  it("returns relative path for same-origin absolute workspace file download URL", () => {
    expect(
      extractWorkspaceFileDownloadPath(`${window.location.origin}${FILE_DOWNLOAD_PATH}?token=a`),
    ).toBe(`${FILE_DOWNLOAD_PATH}?token=a`);
  });

  it("returns null for legacy and external links", () => {
    expect(extractWorkspaceFileDownloadPath("/user_uploads/2/file.txt")).toBeNull();
    expect(extractWorkspaceFileDownloadPath("https://example.com/docs")).toBeNull();
    expect(
      extractWorkspaceFileDownloadPath(`https://evil.example.com${FILE_DOWNLOAD_PATH}`),
    ).toBeNull();
  });
});

describe("deriveAttachmentFileName", () => {
  it("returns sanitized label from markdown link text", () => {
    expect(deriveAttachmentFileName("Quarterly report?.pdf")).toBe("Quarterly report_.pdf");
  });

  it("falls back to generic attachment name when label is empty", () => {
    expect(deriveAttachmentFileName("   ")).toBe("attachment");
  });
});

describe("downloadWorkspaceFileAttachment", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "a") {
        return {
          href: "",
          download: "",
          click: vi.fn(),
        } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tagName);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("downloads file when request succeeds", async () => {
    const createObjectURLMock = vi.fn(() => "blob:test");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200, headers: { "content-length": "2" } }));

    const success = await downloadWorkspaceFileAttachment({
      path: FILE_DOWNLOAD_PATH,
      fileName: "file.txt",
      authHeaders: { Authorization: "Bearer token" },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(FILE_DOWNLOAD_PATH, {
      headers: { Authorization: "Bearer token" },
      credentials: "include",
    });
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("fail", { status: 500 }));

    const success = await downloadWorkspaceFileAttachment({
      path: FILE_DOWNLOAD_PATH,
      fileName: "file.txt",
      authHeaders: {},
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(false);
  });

  it("reports streaming progress while downloading", async () => {
    const createObjectURLMock = vi.fn(() => "blob:test-stream");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });

    const chunkA = new TextEncoder().encode("hello");
    const chunkB = new TextEncoder().encode("world");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunkA);
        controller.enqueue(chunkB);
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          "content-length": String(chunkA.byteLength + chunkB.byteLength),
          "content-type": "text/plain",
        },
      }),
    );
    const onProgress = vi.fn();

    const success = await downloadWorkspaceFileAttachment({
      path: FILE_DOWNLOAD_PATH,
      fileName: "file.txt",
      authHeaders: { Authorization: "Bearer token" },
      onProgress,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, { receivedBytes: 5, totalBytes: 10 });
    expect(onProgress).toHaveBeenNthCalledWith(2, { receivedBytes: 10, totalBytes: 10 });
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes same-origin absolute download URL to relative path before request", async () => {
    const createObjectURLMock = vi.fn(() => "blob:test-safe");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200, headers: { "content-length": "2" } }));

    const success = await downloadWorkspaceFileAttachment({
      path: `${window.location.origin}${FILE_DOWNLOAD_PATH}`,
      fileName: "file.txt",
      authHeaders: { Authorization: "Bearer token" },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(FILE_DOWNLOAD_PATH, {
      headers: { Authorization: "Bearer token" },
      credentials: "include",
    });
  });

  it("does not issue request for invalid or legacy path", async () => {
    const fetchMock = vi.fn();

    const success = await downloadWorkspaceFileAttachment({
      path: "/user_uploads/1/file.txt",
      fileName: "file.txt",
      authHeaders: { Authorization: "Bearer token" },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
