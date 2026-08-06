import { describe, expect, it } from "vitest";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import {
  adaptMessengerFolder,
  adaptMessengerMessage,
  adaptMessengerStream,
  adaptMessengerStreamBinding,
  adaptMessengerTopic,
  adaptStreamToMessengerConversation,
  adaptTopicToMessengerConversation,
} from "./messenger-adapters.lib";

// Adapter tests show how raw backend DTOs become stable UI domain objects.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_BINDING_UUID = "ea4364f4-96e3-4b33-b80d-fd53e5697151";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const FOLDER_UUID = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_UUID = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const DATE = "2026-06-22T10:10:00Z";

const streamDto: WorkspaceMessengerStreamDto = {
  uuid: STREAM_UUID,
  name: "Engineering",
  description: "Engineering workspace",
  project_id: PROJECT_UUID,
  owner: USER_UUID,
  user_uuid: USER_UUID,
  role: "owner",
  notification_mode: "all_messages",
  unread_count: 3,
  active_unread_count: 3,
  passive_unread_count: 0,
  source_name: "native",
  source: { kind: "native" },
  invite_only: false,
  announce: false,
  private: false,
  is_archived: false,
  color: 0x2563eb,
  direct_user_uuid: null,
  created_at: DATE,
  updated_at: DATE,
};

const streamBindingDto: WorkspaceMessengerStreamBindingDto = {
  uuid: STREAM_BINDING_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  user_uuid: USER_UUID,
  who_uuid: USER_UUID,
  role: "owner",
  notification_mode: "mentions_only",
  created_at: DATE,
  updated_at: DATE,
};

const topicDto: WorkspaceMessengerTopicDto = {
  uuid: TOPIC_UUID,
  project_id: PROJECT_UUID,
  name: "Releases",
  stream_uuid: STREAM_UUID,
  user_uuid: USER_UUID,
  unread_count: 2,
  active_unread_count: 2,
  passive_unread_count: 0,
  is_default: false,
  is_done: false,
  notification_mode: "follow",
  color: 0xf458d2,
  created_at: DATE,
  updated_at: DATE,
};

const messageDto: WorkspaceMessengerMessageDto = {
  uuid: MESSAGE_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  topic_uuid: TOPIC_UUID,
  author_uuid: USER_UUID,
  payload: {
    kind: "markdown",
    content: "Hello, workspace",
  },
  user_uuid: USER_UUID,
  read: true,
  pinned: false,
  starred: false,
  is_own: true,
  reactions: {
    thumbs_up: 2,
    eyes: 1,
  },
  reaction_users: {
    eyes: [USER_UUID],
  },
  created_at: DATE,
  updated_at: DATE,
};

describe("messenger adapters", () => {
  it("maps streams and topics to domain objects", () => {
    expect(adaptMessengerStream(streamDto)).toMatchObject({
      uuid: STREAM_UUID,
      projectId: PROJECT_UUID,
      ownerUuid: USER_UUID,
      name: "Engineering",
      audience: "channel",
      isPrivate: false,
      unreadCount: 3,
      activeUnreadCount: 3,
      passiveUnreadCount: 0,
      notificationMode: "all_messages",
      sourceName: "native",
      source: { kind: "native" },
      isArchived: false,
      color: 0x2563eb,
      directUserUuid: null,
    });
    expect(adaptMessengerTopic(topicDto)).toMatchObject({
      uuid: TOPIC_UUID,
      streamUuid: STREAM_UUID,
      name: "Releases",
      unreadCount: 2,
      activeUnreadCount: 2,
      passiveUnreadCount: 0,
      notificationMode: "follow",
      color: 0xf458d2,
    });
  });

  it("maps separate active and passive unread counters", () => {
    expect(
      adaptMessengerStream({
        ...streamDto,
        unread_count: 9,
        active_unread_count: 2,
        passive_unread_count: 7,
      }),
    ).toMatchObject({ unreadCount: 9, activeUnreadCount: 2, passiveUnreadCount: 7 });
    expect(
      adaptMessengerTopic({
        ...topicDto,
        unread_count: 5,
        active_unread_count: 1,
        passive_unread_count: 4,
      }),
    ).toMatchObject({ unreadCount: 5, activeUnreadCount: 1, passiveUnreadCount: 4 });
  });

  it("normalizes missing direct user id on channel streams", () => {
    const channelStream = { ...streamDto, direct_user_uuid: undefined };

    expect(adaptMessengerStream(channelStream).directUserUuid).toBeNull();
    expect(adaptStreamToMessengerConversation(channelStream).directUserUuid).toBeNull();
  });

  it("maps stream bindings to domain objects", () => {
    expect(adaptMessengerStreamBinding(streamBindingDto)).toEqual({
      uuid: STREAM_BINDING_UUID,
      projectId: PROJECT_UUID,
      streamUuid: STREAM_UUID,
      userUuid: USER_UUID,
      whoUuid: USER_UUID,
      role: "owner",
      notificationMode: "mentions_only",
      createdAt: DATE,
      updatedAt: DATE,
    });
  });

  it("maps private streams to private audience without changing id shape", () => {
    const privateStream = {
      ...streamDto,
      name: "Alice",
      private: true,
      direct_user_uuid: USER_UUID,
    };

    expect(adaptStreamToMessengerConversation(privateStream)).toEqual({
      id: `stream:${STREAM_UUID}`,
      streamUuid: STREAM_UUID,
      title: "Alice",
      audience: "private",
      isPrivate: true,
      unreadCount: 3,
      activeUnreadCount: 3,
      passiveUnreadCount: 0,
      isArchived: false,
      directUserUuid: USER_UUID,
      lastMessageUuid: null,
      notificationMode: "all_messages",
    });
    expect(adaptTopicToMessengerConversation(topicDto, privateStream)).toEqual({
      id: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
      title: "Releases",
      audience: "private",
      isPrivate: true,
      unreadCount: 2,
      activeUnreadCount: 2,
      passiveUnreadCount: 0,
      isArchived: false,
      directUserUuid: USER_UUID,
      lastMessageUuid: null,
      notificationMode: "follow",
      isDone: false,
      isDefaultTopic: false,
    });
  });

  it("maps last message uuid from streams and topics", () => {
    expect(
      adaptMessengerStream({
        ...streamDto,
        last_message_uuid: MESSAGE_UUID,
      }),
    ).toEqual(expect.objectContaining({ lastMessageUuid: MESSAGE_UUID }));
    expect(
      adaptMessengerTopic({
        ...topicDto,
        last_message_uuid: MESSAGE_UUID,
      }),
    ).toEqual(expect.objectContaining({ lastMessageUuid: MESSAGE_UUID }));
    expect(
      adaptStreamToMessengerConversation({
        ...streamDto,
        last_message_uuid: MESSAGE_UUID,
      }),
    ).toEqual(expect.objectContaining({ lastMessageUuid: MESSAGE_UUID }));
    expect(
      adaptTopicToMessengerConversation(
        {
          ...topicDto,
          last_message_uuid: MESSAGE_UUID,
        },
        streamDto,
      ),
    ).toEqual(expect.objectContaining({ lastMessageUuid: MESSAGE_UUID }));
  });

  it("maps messages to topic conversations and markdown content", () => {
    expect(adaptMessengerMessage(messageDto)).toEqual({
      uuid: MESSAGE_UUID,
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      projectId: PROJECT_UUID,
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
      authorUuid: USER_UUID,
      userUuid: USER_UUID,
      payload: { kind: "markdown", content: "Hello, workspace" },
      read: true,
      pinned: false,
      starred: false,
      isOwn: true,
      mentioned: undefined,
      sourceName: "native",
      source: { kind: "native" },
      provider: null,
      delivery: null,
      reactions: {
        thumbs_up: 2,
        eyes: 1,
      },
      reactionUserUuidsByEmojiName: {
        eyes: [USER_UUID],
      },
      ownReactionUuidsByEmojiName: {},
      createdAt: DATE,
      updatedAt: DATE,
    });
  });

  it("keeps external message provenance and backend mention state", () => {
    expect(
      adaptMessengerMessage({
        ...messageDto,
        mentioned: true,
        source_name: "zulip",
        source: {
          kind: "zulip",
          stream_id: 7,
          message_id: 42,
        },
        provider: {
          kind: "zulip",
          account_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          external_id: "message-42",
          capabilities: {},
          delivery_class: "backfill",
          notification_eligible: false,
        },
        delivery: {
          status: "delivered",
          safe_error: null,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        mentioned: true,
        sourceName: "zulip",
        source: {
          kind: "zulip",
          stream_id: 7,
          message_id: 42,
        },
        provider: expect.objectContaining({
          delivery_class: "backfill",
          notification_eligible: false,
        }),
        delivery: {
          status: "delivered",
          safe_error: null,
        },
      }),
    );
  });

  it("maps folder items to stream conversations", () => {
    const folderDto: WorkspaceMessengerFolderDto = {
      uuid: FOLDER_UUID,
      title: "Inbox",
      background_color_value: 4280391411,
      unread_count: 3,
      system_type: "created",
      folder_items: [
        {
          uuid: FOLDER_ITEM_UUID,
          project_id: PROJECT_UUID,
          folder_uuid: FOLDER_UUID,
          user_uuid: USER_UUID,
          stream_uuid: STREAM_UUID,
          chat_type: "private",
          order_index: 10,
          pinned_at: null,
          unread_count: 3,
          active_unread_count: 3,
          passive_unread_count: 0,
          created_at: DATE,
          updated_at: DATE,
        },
      ],
      created_at: DATE,
      updated_at: DATE,
    };

    expect(adaptMessengerFolder(folderDto)).toEqual({
      uuid: FOLDER_UUID,
      title: "Inbox",
      backgroundColorValue: 4280391411,
      unreadCount: 3,
      systemType: "created",
      items: [
        {
          uuid: FOLDER_ITEM_UUID,
          projectId: PROJECT_UUID,
          folderUuid: FOLDER_UUID,
          userUuid: USER_UUID,
          streamUuid: STREAM_UUID,
          conversationId: `stream:${STREAM_UUID}`,
          chatType: "private",
          orderIndex: 10,
          pinnedAt: null,
          unreadCount: 3,
          activeUnreadCount: 3,
          passiveUnreadCount: 0,
          createdAt: DATE,
          updatedAt: DATE,
        },
      ],
      createdAt: DATE,
      updatedAt: DATE,
    });
  });

  it("maps backend folder parent alias to domain folder uuid", () => {
    const folderDto: WorkspaceMessengerFolderDto = {
      uuid: "00000000-0000-0000-0000-000000000000",
      title: "All chats",
      unread_count: 3,
      system_type: "all",
      folder_items: [
        {
          uuid: FOLDER_ITEM_UUID,
          project_id: PROJECT_UUID,
          folder: "00000000-0000-0000-0000-000000000000",
          user_uuid: USER_UUID,
          stream_uuid: STREAM_UUID,
          chat_type: "stream",
          order_index: null,
          pinned_at: null,
          unread_count: 3,
          active_unread_count: 3,
          passive_unread_count: 0,
          created_at: DATE,
          updated_at: DATE,
        },
      ],
      created_at: DATE,
      updated_at: DATE,
    };

    expect(adaptMessengerFolder(folderDto)).toMatchObject({
      uuid: "00000000-0000-0000-0000-000000000000",
      backgroundColorValue: null,
      items: [
        {
          folderUuid: "00000000-0000-0000-0000-000000000000",
          streamUuid: STREAM_UUID,
        },
      ],
    });
  });

  it("normalizes missing folder item nullable fields to null", () => {
    const folderDto: WorkspaceMessengerFolderDto = {
      uuid: FOLDER_UUID,
      title: "Inbox",
      unread_count: 3,
      system_type: "created",
      folder_items: [
        {
          uuid: FOLDER_ITEM_UUID,
          project_id: PROJECT_UUID,
          folder_uuid: FOLDER_UUID,
          user_uuid: USER_UUID,
          stream_uuid: STREAM_UUID,
          chat_type: "private",
          unread_count: 3,
          active_unread_count: 3,
          passive_unread_count: 0,
          created_at: DATE,
          updated_at: DATE,
        },
      ],
      created_at: DATE,
      updated_at: DATE,
    };

    expect(adaptMessengerFolder(folderDto)).toMatchObject({
      items: [
        {
          uuid: FOLDER_ITEM_UUID,
          orderIndex: null,
          pinnedAt: null,
        },
      ],
    });
  });

  it("throws when topic and stream DTOs do not belong together", () => {
    expect(() =>
      adaptTopicToMessengerConversation(
        {
          ...topicDto,
          stream_uuid: "99999999-9999-4999-8999-999999999999",
        },
        streamDto,
      ),
    ).toThrow("Topic stream does not match conversation stream");
  });
});
