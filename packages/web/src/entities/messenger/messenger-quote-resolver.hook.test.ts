import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useResolvedMessengerQuoteMessage } from "./messenger-quote-resolver.hook";
import type { MessengerMessage } from "./messenger.types";

const mocked = vi.hoisted(() => ({
  load: vi.fn(() => Promise.resolve({ status: "unavailable" as const })),
}));

vi.mock("./messenger-quote-loader.lib", () => ({
  loadMessengerQuoteMessage: mocked.load,
}));

const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";

function activeMessage(): MessengerMessage {
  return {
    uuid: MESSAGE_UUID,
    conversationId: "stream:75309057-419c-4b12-a7c1-3932429ec4a6",
    projectId: "22222222-2222-4222-8222-222222222222",
    streamUuid: "75309057-419c-4b12-a7c1-3932429ec4a6",
    topicUuid: "4ec0b996-b778-45f8-8ef4-ef863be0c047",
    authorUuid: "11111111-1111-4111-8111-111111111111",
    userUuid: "11111111-1111-4111-8111-111111111111",
    payload: { kind: "markdown", content: "Active body" },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-28T10:00:00Z",
    updatedAt: "2026-07-28T10:00:00Z",
  };
}

describe("useResolvedMessengerQuoteMessage", () => {
  beforeEach(() => {
    mocked.load.mockClear();
    useWorkspaceMessageStore.getState().clear();
    useWorkspaceMessageStore.getState().upsertMessage(activeMessage());
    useWorkspaceAuthStore.setState({
      currentAccountId: "account-a",
      runtimeGeneration: 1,
      sessions: [
        {
          accountId: "account-a",
          instanceId: "instance-a",
          organizationId: "organization-a",
          organizationOrigin: "https://org-a.example.com",
          projectId: "22222222-2222-4222-8222-222222222222",
          userUuid: "11111111-1111-4111-8111-111111111111",
          accessToken: "token",
          runtimeGeneration: 1,
          login: "alice",
          profile: {
            uuid: "11111111-1111-4111-8111-111111111111",
            username: "alice",
            firstName: "Alice",
            lastName: null,
            email: null,
          },
        },
      ],
    });
  });

  it("returns an active-store hit immediately and still starts a background refresh", async () => {
    const { result } = renderHook(() => useResolvedMessengerQuoteMessage(MESSAGE_UUID));

    expect(result.current).toEqual({
      status: "ready",
      message: expect.objectContaining({ uuid: MESSAGE_UUID }),
    });
    await waitFor(() => {
      expect(mocked.load).toHaveBeenCalledWith(
        expect.objectContaining({ messageUuid: MESSAGE_UUID }),
      );
    });
  });
});
