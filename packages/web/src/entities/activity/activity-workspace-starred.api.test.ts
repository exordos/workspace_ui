import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { fetchWorkspaceStarredMessages } from "./activity-workspace-starred.api";

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

const message: WorkspaceMessengerMessageDto = {
  uuid: "message-1",
  project_id: "project-1",
  stream_uuid: "stream-1",
  topic_uuid: "topic-1",
  author_uuid: "user-2",
  payload: { kind: "markdown", content: "Starred message" },
  user_uuid: "user-1",
  read: true,
  pinned: false,
  starred: true,
  is_own: false,
  reactions: {},
  reaction_users: {},
  created_at: "2026-06-22T10:10:00Z",
  updated_at: "2026-06-22T10:10:00Z",
};

describe("fetchWorkspaceStarredMessages", () => {
  it("requests Workspace messages with the starred filter", async () => {
    const getMessagesPage = vi.fn().mockResolvedValue({
      items: [message],
      nextPageMarker: "next-message",
      pageLimit: 50,
    });

    await expect(
      fetchWorkspaceStarredMessages({
        runtimeContext,
        pageLimit: 50,
        pageMarker: "cursor",
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({
      messages: [message],
      nextPageMarker: "next-message",
      hasMore: true,
      pageLimit: 50,
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: runtimeContext.accessToken,
        projectId: runtimeContext.projectId,
      }),
      {
        pageLimit: 50,
        pageMarker: "cursor",
        starred: true,
        sortKey: "created_at",
        sortDir: "desc",
      },
    );
  });

  it("does not apply a default page limit", async () => {
    const getMessagesPage = vi.fn().mockResolvedValue({
      items: [message],
      nextPageMarker: null,
      pageLimit: null,
    });

    await fetchWorkspaceStarredMessages({
      runtimeContext,
      client: { getMessagesPage },
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: runtimeContext.accessToken,
        projectId: runtimeContext.projectId,
      }),
      {
        starred: true,
        sortKey: "created_at",
        sortDir: "desc",
      },
    );
  });
});
