import { describe, expect, it, vi } from "vitest";
import { downloadWorkspaceFile, uploadWorkspaceFile } from "./messenger-files.api";
import { MessengerApiError } from "./messenger-transport.internal";

const FILE_UUID = "33333333-3333-4333-8333-333333333333";
const STREAM_UUID = "44444444-4444-4444-8444-444444444444";

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) {
    throw new Error("Expected fetch to be called");
  }
  return call;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("messenger files API", () => {
  it("downloads Workspace file bytes through the confirmed file download endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response("workspace file", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": 'attachment; filename="report.txt"',
        },
      }),
    );

    const result = await downloadWorkspaceFile(
      { accessToken: "access-token", fetchImpl: fetchMock },
      FILE_UUID,
    );

    expect(await result.blob.text()).toBe("workspace file");
    expect(result.headers.get("content-disposition")).toContain("report.txt");
    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/files/${FILE_UUID}/actions/download`);
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({
      Accept: "*/*",
      Authorization: "Bearer access-token",
    });
  });

  it("uploads Workspace files as multipart with auth, dev proxy header, and abort signal", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      jsonResponse({
        uuid: FILE_UUID,
        stream_uuid: STREAM_UUID,
        name: "report.txt",
        description: "Quarterly report",
        content_type: "text/plain",
        size_bytes: 14,
        hash: "abc123",
        created_at: "2026-07-06T10:00:00Z",
        updated_at: "2026-07-06T10:00:00Z",
      }),
    );
    const controller = new AbortController();
    const file = new File(["workspace file"], "original.txt", { type: "text/plain" });

    const result = await uploadWorkspaceFile(
      {
        accessToken: "access-token",
        devTargetOrigin: "https://workspace.example.com",
        fetchImpl: fetchMock,
        signal: controller.signal,
      },
      {
        file,
        streamUuid: STREAM_UUID,
        name: "report.txt",
        description: "Quarterly report",
      },
    );

    expect(result).toMatchObject({
      uuid: FILE_UUID,
      name: "report.txt",
      content_type: "text/plain",
      size_bytes: 14,
    });
    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/files/");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBe(controller.signal);
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
      "X-Workspace-Dev-Target-Origin": "https://workspace.example.com",
    });
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);

    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) {
      throw new Error("Expected multipart FormData body");
    }
    expect(body.get("stream_uuid")).toBe(STREAM_UUID);
    expect(body.get("name")).toBe("report.txt");
    expect(body.get("description")).toBe("Quarterly report");
    const filePart = body.get("file");
    expect(filePart).toBeInstanceOf(File);
    if (!(filePart instanceof File)) {
      throw new Error("Expected multipart file part");
    }
    expect(filePart.name).toBe("original.txt");
    expect(filePart.type).toBe("text/plain");
    expect(await filePart.text()).toBe("workspace file");
  });

  it("omits optional multipart metadata when caller does not provide it", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      jsonResponse({
        uuid: FILE_UUID,
        name: "original.txt",
        content_type: "text/plain",
        size_bytes: 14,
      }),
    );

    await uploadWorkspaceFile(
      { accessToken: "access-token", fetchImpl: fetchMock },
      {
        file: new File(["workspace file"], "original.txt", { type: "text/plain" }),
        streamUuid: STREAM_UUID,
      },
    );

    const [, init] = firstFetchCall(fetchMock);
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) {
      throw new Error("Expected multipart FormData body");
    }
    expect(body.has("name")).toBe(false);
    expect(body.has("description")).toBe(false);
  });

  it("throws a MessengerApiError for failed Workspace file uploads", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ detail: "Forbidden" }, 403)));

    await expect(
      uploadWorkspaceFile(
        { accessToken: "access-token", fetchImpl: fetchMock },
        {
          file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
          streamUuid: STREAM_UUID,
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "MessengerApiError",
        message: "Messenger API POST /files/ failed",
        status: 403,
        data: { detail: "Forbidden" },
      }),
    );
    await expect(
      uploadWorkspaceFile(
        { accessToken: "access-token", fetchImpl: fetchMock },
        {
          file: new File(["workspace file"], "report.txt", { type: "text/plain" }),
          streamUuid: STREAM_UUID,
        },
      ),
    ).rejects.toBeInstanceOf(MessengerApiError);
  });
});
