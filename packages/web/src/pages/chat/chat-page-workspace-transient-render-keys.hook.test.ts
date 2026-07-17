import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { useWorkspaceTransientRenderKeys } from "./chat-page-workspace-transient-render-keys.hook";

const CONVERSATION_A = "topic:stream-a:topic-a";
const CONVERSATION_B = "topic:stream-b:topic-b";
const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const SERVER_MESSAGE_UUID = "server-message-uuid";
const LOCAL_ID = "outgoing:local-id";

function createMessage(uuid = SERVER_MESSAGE_UUID): MessengerMessage {
  return {
    uuid,
    conversationId: CONVERSATION_A,
    projectId: "project-uuid",
    streamUuid: "stream-a",
    topicUuid: "topic-a",
    authorUuid: "user-uuid",
    userUuid: "user-uuid",
    payload: { kind: "markdown", content: "message" },
    read: true,
    pinned: false,
    starred: false,
    isOwn: true,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-17T10:00:00.000Z",
    updatedAt: "2026-07-17T10:00:00.000Z",
  };
}

describe("useWorkspaceTransientRenderKeys", () => {
  it("keeps the local key for a delivered server message in the current chat", () => {
    const { result } = renderHook(() =>
      useWorkspaceTransientRenderKeys({
        ownerKey: OWNER_A,
        conversationId: CONVERSATION_A,
        messages: [createMessage()],
      }),
    );

    act(() => {
      result.current.registerDeliveredOutgoingMessage(
        OWNER_A,
        CONVERSATION_A,
        SERVER_MESSAGE_UUID,
        LOCAL_ID,
      );
    });

    expect(result.current.resolveServerMessageRenderKey(SERVER_MESSAGE_UUID)).toBe(LOCAL_ID);
  });

  it("clears keys on chat change and rejects a late response from the previous chat", () => {
    const { result, rerender } = renderHook(
      ({ conversationId, messages }: { conversationId: string; messages: MessengerMessage[] }) =>
        useWorkspaceTransientRenderKeys({ ownerKey: OWNER_A, conversationId, messages }),
      {
        initialProps: { conversationId: CONVERSATION_A, messages: [createMessage()] },
      },
    );

    act(() => {
      result.current.registerDeliveredOutgoingMessage(
        OWNER_A,
        CONVERSATION_A,
        SERVER_MESSAGE_UUID,
        LOCAL_ID,
      );
    });
    rerender({ conversationId: CONVERSATION_B, messages: [] });

    expect(result.current.resolveServerMessageRenderKey(SERVER_MESSAGE_UUID)).toBeUndefined();

    act(() => {
      result.current.registerDeliveredOutgoingMessage(
        OWNER_A,
        CONVERSATION_A,
        SERVER_MESSAGE_UUID,
        LOCAL_ID,
      );
    });

    expect(result.current.resolveServerMessageRenderKey(SERVER_MESSAGE_UUID)).toBeUndefined();

    rerender({ conversationId: CONVERSATION_A, messages: [createMessage()] });

    expect(result.current.resolveServerMessageRenderKey(SERVER_MESSAGE_UUID)).toBeUndefined();
  });

  it("drops a key when the server message disappears from the active chat", () => {
    const { result, rerender } = renderHook(
      ({ messages }: { messages: MessengerMessage[] }) =>
        useWorkspaceTransientRenderKeys({
          ownerKey: OWNER_A,
          conversationId: CONVERSATION_A,
          messages,
        }),
      { initialProps: { messages: [createMessage()] } },
    );

    act(() => {
      result.current.registerDeliveredOutgoingMessage(
        OWNER_A,
        CONVERSATION_A,
        SERVER_MESSAGE_UUID,
        LOCAL_ID,
      );
    });
    rerender({ messages: [] });

    expect(result.current.resolveServerMessageRenderKey(SERVER_MESSAGE_UUID)).toBeUndefined();
  });

  it("removes the key immediately after an explicit message deletion", () => {
    const { result } = renderHook(() =>
      useWorkspaceTransientRenderKeys({
        ownerKey: OWNER_A,
        conversationId: CONVERSATION_A,
        messages: [createMessage()],
      }),
    );

    act(() => {
      result.current.registerDeliveredOutgoingMessage(
        OWNER_A,
        CONVERSATION_A,
        SERVER_MESSAGE_UUID,
        LOCAL_ID,
      );
      result.current.removeServerMessageRenderKey(OWNER_A, CONVERSATION_A, SERVER_MESSAGE_UUID);
    });

    expect(result.current.resolveServerMessageRenderKey(SERVER_MESSAGE_UUID)).toBeUndefined();
  });

  it("clears keys and rejects a late response when the owner changes in the same chat", () => {
    const { result, rerender } = renderHook(
      ({ ownerKey }: { ownerKey: string }) =>
        useWorkspaceTransientRenderKeys({
          ownerKey,
          conversationId: CONVERSATION_A,
          messages: [createMessage()],
        }),
      { initialProps: { ownerKey: OWNER_A } },
    );

    act(() => {
      result.current.registerDeliveredOutgoingMessage(
        OWNER_A,
        CONVERSATION_A,
        SERVER_MESSAGE_UUID,
        LOCAL_ID,
      );
    });
    rerender({ ownerKey: OWNER_B });

    expect(result.current.resolveServerMessageRenderKey(SERVER_MESSAGE_UUID)).toBeUndefined();

    act(() => {
      result.current.registerDeliveredOutgoingMessage(
        OWNER_A,
        CONVERSATION_A,
        SERVER_MESSAGE_UUID,
        LOCAL_ID,
      );
    });

    expect(result.current.resolveServerMessageRenderKey(SERVER_MESSAGE_UUID)).toBeUndefined();
  });
});
