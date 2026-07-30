import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { fetchMyMentionsPage } from "./activity-mentions.api";

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
