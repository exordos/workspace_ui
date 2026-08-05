import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { fetchMyReactionActivityPage } from "./activity-reactions.api";

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

const reactedOwnMessage: WorkspaceMessengerMessageDto = {
  uuid: "message-1",
  project_id: "project-1",
  stream_uuid: "11111111-1111-4111-8111-111111111111",
  topic_uuid: "22222222-2222-4222-8222-222222222222",
  author_uuid: "user-1",
  payload: { kind: "markdown", content: "Reacted own message" },
  user_uuid: "user-1",
  read: true,
  pinned: false,
  starred: false,
  is_own: true,
  reactions: { heart: 2 },
  reaction_users: {
    heart: ["user-2", "user-3"],
  },
  created_at: "2026-06-22T10:10:00Z",
  updated_at: "2026-06-22T10:10:00Z",
};

describe("fetchMyReactionActivityPage", () => {
  it("requests the dedicated current-user reaction activity page", async () => {
    const getReactionActivityMessagesPage = vi.fn().mockResolvedValue({
      items: [reactedOwnMessage],
      nextPageMarker: "next-message",
      pageLimit: 50,
    });

    await expect(
      fetchMyReactionActivityPage({
        runtimeContext,
        cursor: "cursor",
        client: { getReactionActivityMessagesPage },
      }),
    ).resolves.toEqual({
      messages: [
        expect.objectContaining({
          uuid: reactedOwnMessage.uuid,
          authorUuid: runtimeContext.userUuid,
          isOwn: true,
          reactions: { heart: 2 },
        }),
      ],
      nextCursor: "next-message",
      hasMore: true,
    });

    expect(getReactionActivityMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: runtimeContext.accessToken,
        projectId: runtimeContext.projectId,
      }),
      {
        pageLimit: 50,
        pageMarker: "cursor",
      },
    );
  });
});
