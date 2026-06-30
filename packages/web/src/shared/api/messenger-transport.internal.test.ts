import { describe, expect, it, vi } from "vitest";
import {
  MessengerApiError,
  buildMessengerUrl,
  getJsonResult,
  parsePaginationHeaders,
  publicGetJsonResult,
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
    ).toBe("/api/messenger/v1/events/?page_limit=500&epoch_version%3E=123");
    expect(buildMessengerUrl("/custom/api/", "/server_settings")).toBe(
      "/custom/api/server_settings",
    );
  });

  it("builds repeated query params for array values", () => {
    expect(
      buildMessengerUrl(undefined, "/messages/", {
        uuid: ["a", null, "b", undefined],
      }),
    ).toBe("/api/messenger/v1/messages/?uuid=a&uuid=b");
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
      baseUrl: "https://workspace.example.com/api/messenger/v1",
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
        { accessToken: "token", baseUrl: "/api/messenger/v1", fetchImpl: fetchMock },
        { page_limit: 50 },
      ),
    ).resolves.toMatchObject({
      data: [{ uuid: "stream" }],
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/messenger/v1/streams/?page_limit=50",
      "/api/messenger/v1/streams?page_limit=50",
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
