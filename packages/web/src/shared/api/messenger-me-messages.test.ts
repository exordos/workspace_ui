/**
 * Tests for the Workspace gateway per-user message API (messenger-me-messages module).
 */
import { describe, expect, it } from "vitest";
// messenger.test.setup must load before the module under test so its vi.mock hooks register first.
import { getMockMessengerApi } from "./messenger.test.setup";
// eslint-disable-next-line import-x/order -- keep setup import above first for vi.mock registration
import {
  fetchMeMessageById,
  fetchMyMessages,
  fetchMyMessagesPage,
  fetchStreamMessages,
  fetchStreamMessagesPage,
  meMessageToMockMessage,
  parseMeMessage,
  ME_MESSAGES_PAGE_LIMIT,
} from "./messenger-me-messages";
import type { MessengerMeMessage } from "./messenger.types";

const mockMessengerApi = getMockMessengerApi();

const STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const MSG_UUID_1 = "11111111-1111-4111-8111-111111111111";
const MSG_UUID_2 = "33333333-3333-4333-8333-333333333333";
const USER_UUID = "55555555-5555-4555-8555-555555555555";

function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uuid: MSG_UUID_1,
    user_stream_uuid: STREAM_UUID,
    user_uuid: USER_UUID,
    payload: { kind: "markdown", content: "Hello world" },
    last_synced_at: "2026-06-21T10:30:00Z",
    read: false,
    pinned: false,
    starred: false,
    created_at: "2026-06-21T10:20:00Z",
    updated_at: "2026-06-21T10:20:00Z",
    ...overrides,
  };
}

function pageResponse(rows: unknown[], nextMarker?: string) {
  return {
    ok: true,
    status: 200,
    data: rows,
    headers: new Headers(nextMarker != null ? { "X-Pagination-Marker": nextMarker } : {}),
    raw: { statusText: "OK" },
  };
}

describe("parseMeMessage", () => {
  it("maps a full row into the domain shape", () => {
    expect(parseMeMessage(rawRow())).toEqual<MessengerMeMessage>({
      uuid: MSG_UUID_1,
      user_stream_uuid: STREAM_UUID,
      user_uuid: USER_UUID,
      payload: { kind: "markdown", content: "Hello world" },
      read: false,
      pinned: false,
      starred: false,
      last_synced_at: "2026-06-21T10:30:00Z",
      created_at: "2026-06-21T10:20:00Z",
      updated_at: "2026-06-21T10:20:00Z",
    });
  });

  it("coerces flags to booleans and tolerates missing optional fields", () => {
    const parsed = parseMeMessage({
      uuid: MSG_UUID_1,
      user_stream_uuid: STREAM_UUID,
      payload: { content: "hi" },
      read: true,
      starred: true,
    });
    expect(parsed).toMatchObject({
      payload: { kind: "markdown", content: "hi" },
      read: true,
      pinned: false,
      starred: true,
    });
    expect(parsed?.created_at).toBeUndefined();
  });

  it("rejects rows missing uuid, stream uuid, or payload content", () => {
    expect(parseMeMessage({ user_stream_uuid: STREAM_UUID, payload: { content: "x" } })).toBeNull();
    expect(parseMeMessage({ uuid: MSG_UUID_1, payload: { content: "x" } })).toBeNull();
    expect(parseMeMessage(rawRow({ payload: { kind: "markdown" } }))).toBeNull();
    expect(parseMeMessage(null)).toBeNull();
  });
});

describe("fetchMyMessagesPage", () => {
  it("requests /me/messages/ with default pagination and sort params", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(pageResponse([rawRow()]));

    const page = await fetchMyMessagesPage({ streamUuid: STREAM_UUID });

    expect(page.messages).toHaveLength(1);
    expect(page.nextMarker).toBeNull();
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messanger/v1",
      "/me/messages/",
      {
        page_limit: String(ME_MESSAGES_PAGE_LIMIT),
        sort_key: "created_at",
        sort_dir: "asc",
        user_stream_uuid: STREAM_UUID,
      },
      undefined,
    );
  });

  it("forwards limit, marker, and sort overrides", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(pageResponse([]));

    await fetchMyMessagesPage({
      streamUuid: STREAM_UUID,
      limit: 25,
      marker: "cursor-1",
      sortKey: "updated_at",
      sortDir: "desc",
    });

    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messanger/v1",
      "/me/messages/",
      {
        page_limit: "25",
        sort_key: "updated_at",
        sort_dir: "desc",
        user_stream_uuid: STREAM_UUID,
        page_marker: "cursor-1",
      },
      undefined,
    );
  });

  it("reads the next marker from the X-Pagination-Marker header", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(pageResponse([rawRow()], MSG_UUID_1));

    const page = await fetchMyMessagesPage();
    expect(page.nextMarker).toBe(MSG_UUID_1);
  });

  it("returns an empty page on a non-ok response", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: false,
      status: 401,
      data: { msg: "unauthorized" },
      headers: new Headers(),
      raw: { statusText: "Unauthorized" },
    });

    await expect(fetchMyMessagesPage({ streamUuid: STREAM_UUID })).resolves.toEqual({
      messages: [],
      nextMarker: null,
    });
  });
});

describe("fetchStreamMessages", () => {
  it("drains every page by following the pagination marker", async () => {
    mockMessengerApi.getWithBase
      .mockResolvedValueOnce(pageResponse([rawRow({ uuid: MSG_UUID_1 })], MSG_UUID_1))
      .mockResolvedValueOnce(pageResponse([rawRow({ uuid: MSG_UUID_2 })]));

    const messages = await fetchStreamMessages(STREAM_UUID);

    expect(messages.map((m) => m.uuid)).toEqual([MSG_UUID_1, MSG_UUID_2]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledTimes(2);
    expect(mockMessengerApi.getWithBase).toHaveBeenNthCalledWith(
      2,
      "/api/messanger/v1",
      "/me/messages/",
      expect.objectContaining({ page_marker: MSG_UUID_1, user_stream_uuid: STREAM_UUID }),
      undefined,
    );
  });

  it("normalizes an uppercase stream uuid before filtering", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(pageResponse([]));

    await fetchStreamMessages(STREAM_UUID.toUpperCase());

    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messanger/v1",
      "/me/messages/",
      expect.objectContaining({ user_stream_uuid: STREAM_UUID }),
      undefined,
    );
  });

  it("throws on an invalid stream uuid", async () => {
    await expect(fetchStreamMessages("not-a-uuid")).rejects.toThrow(/Invalid stream uuid/);
    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
  });
});

describe("fetchMyMessages", () => {
  it("stops following the cursor when the marker repeats", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(pageResponse([rawRow()], MSG_UUID_1));

    const messages = await fetchMyMessages();

    expect(messages).toHaveLength(2);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledTimes(2);
  });
});

describe("meMessageToMockMessage", () => {
  it("maps content, markdown source, flags, and timestamp", () => {
    const mock = meMessageToMockMessage(parseMeMessage(rawRow({ read: true, starred: true }))!);

    expect(mock).toMatchObject({
      id: MSG_UUID_1,
      sender_id: 0,
      sender_full_name: "",
      stream_id: null,
      subject: "",
      content: "Hello world",
      markdown_source: "Hello world",
      flags: ["read", "starred"],
      timestamp: Math.floor(Date.parse("2026-06-21T10:20:00Z") / 1000),
    });
  });

  it("uses timestamp 0 when created_at is absent", () => {
    const parsed = parseMeMessage({
      uuid: MSG_UUID_1,
      user_stream_uuid: STREAM_UUID,
      payload: { content: "hi" },
    });
    expect(meMessageToMockMessage(parsed!).timestamp).toBe(0);
  });

  it("stamps the provided stream id", () => {
    expect(meMessageToMockMessage(parseMeMessage(rawRow())!, 7).stream_id).toBe(7);
  });
});

function singleResponse(row: unknown) {
  return { ok: true, status: 200, data: row, raw: { statusText: "OK" } };
}

describe("fetchMeMessageById", () => {
  it("fetches one row by uuid via /me/messages/<uuid>", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(singleResponse(rawRow()));

    const result = await fetchMeMessageById(MSG_UUID_1);

    expect(result?.uuid).toBe(MSG_UUID_1);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messanger/v1",
      `/me/messages/${MSG_UUID_1}`,
      undefined,
      undefined,
    );
  });

  it("returns null for an invalid uuid without calling the API", async () => {
    expect(await fetchMeMessageById("nope")).toBeNull();
    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
  });

  it("returns null on a non-ok response", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: false,
      status: 404,
      data: {},
      raw: { statusText: "Not Found" },
    });
    expect(await fetchMeMessageById(MSG_UUID_1)).toBeNull();
  });
});

describe("fetchStreamMessagesPage", () => {
  it("loads the newest window (desc) and returns it ascending", async () => {
    // Server returns newest-first; the page should be reversed to ascending order.
    mockMessengerApi.getWithBase.mockResolvedValue(
      pageResponse([rawRow({ uuid: MSG_UUID_2 }), rawRow({ uuid: MSG_UUID_1 })]),
    );

    const page = await fetchStreamMessagesPage({
      streamUuid: STREAM_UUID,
      streamId: 7,
      numBefore: 50,
    });

    expect(page.messages.map((m) => m.id)).toEqual([MSG_UUID_1, MSG_UUID_2]);
    expect(page.messages[0]?.stream_id).toBe(7);
    expect(page.foundNewest).toBe(true);
    expect(page.foundOldest).toBe(true);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messanger/v1",
      "/me/messages/",
      expect.objectContaining({
        user_stream_uuid: STREAM_UUID,
        page_limit: "50",
        sort_key: "created_at",
        sort_dir: "desc",
      }),
      undefined,
    );
  });

  it("keeps foundOldest false while a pagination marker remains on the newest window", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(
      pageResponse([rawRow({ uuid: MSG_UUID_1 })], MSG_UUID_1),
    );
    const page = await fetchStreamMessagesPage({ streamUuid: STREAM_UUID, numBefore: 50 });
    expect(page.foundOldest).toBe(false);
    expect(page.foundNewest).toBe(true);
  });

  it("loads older rows before an anchor (desc + marker), ascending", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(pageResponse([rawRow({ uuid: MSG_UUID_1 })]));

    const page = await fetchStreamMessagesPage({
      streamUuid: STREAM_UUID,
      anchor: MSG_UUID_2,
      numBefore: 30,
      numAfter: 0,
    });

    expect(page.messages.map((m) => m.id)).toEqual([MSG_UUID_1]);
    expect(page.foundOldest).toBe(true);
    expect(page.foundNewest).toBe(false);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messanger/v1",
      "/me/messages/",
      expect.objectContaining({ sort_dir: "desc", page_marker: MSG_UUID_2, page_limit: "30" }),
      undefined,
    );
  });

  it("loads newer rows after an anchor (asc + marker)", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue(
      pageResponse([rawRow({ uuid: MSG_UUID_2 })], MSG_UUID_2),
    );

    const page = await fetchStreamMessagesPage({
      streamUuid: STREAM_UUID,
      anchor: MSG_UUID_1,
      numBefore: 0,
      numAfter: 30,
    });

    expect(page.messages.map((m) => m.id)).toEqual([MSG_UUID_2]);
    expect(page.foundOldest).toBe(false);
    expect(page.foundNewest).toBe(false);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messanger/v1",
      "/me/messages/",
      expect.objectContaining({ sort_dir: "asc", page_marker: MSG_UUID_1, page_limit: "30" }),
      undefined,
    );
  });

  it("loads a focused window of older + anchor + newer rows", async () => {
    const ANCHOR = "44444444-4444-4444-8444-444444444444";
    const OLDER = MSG_UUID_1;
    const NEWER = MSG_UUID_2;
    mockMessengerApi.getWithBase.mockImplementation(
      (_base: string, path: string, params?: Record<string, string>) => {
        if (path === `/me/messages/${ANCHOR}`) {
          return Promise.resolve(singleResponse(rawRow({ uuid: ANCHOR })));
        }
        if (params?.sort_dir === "desc") {
          return Promise.resolve(pageResponse([rawRow({ uuid: OLDER })]));
        }
        return Promise.resolve(pageResponse([rawRow({ uuid: NEWER })]));
      },
    );

    const page = await fetchStreamMessagesPage({
      streamUuid: STREAM_UUID,
      anchor: ANCHOR,
      numBefore: 10,
      numAfter: 10,
    });

    expect(page.messages.map((m) => m.id)).toEqual([OLDER, ANCHOR, NEWER]);
    expect(page.foundOldest).toBe(true);
    expect(page.foundNewest).toBe(true);
  });
});
