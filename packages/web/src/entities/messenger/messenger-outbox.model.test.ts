import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectWorkspaceMessagesForConversation,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import {
  selectMessengerOutgoingMessagesForConversation,
  useMessengerOutboxStore,
} from "./messenger-outbox.model";

const OWNER_A = "account-a:project-a";
const OWNER_B = "account-b:project-b";
const CONVERSATION_A = "topic:stream-a:topic-a";

describe("messenger outbox store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
    useMessengerOutboxStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  it("keeps local outgoing messages outside the canonical Workspace message store", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: "topic-a",
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
  });

  it("filters outgoing messages by runtime owner", () => {
    useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: "topic-a",
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
      topicUuid: "topic-a",
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

  it("retries the same local row instead of appending a duplicate", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: "topic-a",
      authorUuid: "user-a",
      markdown: "local text",
      sourceMarkdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    useMessengerOutboxStore.getState().markOutgoingMessageFailed(outgoing.localId, "failed");
    useMessengerOutboxStore.getState().markOutgoingMessageSending(outgoing.localId);

    const messages = selectMessengerOutgoingMessagesForConversation(
      useMessengerOutboxStore.getState(),
      OWNER_A,
      CONVERSATION_A,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        localId: outgoing.localId,
        status: "sending",
        attempt: 2,
        error: null,
      }),
    );
  });

  it("removes a local row after the server confirms delivery", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: "topic-a",
      authorUuid: "user-a",
      markdown: "local text",
      sourceMarkdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    useMessengerOutboxStore.getState().removeOutgoingMessage(outgoing.localId);

    expect(
      selectMessengerOutgoingMessagesForConversation(
        useMessengerOutboxStore.getState(),
        OWNER_A,
        CONVERSATION_A,
      ),
    ).toEqual([]);
  });
});
