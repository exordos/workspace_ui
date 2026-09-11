import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectWorkspaceMessagesForConversation,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import {
  selectMessengerOutgoingMessagesForConversation,
  settleMessengerOutgoingMessage,
  useMessengerOutboxStore,
} from "./messenger-outbox.model";
import type { MessengerOutgoingMessage } from "./messenger-outbox.types";
import type { MessengerMessage } from "./messenger.types";

const OWNER_A = "account-a:project-a";
const OWNER_B = "account-b:project-b";
const CONVERSATION_A = "topic:stream-a:topic-a";
const TOPIC_UUID = "00000000-0000-0000-0000-000000000001";
const CANONICAL_MESSAGE_UUID = "00000000-0000-4000-8000-000000000002";
const PLACEMENT_UUID = "d2919e10-8c62-5b88-89e6-ed7da20fc912";

function createAuthoritativeMessage(
  outgoing: MessengerOutgoingMessage,
  overrides: Partial<MessengerMessage> = {},
): MessengerMessage {
  return {
    uuid: outgoing.placementUuid,
    conversationId: outgoing.conversationId,
    projectId: outgoing.projectId,
    streamUuid: outgoing.streamUuid,
    topicUuid: outgoing.topicUuid,
    authorUuid: outgoing.authorUuid,
    userUuid: outgoing.authorUuid,
    payload: { kind: "markdown", content: outgoing.markdown },
    read: true,
    pinned: false,
    starred: false,
    isOwn: true,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: outgoing.createdAt,
    updatedAt: outgoing.updatedAt,
    ...overrides,
  };
}

describe("messenger outbox store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
    useMessengerOutboxStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps local outgoing messages outside the canonical Workspace message store", () => {
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockReturnValue(CANONICAL_MESSAGE_UUID);
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      sourceMarkdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    expect(
      selectMessengerOutgoingMessagesForConversation(
        useMessengerOutboxStore.getState(),
        OWNER_A,
        CONVERSATION_A,
      ),
    ).toEqual([outgoing]);
    expect(
      selectWorkspaceMessagesForConversation(useWorkspaceMessageStore.getState(), CONVERSATION_A),
    ).toEqual([]);
    expect(outgoing).toEqual(
      expect.objectContaining({
        canonicalMessageUuid: CANONICAL_MESSAGE_UUID,
        placementUuid: PLACEMENT_UUID,
      }),
    );
    expect(randomUuid).toHaveBeenCalledOnce();
    expect(useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid).toEqual({
      [PLACEMENT_UUID]: outgoing,
    });
  });

  it("filters outgoing messages by runtime owner", () => {
    useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "owner a text",
      sourceMarkdown: "owner a text",
      status: "sending",
      includeStreamConversation: false,
    });
    useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_B,
      conversationId: CONVERSATION_A,
      projectId: "project-b",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-b",
      markdown: "owner b text",
      sourceMarkdown: "owner b text",
      status: "sending",
      includeStreamConversation: false,
    });

    expect(
      selectMessengerOutgoingMessagesForConversation(
        useMessengerOutboxStore.getState(),
        OWNER_A,
        CONVERSATION_A,
      ).map((message) => message.markdown),
    ).toEqual(["owner a text"]);
  });

  it("retries the same placement row without changing its identity", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      sourceMarkdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    useMessengerOutboxStore.getState().markOutgoingMessageFailed(outgoing.placementUuid, "failed");
    useMessengerOutboxStore.getState().markOutgoingMessageSending(outgoing.placementUuid);

    const messages = selectMessengerOutgoingMessagesForConversation(
      useMessengerOutboxStore.getState(),
      OWNER_A,
      CONVERSATION_A,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        canonicalMessageUuid: outgoing.canonicalMessageUuid,
        placementUuid: outgoing.placementUuid,
        status: "sending",
        attempt: 2,
        error: null,
      }),
    );
  });

  it("removes a placement row after the server confirms delivery", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      sourceMarkdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    useMessengerOutboxStore.getState().removeOutgoingMessage(outgoing.placementUuid);

    expect(
      selectMessengerOutgoingMessagesForConversation(
        useMessengerOutboxStore.getState(),
        OWNER_A,
        CONVERSATION_A,
      ),
    ).toEqual([]);
  });

  it("settles an outgoing row only after its exact authoritative message arrives", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    expect(settleMessengerOutgoingMessage(OWNER_A, createAuthoritativeMessage(outgoing))).toBe(
      true,
    );
    expect(
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[outgoing.placementUuid],
    ).toBeUndefined();
  });

  it.each([
    ["owner", OWNER_B],
    ["projectId", "project-b"],
    ["streamUuid", "stream-b"],
    ["topicUuid", "00000000-0000-0000-0000-000000000009"],
    ["authorUuid", "user-b"],
  ] as const)("does not settle when %s does not match", (field, value) => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });
    const message = createAuthoritativeMessage(
      outgoing,
      field === "owner" ? {} : { [field]: value },
    );

    expect(settleMessengerOutgoingMessage(field === "owner" ? value : OWNER_A, message)).toBe(
      false,
    );
    expect(
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[outgoing.placementUuid],
    ).toBe(outgoing);
  });
});
