import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectWorkspaceMessagesForConversation,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { useMessengerBackgroundProjectionStore } from "~/entities/messenger/messenger-background-projection.model";
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
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { applyMessengerMessageWindow } from "./messenger-messages-loader.lib";
import {
  clearMessengerReadBoundariesForOwner,
  readMessengerReadBoundary,
} from "./messenger-read-boundary.lib";
import {
  createMessengerRealtimeActiveApplier,
  createMessengerRealtimeBackgroundApplier,
} from "./messenger-realtime-applier.lib";
import {
  selectMessengerSidebarFolders,
  selectMessengerSidebarStreams,
} from "./messenger-sidebar.lib";
import {
  selectMessengerFolders,
  selectMessengerSidebarConversations,
  useMessengerStore,
} from "./messenger.model";

const ACCOUNT_A = "account-a";
const INSTANCE_A = "instance-a";
const ORGANIZATION_A = "organization-a";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_B = "37a28696-153d-431e-a5fb-36f0c0209765";
const STREAM_BINDING_A = "ea4364f4-96e3-4b33-b80d-fd53e5697151";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const TOPIC_B = "ed25f944-8106-4386-b2f9-65e9db32d465";
const FOLDER_A = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const FOLDER_ITEM_B = "5f5b9a9d-0e57-4775-849b-c8308f95a809";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const MESSAGE_B = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";
const MESSAGE_C = "cc10bcd3-8d5b-45bc-9960-40f1cf7a04de";
const DATE = "2026-06-22T10:10:00Z";
const DATE_MIDDLE = "2026-06-22T10:15:00Z";
const DATE_LATER = "2026-06-22T10:20:00Z";
type RealtimeUserPayload = Extract<WorkspaceRealtimeEvent, { kind: "user.updated" }>["user"];

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
    notificationsEnabled: true,
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
    active_unread_count: 3,
    passive_unread_count: 0,
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
    active_unread_count: 2,
    passive_unread_count: 0,
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
    reactions: {},
    reaction_users: {},
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createUserDto(overrides: Partial<RealtimeUserPayload> = {}): RealtimeUserPayload {
  return {
    uuid: USER_A,
    username: "alice",
    source: "iam",
    avatar: `urn:gavatar:${USER_A}`,
    status: "active",
    status_emoji: null,
    status_text: null,
    first_name: "Alice",
    last_name: "Smith",
    email: "alice@example.com",
    last_ping_at: DATE,
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
        active_unread_count: 3,
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

function applyStreamAndTopicSnapshot(
  applier: ReturnType<typeof createMessengerRealtimeActiveApplier>,
  context: WorkspaceRealtimeEventContext,
  options: {
    stream?: Partial<WorkspaceMessengerStreamDto>;
    topic?: Partial<WorkspaceMessengerTopicDto>;
    streamEpoch?: number;
    topicEpoch?: number;
  } = {},
): void {
  applier.applyEvent(
    {
      epoch_version: options.streamEpoch ?? 1,
      type: "stream",
      kind: "stream.created",
      stream: createStreamDto(options.stream),
    },
    context,
  );
  applier.applyEvent(
    {
      epoch_version: options.topicEpoch ?? 2,
      type: "topic",
      kind: "topic.created",
      topic: createTopicDto(options.topic),
    },
    context,
  );
}

describe("messenger realtime active applier", () => {
  beforeEach(() => {
    clearMessengerReadBoundariesForOwner(createContext().ownerKey);
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().setOwner(null, false);
    useWorkspaceMessageStore.getState().clear();
    useMessengerBackgroundProjectionStore.getState().clear();
  });

  it("advances a read boundary and marks the loaded topic prefix", () => {
    const context = createContext();
    const cache = {
      advanceReadBoundary: vi.fn(),
      patchCachedMessage: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const onMessageCreated = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({ cache, onMessageCreated });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    for (const [uuid, createdAt] of [
      [MESSAGE_A, DATE],
      [MESSAGE_B, DATE_LATER],
    ] as const) {
      applier.applyEvent(
        {
          epoch_version: uuid === MESSAGE_A ? 10 : 11,
          type: "message",
          kind: "message.created",
          message: createMessageDto({
            uuid,
            author_uuid: USER_B,
            is_own: false,
            read: false,
            created_at: createdAt,
            updated_at: createdAt,
          }),
        },
        context,
      );
    }
    const messageState = useWorkspaceMessageStore.getState();
    messageState.replaceConversationWindow({
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      expectedRevision: null,
      capturedMutationRevision: messageState.messageMutationRevision,
      mode: "tail",
      anchorMessageUuid: null,
      messages: [messageState.messagesById[MESSAGE_A]!, messageState.messagesById[MESSAGE_B]!],
      markers: { beforePageMarker: null, afterPageMarker: null },
    });
    onMessageCreated.mockClear();

    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        kind: "message.read",
        message: createMessageDto({
          uuid: MESSAGE_B,
          author_uuid: USER_B,
          is_own: false,
          read: true,
          created_at: DATE_LATER,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.read).toBe(true);
    expect(readMessengerReadBoundary(context.ownerKey, STREAM_A, TOPIC_A)).toMatchObject({
      messageUuid: MESSAGE_B,
      epochVersion: 12,
    });
    expect(cache.advanceReadBoundary).toHaveBeenCalledWith(
      expect.objectContaining({ messageUuid: MESSAGE_B, epochVersion: 12 }),
    );
    expect(onMessageCreated).not.toHaveBeenCalled();
  });

  it("does not publish the applied epoch before the read boundary is durable", async () => {
    const context = createContext();
    let releaseBoundaryWrite: (() => void) | undefined;
    const boundaryWrite = new Promise<void>((resolve) => {
      releaseBoundaryWrite = resolve;
    });
    const applier = createMessengerRealtimeActiveApplier({
      cache: {
        advanceReadBoundary: vi.fn(() => boundaryWrite),
        patchCachedMessage: vi.fn(),
        writeRealtimeCursor: vi.fn(),
      },
    });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 12,
          type: "message",
          kind: "message.read",
          message: createMessageDto({
            uuid: MESSAGE_B,
            author_uuid: USER_B,
            is_own: false,
            read: true,
            created_at: DATE_LATER,
            updated_at: DATE_LATER,
          }),
        },
        context,
      ),
    );

    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();

    releaseBoundaryWrite?.();
    await application;

    expect(useMessengerStore.getState().lastEpochVersion).toBe(12);
  });

  it("applies messages.read as an exact batch without advancing a boundary", () => {
    const context = createContext();
    const cache = { markCachedMessagesRead: vi.fn(), writeRealtimeCursor: vi.fn() };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        kind: "message.created",
        message: createMessageDto({
          uuid: MESSAGE_A,
          author_uuid: USER_B,
          is_own: false,
          read: false,
        }),
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 13,
        type: "messages",
        kind: "messages.read",
        messageUuids: [MESSAGE_A],
      },
      context,
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
    expect(readMessengerReadBoundary(context.ownerKey, STREAM_A, TOPIC_A)).toBeNull();
    expect(cache.markCachedMessagesRead).toHaveBeenCalledWith(context.ownerKey, [MESSAGE_A]);
  });

  it("persists a background message.read boundary without touching the active message store", () => {
    const context = createContext(createOwner(), { surface: "background" });
    const cache = { advanceReadBoundary: vi.fn(), markCachedMessagesRead: vi.fn() };
    const applier = createMessengerRealtimeBackgroundApplier({ cache });

    applier.applyEvent(
      {
        epoch_version: 14,
        type: "message",
        kind: "message.read",
        message: createMessageDto({
          uuid: MESSAGE_B,
          author_uuid: USER_B,
          is_own: false,
          read: true,
          created_at: DATE_LATER,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]).toBeUndefined();
    expect(readMessengerReadBoundary(context.ownerKey, STREAM_A, TOPIC_A)?.messageUuid).toBe(
      MESSAGE_B,
    );
    expect(cache.advanceReadBoundary).toHaveBeenCalledWith(
      expect.objectContaining({ messageUuid: MESSAGE_B, epochVersion: 14 }),
    );
  });

  it("keeps background message.read application pending until the boundary is durable", async () => {
    const context = createContext(createOwner(), { surface: "background" });
    let releaseBoundaryWrite: (() => void) | undefined;
    const boundaryWrite = new Promise<void>((resolve) => {
      releaseBoundaryWrite = resolve;
    });
    const applier = createMessengerRealtimeBackgroundApplier({
      cache: { advanceReadBoundary: vi.fn(() => boundaryWrite) },
    });

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 14,
          type: "message",
          kind: "message.read",
          message: createMessageDto({
            uuid: MESSAGE_B,
            author_uuid: USER_B,
            is_own: false,
            read: true,
            created_at: DATE_LATER,
            updated_at: DATE_LATER,
          }),
        },
        context,
      ),
    );
    let settled = false;
    void application.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    releaseBoundaryWrite?.();
    await application;

    expect(settled).toBe(true);
  });

  it("publishes initial sync readiness only after active catch-up finishes", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    const transportState = (
      mode: "catching_up" | "connecting" | "connected" | "reconnecting" | "failed",
      reason?: string,
    ) => ({
      owner: context.owner,
      ownerKey: context.ownerKey,
      surface: "active" as const,
      mode,
      lastEpochVersion: null,
      reconnectAttempt: 0,
      ...(reason == null ? {} : { reason }),
    });

    applier.onTransportStateChange(transportState("catching_up"), context);
    expect(useMessengerStore.getState().realtimeReadyRuntimeGeneration).toBeNull();

    applier.onTransportStateChange(transportState("connecting"), context);
    expect(useMessengerStore.getState().realtimeReadyRuntimeGeneration).toBeNull();

    applier.onTransportStateChange(transportState("connected"), context);
    expect(useMessengerStore.getState().realtimeReadyRuntimeGeneration).toBe(
      context.owner.runtimeGeneration,
    );

    applier.onTransportStateChange(transportState("reconnecting", "socket_close"), context);
    expect(useMessengerStore.getState().realtimeReadyRuntimeGeneration).toBeNull();

    applier.onTransportStateChange(transportState("catching_up"), context);
    expect(useMessengerStore.getState().realtimeReadyRuntimeGeneration).toBeNull();

    applier.onTransportStateChange(transportState("failed"), context);
    expect(useMessengerStore.getState().realtimeReadyRuntimeGeneration).toBe(
      context.owner.runtimeGeneration,
    );

    applier.onTransportStateChange(transportState("reconnecting", "catch_up_failed"), context);
    expect(useMessengerStore.getState().realtimeReadyRuntimeGeneration).toBe(
      context.owner.runtimeGeneration,
    );
  });

  it("applies message created, updated, and deleted events", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cache = {
      writeConversationMessagePage: vi.fn(),
      patchCachedMessage: vi.fn(),
      deleteCachedMessage: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    expect(cache.writeConversationMessagePage).toHaveBeenCalledTimes(2);
    expect(cache.writeConversationMessagePage).toHaveBeenNthCalledWith(
      1,
      ownerKey,
      `topic:${STREAM_A}:${TOPIC_A}`,
      {
        messages: [expect.objectContaining({ uuid: MESSAGE_A })],
        source: "realtime",
      },
    );
    expect(cache.writeConversationMessagePage).toHaveBeenNthCalledWith(
      2,
      ownerKey,
      `stream:${STREAM_A}`,
      {
        messages: [expect.objectContaining({ uuid: MESSAGE_A })],
        source: "realtime",
      },
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

    expect(cache.patchCachedMessage).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({
        uuid: MESSAGE_A,
        payload: { kind: "markdown", content: "Edited workspace message" },
      }),
    );
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        payload: { kind: "markdown", content: "Edited workspace message" },
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

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(useMessengerStore.getState().lastEpochVersion).toBe(13);
    expect(cache.deleteCachedMessage).toHaveBeenCalledWith(ownerKey, MESSAGE_A, [
      `stream:${STREAM_A}`,
      `topic:${STREAM_A}:${TOPIC_A}`,
    ]);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledTimes(3);
    expect(cache.writeRealtimeCursor).toHaveBeenNthCalledWith(1, ownerKey, 11);
    expect(cache.writeRealtimeCursor).toHaveBeenNthCalledWith(2, ownerKey, 12);
    expect(cache.writeRealtimeCursor).toHaveBeenNthCalledWith(3, ownerKey, 13);
  });

  it("preserves realtime body and pointers when an older fetched anchor window is applied", async () => {
    const context = createContext();
    const runtimeContext = {
      ...context.owner,
      organizationOrigin: "https://organization-a.example.com",
      accessToken: "access-token-a",
    };
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    applyStreamAndTopicSnapshot(applier, context);
    useWorkspaceMessageStore.getState().setOwner(context.ownerKey, false);

    const window = {
      ownerKey: context.ownerKey,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}` as const,
      anchorUuid: MESSAGE_A,
      messages: [
        adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_A })),
        adaptMessengerMessage(
          createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
        ),
      ],
      beforePageMarker: "older",
      afterPageMarker: "newer",
      expectedWindowRevision: null,
      capturedMutationRevision: 0,
    };

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        kind: "message.created",
        message: createMessageDto({
          uuid: MESSAGE_C,
          created_at: DATE_MIDDLE,
          updated_at: DATE_MIDDLE,
        }),
      },
      context,
    );

    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window,
        getRuntimeContext: () => runtimeContext,
        isRequestCurrent: () => true,
      }),
    ).resolves.toMatchObject({ status: "applied" });

    const messageState = useWorkspaceMessageStore.getState();
    expect(messageState.messagesById[MESSAGE_C]).toBeDefined();
    expect(
      selectWorkspaceMessagesForConversation(messageState, window.conversationId).map(
        (message) => message.uuid,
      ),
    ).toEqual([MESSAGE_A, MESSAGE_C, MESSAGE_B]);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.lastMessageUuid).toBe(MESSAGE_C);
  });

  it("does not move last-message pointers when an older message is edited", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    applyStreamAndTopicSnapshot(applier, context, {
      stream: { last_message_uuid: MESSAGE_B },
      topic: { last_message_uuid: MESSAGE_B },
    });

    applier.applyEvent(
      {
        epoch_version: 3,
        type: "message",
        kind: "message.updated",
        message: createMessageDto({
          uuid: MESSAGE_A,
          created_at: DATE_MIDDLE,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    const state = useMessengerStore.getState();
    expect(state.streamsById[STREAM_A]?.lastMessageUuid).toBe(MESSAGE_B);
    expect(state.topicsById[TOPIC_A]?.lastMessageUuid).toBe(MESSAGE_B);
    expect(state.conversationsById[`stream:${STREAM_A}`]?.lastMessageUuid).toBe(MESSAGE_B);
    expect(state.conversationsById[`topic:${STREAM_A}:${TOPIC_A}`]?.lastMessageUuid).toBe(
      MESSAGE_B,
    );
  });

  it("updates message reaction aggregate without dropping own projection", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const onMessageReactionAggregateUpdated = vi.fn();
    const cache = {
      patchCachedMessage: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({
      cache,
      onMessageReactionAggregateUpdated,
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context);

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({
          reactions: { thumbs_up: 1 },
          reaction_users: { thumbs_up: [USER_A] },
        }),
      },
      context,
    );
    useWorkspaceMessageStore
      .getState()
      .setOwnMessageReaction(MESSAGE_A, "thumbs_up", "20000000-0000-4000-8000-000000000001");

    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        kind: "message.updated",
        message: createMessageDto({
          reactions: { thumbs_up: 2, eyes: 1 },
          reaction_users: { eyes: [USER_B] },
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        reactions: { thumbs_up: 2, eyes: 1 },
        reactionUserUuidsByEmojiName: { eyes: [USER_B] },
        ownReactionUuidsByEmojiName: {
          thumbs_up: "20000000-0000-4000-8000-000000000001",
        },
      }),
    );
    expect(cache.patchCachedMessage).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({
        uuid: MESSAGE_A,
        reactions: { thumbs_up: 2, eyes: 1 },
        reactionUserUuidsByEmojiName: { eyes: [USER_B] },
      }),
    );
    expect(onMessageReactionAggregateUpdated).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({
        uuid: MESSAGE_A,
        reactions: { thumbs_up: 2, eyes: 1 },
      }),
    );
  });

  it("notifies reaction aggregate hook when the last reaction is removed", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const onMessageReactionAggregateUpdated = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({
      onMessageReactionAggregateUpdated,
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context);

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({
          reactions: { thumbs_up: 1 },
        }),
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        kind: "message.updated",
        message: createMessageDto({
          reactions: {},
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    expect(onMessageReactionAggregateUpdated).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({
        uuid: MESSAGE_A,
        reactions: {},
      }),
    );
  });

  it("keeps repeated created events outside an unloaded visible window", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context);

    const event = {
      epoch_version: 11,
      type: "message",
      message: createMessageDto(),
    } satisfies WorkspaceRealtimeEvent;
    applier.applyEvent(event, { ...context, source: "catch_up" });
    applier.applyEvent({ ...event, epoch_version: 12 }, context);

    const messengerState = useMessengerStore.getState();
    const messageState = useWorkspaceMessageStore.getState();
    expect(Object.keys(messageState.messagesById)).toEqual([MESSAGE_A]);
    expect(selectWorkspaceMessagesForConversation(messageState, `stream:${STREAM_A}`)).toEqual([]);
    expect(
      selectWorkspaceMessagesForConversation(messageState, `topic:${STREAM_A}:${TOPIC_A}`),
    ).toEqual([]);
    expect(messengerState.streamsById[STREAM_A]?.lastMessageUuid).toBe(MESSAGE_A);
    expect(messengerState.topicsById[TOPIC_A]?.lastMessageUuid).toBe(MESSAGE_A);
  });

  it("stores an incoming message body without inventing stream or topic membership", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context);

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({ is_own: false }),
      },
      context,
    );

    const state = useWorkspaceMessageStore.getState();
    expect(state.messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        uuid: MESSAGE_A,
        payload: { kind: "markdown", content: "Hello, workspace" },
      }),
    );
    expect(selectWorkspaceMessagesForConversation(state, `stream:${STREAM_A}`)).toEqual([]);
    expect(selectWorkspaceMessagesForConversation(state, `topic:${STREAM_A}:${TOPIC_A}`)).toEqual(
      [],
    );
  });

  it("does not apply an active owner A event after the message store switches to owner B", () => {
    const contextA = createContext();
    const ownerB = workspaceRuntimeOwnerKey(
      createOwner({ organizationId: "organization-b", projectId: "project-b" }),
    );
    useWorkspaceMessageStore.getState().setOwner(ownerB, false);
    const applier = createMessengerRealtimeActiveApplier({ isOwnerCurrent: () => true });

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto(),
      },
      contextA,
    );

    expect(useWorkspaceMessageStore.getState().ownerKey).toBe(ownerB);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
  });

  it.each(["message.updated", "message.read"] as const)(
    "does not patch cache or create a body for unknown realtime %s",
    (kind) => {
      const context = createContext();
      const cache = {
        patchCachedMessage: vi.fn(),
        writeConversationMessagePage: vi.fn(),
        advanceReadBoundary: vi.fn(),
      };
      const applier = createMessengerRealtimeActiveApplier({ cache });
      useMessengerStore.getState().startBootstrap(context.ownerKey);
      const beforeRevision = useWorkspaceMessageStore.getState().messageMutationRevision;

      applier.applyEvent(
        {
          epoch_version: 11,
          type: "message",
          kind,
          message: createMessageDto(),
        },
        context,
      );

      const state = useWorkspaceMessageStore.getState();
      expect(state.messagesById[MESSAGE_A]).toBeUndefined();
      expect(state.messageMutationRevision).toBe(beforeRevision + 1);
      expect(cache.patchCachedMessage).not.toHaveBeenCalled();
      expect(cache.writeConversationMessagePage).not.toHaveBeenCalled();
      expect(cache.advanceReadBoundary).toHaveBeenCalledTimes(kind === "message.read" ? 1 : 0);
    },
  );

  it("emits message created callback with stream context for incoming DM call detection", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const onMessageCreated = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({ onMessageCreated });
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context, {
      stream: {
        private: true,
        invite_only: true,
        direct_user_uuid: USER_B,
      },
    });

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({
          author_uuid: USER_B,
          is_own: false,
          payload: {
            kind: "markdown",
            content: "https://meet.workspace.example.com/workspace-room-1",
          },
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        kind: "message.updated",
        message: createMessageDto({
          author_uuid: USER_B,
          is_own: false,
          payload: {
            kind: "markdown",
            content: "https://meet.workspace.example.com/workspace-room-2",
          },
        }),
      },
      context,
    );

    expect(onMessageCreated).toHaveBeenCalledTimes(1);
    expect(onMessageCreated).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({
        uuid: MESSAGE_A,
        authorUuid: USER_B,
        payload: {
          kind: "markdown",
          content: "https://meet.workspace.example.com/workspace-room-1",
        },
      }),
      expect.objectContaining({
        uuid: STREAM_A,
        isPrivate: true,
        directUserUuid: USER_B,
      }),
      context,
    );
  });

  it("does not run message-created side effects before realtime is ready", () => {
    const context = createContext(createOwner(), { notificationsEnabled: false });
    const onMessageCreated = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({ onMessageCreated });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 13,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeDefined();
    expect(onMessageCreated).not.toHaveBeenCalled();
  });

  it("stores backfill messages without running message-created live side effects", () => {
    const context = createContext();
    const onMessageCreated = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({ onMessageCreated });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 13,
        type: "message",
        message: createMessageDto({
          provider: {
            kind: "zulip",
            account_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            external_id: "message-42",
            capabilities: {},
            delivery_class: "backfill",
            notification_eligible: false,
          },
        }),
      },
      context,
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        uuid: MESSAGE_A,
        provider: expect.objectContaining({ delivery_class: "backfill" }),
      }),
    );
    expect(onMessageCreated).not.toHaveBeenCalled();
  });

  it("stores delayed live message bodies without extending an unloaded window", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context);

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({ uuid: MESSAGE_A, created_at: DATE, updated_at: DATE }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        message: createMessageDto({
          uuid: MESSAGE_B,
          payload: { kind: "markdown", content: "Later message" },
          created_at: DATE_LATER,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 13,
        type: "message",
        message: createMessageDto({
          uuid: MESSAGE_C,
          payload: { kind: "markdown", content: "Middle message" },
          created_at: DATE_MIDDLE,
          updated_at: DATE_MIDDLE,
        }),
      },
      context,
    );

    const state = useWorkspaceMessageStore.getState();
    expect(Object.keys(state.messagesById).sort()).toEqual(
      [MESSAGE_A, MESSAGE_B, MESSAGE_C].sort(),
    );
    expect(selectWorkspaceMessagesForConversation(state, `stream:${STREAM_A}`)).toEqual([]);
    expect(selectWorkspaceMessagesForConversation(state, `topic:${STREAM_A}:${TOPIC_A}`)).toEqual(
      [],
    );
  });

  it("updates inactive conversation sidebar preview and ordering from a fresh message event", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context, {
      stream: { updated_at: DATE },
      topic: { updated_at: DATE },
    });
    applyStreamAndTopicSnapshot(applier, context, {
      stream: {
        uuid: STREAM_B,
        name: "Support",
        updated_at: DATE,
      },
      topic: {
        uuid: TOPIC_B,
        stream_uuid: STREAM_B,
        name: "Ops",
        updated_at: DATE,
      },
      streamEpoch: 3,
      topicEpoch: 4,
    });
    applier.applyEvent(
      {
        epoch_version: 5,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto({
          folder_items: [
            {
              uuid: FOLDER_ITEM_A,
              project_id: PROJECT_A,
              folder_uuid: FOLDER_A,
              user_uuid: USER_A,
              stream_uuid: STREAM_A,
              chat_type: "stream",
              order_index: null,
              pinned_at: null,
              unread_count: 0,
              active_unread_count: 0,
              passive_unread_count: 0,
              created_at: DATE,
              updated_at: DATE,
            },
            {
              uuid: FOLDER_ITEM_B,
              project_id: PROJECT_A,
              folder_uuid: FOLDER_A,
              user_uuid: USER_A,
              stream_uuid: STREAM_B,
              chat_type: "stream",
              order_index: null,
              pinned_at: null,
              unread_count: 1,
              active_unread_count: 1,
              passive_unread_count: 0,
              created_at: DATE,
              updated_at: DATE,
            },
          ],
        }),
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({
          uuid: MESSAGE_B,
          stream_uuid: STREAM_B,
          topic_uuid: TOPIC_B,
          payload: { kind: "markdown", content: "Fresh inactive chat" },
          is_own: false,
          created_at: DATE_LATER,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    const messengerState = useMessengerStore.getState();
    const messageState = useWorkspaceMessageStore.getState();
    expect(messageState.messagesById[MESSAGE_B]).toEqual(
      expect.objectContaining({
        uuid: MESSAGE_B,
        payload: { kind: "markdown", content: "Fresh inactive chat" },
      }),
    );
    expect(
      selectWorkspaceMessagesForConversation(messageState, `topic:${STREAM_B}:${TOPIC_B}`),
    ).toEqual([]);
    const rows = selectMessengerSidebarStreams(messengerState, {
      organizationId: ORGANIZATION_A,
      projectId: PROJECT_A,
      selectedFolderUuid: FOLDER_A,
      messagesById: messageState.messagesById,
    });
    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
    expect(rows[0]).toMatchObject({
      streamUuid: STREAM_B,
      preview: {
        messageUuid: MESSAGE_B,
        text: "Fresh inactive chat",
      },
      updatedAt: DATE_LATER,
    });
  });

  it("updates and deletes known message bodies outside an unloaded window", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context);
    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto({ uuid: MESSAGE_A }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        message: createMessageDto({
          uuid: MESSAGE_B,
          payload: { kind: "markdown", content: "Second message" },
          created_at: DATE_LATER,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 13,
        type: "message",
        kind: "message.updated",
        message: createMessageDto({
          uuid: MESSAGE_A,
          payload: { kind: "markdown", content: "Edited first message" },
          updated_at: "2026-06-22T10:30:00Z",
        }),
      },
      context,
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({ payload: { kind: "markdown", content: "Edited first message" } }),
    );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([]);

    applier.applyEvent(
      {
        epoch_version: 14,
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

    const state = useWorkspaceMessageStore.getState();
    expect(selectWorkspaceMessagesForConversation(state, `stream:${STREAM_A}`)).toEqual([]);
    expect(selectWorkspaceMessagesForConversation(state, `topic:${STREAM_A}:${TOPIC_A}`)).toEqual(
      [],
    );
    expect(state.messagesById[MESSAGE_A]).toBeUndefined();
  });

  it("removes topic messages from the stream bucket when a topic is deleted", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyStreamAndTopicSnapshot(applier, context);
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
        type: "topic",
        kind: "topic.deleted",
        topic: { uuid: TOPIC_A, stream_uuid: STREAM_A },
      },
      context,
    );

    const state = useWorkspaceMessageStore.getState();
    expect(selectWorkspaceMessagesForConversation(state, `stream:${STREAM_A}`)).toEqual([]);
    expect(selectWorkspaceMessagesForConversation(state, `topic:${STREAM_A}:${TOPIC_A}`)).toEqual(
      [],
    );
    expect(state.messagesById[MESSAGE_A]).toBeUndefined();
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

  it("does not mark user realtime events as unsupported in messenger appliers", () => {
    const activeContext = createContext();
    const backgroundContext = createContext(createOwner(), { surface: "background" });
    const activeApplier = createMessengerRealtimeActiveApplier();
    const backgroundApplier = createMessengerRealtimeBackgroundApplier();
    const event: WorkspaceRealtimeEvent = {
      epoch_version: 23,
      type: "user",
      kind: "user.updated",
      user: createUserDto(),
    };
    useMessengerStore.getState().startBootstrap(activeContext.ownerKey);

    activeApplier.applyEvent(event, activeContext);
    backgroundApplier.applyEvent(event, backgroundContext);

    expect(useMessengerStore.getState().skippedRealtimeEvents).toEqual([]);
    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[
        backgroundContext.ownerKey
      ]?.skippedEvents,
    ).toBeUndefined();
  });

  it("does not write active skipped events when owner is stale", () => {
    const context = createContext();
    const cache = {
      writeConversationMessagePage: vi.fn(),
      patchCachedMessage: vi.fn(),
      deleteCachedMessage: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({
      isOwnerCurrent: () => false,
      cache,
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

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(useMessengerStore.getState().skippedRealtimeEvents).toEqual([]);
    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
    expect(cache.writeConversationMessagePage).not.toHaveBeenCalled();
    expect(cache.patchCachedMessage).not.toHaveBeenCalled();
    expect(cache.deleteCachedMessage).not.toHaveBeenCalled();
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
  });

  it("keeps applying realtime events when the cache write fails", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cache = {
      writeConversationMessagePage: vi.fn(() => {
        throw new Error("cache unavailable");
      }),
      writeRealtimeCursor: vi.fn(() => {
        throw new Error("cursor unavailable");
      }),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);

    expect(() =>
      applier.applyEvent(
        {
          epoch_version: 33,
          type: "message",
          message: createMessageDto(),
        },
        context,
      ),
    ).not.toThrow();

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({ uuid: MESSAGE_A }),
    );
    expect(useMessengerStore.getState().lastEpochVersion).toBe(33);
    expect(cache.writeConversationMessagePage).toHaveBeenCalled();
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(ownerKey, 33);
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

  it("runs full owner-scoped cleanup for a background stream deletion", async () => {
    const context = createContext(createOwner(), { surface: "background" });
    const removeProjection = vi.fn(() => Promise.resolve());
    const applier = createMessengerRealtimeBackgroundApplier({ removeProjection });

    applier.applyEvent(
      {
        epoch_version: 43,
        type: "stream",
        kind: "stream.deleted",
        stream: createStreamDto(),
      },
      context,
    );

    await vi.waitFor(() => expect(removeProjection).toHaveBeenCalledOnce());
    expect(removeProjection).toHaveBeenCalledWith({
      ownerKey: context.ownerKey,
      streamUuid: STREAM_A,
      removeActiveProjection: false,
      isOwnerCurrent: expect.any(Function),
    });
  });

  it("accepts a lawful stream.created after deleting the same stream UUID", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier({
      cache: {
        deleteCachedStream: vi.fn(),
        upsertCachedStream: vi.fn(),
      },
    });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 44,
        type: "stream",
        kind: "stream.deleted",
        stream: createStreamDto(),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 45,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto({ name: "Recreated" }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.name).toBe("Recreated");
  });

  it("projects active owner realtime messages into the shared notification projection store", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);

    applyStreamAndTopicSnapshot(applier, context, {
      stream: {
        private: true,
        notification_mode: "mentions_only",
      },
      topic: {
        name: "Releases",
        notification_mode: "follow",
      },
    });

    applier.applyEvent(
      {
        epoch_version: 3,
        type: "message",
        message: createMessageDto({
          author_uuid: USER_B,
          is_own: false,
          read: false,
          payload: {
            kind: "markdown",
            content: "Ping for active owner",
          },
        }),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[ownerKey];

    expect(projection).toEqual(
      expect.objectContaining({
        lastEpochVersion: 3,
      }),
    );
    expect(projection?.streamSnapshotsById[STREAM_A]).toEqual(
      expect.objectContaining({
        ownerKey,
        streamUuid: STREAM_A,
        isPrivate: true,
        notificationMode: "mentions_only",
      }),
    );
    expect(projection?.topicSnapshotsById[TOPIC_A]).toEqual(
      expect.objectContaining({
        ownerKey,
        topicUuid: TOPIC_A,
        streamUuid: STREAM_A,
        topicName: "Releases",
        notificationMode: "follow",
      }),
    );
    expect(projection?.messageIdSnapshotsById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        ownerKey,
        messageUuid: MESSAGE_A,
        authorUuid: USER_B,
        isOwn: false,
        read: false,
      }),
    );
    expect(projection?.notificationCandidates).toEqual([
      expect.objectContaining({
        ownerKey,
        messageUuid: MESSAGE_A,
        authorUuid: USER_B,
        audience: "private",
        streamName: "Engineering",
        topicName: "Releases",
        streamNotificationMode: "mentions_only",
        topicNotificationMode: "follow",
      }),
    ]);
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
          active_unread_count: 4,
          passive_unread_count: 0,
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
          summary: "Release scope is approved.",
          summary_last_message_uuid: MESSAGE_A,
          summary_has_new_messages: true,
          summary_enabled: true,
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
      expect.objectContaining({
        name: "Release notes",
        isDone: true,
        summary: "Release scope is approved.",
        summaryLastMessageUuid: MESSAGE_A,
        summaryHasNewMessages: true,
        summaryEnabled: true,
      }),
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

  it("uses folder realtime snapshots as the source of truth for title, counters, and items", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 71,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto({
          title: "Inbox",
          unread_count: 12,
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
              unread_count: 2,
              active_unread_count: 2,
              passive_unread_count: 0,
              created_at: DATE,
              updated_at: DATE,
            },
          ],
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 72,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          title: "Backend inbox",
          unread_count: 9,
          folder_items: [],
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    expect(selectMessengerFolders(useMessengerStore.getState())).toEqual([
      expect.objectContaining({
        uuid: FOLDER_A,
        title: "Backend inbox",
        unreadCount: 9,
        items: [],
        updatedAt: DATE_LATER,
      }),
    ]);
  });

  it("projects realtime stream unread snapshots into folder items and aggregate counters", () => {
    const context = createContext();
    const upsertCachedFolder = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({
      cache: { upsertCachedFolder },
    });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 75,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto({
          unread_count: 9,
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
          ],
        }),
      },
      context,
    );
    upsertCachedFolder.mockClear();

    applier.applyEvent(
      {
        epoch_version: 76,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          unread_count: 5,
          active_unread_count: 5,
          passive_unread_count: 0,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    const folder = useMessengerStore.getState().foldersById[FOLDER_A];
    expect(folder).toEqual(
      expect.objectContaining({
        unreadCount: 11,
        items: [expect.objectContaining({ unreadCount: 5 })],
      }),
    );
    expect(upsertCachedFolder).toHaveBeenCalledWith(context.ownerKey, folder);
  });

  it("removes realtime folder item membership while preserving the backend folder counter", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    applier.applyEvent(
      {
        epoch_version: 81,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto({
          unread_count: 9,
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
              unread_count: 2,
              active_unread_count: 2,
              passive_unread_count: 0,
              created_at: DATE,
              updated_at: DATE,
            },
          ],
        }),
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 82,
        type: "folder_item",
        kind: "folder_item.deleted",
        folder_item: { uuid: FOLDER_ITEM_A },
      },
      context,
    );

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toEqual(
      expect.objectContaining({
        unreadCount: 9,
        items: [],
      }),
    );
  });

  it("adds realtime created streams to sidebar and conversation surfaces", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 91,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto({ name: "Realtime engineering" }),
      },
      context,
    );

    expect(
      selectMessengerSidebarStreams(useMessengerStore.getState(), {
        organizationId: ORGANIZATION_A,
        projectId: PROJECT_A,
      }),
    ).toEqual([
      expect.objectContaining({
        id: `stream:${STREAM_A}`,
        streamUuid: STREAM_A,
        title: "Realtime engineering",
      }),
    ]);
    expect(selectMessengerSidebarConversations(useMessengerStore.getState())).toEqual([
      expect.objectContaining({
        id: `stream:${STREAM_A}`,
        streamUuid: STREAM_A,
        title: "Realtime engineering",
      }),
    ]);
  });

  it("uses stream binding realtime events to refresh binding indexes and derived conversations", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    applier.applyEvent(
      {
        epoch_version: 101,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto(),
      },
      context,
    );
    useMessengerStore.setState({
      conversationsById: {},
      conversationIds: [],
    });

    applier.applyEvent(
      {
        epoch_version: 102,
        type: "stream_binding",
        kind: "stream_bindings.created",
        stream_uuid: STREAM_A,
        stream_bindings: [createStreamBindingDto()],
      },
      context,
    );

    const state = useMessengerStore.getState();
    expect(state.streamBindingIds).toEqual([STREAM_BINDING_A]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([STREAM_BINDING_A]);
    expect(selectMessengerSidebarConversations(state)).toEqual([
      expect.objectContaining({ id: `stream:${STREAM_A}`, streamUuid: STREAM_A }),
    ]);
  });

  it("upserts updated stream bindings and removes deleted bindings from state and cache", () => {
    const context = createContext();
    const cache = {
      upsertCachedStreamBindings: vi.fn(),
      deleteCachedStreamBinding: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 103,
        type: "stream_binding",
        kind: "stream_binding.updated",
        stream_binding: createStreamBindingDto({
          role: "moderator",
          notification_mode: "mentions_only",
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamBindingsById[STREAM_BINDING_A]).toEqual(
      expect.objectContaining({
        role: "moderator",
        notificationMode: "mentions_only",
        updatedAt: DATE_LATER,
      }),
    );
    expect(cache.upsertCachedStreamBindings).toHaveBeenCalledWith(context.ownerKey, [
      expect.objectContaining({ uuid: STREAM_BINDING_A, role: "moderator" }),
    ]);

    applier.applyEvent(
      {
        epoch_version: 104,
        type: "stream_binding",
        kind: "stream_binding.deleted",
        stream_binding: {
          uuid: STREAM_BINDING_A,
          stream_uuid: STREAM_A,
          user_uuid: USER_A,
        },
      },
      context,
    );

    expect(useMessengerStore.getState().streamBindingsById[STREAM_BINDING_A]).toBeUndefined();
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toEqual([]);
    expect(cache.deleteCachedStreamBinding).toHaveBeenCalledWith(
      context.ownerKey,
      STREAM_BINDING_A,
    );
  });

  it("invalidates file resources for created, updated, and deleted file events", () => {
    const context = createContext();
    const onFileChanged = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({ onFileChanged });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    const file = {
      uuid: "9c24cf53-2d2d-473f-aacd-97662627a9d4",
      project_id: PROJECT_A,
      user_uuid: USER_A,
      stream_uuid: STREAM_A,
      name: "release-notes.pdf",
      description: "",
      content_type: "application/pdf",
      size_bytes: 128,
      hash: "sha256:123",
      created_at: DATE,
      updated_at: DATE,
    };

    applier.applyEvent({ epoch_version: 105, type: "file", kind: "file.created", file }, context);
    applier.applyEvent(
      {
        epoch_version: 106,
        type: "file",
        kind: "file.updated",
        file: { ...file, updated_at: DATE_LATER },
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 107,
        type: "file",
        kind: "file.deleted",
        file: { uuid: file.uuid, stream_uuid: STREAM_A },
      },
      context,
    );

    expect(onFileChanged).toHaveBeenCalledTimes(3);
    expect(onFileChanged).toHaveBeenNthCalledWith(
      3,
      context.ownerKey,
      expect.objectContaining({
        kind: "file.deleted",
        file: { uuid: file.uuid, stream_uuid: STREAM_A },
      }),
    );
    expect(useMessengerStore.getState().lastEpochVersion).toBe(107);
    expect(useMessengerStore.getState().skippedRealtimeEvents).toEqual([]);
  });

  it("keeps system folders stable after realtime folder updates", () => {
    const context = createContext();
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 111,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto({
          title: "All chats",
          unread_count: 12,
          system_type: "all",
          folder_items: [],
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 112,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto({
          title: "All chats",
          unread_count: 7,
          system_type: "all",
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
              unread_count: 1,
              active_unread_count: 1,
              passive_unread_count: 0,
              created_at: DATE,
              updated_at: DATE_LATER,
            },
          ],
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    expect(selectMessengerSidebarFolders(useMessengerStore.getState())).toEqual([
      expect.objectContaining({
        folderUuid: FOLDER_A,
        title: "All chats",
        unreadCount: 7,
        systemType: "all",
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A, unreadCount: 1 })],
      }),
    ]);
  });
});
