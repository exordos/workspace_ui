import { describe, expect, it, vi } from "vitest";
import {
  UnsupportedMessengerApiActionError,
  addReactionUnsupported,
  createMessage,
  deleteMessage,
  editMessage,
  getActivityUnsupported,
  getLinkPreviewUnsupported,
  getMessage,
  getMessages,
  getMessagesPage,
  markConversationReadUnsupported,
  markMessageRead,
  markMessageUnreadUnsupported,
  pinMessageUnsupported,
  removeReactionUnsupported,
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
      `/api/messenger/v1/messages/?page_limit=50&page_marker=${MESSAGE_UUID}&stream_uuid=${STREAM_UUID}&topic_uuid=${TOPIC_UUID}`,
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
      `/api/messenger/v1/messages/?page_limit=25&page_marker=previous-message&stream_uuid=${STREAM_UUID}&topic_uuid=${TOPIC_UUID}`,
    );
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
    expect(firstFetchCall(getFetchMock)[0]).toBe(`/api/messenger/v1/messages/${MESSAGE_UUID}`);

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
    expect(createUrl).toBe("/api/messenger/v1/messages/");
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
    expect(editUrl).toBe(`/api/messenger/v1/messages/${MESSAGE_UUID}`);
    expect(editInit?.method).toBe("PUT");
    expect(editInit?.body).toBe(JSON.stringify(editBody));

    const readFetchMock = createFetchMock({ ...messageDto, read: true });
    await expect(
      markMessageRead({ accessToken: "access-token", fetchImpl: readFetchMock }, MESSAGE_UUID),
    ).resolves.toEqual({ ...messageDto, read: true });
    const [readUrl, readInit] = firstFetchCall(readFetchMock);
    expect(readUrl).toBe(`/api/messenger/v1/messages/${MESSAGE_UUID}/actions/read/invoke`);
    expect(readInit?.method).toBe("POST");
    expect(readInit?.body).toBeUndefined();

    const deleteFetchMock = createFetchMock(null, 204);
    await expect(
      deleteMessage({ accessToken: "access-token", fetchImpl: deleteFetchMock }, MESSAGE_UUID),
    ).resolves.toBeUndefined();
    const [deleteUrl, deleteInit] = firstFetchCall(deleteFetchMock);
    expect(deleteUrl).toBe(`/api/messenger/v1/messages/${MESSAGE_UUID}`);
    expect(deleteInit?.method).toBe("DELETE");
    expect(deleteInit?.body).toBeUndefined();
  });

  it("rejects unsupported actions without fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const unsupportedCases: {
      action: UnsupportedMessengerApiAction;
      call: () => Promise<never>;
    }[] = [
      { action: "mark_message_unread", call: markMessageUnreadUnsupported },
      { action: "mark_conversation_read", call: markConversationReadUnsupported },
      { action: "add_reaction", call: addReactionUnsupported },
      { action: "remove_reaction", call: removeReactionUnsupported },
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
});
