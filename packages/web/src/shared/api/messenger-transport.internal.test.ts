import { describe, expect, it, vi } from "vitest";
import {
  MessengerApiError,
  buildMessengerUrl,
  getBinaryResult,
  getJsonResult,
  parsePaginationHeaders,
  publicGetJsonResult,
  sendFormDataResult,
  sendJsonResult,
} from "./messenger-transport.internal";

// These tests keep the shared transport behavior stable for every API domain.
function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function textResponse(body: string, status = 200, headers?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers,
  });
}

function createFetchMock(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(body, status, headers)));
  return fetchMock;
}

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) {
    throw new Error("Expected fetch to be called");
  }
  return call;
}

describe("messenger transport helper", () => {
  it("builds encoded messenger URLs with default and custom base paths", () => {
    expect(
      buildMessengerUrl(undefined, "/events/", {
        page_limit: 500,
        "epoch_version>": 123,
        page_marker: undefined,
      }),
    ).toBe("/api/workspace/v1/messenger/events/?page_limit=500&epoch_version%3E=123");
    expect(buildMessengerUrl("/custom/api/", "/server_settings")).toBe(
      "/custom/api/server_settings",
    );
  });

  it("builds repeated query params for array values", () => {
    expect(
      buildMessengerUrl(undefined, "/messages/", {
        uuid: ["a", null, "b", undefined],
      }),
    ).toBe("/api/workspace/v1/messenger/messages/?uuid=a&uuid=b");
  });

  it("sends GET requests with bearer auth", async () => {
    const fetchMock = createFetchMock([{ uuid: "stream" }]);

    await expect(
      getJsonResult("/streams/", { accessToken: " token ", fetchImpl: fetchMock }),
    ).resolves.toMatchObject({
      data: [{ uuid: "stream" }],
    });

    const [, init] = firstFetchCall(fetchMock);
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer token",
    });
  });

  it("downloads binary responses with bearer auth without JSON parsing", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response("file-bytes", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": 'attachment; filename="report.txt"',
        },
      }),
    );

    await expect(
      getBinaryResult("/files/file-uuid/actions/download", {
        accessToken: "token",
        fetchImpl: fetchMock,
      }),
    ).resolves.toMatchObject({
      headers: expect.any(Headers),
    });

    const [, init] = firstFetchCall(fetchMock);
    expect(init?.method).toBe("GET");
    expect(init?.cache).toBe("force-cache");
    expect(init?.headers).toEqual({
      Accept: "*/*",
      Authorization: "Bearer token",
    });
  });

  it("adds the dev target origin header for same-origin proxied requests", async () => {
    const fetchMock = createFetchMock([{ uuid: "stream" }]);

    await getJsonResult("/streams/", {
      accessToken: "token",
      devTargetOrigin: "https://workspace.example.com",
      fetchImpl: fetchMock,
    });

    const [, init] = firstFetchCall(fetchMock);
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer token",
      "X-Workspace-Dev-Target-Origin": "https://workspace.example.com",
    });
  });

  it("does not add the dev target origin header for absolute requests", async () => {
    const fetchMock = createFetchMock([{ uuid: "stream" }]);

    await getJsonResult("/streams/", {
      accessToken: "token",
      baseUrl: "https://workspace.example.com/api/workspace/v1/messenger",
      devTargetOrigin: "https://workspace.example.com",
      fetchImpl: fetchMock,
    });

    const [, init] = firstFetchCall(fetchMock);
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer token",
    });
  });

  it("retries trailing-slash requests without slash after 404", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse([{ uuid: "stream" }]));

    await expect(
      getJsonResult(
        "/streams/",
        { accessToken: "token", baseUrl: "/api/workspace/v1/messenger", fetchImpl: fetchMock },
        { page_limit: 50 },
      ),
    ).resolves.toMatchObject({
      data: [{ uuid: "stream" }],
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/workspace/v1/messenger/streams/?page_limit=50",
      "/api/workspace/v1/messenger/streams?page_limit=50",
    ]);
  });

  it("retries auth failures on the trailing-slash fallback path with a fresh token", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse([{ uuid: "stream" }]));
    const getAccessToken = vi.fn(({ force = false } = {}) => (force ? "new-token" : "old-token"));

    await expect(
      getJsonResult(
        "/streams/",
        {
          accessToken: "old-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
          getAccessToken,
        },
        { page_limit: 50 },
      ),
    ).resolves.toMatchObject({
      data: [{ uuid: "stream" }],
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/workspace/v1/messenger/streams/?page_limit=50",
      "/api/workspace/v1/messenger/streams?page_limit=50",
      "/api/workspace/v1/messenger/streams?page_limit=50",
    ]);
    expect(
      fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Authorization")),
    ).toEqual(["Bearer old-token", "Bearer old-token", "Bearer new-token"]);
    expect(getAccessToken.mock.calls.map(([request]) => request?.force === true)).toEqual([
      false,
      true,
    ]);
  });

  it("retries JSON requests after 401 responses with non-JSON bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        textResponse("<html>Unauthorized</html>", 401, {
          "Content-Type": "text/html",
        }),
      )
      .mockResolvedValueOnce(jsonResponse([{ uuid: "stream" }]));
    const getAccessToken = vi.fn(({ force = false } = {}) => (force ? "new-token" : "old-token"));

    await expect(
      getJsonResult("/streams/", {
        accessToken: "old-token",
        fetchImpl: fetchMock,
        getAccessToken,
      }),
    ).resolves.toMatchObject({
      data: [{ uuid: "stream" }],
    });

    expect(
      fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Authorization")),
    ).toEqual(["Bearer old-token", "Bearer new-token"]);
    expect(getAccessToken.mock.calls.map(([request]) => request?.force === true)).toEqual([
      false,
      true,
    ]);
  });

  it("reports the fallback path when both trailing-slash variants fail", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse({ code: 404 }, 404));

    await expect(
      getJsonResult("/streams/", { accessToken: "token", fetchImpl: fetchMock }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "Messenger API GET /streams failed",
        status: 404,
        data: { code: 404 },
      }),
    );
  });

  it("sends JSON bodies through POST and PUT with bearer auth", async () => {
    const postFetchMock = createFetchMock({ uuid: "created" });
    await expect(
      sendJsonResult(
        "POST",
        "/streams/",
        { accessToken: " token ", fetchImpl: postFetchMock },
        {},
        { name: "Engineering" },
      ),
    ).resolves.toMatchObject({ data: { uuid: "created" } });

    const [, postInit] = firstFetchCall(postFetchMock);
    expect(postInit?.method).toBe("POST");
    expect(postInit?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer token",
    });
    expect(postInit?.body).toBe(JSON.stringify({ name: "Engineering" }));

    const putFetchMock = createFetchMock({ uuid: "updated" });
    await expect(
      sendJsonResult(
        "PUT",
        "/streams/stream-id",
        { accessToken: "token", fetchImpl: putFetchMock },
        {},
        { name: "Engineering 2" },
      ),
    ).resolves.toMatchObject({ data: { uuid: "updated" } });

    const [, putInit] = firstFetchCall(putFetchMock);
    expect(putInit?.method).toBe("PUT");
    expect(putInit?.body).toBe(JSON.stringify({ name: "Engineering 2" }));
  });

  it("sends multipart FormData without explicit Content-Type and keeps trailing-slash fallback", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse({ uuid: "file-uuid" }));
    const form = new FormData();
    form.append("stream_uuid", "stream-uuid");
    form.append("file", new File(["file-bytes"], "report.txt", { type: "text/plain" }));
    const controller = new AbortController();

    await expect(
      sendFormDataResult(
        "/files/",
        {
          accessToken: " token ",
          devTargetOrigin: "https://workspace.example.com",
          fetchImpl: fetchMock,
          signal: controller.signal,
        },
        form,
      ),
    ).resolves.toMatchObject({ data: { uuid: "file-uuid" } });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/workspace/v1/messenger/files/",
      "/api/workspace/v1/messenger/files",
    ]);
    const [, init] = firstFetchCall(fetchMock);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(form);
    expect(init?.signal).toBe(controller.signal);
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer token",
      "X-Workspace-Dev-Target-Origin": "https://workspace.example.com",
    });
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("retries upload requests after 401 responses with non-JSON bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(textResponse("Unauthorized", 401, { "Content-Type": "text/plain" }))
      .mockResolvedValueOnce(jsonResponse({ uuid: "file-uuid" }));
    const getAccessToken = vi.fn(({ force = false } = {}) => (force ? "new-token" : "old-token"));
    const form = new FormData();
    form.append("stream_uuid", "stream-uuid");
    form.append("file", new File(["file-bytes"], "report.txt", { type: "text/plain" }));

    await expect(
      sendFormDataResult(
        "/files/",
        {
          accessToken: "old-token",
          fetchImpl: fetchMock,
          getAccessToken,
        },
        form,
      ),
    ).resolves.toMatchObject({ data: { uuid: "file-uuid" } });

    expect(fetchMock.mock.calls.map(([, init]) => init?.body)).toEqual([form, form]);
    expect(
      fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Authorization")),
    ).toEqual(["Bearer old-token", "Bearer new-token"]);
  });

  it("retries binary downloads after 401 responses with non-JSON bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(textResponse("Unauthorized", 401, { "Content-Type": "text/plain" }))
      .mockResolvedValueOnce(
        new Response("file-bytes", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      );
    const getAccessToken = vi.fn(({ force = false } = {}) => (force ? "new-token" : "old-token"));

    await expect(
      getBinaryResult("/files/file-uuid/actions/download", {
        accessToken: "old-token",
        fetchImpl: fetchMock,
        getAccessToken,
      }),
    ).resolves.toMatchObject({
      headers: expect.any(Headers),
    });

    expect(
      fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Authorization")),
    ).toEqual(["Bearer old-token", "Bearer new-token"]);
  });

  it("supports DELETE JSON and public GET without auth", async () => {
    const deleteFetchMock = createFetchMock(null, 204);
    await expect(
      sendJsonResult("DELETE", "/folder_items/item-id", {
        accessToken: "token",
        fetchImpl: deleteFetchMock,
      }),
    ).resolves.toMatchObject({ data: null });

    const [, deleteInit] = firstFetchCall(deleteFetchMock);
    expect(deleteInit?.method).toBe("DELETE");
    expect(deleteInit?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer token",
    });

    const publicFetchMock = createFetchMock({ result: "success" });
    await expect(
      publicGetJsonResult("/server_settings", { fetchImpl: publicFetchMock }),
    ).resolves.toMatchObject({ data: { result: "success" } });

    const [, publicInit] = firstFetchCall(publicFetchMock);
    expect(publicInit?.headers).toEqual({
      Accept: "application/json",
    });
  });

  it("parses pagination headers", () => {
    const headers = new Headers({
      "X-Pagination-Marker": "next",
      "X-Pagination-Limit": "50",
    });

    expect(parsePaginationHeaders(headers)).toEqual({
      nextPageMarker: "next",
      pageLimit: 50,
    });
  });

  it("throws MessengerApiError with parsed response data", async () => {
    const fetchMock = createFetchMock({ code: 403 }, 403);

    await expect(
      sendJsonResult("POST", "/streams/", { accessToken: "token", fetchImpl: fetchMock }, {}, {}),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "MessengerApiError",
        status: 403,
        data: { code: 403 },
      }),
    );
    await expect(
      sendJsonResult("POST", "/streams/", { accessToken: "token", fetchImpl: fetchMock }, {}, {}),
    ).rejects.toBeInstanceOf(MessengerApiError);
  });
});
