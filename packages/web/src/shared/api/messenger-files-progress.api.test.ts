import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteWorkspaceFile, uploadWorkspaceFileWithProgress } from "./messenger-files.api";
import { MessengerApiError } from "./messenger-transport.internal";

const FILE_UUID = "33333333-3333-4333-8333-333333333333";
const STREAM_UUID = "44444444-4444-4444-8444-444444444444";

interface XhrPlan {
  status?: number;
  responseText?: string;
  responseHeaders?: string;
  progress?: { loaded: number; total: number };
  result?: "error" | "load" | "throw";
}

class XMLHttpRequestMock extends EventTarget {
  static readonly plans: XhrPlan[] = [];
  static readonly instances: XMLHttpRequestMock[] = [];

  readonly upload = new EventTarget();
  readonly requestHeaders = new Map<string, string>();
  body: Document | XMLHttpRequestBodyInit | null = null;
  method = "";
  responseText = "";
  status = 0;
  url = "";
  aborted = false;
  private responseHeaders = "";

  constructor() {
    super();
    XMLHttpRequestMock.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders.set(name, value);
  }

  getAllResponseHeaders(): string {
    return this.responseHeaders;
  }

  send(body: Document | XMLHttpRequestBodyInit | null): void {
    this.body = body;
    const plan = XMLHttpRequestMock.plans.shift();
    if (plan == null) {
      throw new Error("Missing XMLHttpRequest plan");
    }
    if (plan.result === "throw") {
      throw new DOMException("Cannot send request", "InvalidStateError");
    }
    queueMicrotask(() => {
      if (this.aborted) return;
      if (plan.progress != null) {
        this.upload.dispatchEvent(
          new ProgressEvent("progress", {
            lengthComputable: true,
            loaded: plan.progress.loaded,
            total: plan.progress.total,
          }),
        );
      }
      this.status = plan.status ?? 200;
      this.responseText = plan.responseText ?? "";
      this.responseHeaders = plan.responseHeaders ?? "";
      this.dispatchEvent(new Event(plan.result ?? "load"));
    });
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.dispatchEvent(new Event("abort"));
  }
}

function uploadedFileResponse(): string {
  return JSON.stringify({
    uuid: FILE_UUID,
    stream_uuid: STREAM_UUID,
    name: "report.txt",
    description: "Quarterly report",
    content_type: "text/plain",
    size_bytes: 14,
    hash: "abc123",
    created_at: "2026-07-06T10:00:00Z",
    updated_at: "2026-07-06T10:00:00Z",
  });
}

beforeEach(() => {
  XMLHttpRequestMock.plans.length = 0;
  XMLHttpRequestMock.instances.length = 0;
  vi.stubGlobal("XMLHttpRequest", XMLHttpRequestMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Workspace file upload progress API", () => {
  it("uploads one multipart file and reports browser upload progress", async () => {
    XMLHttpRequestMock.plans.push({
      status: 201,
      responseText: uploadedFileResponse(),
      responseHeaders: "Content-Type: application/json\r\nETag: upload-etag\r\n",
      progress: { loaded: 7, total: 14 },
    });
    const onProgress = vi.fn();
    const signal = new AbortController().signal;

    const result = await uploadWorkspaceFileWithProgress(
      {
        accessToken: "access-token",
        devTargetOrigin: "https://workspace.example.com",
        signal,
      },
      {
        file: new File(["workspace file"], "original.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
        name: "report.txt",
        description: "Quarterly report",
        onProgress,
      },
    );

    expect(result.uuid).toBe(FILE_UUID);
    expect(onProgress).toHaveBeenCalledWith({ loaded: 7, total: 14 });
    const request = XMLHttpRequestMock.instances[0];
    expect(request).toBeDefined();
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("/api/workspace/v1/messenger/files/");
    expect(request?.requestHeaders.get("Accept")).toBe("application/json");
    expect(request?.requestHeaders.get("Authorization")).toBe("Bearer access-token");
    expect(request?.requestHeaders.get("X-Workspace-Dev-Target-Origin")).toBe(
      "https://workspace.example.com",
    );
    expect(request?.requestHeaders.has("Content-Type")).toBe(false);
    expect(request?.body).toBeInstanceOf(FormData);
    if (!(request?.body instanceof FormData)) {
      throw new Error("Expected multipart FormData body");
    }
    expect(request.body.get("stream_uuid")).toBe(STREAM_UUID);
    expect(request.body.get("name")).toBe("report.txt");
    expect(request.body.get("description")).toBe("Quarterly report");
    expect(request.body.get("file")).toBeInstanceOf(File);
  });

  it("aborts the active XMLHttpRequest through AbortSignal", async () => {
    XMLHttpRequestMock.plans.push({ status: 201, responseText: uploadedFileResponse() });
    const controller = new AbortController();

    const upload = uploadWorkspaceFileWithProgress(
      { accessToken: "access-token", signal: controller.signal },
      {
        file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
      },
    );
    await Promise.resolve();
    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(XMLHttpRequestMock.instances[0]?.aborted).toBe(true);
  });

  it("refreshes Workspace auth after 401 and retries with the fresh bearer token", async () => {
    XMLHttpRequestMock.plans.push(
      {
        status: 401,
        responseText: JSON.stringify({ detail: "Expired" }),
        progress: { loaded: 14, total: 14 },
      },
      {
        status: 201,
        responseText: uploadedFileResponse(),
        progress: { loaded: 2, total: 14 },
      },
    );
    const getAccessToken = vi.fn(({ force = false }: { force?: boolean } = {}) =>
      force ? "fresh-access-token" : "old-access-token",
    );

    const onProgress = vi.fn();
    await uploadWorkspaceFileWithProgress(
      { accessToken: "old-access-token", getAccessToken },
      {
        file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
        onProgress,
      },
    );

    expect(getAccessToken).toHaveBeenNthCalledWith(1, { force: false, signal: undefined });
    expect(getAccessToken).toHaveBeenNthCalledWith(2, { force: true, signal: undefined });
    expect(XMLHttpRequestMock.instances[0]?.requestHeaders.get("Authorization")).toBe(
      "Bearer old-access-token",
    );
    expect(XMLHttpRequestMock.instances[1]?.requestHeaders.get("Authorization")).toBe(
      "Bearer fresh-access-token",
    );
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { loaded: 14, total: 14 },
      { loaded: 14, total: 14 },
    ]);
  });

  it("keeps progress monotonic when retrying without a trailing slash", async () => {
    XMLHttpRequestMock.plans.push(
      {
        status: 404,
        responseText: JSON.stringify({ detail: "Not found" }),
        progress: { loaded: 12, total: 12 },
      },
      {
        status: 201,
        responseText: uploadedFileResponse(),
        progress: { loaded: 3, total: 12 },
      },
    );
    const onProgress = vi.fn();

    await uploadWorkspaceFileWithProgress(
      { accessToken: "access-token" },
      {
        file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
        onProgress,
      },
    );

    expect(XMLHttpRequestMock.instances.map((request) => request.url)).toEqual([
      "/api/workspace/v1/messenger/files/",
      "/api/workspace/v1/messenger/files",
    ]);
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { loaded: 12, total: 12 },
      { loaded: 12, total: 12 },
    ]);
  });

  it("returns a MessengerApiError with response data and headers after a failed retry", async () => {
    XMLHttpRequestMock.plans.push(
      { status: 401, responseText: JSON.stringify({ detail: "Expired" }) },
      {
        status: 403,
        responseText: JSON.stringify({ detail: "Forbidden" }),
        responseHeaders: "X-Request-Id: request-42\r\n",
      },
    );

    const upload = uploadWorkspaceFileWithProgress(
      {
        accessToken: "old-access-token",
        getAccessToken: ({ force = false } = {}) =>
          force ? "fresh-access-token" : "old-access-token",
      },
      {
        file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
      },
    );

    const error = await upload.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MessengerApiError);
    expect(error).toMatchObject({
      status: 403,
      data: { detail: "Forbidden" },
      message: "Messenger API POST /files/ failed",
    });
    expect((error as MessengerApiError).headers.get("x-request-id")).toBe("request-42");
  });

  it("uses strict JSON parsing for successful upload responses", async () => {
    XMLHttpRequestMock.plans.push({ status: 201, responseText: "not-json" });

    const upload = uploadWorkspaceFileWithProgress(
      { accessToken: "access-token" },
      {
        file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
      },
    );

    await expect(upload).rejects.toBeInstanceOf(SyntaxError);
  });

  it("retains a non-JSON error body in MessengerApiError", async () => {
    XMLHttpRequestMock.plans.push({ status: 422, responseText: "invalid multipart body" });

    const upload = uploadWorkspaceFileWithProgress(
      { accessToken: "access-token" },
      {
        file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
      },
    );

    await expect(upload).rejects.toMatchObject({
      name: "MessengerApiError",
      status: 422,
      data: "invalid multipart body",
    });
  });

  it("removes the abort listener when XMLHttpRequest.send throws", async () => {
    XMLHttpRequestMock.plans.push({ result: "throw" });
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(controller.signal, "removeEventListener");

    const upload = uploadWorkspaceFileWithProgress(
      { accessToken: "access-token", signal: controller.signal },
      {
        file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
      },
    );

    await expect(upload).rejects.toThrow("Messenger file upload failed to start");
    expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("deletes an owned Workspace file through the confirmed endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await deleteWorkspaceFile(
      { accessToken: "access-token", fetchImpl: fetchMock },
      "file/with spaces",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger/files/file%2Fwith%20spaces",
      expect.objectContaining({
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer access-token",
        },
      }),
    );
  });
});
