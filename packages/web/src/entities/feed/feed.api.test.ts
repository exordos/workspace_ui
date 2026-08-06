import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  MessengerCollectionPage,
  MessengerClientOptions,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { fetchFeedMessages, hydrateFeedMessagesFromCache } from "./feed.api";

const logApiCall = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: logError,
    debug: vi.fn(),
  }),
  logApiCall,
}));

const RUNTIME_CONTEXT: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  organizationOrigin: "https://org.example.com",
  projectId: "22222222-2222-4222-8222-222222222222",
  userUuid: "11111111-1111-4111-8111-111111111111",
  accessToken: "access-token",
  runtimeGeneration: 1,
};

function createMessageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    project_id: RUNTIME_CONTEXT.projectId,
    stream_uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    topic_uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    author_uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    user_uuid: RUNTIME_CONTEXT.userUuid,
    payload: {
      kind: "markdown",
      content: "Hello from Workspace",
    },
    read: true,
    pinned: false,
    starred: false,
    is_own: false,
    reactions: {},
    reaction_users: {},
    created_at: "2026-07-02T10:00:00Z",
    updated_at: "2026-07-02T10:00:00Z",
    ...overrides,
  };
}

function createPage(
  items: WorkspaceMessengerMessageDto[],
  nextPageMarker: string | null = "next-page",
): MessengerCollectionPage<WorkspaceMessengerMessageDto> {
  return {
    items,
    nextPageMarker,
    pageLimit: 50,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  logApiCall.mockReset();
  logError.mockReset();
});

describe("fetchFeedMessages", () => {
  it("loads Workspace messages through getMessagesPage and adapts DTOs", async () => {
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createPage([createMessageDto()])),
    );

    const result = await fetchFeedMessages({
      runtimeContext: RUNTIME_CONTEXT,
      client: { getMessagesPage },
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        devTargetOrigin: "https://org.example.com",
        projectId: RUNTIME_CONTEXT.projectId,
      }),
      {
        pageLimit: 50,
        pageMarker: undefined,
      },
    );
    expect(result).toEqual({
      messages: [
        expect.objectContaining({
          uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          authorUuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          payload: { kind: "markdown", content: "Hello from Workspace" },
        }),
      ],
      nextPageMarker: "next-page",
      hasMore: true,
      pageLimit: 50,
    });
  });

  it("passes Workspace pageMarker and pageLimit for pagination", async () => {
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createPage([], null)),
    );

    await fetchFeedMessages({
      runtimeContext: RUNTIME_CONTEXT,
      pageLimit: 25,
      pageMarker: "cursor-a",
      client: { getMessagesPage },
    });

    expect(getMessagesPage).toHaveBeenCalledWith(expect.any(Object), {
      pageLimit: 25,
      pageMarker: "cursor-a",
    });
  });

  it("propagates errors from Workspace message loading", async () => {
    const getMessagesPage = vi.fn(() => Promise.reject(new Error("API failure")));

    await expect(
      fetchFeedMessages({
        runtimeContext: RUNTIME_CONTEXT,
        client: { getMessagesPage },
      }),
    ).rejects.toThrow("API failure");
    expect(logError).toHaveBeenCalled();
  });

  it("does not log abort as an error", async () => {
    const controller = new AbortController();
    controller.abort();
    const getMessagesPage = vi.fn(() => Promise.reject(new DOMException("Aborted", "AbortError")));

    await expect(
      fetchFeedMessages({
        runtimeContext: RUNTIME_CONTEXT,
        signal: controller.signal,
        client: { getMessagesPage },
      }),
    ).rejects.toThrow();

    expect(logApiCall).toHaveBeenCalledWith("GET", "/messages/", {
      durationMs: expect.any(Number),
      aborted: true,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it("returns no cached feed messages until a Workspace feed cache exists", async () => {
    await expect(hydrateFeedMessagesFromCache("owner-a")).resolves.toEqual([]);
  });
});
