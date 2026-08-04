import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import {
  workspaceMessengerMessageRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import type {
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import {
  getMessengerBackgroundProjectionSnapshot,
  selectMessengerBackgroundProjectionSnapshot,
  useMessengerBackgroundProjectionStore,
} from "./messenger-background-projection.model";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import { createMessengerRealtimeBackgroundApplier } from "./messenger-realtime-applier.lib";
import { useMessengerStore } from "./messenger.model";

const ACCOUNT_A = "account-a";
const INSTANCE_A = "instance-a";
const ORGANIZATION_A = "organization-a";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const USER_A = "11111111-1111-4111-8111-111111111111";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_B = "c1ec1406-f498-409d-a513-5b0e53ee4049";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const FOLDER_A = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_B = "b0af81f7-703c-486f-b23d-cf02083aec0a";
const FOLDER_C = "d88993ec-e109-4a98-bdd1-8ba036374ee0";
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const FOLDER_ITEM_B = "5f5b9a9d-0e57-4775-849b-c8308f95a809";
const FOLDER_ITEM_C = "aee58fa0-8ab8-47ba-ae52-b504cfb383d9";
const FOLDER_ITEM_D = "33a78fcf-24df-45f7-9fc5-349b10014baf";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const DATE = "2026-06-22T10:10:00Z";
const DATE_LATER = "2026-06-22T10:15:00Z";
const MESSAGE_MARKDOWN = "Вот **короткий** [анонс](https://workspace.local/private?token=1)";
const MESSAGE_PREVIEW = "Вот короткий анонс";

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
    surface: "background",
    source: "websocket",
    notificationsEnabled: true,
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
      content: MESSAGE_MARKDOWN,
    },
    user_uuid: USER_A,
    read: false,
    pinned: false,
    starred: false,
    is_own: false,
    reactions: {},
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createStreamDto(
  overrides: Partial<WorkspaceMessengerStreamDto> = {},
): WorkspaceMessengerStreamDto {
  return {
    uuid: STREAM_A,
    name: "Release channel",
    description: "Private stream description must not be cached",
    project_id: PROJECT_A,
    owner: USER_A,
    user_uuid: USER_A,
    role: "member",
    notification_mode: "all_messages",
    unread_count: 5,
    active_unread_count: 5,
    passive_unread_count: 0,
    source_name: "native",
    source: { kind: "native" },
    invite_only: false,
    announce: false,
    private: false,
    is_archived: false,
    direct_user_uuid: null,
    last_message_uuid: MESSAGE_A,
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
    name: "Weekly launch",
    stream_uuid: STREAM_A,
    user_uuid: USER_A,
    unread_count: 6,
    active_unread_count: 6,
    passive_unread_count: 0,
    is_default: false,
    is_done: false,
    notification_mode: "default",
    last_message_uuid: MESSAGE_A,
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
    unread_count: 7,
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
        active_unread_count: 3,
        passive_unread_count: 0,
        created_at: DATE,
        updated_at: DATE,
      },
      {
        uuid: FOLDER_ITEM_B,
        project_id: PROJECT_A,
        folder_uuid: FOLDER_A,
        user_uuid: USER_A,
        stream_uuid: STREAM_A,
        chat_type: "stream",
        order_index: 20,
        pinned_at: null,
        unread_count: 4,
        active_unread_count: 4,
        passive_unread_count: 0,
        created_at: DATE,
        updated_at: DATE,
      },
    ],
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createFolderItemDto(
  overrides: Partial<WorkspaceMessengerFolderItemDto> = {},
): WorkspaceMessengerFolderItemDto {
  return {
    uuid: FOLDER_ITEM_A,
    project_id: PROJECT_A,
    folder_uuid: FOLDER_A,
    user_uuid: USER_A,
    stream_uuid: STREAM_A,
    chat_type: "stream",
    order_index: 10,
    pinned_at: null,
    unread_count: 3,
    active_unread_count: 3,
    passive_unread_count: 0,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

describe("messenger background projection", () => {
  beforeEach(() => {
    useMessengerBackgroundProjectionStore.getState().clear();
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records message.created notification candidate with workspace preview and route data", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 9,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto({
          notification_mode: "mentions_only",
          private: true,
          direct_user_uuid: "33333333-3333-4333-8333-333333333333",
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 10,
        type: "topic",
        kind: "topic.created",
        topic: createTopicDto({ notification_mode: "follow" }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.notificationCandidates).toEqual([
      expect.objectContaining({
        ownerKey: context.ownerKey,
        organizationId: ORGANIZATION_A,
        projectId: PROJECT_A,
        epochVersion: 11,
        messageUuid: MESSAGE_A,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        authorUuid: USER_A,
        isOwn: false,
        read: false,
        createdAt: DATE,
        previewText: MESSAGE_PREVIEW,
        audience: "private",
        streamName: "Release channel",
        topicName: "Weekly launch",
        messageRoute: workspaceMessengerMessageRoute({
          orgId: ORGANIZATION_A,
          projectId: PROJECT_A,
          messageUuid: MESSAGE_A,
        }),
        streamRoute: workspaceMessengerStreamRoute({
          orgId: ORGANIZATION_A,
          projectId: PROJECT_A,
          streamUuid: STREAM_A,
        }),
        topicRoute: workspaceMessengerTopicRoute({
          orgId: ORGANIZATION_A,
          projectId: PROJECT_A,
          streamUuid: STREAM_A,
          topicUuid: TOPIC_A,
        }),
        streamConversationId: conversationIdForStream(STREAM_A),
        topicConversationId: conversationIdForTopic(STREAM_A, TOPIC_A),
        streamNotificationMode: "mentions_only",
        topicNotificationMode: "follow",
        hasCurrentUserMention: false,
        hasWildcardMention: false,
      }),
    ]);
    expect(projection?.messageIdSnapshotsById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        messageUuid: MESSAGE_A,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        read: false,
        deletedAt: null,
      }),
    );
    expect(JSON.stringify(projection)).not.toContain(MESSAGE_MARKDOWN);
    expect(JSON.stringify(projection)).not.toContain("https://workspace.local/private?token=1");
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
  });

  it("keeps message snapshots but suppresses notification candidates before realtime is ready", () => {
    const context = createContext(createOwner(), { notificationsEnabled: false });
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.messageIdSnapshotsById[MESSAGE_A]).toEqual(
      expect.objectContaining({ messageUuid: MESSAGE_A }),
    );
    expect(projection?.notificationCandidates).toEqual([]);
  });

  it.each([
    {
      label: "backfill with a closed gate",
      deliveryClass: "backfill" as const,
      notificationEligible: false,
    },
    {
      label: "backfill with a contradictory open gate",
      deliveryClass: "backfill" as const,
      notificationEligible: true,
    },
    {
      label: "live message accepted before the notification gate opened",
      deliveryClass: "live" as const,
      notificationEligible: false,
    },
  ])("keeps $label snapshots without creating notification candidates", (providerState) => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        message: createMessageDto({
          provider: {
            kind: "zulip",
            account_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            external_id: "message-42",
            capabilities: {},
            delivery_class: providerState.deliveryClass,
            notification_eligible: providerState.notificationEligible,
          },
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.messageIdSnapshotsById[MESSAGE_A]).toEqual(
      expect.objectContaining({ messageUuid: MESSAGE_A }),
    );
    expect(projection?.notificationCandidates).toEqual([]);
  });

  it("creates a candidate for eligible live and legacy provider messages", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        message: createMessageDto({
          provider: {
            kind: "zulip",
            account_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            external_id: "message-42",
            capabilities: {},
            delivery_class: "live",
            notification_eligible: true,
          },
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 13,
        type: "message",
        message: createMessageDto({
          uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          provider: {
            kind: "zulip",
            account_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            external_id: "message-43",
            capabilities: {},
          },
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.notificationCandidates).toEqual([
      expect.objectContaining({
        messageUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        notificationEligible: true,
        liveEffectPolicyReason: "legacy_provider",
      }),
      expect.objectContaining({
        messageUuid: MESSAGE_A,
        notificationEligible: true,
        liveEffectPolicyReason: "live",
      }),
    ]);
  });

  it("keeps notification names and modes null when message arrives before stream and topic snapshots", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.notificationCandidates).toEqual([
      expect.objectContaining({
        messageUuid: MESSAGE_A,
        audience: "unknown",
        streamName: null,
        topicName: null,
        streamNotificationMode: null,
        topicNotificationMode: null,
      }),
    ]);
  });

  it("stores precomputed notification mention flags without keeping full markdown", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({
          payload: {
            kind: "markdown",
            content: `Привет <@${USER_A}> и @everyone`,
          },
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.notificationCandidates).toEqual([
      expect.objectContaining({
        messageUuid: MESSAGE_A,
        hasCurrentUserMention: true,
        hasWildcardMention: true,
      }),
    ]);
    expect(JSON.stringify(projection)).not.toContain(`<@${USER_A}>`);
  });

  it("uses the backend mention flag instead of re-parsing markdown when it is present", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({
          mentioned: false,
          payload: {
            kind: "markdown",
            content: `Привет <@${USER_A}>`,
          },
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.notificationCandidates).toEqual([
      expect.objectContaining({
        messageUuid: MESSAGE_A,
        hasCurrentUserMention: false,
      }),
    ]);
  });

  it("does not guess current-user mention from plain display text in background mode", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({
          payload: {
            kind: "markdown",
            content: "Пинг @alice",
          },
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.notificationCandidates).toEqual([
      expect.objectContaining({
        messageUuid: MESSAGE_A,
        hasCurrentUserMention: false,
        hasWildcardMention: false,
      }),
    ]);
  });

  it("records folder unread counters from folder snapshot", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto(),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.lastEpochVersion).toBe(21);
    expect(projection?.unreadByFolderId).toEqual({ [FOLDER_A]: 7 });
    expect(projection?.unreadByFolderItemId).toEqual({
      [FOLDER_ITEM_A]: 3,
      [FOLDER_ITEM_B]: 4,
    });
    expect(projection?.folderSnapshotsById[FOLDER_A]).toEqual(
      expect.objectContaining({
        folderUuid: FOLDER_A,
        unreadCount: 7,
        folderItemIds: [FOLDER_ITEM_A, FOLDER_ITEM_B],
      }),
    );
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_A]).toEqual(
      expect.objectContaining({
        folderItemUuid: FOLDER_ITEM_A,
        folderUuid: FOLDER_A,
        streamUuid: STREAM_A,
        unreadCount: 3,
      }),
    );
  });

  it("projects stream unread snapshots into matching background folder items and totals", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          unread_count: 7,
          folder_items: [
            createFolderItemDto(),
            createFolderItemDto({
              uuid: FOLDER_ITEM_B,
              stream_uuid: STREAM_B,
              unread_count: 4,
              active_unread_count: 4,
              passive_unread_count: 0,
            }),
          ],
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 22,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          uuid: FOLDER_B,
          unread_count: 2,
          folder_items: [
            createFolderItemDto({
              uuid: FOLDER_ITEM_C,
              folder_uuid: FOLDER_B,
              unread_count: 2,
              active_unread_count: 2,
              passive_unread_count: 0,
            }),
          ],
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 23,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          uuid: FOLDER_C,
          unread_count: 6,
          folder_items: [
            createFolderItemDto({
              uuid: FOLDER_ITEM_D,
              folder_uuid: FOLDER_C,
              stream_uuid: STREAM_B,
              unread_count: 6,
              active_unread_count: 6,
              passive_unread_count: 0,
            }),
          ],
        }),
      },
      context,
    );

    const before =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    const unaffectedFolder = before?.folderSnapshotsById[FOLDER_C];
    const unaffectedItem = before?.folderItemSnapshotsById[FOLDER_ITEM_D];

    applier.applyEvent(
      {
        epoch_version: 24,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          unread_count: 8,
          active_unread_count: 8,
          passive_unread_count: 0,
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.unreadByFolderItemId).toEqual({
      [FOLDER_ITEM_A]: 8,
      [FOLDER_ITEM_B]: 4,
      [FOLDER_ITEM_C]: 8,
      [FOLDER_ITEM_D]: 6,
    });
    expect(projection?.unreadByFolderId).toEqual({
      [FOLDER_A]: 12,
      [FOLDER_B]: 8,
      [FOLDER_C]: 6,
    });
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_A]?.unreadCount).toBe(8);
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_C]?.unreadCount).toBe(8);
    expect(projection?.folderSnapshotsById[FOLDER_A]?.unreadCount).toBe(12);
    expect(projection?.folderSnapshotsById[FOLDER_B]?.unreadCount).toBe(8);
    expect(projection?.folderSnapshotsById[FOLDER_C]).toBe(unaffectedFolder);
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_D]).toBe(unaffectedItem);

    const matchingFolder = projection?.folderSnapshotsById[FOLDER_A];
    const matchingItem = projection?.folderItemSnapshotsById[FOLDER_ITEM_A];
    applier.applyEvent(
      {
        epoch_version: 25,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          unread_count: 8,
          active_unread_count: 8,
          passive_unread_count: 0,
        }),
      },
      context,
    );
    const repeatedProjection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(repeatedProjection?.folderSnapshotsById[FOLDER_A]).toBe(matchingFolder);
    expect(repeatedProjection?.folderItemSnapshotsById[FOLDER_ITEM_A]).toBe(matchingItem);
  });

  it("does not create background folder state from a stream snapshot alone", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({ unread_count: 8 }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.folderSnapshotsById).toEqual({});
    expect(projection?.folderItemSnapshotsById).toEqual({});
    expect(projection?.unreadByFolderId).toEqual({});
    expect(projection?.unreadByFolderItemId).toEqual({});
  });

  it("projects active stream unread into folder totals while preserving passive unread", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          unread_count: 2,
          folder_items: [
            createFolderItemDto({
              unread_count: 7,
              active_unread_count: 2,
              passive_unread_count: 5,
            }),
          ],
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 22,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          unread_count: 9,
          active_unread_count: 3,
          passive_unread_count: 6,
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.unreadByFolderItemId[FOLDER_ITEM_A]).toBe(3);
    expect(projection?.unreadByFolderId[FOLDER_A]).toBe(3);
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_A]).toMatchObject({
      unreadCount: 9,
      activeUnreadCount: 3,
      passiveUnreadCount: 6,
    });
  });

  it("projects a zero stream unread count into existing background folder state", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          unread_count: 7,
          folder_items: [
            createFolderItemDto(),
            createFolderItemDto({
              uuid: FOLDER_ITEM_B,
              stream_uuid: STREAM_B,
              unread_count: 4,
              active_unread_count: 4,
              passive_unread_count: 0,
            }),
          ],
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 22,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          unread_count: 0,
          active_unread_count: 0,
          passive_unread_count: 0,
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.unreadByFolderItemId).toEqual({
      [FOLDER_ITEM_A]: 0,
      [FOLDER_ITEM_B]: 4,
    });
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_A]?.unreadCount).toBe(0);
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_B]?.unreadCount).toBe(4);
    expect(projection?.unreadByFolderId[FOLDER_A]).toBe(4);
    expect(projection?.folderSnapshotsById[FOLDER_A]?.unreadCount).toBe(4);
  });

  it("keeps unread topology after lightweight snapshots expire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T08:00:00Z"));
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          unread_count: 3,
          folder_items: [
            createFolderItemDto({
              unread_count: 3,
              active_unread_count: 3,
              passive_unread_count: 0,
            }),
          ],
        }),
      },
      context,
    );

    vi.advanceTimersByTime(31 * 60 * 1000);
    applier.applyEvent(
      {
        epoch_version: 22,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          unread_count: 0,
          active_unread_count: 0,
          passive_unread_count: 0,
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.folderSnapshotsById).toEqual({});
    expect(projection?.folderItemSnapshotsById).toEqual({});
    expect(projection?.folderItemTopologyById[FOLDER_ITEM_A]).toEqual({
      streamUuid: STREAM_A,
      folderUuid: FOLDER_A,
    });
    expect(projection?.unreadByFolderItemId[FOLDER_ITEM_A]).toBe(0);
    expect(projection?.unreadByFolderId[FOLDER_A]).toBe(0);

    const unreadByFolderId = projection?.unreadByFolderId;
    const unreadByFolderItemId = projection?.unreadByFolderItemId;
    applier.applyEvent(
      {
        epoch_version: 23,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          unread_count: 0,
          active_unread_count: 0,
          passive_unread_count: 0,
        }),
      },
      context,
    );
    const repeatedProjection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(repeatedProjection?.unreadByFolderId).toBe(unreadByFolderId);
    expect(repeatedProjection?.unreadByFolderItemId).toBe(unreadByFolderItemId);
  });

  it("keeps complete unread totals when lightweight item snapshots are capped", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();
    const folderItems = Array.from({ length: 201 }, (_, index) =>
      createFolderItemDto({
        uuid: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        stream_uuid: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        unread_count: 1,
        active_unread_count: 1,
        passive_unread_count: 0,
      }),
    );
    const lastItem = folderItems[200];
    if (lastItem == null) throw new Error("Expected the last folder item");

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          unread_count: 201,
          folder_items: folderItems,
        }),
      },
      context,
    );

    const compactedProjection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(Object.keys(compactedProjection?.folderItemSnapshotsById ?? {})).toHaveLength(200);
    expect(Object.keys(compactedProjection?.folderItemTopologyById ?? {})).toHaveLength(201);

    applier.applyEvent(
      {
        epoch_version: 22,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          uuid: lastItem.stream_uuid,
          unread_count: 5,
          active_unread_count: 5,
          passive_unread_count: 0,
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.unreadByFolderItemId[lastItem.uuid]).toBe(5);
    expect(projection?.unreadByFolderId[FOLDER_A]).toBe(205);
  });

  it("stores lightweight stream topic folder and message snapshots without PII fields", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 31,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto(),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 32,
        type: "topic",
        kind: "topic.created",
        topic: createTopicDto(),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 33,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto({ title: "Private folder title must not be cached" }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 34,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    const projection = selectMessengerBackgroundProjectionSnapshot(
      useMessengerBackgroundProjectionStore.getState(),
      context.ownerKey,
    );

    expect(projection?.streamSnapshotsById[STREAM_A]).toEqual(
      expect.objectContaining({
        streamUuid: STREAM_A,
        streamName: "Release channel",
        unreadCount: 5,
        isPrivate: false,
        lastMessageUuid: MESSAGE_A,
      }),
    );
    expect(projection?.topicSnapshotsById[TOPIC_A]).toEqual(
      expect.objectContaining({
        topicUuid: TOPIC_A,
        streamUuid: STREAM_A,
        topicName: "Weekly launch",
        unreadCount: 6,
      }),
    );
    expect(projection?.folderSnapshotsById[FOLDER_A]).toEqual(
      expect.objectContaining({
        folderUuid: FOLDER_A,
        unreadCount: 7,
      }),
    );
    expect(getMessengerBackgroundProjectionSnapshot(context.ownerKey)).toBe(projection);

    const serializedProjection = JSON.stringify(projection);
    expect(serializedProjection).toContain(MESSAGE_PREVIEW);
    expect(serializedProjection).toContain("Release channel");
    expect(serializedProjection).toContain("Weekly launch");
    expect(serializedProjection).not.toContain(MESSAGE_MARKDOWN);
    expect(serializedProjection).not.toContain("https://workspace.local/private?token=1");
    expect(serializedProjection).not.toContain("Private stream description");
    expect(serializedProjection).not.toContain("Private folder title");
  });

  it("records unsupported and skipped diagnostics as a bounded list", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      { epoch_version: 1, type: "unknown" } as unknown as WorkspaceRealtimeEvent,
      context,
    );
    for (let epochVersion = 2; epochVersion <= 56; epochVersion++) {
      applier.skipEvent({ epoch_version: epochVersion }, "unsupported_event", context);
    }

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.skippedEvents).toHaveLength(50);
    expect(projection?.skippedEvents[0]).toEqual(
      expect.objectContaining({ epochVersion: 56, reason: "unsupported_event" }),
    );
    expect(projection?.skippedEvents.at(-1)).toEqual(
      expect.objectContaining({ epochVersion: 7, reason: "unsupported_event" }),
    );
  });

  it("keeps recent events candidates skipped events and snapshot ids bounded", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    for (let index = 0; index < 260; index++) {
      const suffix = index.toString(16).padStart(12, "0");
      applier.applyEvent(
        {
          epoch_version: index + 1,
          type: "message",
          message: createMessageDto({
            uuid: `00000000-0000-4000-8000-${suffix}`,
            payload: {
              kind: "markdown",
              content: `**private-body-${index}** [label-${index}](https://example.com/${index})`,
            },
          }),
        },
        context,
      );
    }

    for (let epochVersion = 261; epochVersion <= 330; epochVersion++) {
      applier.skipEvent({ epoch_version: epochVersion }, "unsupported_event", context);
    }

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.recentEvents).toHaveLength(50);
    expect(projection?.notificationCandidates).toHaveLength(50);
    expect(projection?.skippedEvents).toHaveLength(50);
    expect(Object.keys(projection?.messageIdSnapshotsById ?? {})).toHaveLength(200);
    expect(JSON.stringify(projection)).not.toContain("**private-body-259**");
    expect(JSON.stringify(projection)).not.toContain("https://example.com/259");
    expect(JSON.stringify(projection)).not.toContain("private-body-0");
  });

  it("expires stale lightweight snapshots on the next background event", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:00:00Z"));

    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 41,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto({ uuid: STREAM_A }),
      },
      context,
    );

    vi.setSystemTime(new Date("2026-06-22T10:31:00Z"));
    applier.applyEvent(
      {
        epoch_version: 42,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto({ uuid: STREAM_B, updated_at: DATE_LATER }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.streamSnapshotsById[STREAM_A]).toBeUndefined();
    expect(projection?.streamSnapshotsById[STREAM_B]).toEqual(
      expect.objectContaining({ streamUuid: STREAM_B }),
    );
  });

  it("removes deleted folder stream topic and folder item snapshots", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

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
        type: "topic",
        kind: "topic.created",
        topic: createTopicDto(),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 53,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto(),
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 54,
        type: "folder_item",
        kind: "folder_item.deleted",
        folder_item: { uuid: FOLDER_ITEM_A },
      },
      context,
    );
    let projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_A]).toBeUndefined();
    expect(projection?.unreadByFolderItemId[FOLDER_ITEM_A]).toBeUndefined();
    expect(projection?.folderSnapshotsById[FOLDER_A]?.folderItemIds).toEqual([FOLDER_ITEM_B]);

    applier.applyEvent(
      {
        epoch_version: 55,
        type: "topic",
        kind: "topic.deleted",
        topic: { uuid: TOPIC_A, stream_uuid: STREAM_A },
      },
      context,
    );
    projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.topicSnapshotsById[TOPIC_A]).toBeUndefined();

    applier.applyEvent(
      {
        epoch_version: 56,
        type: "stream",
        kind: "stream.deleted",
        stream: { uuid: STREAM_A },
      },
      context,
    );
    projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.streamSnapshotsById[STREAM_A]).toBeUndefined();
    expect(projection?.folderSnapshotsById[FOLDER_A]?.folderItemIds).toEqual([]);
    expect(projection?.folderItemSnapshotsById[FOLDER_ITEM_B]).toBeUndefined();
    expect(
      projection?.notificationCandidates.some((candidate) => candidate.streamUuid === STREAM_A),
    ).toBe(false);

    applier.applyEvent(
      {
        epoch_version: 57,
        type: "folder",
        kind: "folder.deleted",
        folder: { uuid: FOLDER_A },
      },
      context,
    );
    projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.folderSnapshotsById[FOLDER_A]).toBeUndefined();
    expect(projection?.unreadByFolderId[FOLDER_A]).toBeUndefined();
  });

  it("ignores active-surface events so active apply path stays separate", () => {
    const context = createContext(createOwner(), { surface: "active" });
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 31,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    expect(useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey).toEqual({});
  });
});
