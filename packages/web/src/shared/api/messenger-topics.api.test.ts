import { describe, expect, it, vi } from "vitest";
import {
  createStreamTopic,
  deleteStreamTopic,
  getStreamTopic,
  getStreamTopics,
  getStreamTopicsPage,
  markStreamTopicRead,
  renameStreamTopic,
  setStreamTopicNotificationMode,
  toggleStreamTopicDone,
} from "./messenger-topics.api";

// Topic tests cover conversation topics and their per-user actions.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const DATE = "2026-06-22T10:10:00Z";

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

const topicDto = {
  uuid: TOPIC_UUID,
  project_id: PROJECT_UUID,
  name: "Releases",
  stream_uuid: STREAM_UUID,
  user_uuid: USER_UUID,
  unread_count: 0,
  is_default: false,
  is_done: false,
  notification_mode: "default",
  created_at: DATE,
  updated_at: DATE,
};

describe("messenger topics API", () => {
  it("marks every message in a topic as read", async () => {
    const fetchMock = createFetchMock(topicDto);
    const abortController = new AbortController();

    await expect(
      markStreamTopicRead(
        {
          accessToken: "access-token",
          baseUrl: "https://workspace.example.com/messenger",
          fetchImpl: fetchMock,
          projectId: PROJECT_UUID,
          signal: abortController.signal,
        },
        TOPIC_UUID,
      ),
    ).resolves.toEqual(topicDto);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `https://workspace.example.com/messenger/stream_topics/${TOPIC_UUID}/actions/read/invoke`,
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
    expect(init?.signal).toBe(abortController.signal);

    const invalidFetchMock = createFetchMock({ ...topicDto, unread_count: "0" });
    await expect(
      markStreamTopicRead({ accessToken: "access-token", fetchImpl: invalidFetchMock }, TOPIC_UUID),
    ).rejects.toThrow("Expected valid messenger stream topic response");
  });

  it("propagates a topic read network failure", async () => {
    const networkError = new TypeError("network unavailable");
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(networkError));

    await expect(
      markStreamTopicRead({ accessToken: "access-token", fetchImpl: fetchMock }, TOPIC_UUID),
    ).rejects.toBe(networkError);
  });

  it("lists topics with stream and pagination query", async () => {
    const fetchMock = createFetchMock([topicDto]);

    await expect(
      getStreamTopics(
        { accessToken: "access-token", fetchImpl: fetchMock },
        { streamUuid: STREAM_UUID, pageLimit: 50, pageMarker: "cursor-1" },
      ),
    ).resolves.toEqual([topicDto]);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/stream_topics/?page_limit=50&page_marker=cursor-1&stream_uuid=${STREAM_UUID}`,
    );
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
  });

  it("returns topic pagination headers", async () => {
    const fetchMock = createFetchMock([topicDto], 200, {
      "X-Pagination-Marker": "next-topic",
      "X-Pagination-Limit": "50",
    });

    await expect(
      getStreamTopicsPage(
        { accessToken: "access-token", fetchImpl: fetchMock },
        { streamUuid: STREAM_UUID, pageLimit: 50, pageMarker: "cursor-1" },
      ),
    ).resolves.toEqual({
      items: [topicDto],
      nextPageMarker: "next-topic",
      pageLimit: 50,
    });

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/stream_topics/?page_limit=50&page_marker=cursor-1&stream_uuid=${STREAM_UUID}`,
    );
  });

  it("gets a single topic", async () => {
    const fetchMock = createFetchMock(topicDto);

    await expect(
      getStreamTopic({ accessToken: "access-token", fetchImpl: fetchMock }, TOPIC_UUID),
    ).resolves.toEqual(topicDto);

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/stream_topics/${TOPIC_UUID}`);
  });

  it("creates a topic with name and stream uuid", async () => {
    const fetchMock = createFetchMock(topicDto);

    await expect(
      createStreamTopic(
        { accessToken: "access-token", fetchImpl: fetchMock },
        { name: "Releases", stream_uuid: STREAM_UUID },
      ),
    ).resolves.toEqual(topicDto);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/stream_topics/");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "Releases", stream_uuid: STREAM_UUID }));
  });

  it("renames a topic with name body", async () => {
    const fetchMock = createFetchMock({ ...topicDto, name: "Incidents" });

    await expect(
      renameStreamTopic({ accessToken: "access-token", fetchImpl: fetchMock }, TOPIC_UUID, {
        name: "Incidents",
      }),
    ).resolves.toEqual({ ...topicDto, name: "Incidents" });

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/stream_topics/${TOPIC_UUID}`);
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify({ name: "Incidents" }));
  });

  it("toggles done through an action path without body", async () => {
    const fetchMock = createFetchMock({ ...topicDto, is_done: true });

    await expect(
      toggleStreamTopicDone({ accessToken: "access-token", fetchImpl: fetchMock }, TOPIC_UUID),
    ).resolves.toEqual({ ...topicDto, is_done: true });

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/stream_topics/${TOPIC_UUID}/actions/toggle_done/invoke`,
    );
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
  });

  it("sets notifications through an action path with notification mode", async () => {
    const fetchMock = createFetchMock({ ...topicDto, notification_mode: "follow" });

    await expect(
      setStreamTopicNotificationMode(
        { accessToken: "access-token", fetchImpl: fetchMock },
        TOPIC_UUID,
        { notification_mode: "follow" },
      ),
    ).resolves.toEqual({ ...topicDto, notification_mode: "follow" });

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/stream_topics/${TOPIC_UUID}/actions/notifications/invoke`,
    );
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ notification_mode: "follow" }));
  });

  it("accepts 204 delete without parsing a DTO", async () => {
    const fetchMock = createFetchMock(null, 204);

    await expect(
      deleteStreamTopic({ accessToken: "access-token", fetchImpl: fetchMock }, TOPIC_UUID),
    ).resolves.toBeUndefined();

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/stream_topics/${TOPIC_UUID}`);
    expect(init?.method).toBe("DELETE");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
  });

  it("rejects invalid rows in strict topic pages", async () => {
    const fetchMock = createFetchMock([topicDto, { ...topicDto, uuid: "bad" }]);

    await expect(
      getStreamTopicsPage({ accessToken: "access-token", fetchImpl: fetchMock }),
    ).rejects.toThrow("Expected valid messenger stream topics response item at index 1");
  });
});
