import { describe, expect, it, vi } from "vitest";
import {
  addStreamUsers,
  archiveStream,
  createStream,
  deleteStreamBinding,
  getStreamBinding,
  getStreamBindings,
  getStreamBindingsPage,
  getStreamsPage,
  markStreamRead,
  unarchiveStream,
  updateStreamBinding,
  updateStreamNotifications,
} from "./messenger-streams.api";

// Streams tests cover stream CRUD, user bindings, and stream action paths.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_UUID = "33333333-3333-4333-8333-333333333333";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const BINDING_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const DATE = "2026-06-22T10:10:00Z";

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
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

function createEmptyFetchMock(status = 204): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(() => Promise.resolve(emptyResponse(status)));
  return fetchMock;
}

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) {
    throw new Error("Expected fetch to be called");
  }
  return call;
}

function requestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected string request body");
  }
  return JSON.parse(init.body) as unknown;
}

const streamDto = {
  uuid: STREAM_UUID,
  name: "Engineering",
  description: "Engineering workspace",
  project_id: PROJECT_UUID,
  owner: USER_UUID,
  user_uuid: USER_UUID,
  role: "owner",
  notification_mode: "all_messages",
  unread_count: 3,
  source_name: "native",
  source: { kind: "native" },
  invite_only: false,
  announce: false,
  private: false,
  is_archived: false,
  direct_user_uuid: null,
  created_at: DATE,
  updated_at: DATE,
};

const streamBindingDto = {
  uuid: BINDING_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  user_uuid: OTHER_USER_UUID,
  who_uuid: USER_UUID,
  role: "member",
  notification_mode: "all_messages",
  created_at: DATE,
  updated_at: DATE,
};

describe("messenger-streams api", () => {
  it("marks every message in a stream as read", async () => {
    const readStreamDto = { ...streamDto, unread_count: 0 };
    const fetchMock = createFetchMock(readStreamDto);
    const abortController = new AbortController();

    await expect(
      markStreamRead(
        {
          accessToken: "access-token",
          baseUrl: "https://workspace.example.com/messenger",
          fetchImpl: fetchMock,
          projectId: PROJECT_UUID,
          signal: abortController.signal,
        },
        STREAM_UUID,
      ),
    ).resolves.toEqual(readStreamDto);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `https://workspace.example.com/messenger/streams/${STREAM_UUID}/actions/read/invoke`,
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
    expect(init?.signal).toBe(abortController.signal);

    const invalidFetchMock = createFetchMock({ ...readStreamDto, unread_count: "0" });
    await expect(
      markStreamRead({ accessToken: "access-token", fetchImpl: invalidFetchMock }, STREAM_UUID),
    ).rejects.toThrow("Expected valid messenger stream response");
  });

  it("propagates a stream read network failure", async () => {
    const networkError = new TypeError("network unavailable");
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(networkError));

    await expect(
      markStreamRead({ accessToken: "access-token", fetchImpl: fetchMock }, STREAM_UUID),
    ).rejects.toBe(networkError);
  });

  it("creates a native stream without sending private", async () => {
    const fetchMock = createFetchMock(streamDto);

    await expect(
      createStream(
        { accessToken: "access-token", fetchImpl: fetchMock },
        {
          name: "Engineering",
          description: "Engineering workspace",
          source_name: "native",
          source: { kind: "native" },
          invite_only: false,
          announce: false,
        },
      ),
    ).resolves.toEqual(streamDto);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/streams/");
    expect(init?.method).toBe("POST");
    expect(requestBody(init)).toEqual({
      name: "Engineering",
      description: "Engineering workspace",
      source_name: "native",
      source: { kind: "native" },
      invite_only: false,
      announce: false,
    });
    expect(requestBody(init)).not.toHaveProperty("private");
  });

  it("creates a direct native stream with direct_user_uuid", async () => {
    const directStreamDto = { ...streamDto, private: true, direct_user_uuid: OTHER_USER_UUID };
    const fetchMock = createFetchMock(directStreamDto);

    await expect(
      createStream(
        { accessToken: "access-token", fetchImpl: fetchMock },
        {
          name: "Direct",
          description: "Private workspace",
          source_name: "native",
          source: { kind: "native" },
          direct_user_uuid: OTHER_USER_UUID,
        },
      ),
    ).resolves.toEqual(directStreamDto);

    const [, init] = firstFetchCall(fetchMock);
    expect(requestBody(init)).toEqual({
      name: "Direct",
      description: "Private workspace",
      source_name: "native",
      source: { kind: "native" },
      direct_user_uuid: OTHER_USER_UUID,
    });
  });

  it("adds stream users through action path and strictly parses bindings", async () => {
    const fetchMock = createFetchMock([streamBindingDto]);

    await expect(
      addStreamUsers({ accessToken: "access-token", fetchImpl: fetchMock }, STREAM_UUID, {
        member: [OTHER_USER_UUID],
      }),
    ).resolves.toEqual([streamBindingDto]);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/streams/${STREAM_UUID}/actions/add_users/invoke`);
    expect(init?.method).toBe("POST");
    expect(requestBody(init)).toEqual({ member: [OTHER_USER_UUID] });

    const invalidFetchMock = createFetchMock([{ ...streamBindingDto, role: "bad-role" }]);

    await expect(
      addStreamUsers({ accessToken: "access-token", fetchImpl: invalidFetchMock }, STREAM_UUID, {
        member: [OTHER_USER_UUID],
      }),
    ).rejects.toThrow("Expected valid messenger stream bindings response item at index 0");
  });

  it("uses stream archive, unarchive, and notification action paths", async () => {
    const archiveFetchMock = createFetchMock({ ...streamDto, is_archived: true });
    const unarchiveFetchMock = createFetchMock(streamDto);
    const notificationsFetchMock = createFetchMock({
      ...streamDto,
      notification_mode: "mentions_only",
    });

    await expect(
      archiveStream({ accessToken: "access-token", fetchImpl: archiveFetchMock }, STREAM_UUID),
    ).resolves.toMatchObject({ is_archived: true });
    await expect(
      unarchiveStream({ accessToken: "access-token", fetchImpl: unarchiveFetchMock }, STREAM_UUID),
    ).resolves.toMatchObject({ is_archived: false });
    await expect(
      updateStreamNotifications(
        { accessToken: "access-token", fetchImpl: notificationsFetchMock },
        STREAM_UUID,
        { notification_mode: "mentions_only" },
      ),
    ).resolves.toMatchObject({ notification_mode: "mentions_only" });

    expect(firstFetchCall(archiveFetchMock)[0]).toBe(
      `/api/workspace/v1/messenger/streams/${STREAM_UUID}/actions/archive/invoke`,
    );
    expect(firstFetchCall(unarchiveFetchMock)[0]).toBe(
      `/api/workspace/v1/messenger/streams/${STREAM_UUID}/actions/unarchive/invoke`,
    );
    const [notificationsUrl, notificationsInit] = firstFetchCall(notificationsFetchMock);
    expect(notificationsUrl).toBe(
      `/api/workspace/v1/messenger/streams/${STREAM_UUID}/actions/notifications/invoke`,
    );
    expect(requestBody(notificationsInit)).toEqual({ notification_mode: "mentions_only" });
  });

  it("returns stream pagination headers", async () => {
    const fetchMock = createFetchMock([streamDto], 200, {
      "X-Pagination-Marker": "next-stream",
      "X-Pagination-Limit": "25",
    });

    await expect(
      getStreamsPage(
        { accessToken: "access-token", fetchImpl: fetchMock },
        { pageLimit: 25, pageMarker: "after-stream" },
      ),
    ).resolves.toEqual({
      items: [streamDto],
      nextPageMarker: "next-stream",
      pageLimit: 25,
    });

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/streams/?page_limit=25&page_marker=after-stream");
  });

  it("supports binding list, page, singleton, update, and delete", async () => {
    const listFetchMock = createFetchMock([streamBindingDto]);
    const pageFetchMock = createFetchMock([streamBindingDto], 200, {
      "X-Pagination-Marker": "next-binding",
      "X-Pagination-Limit": "10",
    });
    const singletonFetchMock = createFetchMock(streamBindingDto);
    const updateFetchMock = createFetchMock({ ...streamBindingDto, role: "moderator" });
    const deleteFetchMock = createEmptyFetchMock();

    await expect(
      getStreamBindings(
        { accessToken: "access-token", fetchImpl: listFetchMock },
        { streamUuid: STREAM_UUID },
      ),
    ).resolves.toEqual([streamBindingDto]);
    await expect(
      getStreamBindingsPage(
        { accessToken: "access-token", fetchImpl: pageFetchMock },
        { streamUuid: STREAM_UUID, pageLimit: 10, pageMarker: "after-binding" },
      ),
    ).resolves.toEqual({
      items: [streamBindingDto],
      nextPageMarker: "next-binding",
      pageLimit: 10,
    });
    await expect(
      getStreamBinding(
        { accessToken: "access-token", fetchImpl: singletonFetchMock },
        BINDING_UUID,
      ),
    ).resolves.toEqual(streamBindingDto);
    await expect(
      updateStreamBinding(
        { accessToken: "access-token", fetchImpl: updateFetchMock },
        BINDING_UUID,
        { role: "moderator" },
      ),
    ).resolves.toMatchObject({ role: "moderator" });
    await expect(
      deleteStreamBinding(
        { accessToken: "access-token", fetchImpl: deleteFetchMock },
        BINDING_UUID,
      ),
    ).resolves.toBeUndefined();

    expect(firstFetchCall(listFetchMock)[0]).toBe(
      `/api/workspace/v1/messenger/stream_bindings/?stream_uuid=${STREAM_UUID}`,
    );
    expect(firstFetchCall(pageFetchMock)[0]).toBe(
      `/api/workspace/v1/messenger/stream_bindings/?page_limit=10&page_marker=after-binding&stream_uuid=${STREAM_UUID}`,
    );
    expect(firstFetchCall(singletonFetchMock)[0]).toBe(
      `/api/workspace/v1/messenger/stream_bindings/${BINDING_UUID}`,
    );
    const [updateUrl, updateInit] = firstFetchCall(updateFetchMock);
    expect(updateUrl).toBe(`/api/workspace/v1/messenger/stream_bindings/${BINDING_UUID}`);
    expect(updateInit?.method).toBe("PUT");
    expect(requestBody(updateInit)).toEqual({ role: "moderator" });
    const [deleteUrl, deleteInit] = firstFetchCall(deleteFetchMock);
    expect(deleteUrl).toBe(`/api/workspace/v1/messenger/stream_bindings/${BINDING_UUID}`);
    expect(deleteInit?.method).toBe("DELETE");
  });

  it("rejects invalid binding rows in strict lists", async () => {
    const fetchMock = createFetchMock([{ ...streamBindingDto, notification_mode: "default" }]);

    await expect(
      getStreamBindingsPage({ accessToken: "access-token", fetchImpl: fetchMock }),
    ).rejects.toThrow("Expected valid messenger stream bindings response item at index 0");
  });
});
