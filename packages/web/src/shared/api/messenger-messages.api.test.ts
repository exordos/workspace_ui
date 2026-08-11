import { describe, expect, it, vi } from "vitest";
import {
  UnsupportedMessengerApiActionError,
  createMessageReaction,
  createMessage,
  deleteMessageReaction,
  deleteMessage,
  editMessage,
  getActivityUnsupported,
  getLinkPreviewUnsupported,
  getMessage,
  getMessageReactions,
  getMessagePagesAroundResolvedMessage,
  getMessages,
  getMessagesPage,
  markConversationReadUnsupported,
  markMessageRead,
  markMessagesReadUpTo,
  markMessageUnreadUnsupported,
  pinMessageUnsupported,
  searchMessagesUnsupported,
  setTypingUnsupported,
  starMessageUnsupported,
  unpinMessageUnsupported,
  unstarMessageUnsupported,
  uploadAttachmentUnsupported,
} from "./messenger-messages.api";
import type { UnsupportedMessengerApiAction } from "./messenger-messages.api";

// Message tests cover markdown CRUD and explicit unsupported backend gaps.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const REACTION_UUID = "fae5c55d-9bb2-4646-9c03-f4a6dd65c9f0";
const DATE = "2026-06-22T10:10:00Z";

const messageDto = {
  uuid: MESSAGE_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  topic_uuid: TOPIC_UUID,
  author_uuid: USER_UUID,
  payload: {
    kind: "markdown",
    content: "Hello, workspace",
  },
  user_uuid: USER_UUID,
  read: false,
  pinned: false,
  starred: false,
  is_own: true,
  reactions: {
    thumbs_up: 2,
  },
  reaction_users: {},
  created_at: DATE,
  updated_at: DATE,
};

const reactionDto = {
  uuid: REACTION_UUID,
  project_id: PROJECT_UUID,
  message_uuid: MESSAGE_UUID,
  user_uuid: USER_UUID,
  emoji_name: "thumbs_up",
  created_at: DATE,
  updated_at: DATE,
};

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

function messageWithUuid(uuid: string, createdAt: string) {
  return {
    ...messageDto,
    uuid,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function parsedFetchUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string" || input instanceof URL) {
    return new URL(input, "http://workspace.test");
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return new URL(input.url, "http://workspace.test");
  }
  throw new Error("Unexpected fetch input type");
}

describe("messenger messages API", () => {
  it("lists messages with filters and strict row parsing", async () => {
    const fetchMock = createFetchMock([messageDto]);

    await expect(
      getMessages(
        { accessToken: "access-token", fetchImpl: fetchMock },
        {
          pageLimit: 50,
          pageMarker: MESSAGE_UUID,
          streamUuid: STREAM_UUID,
          topicUuid: TOPIC_UUID,
        },
      ),
    ).resolves.toEqual([messageDto]);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/messages/?page_limit=50&page_marker=${MESSAGE_UUID}&stream_uuid=${STREAM_UUID}&topic_uuid=${TOPIC_UUID}`,
    );
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
  });

  it("returns message page with pagination headers", async () => {
    const fetchMock = createFetchMock([messageDto], 200, {
      "X-Pagination-Marker": "next-message",
      "X-Pagination-Limit": "25",
    });

    await expect(
      getMessagesPage(
        { accessToken: "access-token", fetchImpl: fetchMock },
        {
          pageLimit: 25,
          pageMarker: "previous-message",
          streamUuid: STREAM_UUID,
          topicUuid: TOPIC_UUID,
        },
      ),
    ).resolves.toEqual({
      items: [messageDto],
      nextPageMarker: "next-message",
      pageLimit: 25,
    });

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/messages/?page_limit=25&page_marker=previous-message&stream_uuid=${STREAM_UUID}&topic_uuid=${TOPIC_UUID}`,
    );
  });

  it("loads message pages in parallel around a resolved anchor", async () => {
    const beforeOlder = messageWithUuid(
      "6e5de721-6c25-40f1-bd73-ef854055d291",
      "2026-06-22T10:08:00Z",
    );
    const beforeNewer = messageWithUuid(
      "e9a4c2eb-55c2-41b0-9411-2f6b769923ab",
      "2026-06-22T10:09:00Z",
    );
    const afterNewer = messageWithUuid(
      "d892276e-8c58-4baa-90eb-d88fb4ad2fac",
      "2026-06-22T10:11:00Z",
    );
    const fetchMock = vi.fn<typeof fetch>();

    fetchMock.mockImplementation((input) => {
      const url = parsedFetchUrl(input);
      if (url.pathname === "/api/workspace/v1/messenger/messages/") {
        const sortDir = url.searchParams.get("sort_dir");
        if (sortDir === "desc") {
          return Promise.resolve(
            jsonResponse([beforeNewer, beforeOlder], 200, {
              "X-Pagination-Marker": "before-page",
            }),
          );
        }
        if (sortDir === "asc") {
          return Promise.resolve(
            jsonResponse([afterNewer], 200, {
              "X-Pagination-Marker": "after-page",
            }),
          );
        }
      }
      return Promise.reject(new Error(`Unexpected URL: ${url.toString()}`));
    });

    const windowPromise = getMessagePagesAroundResolvedMessage(
      { accessToken: "access-token", fetchImpl: fetchMock },
      {
        messageUuid: MESSAGE_UUID,
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        beforeLimit: 2,
        afterLimit: 1,
      },
    );

    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(windowPromise).resolves.toEqual({
      before: [beforeOlder, beforeNewer],
      after: [afterNewer],
      beforePageMarker: "before-page",
      afterPageMarker: "after-page",
    });

    const urls = fetchMock.mock.calls.map((call) => parsedFetchUrl(call[0]));
    const beforeUrl = urls.find((url) => url.searchParams.get("sort_dir") === "desc");
    const afterUrl = urls.find((url) => url.searchParams.get("sort_dir") === "asc");

    expect(beforeUrl?.searchParams.get("page_limit")).toBe("2");
    expect(beforeUrl?.searchParams.get("page_marker")).toBe(MESSAGE_UUID);
    expect(beforeUrl?.searchParams.get("stream_uuid")).toBe(STREAM_UUID);
    expect(beforeUrl?.searchParams.get("topic_uuid")).toBe(TOPIC_UUID);
    expect(beforeUrl?.searchParams.get("sort_key")).toBe("created_at");
    expect(beforeUrl?.searchParams.get("sort_dir")).toBe("desc");
    expect(afterUrl?.searchParams.get("page_limit")).toBe("1");
    expect(afterUrl?.searchParams.get("page_marker")).toBe(MESSAGE_UUID);
    expect(afterUrl?.searchParams.get("stream_uuid")).toBe(STREAM_UUID);
    expect(afterUrl?.searchParams.get("topic_uuid")).toBe(TOPIC_UUID);
    expect(afterUrl?.searchParams.get("sort_key")).toBe("created_at");
    expect(afterUrl?.searchParams.get("sort_dir")).toBe("asc");
    expect(urls.map((url) => url.toString()).join("\n")).not.toContain("created_at%3E");
    expect(urls.map((url) => url.toString()).join("\n")).not.toContain("created_at%3C");
    expect(urls.map((url) => url.toString()).join("\n")).not.toContain("created_at>");
    expect(urls.map((url) => url.toString()).join("\n")).not.toContain("created_at<");
  });

  it("strictly rejects invalid message rows", async () => {
    const fetchMock = createFetchMock([
      messageDto,
      {
        ...messageDto,
        uuid: "bad",
      },
    ]);

    await expect(
      getMessages({ accessToken: "access-token", fetchImpl: fetchMock }),
    ).rejects.toThrow("Expected valid messenger messages response item at index 1");
  });

  it("gets, creates, edits, marks read, and deletes messages with expected paths and bodies", async () => {
    const getFetchMock = createFetchMock(messageDto);
    await expect(
      getMessage({ accessToken: "access-token", fetchImpl: getFetchMock }, MESSAGE_UUID),
    ).resolves.toEqual(messageDto);
    expect(firstFetchCall(getFetchMock)[0]).toBe(
      `/api/workspace/v1/messenger/messages/${MESSAGE_UUID}`,
    );

    const createBody = {
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      payload: {
        kind: "markdown" as const,
        content: "Hello, workspace",
      },
    };
    const createFetch = createFetchMock(messageDto);
    await expect(
      createMessage({ accessToken: "access-token", fetchImpl: createFetch }, createBody),
    ).resolves.toEqual(messageDto);
    const [createUrl, createInit] = firstFetchCall(createFetch);
    expect(createUrl).toBe("/api/workspace/v1/messenger/messages/");
    expect(createInit?.method).toBe("POST");
    expect(createInit?.body).toBe(JSON.stringify(createBody));

    const editBody = {
      payload: {
        kind: "markdown" as const,
        content: "Edited text",
      },
    };
    const editFetchMock = createFetchMock({ ...messageDto, payload: editBody.payload });
    await expect(
      editMessage(
        { accessToken: "access-token", fetchImpl: editFetchMock },
        MESSAGE_UUID,
        editBody,
      ),
    ).resolves.toEqual({ ...messageDto, payload: editBody.payload });
    const [editUrl, editInit] = firstFetchCall(editFetchMock);
    expect(editUrl).toBe(`/api/workspace/v1/messenger/messages/${MESSAGE_UUID}`);
    expect(editInit?.method).toBe("PUT");
    expect(editInit?.body).toBe(JSON.stringify(editBody));

    const readFetchMock = createFetchMock({ ...messageDto, read: true });
    await expect(
      markMessageRead({ accessToken: "access-token", fetchImpl: readFetchMock }, MESSAGE_UUID),
    ).resolves.toEqual({ ...messageDto, read: true });
    const [readUrl, readInit] = firstFetchCall(readFetchMock);
    expect(readUrl).toBe(
      `/api/workspace/v1/messenger/messages/${MESSAGE_UUID}/actions/read/invoke`,
    );
    expect(readInit?.method).toBe("POST");
    expect(readInit?.body).toBeUndefined();

    const readUpToFetchMock = createFetchMock({ ...messageDto, read: true });
    await expect(
      markMessagesReadUpTo(
        { accessToken: "access-token", fetchImpl: readUpToFetchMock },
        MESSAGE_UUID,
      ),
    ).resolves.toEqual({ ...messageDto, read: true });
    const [readUpToUrl, readUpToInit] = firstFetchCall(readUpToFetchMock);
    expect(readUpToUrl).toBe(
      `/api/workspace/v1/messenger/messages/${MESSAGE_UUID}/actions/read_up_to/invoke`,
    );
    expect(readUpToInit?.method).toBe("POST");
    expect(readUpToInit?.body).toBeUndefined();

    const deleteFetchMock = createFetchMock(null, 204);
    await expect(
      deleteMessage({ accessToken: "access-token", fetchImpl: deleteFetchMock }, MESSAGE_UUID),
    ).resolves.toBeUndefined();
    const [deleteUrl, deleteInit] = firstFetchCall(deleteFetchMock);
    expect(deleteUrl).toBe(`/api/workspace/v1/messenger/messages/${MESSAGE_UUID}`);
    expect(deleteInit?.method).toBe("DELETE");
    expect(deleteInit?.body).toBeUndefined();
  });

  it("lists, creates, and deletes message reactions with Workspace payloads", async () => {
    const listFetchMock = createFetchMock([reactionDto]);
    await expect(
      getMessageReactions(
        { accessToken: "access-token", fetchImpl: listFetchMock },
        { messageUuid: MESSAGE_UUID, userUuid: USER_UUID },
      ),
    ).resolves.toEqual([reactionDto]);
    const [listUrl, listInit] = firstFetchCall(listFetchMock);
    expect(listUrl).toBe(
      `/api/workspace/v1/messenger/message_reactions/?message_uuid=${MESSAGE_UUID}&user_uuid=${USER_UUID}`,
    );
    expect(listInit?.method).toBe("GET");

    const createBody = {
      message_uuid: MESSAGE_UUID,
      emoji_name: "thumbs_up",
    };
    const createReactionFetchMock = createFetchMock(reactionDto);
    await expect(
      createMessageReaction(
        { accessToken: "access-token", fetchImpl: createReactionFetchMock },
        createBody,
      ),
    ).resolves.toEqual(reactionDto);
    const [createUrl, createInit] = firstFetchCall(createReactionFetchMock);
    expect(createUrl).toBe("/api/workspace/v1/messenger/message_reactions/");
    expect(createInit?.method).toBe("POST");
    expect(createInit?.body).toBe(JSON.stringify(createBody));

    const deleteFetchMock = createFetchMock(null, 204);
    await expect(
      deleteMessageReaction(
        { accessToken: "access-token", fetchImpl: deleteFetchMock },
        REACTION_UUID,
      ),
    ).resolves.toBeUndefined();
    const [deleteUrl, deleteInit] = firstFetchCall(deleteFetchMock);
    expect(deleteUrl).toBe(`/api/workspace/v1/messenger/message_reactions/${REACTION_UUID}`);
    expect(deleteInit?.method).toBe("DELETE");
    expect(deleteInit?.body).toBeUndefined();
  });

  it("lists current user reactions without a message UUID filter", async () => {
    const fetchMock = createFetchMock([reactionDto]);

    await expect(
      getMessageReactions(
        { accessToken: "access-token", fetchImpl: fetchMock },
        { userUuid: USER_UUID },
      ),
    ).resolves.toEqual([reactionDto]);

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/message_reactions/?user_uuid=${USER_UUID}`);
    expect(url).not.toContain("message_uuid");
  });

  it("strictly rejects invalid reaction rows", async () => {
    const fetchMock = createFetchMock([
      reactionDto,
      {
        ...reactionDto,
        emoji_name: "",
      },
    ]);

    await expect(
      getMessageReactions(
        { accessToken: "access-token", fetchImpl: fetchMock },
        { messageUuid: MESSAGE_UUID },
      ),
    ).rejects.toThrow("Expected valid messenger message reactions response item at index 1");
  });

  it("rejects unsupported actions without fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const unsupportedCases: {
      action: UnsupportedMessengerApiAction;
      call: () => Promise<never>;
    }[] = [
      { action: "mark_message_unread", call: markMessageUnreadUnsupported },
      { action: "mark_conversation_read", call: markConversationReadUnsupported },
      { action: "star_message", call: starMessageUnsupported },
      { action: "unstar_message", call: unstarMessageUnsupported },
      { action: "pin_message", call: pinMessageUnsupported },
      { action: "unpin_message", call: unpinMessageUnsupported },
      { action: "upload_attachment", call: uploadAttachmentUnsupported },
      { action: "set_typing", call: setTypingUnsupported },
      { action: "search_messages", call: searchMessagesUnsupported },
      { action: "get_activity", call: getActivityUnsupported },
      { action: "get_link_preview", call: getLinkPreviewUnsupported },
    ];

    for (const unsupportedCase of unsupportedCases) {
      await expect(unsupportedCase.call()).rejects.toEqual(
        expect.objectContaining({
          action: unsupportedCase.action,
          message: `Workspace Messenger API action is unsupported: ${unsupportedCase.action}`,
        }),
      );
      await expect(unsupportedCase.call()).rejects.toBeInstanceOf(
        UnsupportedMessengerApiActionError,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a stream window across topics when only stream scope is requested", async () => {
    const otherTopicUuid = "18d6ded8-f57b-42a6-bf87-f82457707653";
    const beforeMessage = {
      ...messageWithUuid("a39dcd0d-b312-417e-8bed-9696f7634a49", "2026-06-22T10:09:00Z"),
      topic_uuid: otherTopicUuid,
    };
    const afterMessage = messageWithUuid(
      "e88dac46-1af8-4529-b32e-ab3ec9725d4c",
      "2026-06-22T10:11:00Z",
    );
    const fetchMock = vi.fn<typeof fetch>();

    fetchMock.mockImplementation((input) => {
      const url = parsedFetchUrl(input);
      if (url.pathname === "/api/workspace/v1/messenger/messages/") {
        expect(url.searchParams.get("stream_uuid")).toBe(STREAM_UUID);
        expect(url.searchParams.has("topic_uuid")).toBe(false);
        return Promise.resolve(
          jsonResponse(
            url.searchParams.get("sort_dir") === "desc" ? [beforeMessage] : [afterMessage],
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url.toString()}`));
    });

    await expect(
      getMessagePagesAroundResolvedMessage(
        { accessToken: "access-token", fetchImpl: fetchMock },
        { messageUuid: MESSAGE_UUID, streamUuid: STREAM_UUID },
      ),
    ).resolves.toMatchObject({
      before: [beforeMessage],
      after: [afterMessage],
    });
  });
});
