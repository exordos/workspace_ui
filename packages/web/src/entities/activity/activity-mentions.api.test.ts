import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { fetchMyMentionsPage, fetchUnreadMentions } from "./activity-mentions.api";

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-1",
  instanceId: "instance-1",
  organizationId: "acme",
  organizationOrigin: "https://acme.example.com",
  projectId: "project-1",
  userUuid: "user-1",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  runtimeGeneration: 1,
};

const ownMentionMessage: WorkspaceMessengerMessageDto = {
  uuid: "message-1",
  project_id: "project-1",
  stream_uuid: "11111111-1111-4111-8111-111111111111",
  topic_uuid: "22222222-2222-4222-8222-222222222222",
  author_uuid: "user-1",
  payload: { kind: "markdown", content: "Self mention" },
  user_uuid: "user-1",
  read: true,
  pinned: false,
  starred: false,
  is_own: true,
  mentioned: true,
  reactions: {},
  reaction_users: {},
  created_at: "2026-06-22T10:10:00Z",
  updated_at: "2026-06-22T10:10:00Z",
};

describe("fetchMyMentionsPage", () => {
  it("requests current-user mentions and keeps an own mentioned message", async () => {
    const getMessagesPage = vi.fn().mockResolvedValue({
      items: [ownMentionMessage],
      nextPageMarker: "next-message",
      pageLimit: 50,
    });

    await expect(
      fetchMyMentionsPage({
        runtimeContext,
        cursor: "cursor",
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({
      messages: [
        expect.objectContaining({
          uuid: ownMentionMessage.uuid,
          authorUuid: runtimeContext.userUuid,
          isOwn: true,
          mentioned: true,
        }),
      ],
      nextCursor: "next-message",
      hasMore: true,
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: runtimeContext.accessToken,
        projectId: runtimeContext.projectId,
      }),
      {
        pageLimit: 50,
        pageMarker: "cursor",
        mentioned: true,
        sortKey: "created_at",
        sortDir: "desc",
      },
    );
  });

  it("allows overriding the page size without exposing message filters", async () => {
    const getMessagesPage = vi.fn().mockResolvedValue({
      items: [],
      nextPageMarker: null,
      pageLimit: 25,
    });

    await expect(
      fetchMyMentionsPage({
        runtimeContext,
        pageSize: 25,
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    expect(getMessagesPage).toHaveBeenCalledWith(expect.any(Object), {
      pageLimit: 25,
      mentioned: true,
      sortKey: "created_at",
      sortDir: "desc",
    });
  });
});

describe("fetchUnreadMentions", () => {
  it("returns minimal entries from every page filtered by unread mentions", async () => {
    const getMessagesPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [ownMentionMessage, { ...ownMentionMessage, uuid: "message-2" }],
        nextPageMarker: "next-page",
        pageLimit: 100,
      })
      .mockResolvedValueOnce({
        items: [{ ...ownMentionMessage, uuid: "message-3" }],
        nextPageMarker: null,
        pageLimit: 100,
      });

    await expect(
      fetchUnreadMentions({ runtimeContext, client: { getMessagesPage } }),
    ).resolves.toEqual([
      {
        uuid: "message-1",
        streamUuid: ownMentionMessage.stream_uuid,
        topicUuid: ownMentionMessage.topic_uuid,
        createdAt: ownMentionMessage.created_at,
      },
      {
        uuid: "message-2",
        streamUuid: ownMentionMessage.stream_uuid,
        topicUuid: ownMentionMessage.topic_uuid,
        createdAt: ownMentionMessage.created_at,
      },
      {
        uuid: "message-3",
        streamUuid: ownMentionMessage.stream_uuid,
        topicUuid: ownMentionMessage.topic_uuid,
        createdAt: ownMentionMessage.created_at,
      },
    ]);

    expect(getMessagesPage).toHaveBeenNthCalledWith(1, expect.any(Object), {
      pageLimit: 100,
      mentioned: true,
      read: false,
      sortKey: "created_at",
      sortDir: "desc",
    });
    expect(getMessagesPage).toHaveBeenNthCalledWith(2, expect.any(Object), {
      pageLimit: 100,
      pageMarker: "next-page",
      mentioned: true,
      read: false,
      sortKey: "created_at",
      sortDir: "desc",
    });
  });
});
