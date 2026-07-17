import { describe, expect, it, vi } from "vitest";
import {
  createFolder,
  createFolderItem,
  deleteFolder,
  getFolder,
  getFolderItems,
  getFolderItemsPage,
  getFolders,
  getFoldersPage,
  pinFolderItem,
  unpinFolderItem,
  updateFolder,
} from "./messenger-folders.api";

// Folders tests cover user folders and their pinned stream items.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const FOLDER_UUID = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_UUID = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const DATE = "2026-06-22T09:30:00Z";
const PINNED_DATE = "2026-06-22T09:31:00Z";

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

function createFetchQueue(responses: Response[]): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  return fetchMock;
}

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) {
    throw new Error("Expected fetch to be called");
  }
  return call;
}

const folderItemDto = {
  uuid: FOLDER_ITEM_UUID,
  project_id: PROJECT_UUID,
  folder_uuid: FOLDER_UUID,
  user_uuid: USER_UUID,
  stream_uuid: STREAM_UUID,
  chat_type: "stream",
  order_index: 10,
  pinned_at: null,
  unread_count: 3,
  created_at: DATE,
  updated_at: DATE,
};

const folderDto = {
  uuid: FOLDER_UUID,
  title: "Inbox",
  background_color_value: 4280391411,
  unread_count: 3,
  system_type: "created",
  folder_items: [folderItemDto],
  created_at: DATE,
  updated_at: DATE,
};

describe("messenger folders API", () => {
  it("lists folders and returns strict folder pages with pagination headers", async () => {
    const listFetchMock = createFetchMock([folderDto]);

    await expect(
      getFolders(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: listFetchMock,
        },
        { pageLimit: 20, pageMarker: "folder-page" },
      ),
    ).resolves.toEqual([folderDto]);

    const [listUrl, listInit] = firstFetchCall(listFetchMock);
    expect(listUrl).toBe(
      "/api/workspace/v1/messenger/folders/?page_limit=20&page_marker=folder-page",
    );
    expect(listInit?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });

    const pageFetchMock = createFetchMock([folderDto], 200, {
      "X-Pagination-Marker": "next-folder",
      "X-Pagination-Limit": "20",
    });

    await expect(
      getFoldersPage(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: pageFetchMock,
        },
        { pageLimit: 20 },
      ),
    ).resolves.toEqual({
      items: [folderDto],
      nextPageMarker: "next-folder",
      pageLimit: 20,
    });

    const invalidFetchMock = createFetchMock([folderDto, { ...folderDto, uuid: "bad" }]);
    await expect(
      getFolders({ accessToken: "access-token", fetchImpl: invalidFetchMock }),
    ).rejects.toThrow("Expected valid messenger folders response item at index 1");
  });

  it("creates, updates, and deletes a folder with JSON body and bearer auth", async () => {
    const createBody = {
      title: "Inbox",
      background_color_value: 4280391411,
    };
    const updateBody = {
      title: "Archive",
      background_color_value: 4289352960,
    };
    const fetchMock = createFetchQueue([
      jsonResponse(folderDto),
      jsonResponse({ ...folderDto, ...updateBody }),
      jsonResponse({ ignored: true }, 200),
    ]);

    await expect(
      createFolder(
        {
          accessToken: " access-token ",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        createBody,
      ),
    ).resolves.toEqual(folderDto);
    await expect(
      updateFolder(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        FOLDER_UUID,
        updateBody,
      ),
    ).resolves.toEqual({ ...folderDto, ...updateBody });
    await expect(
      deleteFolder(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        FOLDER_UUID,
      ),
    ).resolves.toBeUndefined();

    const [, createInit] = fetchMock.mock.calls[0] ?? [];
    expect(createInit?.method).toBe("POST");
    expect(createInit?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer access-token",
    });
    expect(createInit?.body).toBe(JSON.stringify(createBody));

    const [updateUrl, updateInit] = fetchMock.mock.calls[1] ?? [];
    expect(updateUrl).toBe(`/api/workspace/v1/messenger/folders/${FOLDER_UUID}`);
    expect(updateInit?.method).toBe("PUT");
    expect(updateInit?.body).toBe(JSON.stringify(updateBody));

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[2] ?? [];
    expect(deleteUrl).toBe(`/api/workspace/v1/messenger/folders/${FOLDER_UUID}`);
    expect(deleteInit?.method).toBe("DELETE");
    expect(deleteInit?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
  });

  it("maps folder item filter to folder_uuid query", async () => {
    const fetchMock = createFetchMock([folderItemDto]);

    await expect(
      getFolderItems(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        { folderUuid: FOLDER_UUID, pageLimit: 50, pageMarker: "item-page" },
      ),
    ).resolves.toEqual([folderItemDto]);

    const [url] = firstFetchCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/folder_items/?page_limit=50&page_marker=item-page&folder_uuid=${FOLDER_UUID}`,
    );
  });

  it("creates a folder item with request body", async () => {
    const body = {
      folder_uuid: FOLDER_UUID,
      stream_uuid: STREAM_UUID,
      chat_type: "stream" as const,
      order_index: 10,
    };
    const fetchMock = createFetchMock(folderItemDto);

    await expect(
      createFolderItem(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        body,
      ),
    ).resolves.toEqual(folderItemDto);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/folder_items/");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(body));
  });

  it("accepts a partial folder item response when creating a folder item", async () => {
    const body = {
      folder_uuid: FOLDER_UUID,
      stream_uuid: STREAM_UUID,
      chat_type: "stream" as const,
    };
    const fetchMock = createFetchMock({
      uuid: FOLDER_ITEM_UUID,
      project_id: PROJECT_UUID,
      folder_uuid: FOLDER_UUID,
      user_uuid: USER_UUID,
      stream_uuid: STREAM_UUID,
      chat_type: "stream",
      unread_count: 0,
      created_at: DATE,
      updated_at: DATE,
    });

    await expect(
      createFolderItem(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        body,
      ),
    ).resolves.toEqual({
      uuid: FOLDER_ITEM_UUID,
      project_id: PROJECT_UUID,
      folder_uuid: FOLDER_UUID,
      user_uuid: USER_UUID,
      stream_uuid: STREAM_UUID,
      chat_type: "stream",
      unread_count: 0,
      order_index: undefined,
      pinned_at: undefined,
      created_at: DATE,
      updated_at: DATE,
    });
  });

  it("accepts a folder snapshot response when creating a folder item", async () => {
    const body = {
      folder_uuid: FOLDER_UUID,
      stream_uuid: STREAM_UUID,
      chat_type: "stream" as const,
      order_index: 10,
    };
    const fetchMock = createFetchMock({
      ...folderDto,
      folder_items: [folderItemDto],
    });

    await expect(
      createFolderItem(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        body,
      ),
    ).resolves.toEqual(folderItemDto);
  });

  it("calls pin and unpin action paths without request body", async () => {
    const pinnedItem = {
      ...folderItemDto,
      pinned_at: PINNED_DATE,
      updated_at: PINNED_DATE,
    };
    const fetchMock = createFetchQueue([jsonResponse(pinnedItem), jsonResponse(folderItemDto)]);

    await expect(
      pinFolderItem(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        FOLDER_ITEM_UUID,
      ),
    ).resolves.toEqual(pinnedItem);
    await expect(
      unpinFolderItem(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        FOLDER_ITEM_UUID,
      ),
    ).resolves.toEqual(folderItemDto);

    const [pinUrl, pinInit] = fetchMock.mock.calls[0] ?? [];
    expect(pinUrl).toBe(
      `/api/workspace/v1/messenger/folder_items/${FOLDER_ITEM_UUID}/actions/pin/invoke`,
    );
    expect(pinInit?.method).toBe("POST");
    expect(pinInit?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer access-token",
    });
    expect(pinInit?.body).toBeUndefined();

    const [unpinUrl, unpinInit] = fetchMock.mock.calls[1] ?? [];
    expect(unpinUrl).toBe(
      `/api/workspace/v1/messenger/folder_items/${FOLDER_ITEM_UUID}/actions/unpin/invoke`,
    );
    expect(unpinInit?.method).toBe("POST");
    expect(unpinInit?.body).toBeUndefined();
  });

  it("accepts a folder snapshot response for pin and unpin mutations", async () => {
    const pinnedItem = {
      ...folderItemDto,
      pinned_at: PINNED_DATE,
      updated_at: PINNED_DATE,
    };
    const fetchMock = createFetchQueue([
      jsonResponse({ ...folderDto, folder_items: [pinnedItem] }),
      jsonResponse({ ...folderDto, folder_items: [folderItemDto] }),
    ]);

    await expect(
      pinFolderItem(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        FOLDER_ITEM_UUID,
      ),
    ).resolves.toEqual(pinnedItem);
    await expect(
      unpinFolderItem(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        FOLDER_ITEM_UUID,
      ),
    ).resolves.toEqual(folderItemDto);
  });

  it("throws on invalid singleton response", async () => {
    const fetchMock = createFetchMock({
      ...folderDto,
      folder_items: [{ ...folderItemDto, uuid: "bad" }],
    });

    await expect(
      getFolder(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        FOLDER_UUID,
      ),
    ).rejects.toThrow("Expected valid messenger folder response");
  });

  it("throws on invalid strict folder item page rows", async () => {
    const fetchMock = createFetchMock([folderItemDto, { ...folderItemDto, uuid: "bad" }]);

    await expect(
      getFolderItemsPage(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        { folderUuid: FOLDER_UUID },
      ),
    ).rejects.toThrow("Expected valid messenger folder items response item at index 1");
  });
});
