import { describe, expect, it } from "vitest";
import {
  isWorkspaceMessengerEpochDto,
  isWorkspaceMessengerEventDto,
  isWorkspaceMessengerFolderDto,
  isWorkspaceMessengerMessageDto,
  isWorkspaceMessengerMessageReactionDto,
  isWorkspaceMessengerRawEventDto,
  isWorkspaceMessengerReactionAggregate,
  isWorkspaceMessengerRealtimeEventDto,
  isWorkspaceMessengerServerSettingsDto,
  isWorkspaceMessengerStreamBindingDto,
  isWorkspaceMessengerStreamDto,
  isWorkspaceMessengerTopicDto,
  isWorkspaceMessengerUserDto,
  isWorkspaceMessengerWebSocketFrameDto,
  isWorkspaceRealtimeEvent,
} from "./messenger.types";
import type {
  WorkspaceMessengerEventAction,
  WorkspaceMessengerEventObjectType,
} from "./messenger.types";

// DTO guard tests keep the frontend aligned with the backend messenger contract.
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const REACTION_UUID = "fae5c55d-9bb2-4646-9c03-f4a6dd65c9f0";
const FOLDER_UUID = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_UUID = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const BINDING_UUID = "81ffbd82-1f6f-4d85-b44b-b0cd8b4190fb";
const EVENT_UUID = "0cb14b5a-6bf0-4de2-bdb5-4e98df4044e0";
const DATE = "2026-06-22T10:10:00Z";

const streamDto = {
  uuid: STREAM_UUID,
  name: "Engineering",
  description: "Engineering workspace",
  project_id: PROJECT_UUID,
  owner: USER_UUID,
  user_uuid: USER_UUID,
  role: "owner",
  notification_mode: "all_messages",
  unread_count: 3,
  source_name: "native",
  source: { kind: "native" },
  invite_only: false,
  announce: false,
  private: false,
  is_archived: false,
  direct_user_uuid: null,
  created_at: DATE,
  updated_at: DATE,
};

const streamBindingDto = {
  uuid: BINDING_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  user_uuid: USER_UUID,
  who_uuid: USER_UUID,
  role: "member",
  notification_mode: "mentions_only",
  created_at: DATE,
  updated_at: DATE,
};

const topicDto = {
  uuid: TOPIC_UUID,
  project_id: PROJECT_UUID,
  name: "Releases",
  stream_uuid: STREAM_UUID,
  user_uuid: USER_UUID,
  unread_count: 2,
  is_default: false,
  is_done: false,
  notification_mode: "follow",
  created_at: DATE,
  updated_at: DATE,
};

const messageDto = {
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
  created_at: DATE,
  updated_at: DATE,
};

const reactionDto = {
  uuid: REACTION_UUID,
  project_id: PROJECT_UUID,
  message_uuid: MESSAGE_UUID,
  user_uuid: USER_UUID,
  emoji_name: "thumbs_up",
  created_at: DATE,
  updated_at: DATE,
};

const reactionEventPayloadDto = {
  uuid: REACTION_UUID,
  project_id: PROJECT_UUID,
  message_uuid: MESSAGE_UUID,
  user_uuid: USER_UUID,
  emoji_name: "thumbs_up",
  source_name: "native",
  source: { kind: "native" },
};

const userDto = {
  uuid: USER_UUID,
  username: "admin",
  source: "iam",
  avatar: `urn:gavatar:${USER_UUID}`,
  status: "active",
  status_emoji: null,
  status_text: null,
  first_name: null,
  last_name: null,
  email: "admin@example.com",
  last_ping_at: DATE,
  created_at: DATE,
  updated_at: DATE,
};

const folderItemDto = {
  uuid: FOLDER_ITEM_UUID,
  project_id: PROJECT_UUID,
  folder_uuid: FOLDER_UUID,
  user_uuid: USER_UUID,
  stream_uuid: STREAM_UUID,
  chat_type: "stream",
  order_index: 10,
  pinned_at: null,
  unread_count: 3,
  created_at: DATE,
  updated_at: DATE,
};

const folderDto = {
  uuid: FOLDER_UUID,
  project_id: PROJECT_UUID,
  user_uuid: USER_UUID,
  title: "Inbox",
  background_color_value: 4280391411,
  unread_count: 3,
  system_type: "created",
  folder_items: [folderItemDto],
  created_at: DATE,
  updated_at: DATE,
};

const serverSettingsDto = {
  result: "success",
  msg: "Welcome to Exordos Workspace",
  authentication_methods: {
    password: true,
    dev: false,
    email: true,
    ldap: false,
    remoteuser: false,
    github: false,
    azuread: false,
    gitlab: false,
    google: false,
    apple: false,
    saml: false,
    "openid connect": false,
  },
  push_notifications_enabled: true,
  email_auth_enabled: true,
  require_email_format_usernames: true,
  realm_url: "https://zulip.genesis-core.tech",
  realm_name: "Genesis Corporation",
  realm_icon: "/user_avatars/2/realm/icon.png?version=2",
  realm_description: "<p>The coolest place in the universe.</p>",
  realm_web_public_access_enabled: false,
  meet_url: "https://meet.workspace.example.com",
  external_authentication_methods: [],
  realm_uri: "https://zulip.genesis-core.tech",
  ignored_parameters_unsupported: ["foo"],
};

function payloadKindOf(payload: unknown): string {
  if (typeof payload !== "object" || payload == null) return "";
  const { kind } = payload as { kind?: unknown };
  return typeof kind === "string" ? kind : "";
}

function eventActionFromKind(kind: string): WorkspaceMessengerEventAction {
  if (kind.endsWith(".updated")) return "updated";
  if (kind.endsWith(".deleted")) return "deleted";
  if (kind.endsWith(".read")) return "read";
  return "created";
}

function eventObjectTypeFromKind(kind: string): WorkspaceMessengerEventObjectType {
  if (kind.startsWith("message_reaction.")) return "message_reaction";
  if (kind === "messages.read") return "message";
  if (kind.startsWith("message.")) return "message";
  if (kind.startsWith("stream_bindings.")) return "stream_binding";
  if (kind.startsWith("stream.")) return "stream";
  if (kind.startsWith("topic.")) return "topic";
  if (kind.startsWith("folder_item.")) return "folder_item";
  if (kind.startsWith("folder.")) return "folder";
  return "user";
}

function eventDto(payload: unknown) {
  const kind = payloadKindOf(payload);
  return {
    schema_version: 1,
    epoch_version: 124,
    uuid: EVENT_UUID,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: eventObjectTypeFromKind(kind),
    action: eventActionFromKind(kind),
    payload,
    created_at: DATE,
    updated_at: DATE,
  };
}

describe("Workspace messenger DTO guards", () => {
  it("accepts resource DTOs from the backend contract", () => {
    expect(isWorkspaceMessengerStreamDto(streamDto)).toBe(true);
    expect(isWorkspaceMessengerStreamBindingDto(streamBindingDto)).toBe(true);
    expect(isWorkspaceMessengerTopicDto(topicDto)).toBe(true);
    expect(isWorkspaceMessengerMessageDto(messageDto)).toBe(true);
    expect(isWorkspaceMessengerMessageReactionDto(reactionDto)).toBe(true);
    expect(isWorkspaceMessengerFolderDto(folderDto)).toBe(true);
    expect(isWorkspaceMessengerUserDto(userDto)).toBe(true);
    expect(isWorkspaceMessengerServerSettingsDto(serverSettingsDto)).toBe(true);
    expect(
      isWorkspaceMessengerEpochDto({
        epoch_version: 124,
        epoch_generation: "generation-a",
        current_epoch_version: 124,
        minimum_epoch_version: 1,
      }),
    ).toBe(true);
  });

  it("keeps a user valid when the avatar is missing or uses an unknown format", () => {
    expect(isWorkspaceMessengerUserDto({ ...userDto, avatar: undefined })).toBe(true);
    expect(
      isWorkspaceMessengerUserDto({
        ...userDto,
        avatar: "urn:gravatar:eb7767d8c30c3ec0b6a155b77b7a6b7d",
      }),
    ).toBe(true);
  });

  it("validates message reaction aggregates and reaction rows", () => {
    expect(isWorkspaceMessengerReactionAggregate({ thumbs_up: 2, eyes: 0 })).toBe(true);
    expect(isWorkspaceMessengerReactionAggregate({ "": 1 })).toBe(false);
    expect(isWorkspaceMessengerReactionAggregate({ "   ": 1 })).toBe(false);
    expect(isWorkspaceMessengerReactionAggregate({ thumbs_up: -1 })).toBe(false);
    expect(isWorkspaceMessengerReactionAggregate({ thumbs_up: 1.2 })).toBe(false);
    expect(isWorkspaceMessengerReactionAggregate({ thumbs_up: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
    expect(isWorkspaceMessengerReactionAggregate(["thumbs_up"])).toBe(false);
    expect(isWorkspaceMessengerReactionAggregate(new Map([["thumbs_up", 1]]))).toBe(false);

    expect(isWorkspaceMessengerMessageReactionDto(reactionDto)).toBe(true);
    expect(isWorkspaceMessengerMessageReactionDto({ ...reactionDto, emoji_name: "" })).toBe(false);
    expect(isWorkspaceMessengerMessageReactionDto({ ...reactionDto, user_uuid: 42 })).toBe(false);
  });

  it("accepts system folder payloads with folder item parent alias", () => {
    expect(
      isWorkspaceMessengerFolderDto({
        uuid: "00000000-0000-0000-0000-000000000000",
        created_at: "2000-01-01T00:00:00.000000Z",
        updated_at: "2000-01-01T00:00:00.000000Z",
        title: "All chats",
        background_color_value: 11184810,
        system_type: "all",
        unread_count: 3,
        folder_items: [
          {
            uuid: FOLDER_ITEM_UUID,
            folder: "00000000-0000-0000-0000-000000000000",
            project_id: PROJECT_UUID,
            user_uuid: USER_UUID,
            stream_uuid: STREAM_UUID,
            order_index: null,
            pinned_at: null,
            chat_type: "stream",
            unread_count: 3,
            created_at: "2000-01-01T00:00:00",
            updated_at: "2000-01-01T00:00:00",
          },
        ],
      }),
    ).toBe(true);

    expect(
      isWorkspaceMessengerFolderDto({
        uuid: "00000000-0000-0000-0000-000000000002",
        created_at: "2000-01-01T00:00:02.000000Z",
        updated_at: "2000-01-01T00:00:02.000000Z",
        title: "Channels",
        system_type: "all",
        unread_count: 3,
        folder_items: [
          {
            uuid: FOLDER_ITEM_UUID,
            folder: "00000000-0000-0000-0000-000000000002",
            project_id: PROJECT_UUID,
            user_uuid: USER_UUID,
            stream_uuid: STREAM_UUID,
            order_index: null,
            pinned_at: null,
            chat_type: "stream",
            unread_count: 3,
            created_at: "2000-01-01T00:00:02",
            updated_at: "2000-01-01T00:00:02",
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts user payloads without first and last name when username is present", () => {
    expect(
      isWorkspaceMessengerUserDto({
        uuid: USER_UUID,
        username: "test3",
        source: "iam",
        avatar: `urn:gavatar:${USER_UUID}`,
        status: "active",
        status_emoji: null,
        status_text: "Focus",
        email: "test3@example.com",
        last_ping_at: DATE,
        created_at: DATE,
        updated_at: DATE,
      }),
    ).toBe(true);
  });

  it("accepts users synchronized from Zulip", () => {
    expect(
      isWorkspaceMessengerUserDto({
        uuid: USER_UUID,
        username: "Slon",
        source: "zulip",
        avatar: `urn:gavatar:${USER_UUID}`,
        status: "offline",
        email: "slon@example.com",
        last_ping_at: DATE,
        created_at: DATE,
        updated_at: DATE,
      }),
    ).toBe(true);
  });

  it("accepts user payloads without optional custom status fields", () => {
    expect(
      isWorkspaceMessengerUserDto({
        uuid: USER_UUID,
        username: "test4",
        source: "iam",
        avatar: `urn:gavatar:${USER_UUID}`,
        status: "active",
        email: "test4@example.com",
        last_ping_at: DATE,
        created_at: DATE,
        updated_at: DATE,
      }),
    ).toBe(true);
  });

  it("accepts system user payloads without email", () => {
    expect(
      isWorkspaceMessengerUserDto({
        uuid: "00000000-0000-0000-0000-000000000000",
        username: "system-00000000-0000-0000-0000-000000000000",
        source: "iam",
        avatar: "urn:gavatar:00000000-0000-0000-0000-000000000000",
        status: "offline",
        last_ping_at: "2026-07-08T06:03:22.232694Z",
        created_at: "2000-01-01T00:00:00.000000Z",
        updated_at: "2000-01-01T00:00:00.000000Z",
      }),
    ).toBe(true);
  });

  it("rejects user payloads without a non-empty username", () => {
    expect(
      isWorkspaceMessengerUserDto({
        uuid: USER_UUID,
        username: "",
        source: "iam",
        avatar: `urn:gavatar:${USER_UUID}`,
        status: "active",
        status_emoji: null,
        status_text: null,
        email: "test3@example.com",
        last_ping_at: DATE,
        created_at: DATE,
        updated_at: DATE,
      }),
    ).toBe(false);
  });

  it("requires user presence status and last ping timestamp", () => {
    const userDto = {
      uuid: USER_UUID,
      username: "test3",
      source: "iam",
      avatar: `urn:gavatar:${USER_UUID}`,
      status: "active",
      status_emoji: null,
      status_text: null,
      email: "test3@example.com",
      last_ping_at: DATE,
      created_at: DATE,
      updated_at: DATE,
    };

    expect(isWorkspaceMessengerUserDto(userDto)).toBe(true);
    expect(isWorkspaceMessengerUserDto({ ...userDto, status_emoji: undefined })).toBe(true);
    expect(isWorkspaceMessengerUserDto({ ...userDto, status_emoji: 123 })).toBe(false);
    expect(isWorkspaceMessengerUserDto({ ...userDto, status_text: undefined })).toBe(true);
    expect(isWorkspaceMessengerUserDto({ ...userDto, status_text: { text: "Focus" } })).toBe(false);
    expect(isWorkspaceMessengerUserDto({ ...userDto, last_ping_at: undefined })).toBe(false);
    expect(isWorkspaceMessengerUserDto({ ...userDto, last_ping_at: null })).toBe(false);
  });

  it("accepts folder items when mutation responses omit nullable fields", () => {
    expect(
      isWorkspaceMessengerFolderDto({
        ...folderDto,
        folder_items: [
          {
            uuid: FOLDER_ITEM_UUID,
            project_id: PROJECT_UUID,
            folder_uuid: FOLDER_UUID,
            user_uuid: USER_UUID,
            stream_uuid: STREAM_UUID,
            chat_type: "stream",
            unread_count: 0,
            created_at: DATE,
            updated_at: DATE,
          },
        ],
      }),
    ).toBe(true);
  });

  it("requires stream notification mode, archive flag, and source shape", () => {
    expect(isWorkspaceMessengerStreamDto({ ...streamDto, notification_mode: undefined })).toBe(
      false,
    );
    expect(isWorkspaceMessengerStreamDto({ ...streamDto, is_archived: undefined })).toBe(false);
    expect(isWorkspaceMessengerStreamDto({ ...streamDto, direct_user_uuid: undefined })).toBe(true);
    expect(isWorkspaceMessengerStreamDto({ ...streamDto, last_message_uuid: undefined })).toBe(
      true,
    );
    expect(isWorkspaceMessengerStreamDto({ ...streamDto, last_message_uuid: null })).toBe(true);
    expect(isWorkspaceMessengerStreamDto({ ...streamDto, last_message_uuid: MESSAGE_UUID })).toBe(
      true,
    );
    expect(isWorkspaceMessengerStreamDto({ ...streamDto, last_message_uuid: "bad" })).toBe(false);
    expect(
      isWorkspaceMessengerStreamDto({
        ...streamDto,
        source_name: "zulip",
        source: { kind: "zulip", stream_id: 123 },
      }),
    ).toBe(true);
    expect(
      isWorkspaceMessengerStreamDto({
        ...streamDto,
        source_name: "zulip",
        source: { kind: "zulip", stream_id: "123" },
      }),
    ).toBe(false);
  });

  it("accepts optional topic last message uuid", () => {
    expect(isWorkspaceMessengerTopicDto({ ...topicDto, last_message_uuid: undefined })).toBe(true);
    expect(isWorkspaceMessengerTopicDto({ ...topicDto, last_message_uuid: null })).toBe(true);
    expect(isWorkspaceMessengerTopicDto({ ...topicDto, last_message_uuid: MESSAGE_UUID })).toBe(
      true,
    );
    expect(isWorkspaceMessengerTopicDto({ ...topicDto, last_message_uuid: "bad" })).toBe(false);
  });

  it("accepts all documented raw REST outbox payload kinds", () => {
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "stream.created", ...streamDto }))).toBe(
      true,
    );
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "stream.updated", ...streamDto }))).toBe(
      true,
    );
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "stream.read", ...streamDto }))).toBe(
      true,
    );
    expect(
      isWorkspaceMessengerEventDto(eventDto({ kind: "stream.deleted", uuid: STREAM_UUID })),
    ).toBe(true);
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({
          kind: "stream_bindings.created",
          uuid: STREAM_UUID,
          items: [streamBindingDto],
        }),
      ),
    ).toBe(true);
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "topic.created", ...topicDto }))).toBe(
      true,
    );
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "topic.updated", ...topicDto }))).toBe(
      true,
    );
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "topic.read", ...topicDto }))).toBe(true);
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({ kind: "topic.deleted", uuid: TOPIC_UUID, stream_uuid: STREAM_UUID }),
      ),
    ).toBe(true);
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "message.created", ...messageDto }))).toBe(
      true,
    );
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "message.updated", ...messageDto }))).toBe(
      true,
    );
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "message.read", ...messageDto }))).toBe(
      true,
    );
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({
          kind: "messages.read",
          project_id: PROJECT_UUID,
          message_uuids: [MESSAGE_UUID],
        }),
      ),
    ).toBe(true);
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({
          kind: "message_reaction.created",
          ...reactionEventPayloadDto,
        }),
      ),
    ).toBe(true);
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({
          kind: "message_reaction.updated",
          ...reactionEventPayloadDto,
          old_message_uuid: MESSAGE_UUID,
          old_emoji_name: "eyes",
          old_source_name: "native",
          old_source: { kind: "native" },
        }),
      ),
    ).toBe(true);
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({
          kind: "message_reaction.deleted",
          ...reactionEventPayloadDto,
        }),
      ),
    ).toBe(true);
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({
          kind: "message.deleted",
          uuid: MESSAGE_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
        }),
      ),
    ).toBe(true);
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "folder.created", ...folderDto }))).toBe(
      true,
    );
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "folder.updated", ...folderDto }))).toBe(
      true,
    );
    expect(
      isWorkspaceMessengerEventDto(eventDto({ kind: "folder.deleted", uuid: FOLDER_UUID })),
    ).toBe(true);
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({ kind: "folder_item.deleted", uuid: FOLDER_ITEM_UUID }),
      ),
    ).toBe(true);
    expect(isWorkspaceMessengerEventDto(eventDto({ kind: "user.updated", ...userDto }))).toBe(true);
  });

  it("rejects incomplete delete payloads and unknown message payloads", () => {
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({ kind: "message.deleted", uuid: MESSAGE_UUID, stream_uuid: STREAM_UUID }),
      ),
    ).toBe(false);
    expect(
      isWorkspaceMessengerEventDto(eventDto({ kind: "topic.deleted", uuid: TOPIC_UUID })),
    ).toBe(false);
    expect(
      isWorkspaceMessengerMessageDto({
        ...messageDto,
        payload: { kind: "html", content: "<strong>no</strong>" },
      }),
    ).toBe(false);
    expect(isWorkspaceMessengerMessageDto({ ...messageDto, reactions: undefined })).toBe(false);
    expect(
      isWorkspaceMessengerMessageDto({
        ...messageDto,
        reactions: {
          thumbs_up: -1,
        },
      }),
    ).toBe(false);
  });

  it("rejects events with mismatched metadata and payload kind", () => {
    const messageEvent = eventDto({ kind: "message.updated", ...messageDto });
    expect(isWorkspaceMessengerEventDto({ ...messageEvent, action: "created" })).toBe(false);
    expect(isWorkspaceMessengerEventDto({ ...messageEvent, object_type: "stream" })).toBe(false);
    expect(isWorkspaceMessengerRawEventDto({ ...messageEvent, action: "created" })).toBe(true);
    expect(isWorkspaceMessengerRealtimeEventDto({ ...messageEvent, action: "created" })).toBe(true);

    const legacyReadEvent = eventDto({
      kind: "messages.read",
      project_id: PROJECT_UUID,
      message_uuids: [MESSAGE_UUID],
    });
    expect(isWorkspaceMessengerEventDto({ ...legacyReadEvent, action: "updated" })).toBe(false);
  });

  it("accepts unappliable flat event envelopes for realtime cursor skipping", () => {
    const unknownSchemaEvent = {
      ...eventDto({ kind: "message.updated", ...messageDto }),
      schema_version: 2,
    };
    const unknownObjectEvent = {
      ...eventDto({
        kind: "workspace_widget.refreshed",
        uuid: "bb2ac71e-85ed-45d6-87da-89f9f0bcc523",
      }),
      object_type: "workspace_widget",
      action: "refreshed",
    };
    const malformedKnownEvent = {
      ...eventDto({
        kind: "message.deleted",
        uuid: MESSAGE_UUID,
        stream_uuid: STREAM_UUID,
      }),
    };

    expect(isWorkspaceMessengerEventDto(unknownSchemaEvent)).toBe(false);
    expect(isWorkspaceMessengerRawEventDto(unknownSchemaEvent)).toBe(true);
    expect(isWorkspaceMessengerRealtimeEventDto(unknownSchemaEvent)).toBe(true);
    expect(isWorkspaceMessengerEventDto(unknownObjectEvent)).toBe(false);
    expect(isWorkspaceMessengerRawEventDto(unknownObjectEvent)).toBe(true);
    expect(isWorkspaceMessengerRealtimeEventDto(unknownObjectEvent)).toBe(true);
    expect(isWorkspaceMessengerRawEventDto(malformedKnownEvent)).toBe(true);
    expect(isWorkspaceMessengerRealtimeEventDto(malformedKnownEvent)).toBe(true);

    const zulipUserEvent = {
      ...eventDto({ kind: "user.updated", ...userDto }),
      payload: { kind: "user.updated" as const, ...userDto, source: "zulip" as const },
    };
    expect(isWorkspaceMessengerEventDto(zulipUserEvent)).toBe(true);
    expect(isWorkspaceMessengerRawEventDto(zulipUserEvent)).toBe(true);
    expect(isWorkspaceMessengerRealtimeEventDto(zulipUserEvent)).toBe(true);
  });

  it("accepts dispatch-ready realtime events and websocket frames", () => {
    const messageCreatedEvent = {
      epoch_version: 125,
      type: "message",
      message: messageDto,
    };
    const folderDeletedEvent = {
      epoch_version: 126,
      type: "folder",
      kind: "folder.deleted",
      folder: { uuid: FOLDER_UUID },
    };
    const userUpdatedEvent = {
      epoch_version: 127,
      type: "user",
      kind: "user.updated",
      user: userDto,
    };

    expect(isWorkspaceRealtimeEvent(messageCreatedEvent)).toBe(true);
    expect(isWorkspaceRealtimeEvent(folderDeletedEvent)).toBe(true);
    expect(isWorkspaceRealtimeEvent(userUpdatedEvent)).toBe(true);
    expect(
      isWorkspaceMessengerWebSocketFrameDto(eventDto({ kind: "message.created", ...messageDto })),
    ).toBe(true);
    expect(
      isWorkspaceMessengerWebSocketFrameDto({
        type: "ready",
        epoch_generation: "generation-a",
        epoch_version: 124,
      }),
    ).toBe(true);
    expect(
      isWorkspaceMessengerWebSocketFrameDto({
        type: "error",
        code: 410,
        error: "epoch_pruned",
        message: "The saved events cursor is outside the retained event journal",
        reason: "epoch_pruned",
        epoch_generation: "generation-a",
        current_epoch_version: 124,
        minimum_epoch_version: 1,
      }),
    ).toBe(true);
  });

  it("rejects unsupported event kinds and websocket frames", () => {
    expect(
      isWorkspaceMessengerEventDto(
        eventDto({
          kind: "reaction.created",
          uuid: MESSAGE_UUID,
        }),
      ),
    ).toBe(false);
    expect(
      isWorkspaceMessengerWebSocketFrameDto({
        type: "event",
        event: {
          epoch_version: 127,
          type: "message",
          kind: "message.deleted",
          message: { uuid: MESSAGE_UUID, stream_uuid: STREAM_UUID },
        },
      }),
    ).toBe(false);
    expect(
      isWorkspaceMessengerWebSocketFrameDto({
        type: "event",
        event: {
          epoch_version: 128,
          type: "user",
          kind: "user.updated",
          user: { ...userDto, status: "busy" },
        },
      }),
    ).toBe(false);
  });
});
