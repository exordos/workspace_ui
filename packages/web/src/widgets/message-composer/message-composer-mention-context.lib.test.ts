/**
 * Tests for the mention ranking context built from the messenger and message stores.
 */
import { describe, expect, it } from "vitest";
import type {
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
} from "~/entities/messenger/messenger.types";
import {
  buildWorkspaceMentionContext,
  type MentionContextMessageState,
  type MentionContextMessengerState,
} from "./message-composer-mention-context.lib";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const DM_STREAM_OLD = "37a28696-153d-431e-a5fb-36f0c0209765";
const DM_STREAM_NEW = "f1a37d93-38f8-4d47-9be8-22dc63d77a7d";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const CONVERSATION_ID = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
const DATE_OLD = "2026-06-22T10:10:00Z";
const DATE_NEW = "2026-06-23T10:10:00Z";

function stream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: PROJECT_ID,
    ownerUuid: "owner",
    userUuid: "user",
    role: "member",
    notificationMode: "all_messages",
    name: "Engineering",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: DATE_OLD,
    updatedAt: DATE_OLD,
    ...overrides,
  };
}

function binding(overrides: Partial<MessengerStreamBinding> = {}): MessengerStreamBinding {
  return {
    uuid: "binding",
    projectId: PROJECT_ID,
    streamUuid: STREAM_UUID,
    userUuid: "member",
    whoUuid: "who",
    role: "member",
    notificationMode: "all_messages",
    createdAt: DATE_OLD,
    updatedAt: DATE_OLD,
    ...overrides,
  };
}

function message(overrides: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    uuid: "message",
    conversationId: CONVERSATION_ID,
    projectId: PROJECT_ID,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: "author",
    userUuid: "user",
    payload: { kind: "markdown", content: "text" },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: DATE_OLD,
    updatedAt: DATE_OLD,
    ...overrides,
  };
}

function messengerState(
  overrides: Partial<MentionContextMessengerState> = {},
): MentionContextMessengerState {
  return {
    streamIds: [],
    streamsById: {},
    streamBindingsById: {},
    streamBindingIdsByStreamId: {},
    streamBindingsLoadedByStreamId: {},
    ...overrides,
  };
}

function messageState(
  overrides: Partial<MentionContextMessageState> = {},
): MentionContextMessageState {
  return {
    conversationWindowsById: {},
    messagesById: {},
    ...overrides,
  };
}

describe("buildWorkspaceMentionContext", () => {
  it("reports unknown membership until the bindings of the stream are loaded", () => {
    const context = buildWorkspaceMentionContext({
      streamUuid: STREAM_UUID,
      messenger: messengerState({
        streamBindingsById: { "binding-a": binding({ uuid: "binding-a", userUuid: "member-a" }) },
        streamBindingIdsByStreamId: { [STREAM_UUID]: ["binding-a"] },
      }),
      messages: messageState(),
    });

    expect(context.channelMemberUuids).toBeNull();
  });

  it("collects channel members once their bindings are loaded", () => {
    const context = buildWorkspaceMentionContext({
      streamUuid: STREAM_UUID,
      messenger: messengerState({
        streamBindingsById: {
          "binding-a": binding({ uuid: "binding-a", userUuid: "member-a" }),
          "binding-b": binding({ uuid: "binding-b", userUuid: "member-b" }),
        },
        streamBindingIdsByStreamId: { [STREAM_UUID]: ["binding-a", "binding-b"] },
        streamBindingsLoadedByStreamId: { [STREAM_UUID]: true },
      }),
      messages: messageState(),
    });

    expect([...(context.channelMemberUuids ?? [])]).toEqual(["member-a", "member-b"]);
  });

  it("lists the authors of the open conversation, newest first and without repeats", () => {
    const context = buildWorkspaceMentionContext({
      conversationId: CONVERSATION_ID,
      messenger: messengerState(),
      messages: messageState({
        conversationWindowsById: {
          [CONVERSATION_ID]: {
            mode: "tail",
            anchorMessageUuid: null,
            messageUuids: ["m1", "m2", "m3"],
            beforePageMarker: null,
            afterPageMarker: null,
            revision: 1,
          },
        },
        messagesById: {
          m1: message({ uuid: "m1", authorUuid: "author-a" }),
          m2: message({ uuid: "m2", authorUuid: "author-b" }),
          m3: message({ uuid: "m3", authorUuid: "author-a" }),
        },
      }),
    });

    expect(context.recentAuthorUuids).toEqual(["author-a", "author-b"]);
  });

  it("orders direct message partners by the time of their last message", () => {
    const context = buildWorkspaceMentionContext({
      messenger: messengerState({
        streamIds: [DM_STREAM_OLD, DM_STREAM_NEW],
        streamsById: {
          [DM_STREAM_OLD]: stream({
            uuid: DM_STREAM_OLD,
            directUserUuid: "partner-old",
            lastMessageUuid: "m-old",
          }),
          [DM_STREAM_NEW]: stream({
            uuid: DM_STREAM_NEW,
            directUserUuid: "partner-new",
            lastMessageUuid: "m-new",
          }),
        },
      }),
      messages: messageState({
        messagesById: {
          "m-old": message({ uuid: "m-old", createdAt: DATE_OLD }),
          "m-new": message({ uuid: "m-new", createdAt: DATE_NEW }),
        },
      }),
    });

    expect(context.dmPartnerUuids).toEqual(["partner-new", "partner-old"]);
  });

  it("passes the author and frecency scores through untouched", () => {
    const context = buildWorkspaceMentionContext({
      selfUserUuid: "me",
      messenger: messengerState(),
      messages: messageState(),
      frecencyByUserUuid: { "user-a": 3 },
    });

    expect(context.selfUserUuid).toBe("me");
    expect(context.frecencyByUserUuid).toEqual({ "user-a": 3 });
  });
});
