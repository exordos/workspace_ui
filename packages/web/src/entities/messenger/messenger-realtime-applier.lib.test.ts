import { beforeEach, describe, expect, it } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import type {
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { createMessengerRealtimeActiveApplier } from "./messenger-realtime-applier.lib";
import { selectMessengerFolders, useMessengerStore } from "./messenger.model";

const ACCOUNT_A = "account-a";
const INSTANCE_A = "instance-a";
const ORGANIZATION_A = "organization-a";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const USER_A = "11111111-1111-4111-8111-111111111111";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_BINDING_A = "ea4364f4-96e3-4b33-b80d-fd53e5697151";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const FOLDER_A = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const DATE = "2026-06-22T10:10:00Z";

function createOwner(overrides: Partial<WorkspaceRealtimeRuntimeOwner> = {}) {
  return {
    accountId: ACCOUNT_A,
    instanceId: INSTANCE_A,
    organizationId: ORGANIZATION_A,
    projectId: PROJECT_A,
    userUuid: USER_A,
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createContext(
  owner = createOwner(),
  overrides: Partial<WorkspaceRealtimeEventContext> = {},
): WorkspaceRealtimeEventContext {
  return {
    owner,
    ownerKey: workspaceRuntimeOwnerKey(owner),
    surface: "active",
    source: "websocket",
    ...overrides,
  };
}

function createStreamDto(
  overrides: Partial<WorkspaceMessengerStreamDto> = {},
): WorkspaceMessengerStreamDto {
  return {
    uuid: STREAM_A,
    name: "Engineering",
    description: "Engineering workspace",
    project_id: PROJECT_A,
    owner: USER_A,
    user_uuid: USER_A,
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
    ...overrides,
  };
}

function createStreamBindingDto(
  overrides: Partial<WorkspaceMessengerStreamBindingDto> = {},
): WorkspaceMessengerStreamBindingDto {
  return {
    uuid: STREAM_BINDING_A,
    project_id: PROJECT_A,
    stream_uuid: STREAM_A,
    user_uuid: USER_A,
    who_uuid: USER_A,
    role: "owner",
    notification_mode: "all_messages",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createTopicDto(
  overrides: Partial<WorkspaceMessengerTopicDto> = {},
): WorkspaceMessengerTopicDto {
  return {
    uuid: TOPIC_A,
    project_id: PROJECT_A,
    name: "Releases",
    stream_uuid: STREAM_A,
    user_uuid: USER_A,
    unread_count: 2,
    is_default: false,
    is_done: false,
    notification_mode: "default",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createMessageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_A,
    project_id: PROJECT_A,
    stream_uuid: STREAM_A,
    topic_uuid: TOPIC_A,
    author_uuid: USER_A,
    payload: {
      kind: "markdown",
      content: "Hello, workspace",
    },
    user_uuid: USER_A,
    read: true,
    pinned: false,
    starred: false,
    is_own: true,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createFolderDto(
  overrides: Partial<WorkspaceMessengerFolderDto> = {},
): WorkspaceMessengerFolderDto {
  return {
    uuid: FOLDER_A,
    project_id: PROJECT_A,
    user_uuid: USER_A,
    title: "Inbox",
    background_color_value: null,
    unread_count: 3,
    system_type: "created",
    folder_items: [
      {
        uuid: FOLDER_ITEM_A,
        project_id: PROJECT_A,
        folder_uuid: FOLDER_A,
        user_uuid: USER_A,
        stream_uuid: STREAM_A,
        chat_type: "stream",
        order_index: 10,
        pinned_at: null,
        unread_count: 3,
        created_at: DATE,
        updated_at: DATE,
      },
    ],
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

describe("messenger realtime active applier", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
  });

  it("applies message created, updated, and deleted events", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        kind: "message.updated",
        message: createMessageDto({
          payload: { kind: "markdown", content: "Edited workspace message" },
          updated_at: "2026-06-22T10:20:00Z",
        }),
      },
      context,
    );

    expect(useMessengerStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        markdown: "Edited workspace message",
        updatedAt: "2026-06-22T10:20:00Z",
      }),
    );
    expect(useMessengerStore.getState().lastEpochVersion).toBe(12);

    applier.applyEvent(
      {
        epoch_version: 13,
        type: "message",
        kind: "message.deleted",
        message: {
          uuid: MESSAGE_A,
          stream_uuid: STREAM_A,
          topic_uuid: TOPIC_A,
        },
      },
      context,
    );

    expect(useMessengerStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(useMessengerStore.getState().lastEpochVersion).toBe(13);
  });

  it("skips unsupported active events without throwing", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "reaction",
        kind: "reaction.created",
      } as unknown as WorkspaceRealtimeEvent,
      context,
    );
    applier.skipEvent({ epoch_version: 22 }, "unsupported_event", context);

    expect(useMessengerStore.getState().skippedRealtimeEvents).toEqual([
      { epochVersion: 21, reason: "unsupported_event" },
      { epochVersion: 22, reason: "unsupported_event" },
    ]);
    expect(useMessengerStore.getState().lastEpochVersion).toBe(22);
  });

  it("does not write active skipped events when owner is stale", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier({
      isOwnerCurrent: () => false,
    });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 31,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );
    applier.skipEvent({ epoch_version: 32 }, "unsupported_event", context);

    expect(useMessengerStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(useMessengerStore.getState().skippedRealtimeEvents).toEqual([]);
    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
  });

  it("does not write background events to messenger store", () => {
    const context = createContext(createOwner(), { surface: "background" });
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 41,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto(),
      },
      context,
    );
    applier.skipEvent({ epoch_version: 42 }, "background_apply_deferred", context);

    expect(useMessengerStore.getState().streamIds).toEqual([]);
    expect(useMessengerStore.getState().skippedRealtimeEvents).toEqual([]);
    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
  });

  it("applies stream, binding, topic, folder, and delete skeleton mappings", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);

    applier.applyEvent(
      {
        epoch_version: 51,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto(),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 52,
        type: "stream_binding",
        kind: "stream_bindings.created",
        stream_uuid: STREAM_A,
        stream_bindings: [createStreamBindingDto()],
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 53,
        type: "topic",
        kind: "topic.created",
        topic: createTopicDto(),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 54,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto(),
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 55,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          name: "Engineering updates",
          unread_count: 4,
          updated_at: "2026-06-22T10:20:00Z",
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 56,
        type: "topic",
        kind: "topic.updated",
        topic: createTopicDto({
          name: "Release notes",
          is_done: true,
          updated_at: "2026-06-22T10:20:00Z",
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 57,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          title: "Pinned",
          unread_count: 3,
          updated_at: "2026-06-22T10:20:00Z",
        }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ name: "Engineering updates", unreadCount: 4 }),
    );
    expect(useMessengerStore.getState().streamBindingsById[STREAM_BINDING_A]).toEqual(
      expect.objectContaining({ streamUuid: STREAM_A }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ name: "Release notes", isDone: true }),
    );
    expect(selectMessengerFolders(useMessengerStore.getState())).toEqual([
      expect.objectContaining({
        uuid: FOLDER_A,
        title: "Pinned",
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A })],
      }),
    ]);

    applier.applyEvent(
      {
        epoch_version: 58,
        type: "folder_item",
        kind: "folder_item.deleted",
        folder_item: { uuid: FOLDER_ITEM_A },
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 59,
        type: "topic",
        kind: "topic.deleted",
        topic: { uuid: TOPIC_A, stream_uuid: STREAM_A },
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 60,
        type: "stream",
        kind: "stream.deleted",
        stream: { uuid: STREAM_A },
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 61,
        type: "folder",
        kind: "folder.deleted",
        folder: { uuid: FOLDER_A },
      },
      context,
    );

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toBeUndefined();
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toBeUndefined();
    expect(useMessengerStore.getState().streamsById[STREAM_A]).toBeUndefined();
    expect(useMessengerStore.getState().streamBindingsById[STREAM_BINDING_A]).toBeUndefined();
    expect(useMessengerStore.getState().lastEpochVersion).toBe(61);
  });
});
