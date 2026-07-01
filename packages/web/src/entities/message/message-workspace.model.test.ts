import { beforeEach, describe, expect, it } from "vitest";
import {
  conversationIdForStream,
  conversationIdForTopic,
} from "~/entities/messenger/messenger-ids.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import {
  selectWorkspaceMessagesForConversation,
  selectWorkspaceMessageStatusForConversation,
  useWorkspaceMessageStore,
} from "./message.model";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const AUTHOR_UUID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_A = "10000000-0000-4000-8000-000000000001";
const MESSAGE_B = "10000000-0000-4000-8000-000000000002";
const MESSAGE_C = "10000000-0000-4000-8000-000000000003";
const DATE = "2026-06-22T10:10:00Z";
const DATE_LATER = "2026-06-22T10:20:00Z";
const DATE_EARLIER = "2026-06-22T10:00:00Z";

const TOPIC_CONVERSATION_ID = conversationIdForTopic(STREAM_UUID, TOPIC_UUID);
const STREAM_CONVERSATION_ID = conversationIdForStream(STREAM_UUID);

function createMessage(
  overrides: Partial<MessengerMessage> & { uuid: MessengerUuid },
): MessengerMessage {
  const { uuid, ...rest } = overrides;
  return {
    uuid,
    conversationId: TOPIC_CONVERSATION_ID,
    projectId: PROJECT_UUID,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: AUTHOR_UUID,
    userUuid: USER_UUID,
    markdown: "message",
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    createdAt: DATE,
    updatedAt: DATE,
    ...rest,
  };
}

function selectMessages(conversationId: MessengerConversationId): MessengerMessage[] {
  return selectWorkspaceMessagesForConversation(
    useWorkspaceMessageStore.getState(),
    conversationId,
  );
}

describe("workspace message store", () => {
  beforeEach(() => {
    useWorkspaceMessageStore.getState().clear();
  });

  it("keeps conversation ids sorted by createdAt and then uuid", () => {
    useWorkspaceMessageStore
      .getState()
      .mergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
        createMessage({ uuid: MESSAGE_B, createdAt: DATE, markdown: "b" }),
        createMessage({ uuid: MESSAGE_A, createdAt: DATE, markdown: "a" }),
        createMessage({ uuid: MESSAGE_C, createdAt: DATE_EARLIER, markdown: "c" }),
      ]);

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_C,
      MESSAGE_A,
      MESSAGE_B,
    ]);
  });

  it("deduplicates by uuid and stores the latest body", () => {
    useWorkspaceMessageStore
      .getState()
      .mergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
        createMessage({ uuid: MESSAGE_A, markdown: "first" }),
        createMessage({ uuid: MESSAGE_A, markdown: "second" }),
      ]);

    const messages = selectMessages(TOPIC_CONVERSATION_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.markdown).toBe("second");
  });

  it("reindexes a duplicate message when createdAt changes", () => {
    useWorkspaceMessageStore
      .getState()
      .mergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
        createMessage({ uuid: MESSAGE_A, createdAt: DATE_LATER }),
        createMessage({ uuid: MESSAGE_B, createdAt: DATE }),
      ]);

    useWorkspaceMessageStore
      .getState()
      .upsertMessage(createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER }));

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
      MESSAGE_B,
    ]);
  });

  it("does not drop a live message when an initial page arrives later", () => {
    useWorkspaceMessageStore
      .getState()
      .upsertMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER, markdown: "live" }));

    useWorkspaceMessageStore
      .getState()
      .replaceOrMergeConversationMessagesPage(TOPIC_CONVERSATION_ID, [
        createMessage({ uuid: MESSAGE_A, createdAt: DATE, markdown: "initial" }),
      ]);

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.markdown)).toEqual([
      "initial",
      "live",
    ]);
  });

  it("indexes one message into topic and stream buckets when requested", () => {
    useWorkspaceMessageStore
      .getState()
      .indexMessageIntoConversationBuckets(createMessage({ uuid: MESSAGE_A }), {
        includeStreamConversation: true,
      });

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
    expect(selectMessages(STREAM_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
  });

  it("keeps stable selector fallback references", () => {
    const firstMessages = selectWorkspaceMessagesForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );
    const secondMessages = selectWorkspaceMessagesForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );
    const firstStatus = selectWorkspaceMessageStatusForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );
    const secondStatus = selectWorkspaceMessageStatusForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );

    expect(secondMessages).toBe(firstMessages);
    expect(secondStatus).toBe(firstStatus);
  });
});
