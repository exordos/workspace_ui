import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import {
  deriveAttachmentFileName,
  downloadUserUploadAttachment,
  extractUserUploadPath,
} from "./message-attachment-download.lib";

describe("extractUserUploadPath", () => {
  it("returns relative path for absolute user_upload URL", () => {
    expect(
      extractUserUploadPath("https://chat.example.com/user_uploads/1/report.pdf?token=a"),
    ).toBe("/user_uploads/1/report.pdf?token=a");
  });

  it("returns relative path for raw /user_uploads value", () => {
    expect(extractUserUploadPath("/user_uploads/2/file.txt")).toBe("/user_uploads/2/file.txt");
  });

  it("strips workspace gateway prefix from relative user_upload path", () => {
    expect(extractUserUploadPath("/workspace/v1/user_uploads/2/file.txt?download=1")).toBe(
      "/user_uploads/2/file.txt?download=1",
    );
  });

  it("strips workspace gateway prefix from absolute user_upload URL", () => {
    expect(
      extractUserUploadPath("https://chat.example.com/workspace/v1/user_uploads/1/report.pdf"),
    ).toBe("/user_uploads/1/report.pdf");
  });

  it("returns null for non-upload links", () => {
    expect(extractUserUploadPath("https://example.com/docs")).toBeNull();
  });
});

describe("deriveAttachmentFileName", () => {
  it("prefers sanitized label from markdown link text", () => {
    expect(deriveAttachmentFileName("Quarterly report?.pdf", "/user_uploads/1/ignored")).toBe(
      "Quarterly report_.pdf",
    );
  });

  it("falls back to path segment when label is empty", () => {
    expect(deriveAttachmentFileName("   ", "/user_uploads/1/archive.tar.gz")).toBe(
      "archive.tar.gz",
    );
  });

  it("falls back to raw segment when encoded fallback is malformed", () => {
    const derive = () => deriveAttachmentFileName("   ", "/user_uploads/1/%E0%A4%A.txt");

    expect(derive).not.toThrow();
    expect(derive()).toBe("%E0%A4%A.txt");
  });
});

describe("downloadUserUploadAttachment", () => {
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
    setInstanceProvider(() => null);
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

    const success = await downloadUserUploadAttachment({
      path: "/user_uploads/1/file.txt",
      fileName: "file.txt",
      authHeaders: { Authorization: "Basic token" },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/user_uploads/1/file.txt", {
      headers: { Authorization: "Basic token" },
      credentials: "include",
    });
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("fail", { status: 500 }));

    const success = await downloadUserUploadAttachment({
      path: "/user_uploads/1/file.txt",
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

    const success = await downloadUserUploadAttachment({
      path: "/user_uploads/1/file.txt",
      fileName: "file.txt",
      authHeaders: { Authorization: "Basic token" },
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

  it("normalizes absolute upload URL to safe relative path before request", async () => {
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

    const success = await downloadUserUploadAttachment({
      path: "https://evil.example.com/user_uploads/1/file.txt?token=unsafe",
      fileName: "file.txt",
      authHeaders: { Authorization: "Basic token" },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/user_uploads/1/file.txt?token=unsafe", {
      headers: { Authorization: "Basic token" },
      credentials: "include",
    });
  });

  it("builds canonical fetch URL for workspace gateway user_upload links", async () => {
    const createObjectURLMock = vi.fn(() => "blob:test-canonical");
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
    setInstanceProvider(() => ({
      id: "inst-1",
      realm: "https://chat.example.com/workspace/v1/api/v1",
      email: "alice@example.com",
      apiKey: "token",
    }));

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200, headers: { "content-length": "2" } }));

    const success = await downloadUserUploadAttachment({
      path: "https://chat.example.com/workspace/v1/user_uploads/1/file.txt?token=unsafe",
      fileName: "file.txt",
      authHeaders: { Authorization: "Basic token" },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://chat.example.com/workspace/v1/user_uploads/1/file.txt?token=unsafe",
      {
        headers: { Authorization: "Basic token" },
        credentials: "omit",
      },
    );
  });

  it("does not issue request for invalid non-upload path", async () => {
    const fetchMock = vi.fn();

    const success = await downloadUserUploadAttachment({
      path: "https://evil.example.com/public/file.txt",
      fileName: "file.txt",
      authHeaders: { Authorization: "Basic token" },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
