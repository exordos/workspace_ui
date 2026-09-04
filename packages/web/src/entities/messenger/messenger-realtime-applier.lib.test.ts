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
import {
  adaptMessengerMessage,
  adaptMessengerStream,
  adaptMessengerTopic,
} from "./messenger-adapters.lib";
import { repairDeletedMessagePointers } from "./messenger-deleted-message-pointer-repair.lib";
import { MESSENGER_ALL_CHATS_FOLDER_UUID } from "./messenger-folder-system-type.lib";
import { applyMessengerMessageWindow } from "./messenger-messages-loader.lib";
import { projectWorkspaceStreamNotificationTransition } from "./messenger-notification-mode.lib";
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
  createMessengerCatalogMutationFence,
  selectMessengerFolders,
  selectMessengerSidebarConversations,
  useMessengerStore,
} from "./messenger.model";
import type { RemoveMessengerStreamProjectionOptions } from "./messenger-stream-projection-cleanup.lib";
import type { MessengerMessage } from "./messenger.types";

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
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const onMessageCreated = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({ cache, onMessageCreated });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    useMessengerStore.getState().replaceBootstrapState(context.ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

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
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
    expect(readMessengerReadBoundary(context.ownerKey, STREAM_A, TOPIC_A)).toMatchObject({
      messageUuid: MESSAGE_B,
      epochVersion: 12,
    });
    expect(cache.advanceReadBoundary).toHaveBeenCalledWith(
      expect.objectContaining({ messageUuid: MESSAGE_B, epochVersion: 12 }),
      expect.any(Number),
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

  it("projects cached messages covered by a durable read boundary", async () => {
    const context = createContext();
    const cachedUnreadMessage = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_B,
        author_uuid: USER_B,
        is_own: false,
        read: false,
        created_at: DATE_LATER,
        updated_at: DATE_LATER,
      }),
    );
    const cache = {
      advanceReadBoundary: vi.fn(() => Promise.resolve([cachedUnreadMessage])),
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    useMessengerStore.getState().replaceBootstrapState(context.ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    await applier.applyEvent(
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

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(1);
    expect(cache.upsertCachedStream).toHaveBeenCalledWith(
      context.ownerKey,
      expect.objectContaining({ unreadCount: 2 }),
    );
    expect(cache.upsertCachedTopic).toHaveBeenCalledWith(
      context.ownerKey,
      expect.objectContaining({ unreadCount: 1 }),
    );
  });

  it("does not project a stale cached row for a message already read in memory", async () => {
    const context = createContext();
    const cachedUnreadMessage = adaptMessengerMessage(
      createMessageDto({
        author_uuid: USER_B,
        is_own: false,
        read: false,
      }),
    );
    const cache = {
      advanceReadBoundary: vi.fn(() => Promise.resolve([cachedUnreadMessage])),
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    useMessengerStore.getState().replaceBootstrapState(context.ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        kind: "message.created",
        message: createMessageDto({ author_uuid: USER_B, is_own: false, read: true }),
      },
      context,
    );
    await applier.applyEvent(
      {
        epoch_version: 12,
        type: "message",
        kind: "message.read",
        message: createMessageDto({ author_uuid: USER_B, is_own: false, read: true }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
    expect(cache.upsertCachedStream).not.toHaveBeenCalled();
    expect(cache.upsertCachedTopic).not.toHaveBeenCalled();
  });

  it("does not project stale cached rows for an optimistically read active prefix", async () => {
    const context = createContext();
    const cachedUnreadMessages = [
      adaptMessengerMessage(
        createMessageDto({
          uuid: MESSAGE_A,
          author_uuid: USER_B,
          is_own: false,
          read: false,
          created_at: DATE,
          updated_at: DATE,
        }),
      ),
      adaptMessengerMessage(
        createMessageDto({
          uuid: MESSAGE_B,
          author_uuid: USER_B,
          is_own: false,
          read: false,
          created_at: DATE_LATER,
          updated_at: DATE_LATER,
        }),
      ),
    ];
    const cache = {
      advanceReadBoundary: vi.fn(() => Promise.resolve(cachedUnreadMessages)),
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    useMessengerStore.getState().replaceBootstrapState(context.ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    for (const cachedMessage of cachedUnreadMessages) {
      applier.applyEvent(
        {
          epoch_version: cachedMessage.uuid === MESSAGE_A ? 10 : 11,
          type: "message",
          kind: "message.created",
          message: createMessageDto({
            uuid: cachedMessage.uuid,
            author_uuid: USER_B,
            is_own: false,
            read: true,
            created_at: cachedMessage.createdAt,
            updated_at: cachedMessage.updatedAt,
          }),
        },
        context,
      );
    }

    await applier.applyEvent(
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

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
    expect(cache.upsertCachedStream).not.toHaveBeenCalled();
    expect(cache.upsertCachedTopic).not.toHaveBeenCalled();
  });

  it("does not advance the realtime cursor when read-boundary staging fails", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cache = {
      advanceReadBoundary: vi.fn(() => Promise.reject(new Error("IndexedDB aborted"))),
      queuePendingUnreadProjection: vi.fn(() => Promise.resolve()),
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(
        adaptMessengerMessage(
          createMessageDto({ author_uuid: USER_B, is_own: false, read: false }),
        ),
      );

    await expect(
      applier.applyEvent(
        {
          epoch_version: 12,
          type: "message",
          kind: "message.read",
          message: createMessageDto({ author_uuid: USER_B, is_own: false, read: true }),
        },
        context,
      ),
    ).rejects.toThrow("IndexedDB aborted");

    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
  });

  it("still projects a cached-only unread row beside an already-read active boundary entry", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const activeReadMessage = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_A,
        author_uuid: USER_B,
        is_own: false,
        read: true,
        created_at: DATE,
        updated_at: DATE,
      }),
    );
    const cachedUnreadMessage = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_B,
        author_uuid: USER_B,
        is_own: false,
        read: false,
        created_at: DATE_LATER,
        updated_at: DATE_LATER,
      }),
    );
    const pending = new Map<
      string,
      {
        message: MessengerMessage;
        operation: "decrement";
        delta: -1;
        mutationRevision: number;
      }
    >();
    const cache = {
      advanceReadBoundary: vi.fn(() => Promise.resolve([cachedUnreadMessage])),
      queuePendingUnreadProjection: vi.fn(
        (
          _ownerKey: string,
          message: MessengerMessage,
          _operation: "increment" | "decrement",
          mutationRevision: number,
        ) => {
          pending.set(message.uuid, {
            message,
            operation: "decrement",
            delta: -1,
            mutationRevision,
          });
          return Promise.resolve();
        },
      ),
      readPendingUnreadProjections: vi.fn(() => Promise.resolve([...pending.values()])),
      completePendingUnreadProjections: vi.fn(
        (
          _ownerKey: string,
          projections: readonly { messageUuid: string; mutationRevision: number }[],
        ) => {
          for (const projection of projections) pending.delete(projection.messageUuid);
          return Promise.resolve();
        },
      ),
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [
        adaptMessengerStream(
          createStreamDto({ unread_count: 1, active_unread_count: 1, passive_unread_count: 0 }),
        ),
      ],
      streamBindings: [],
      topics: [
        adaptMessengerTopic(
          createTopicDto({ unread_count: 1, active_unread_count: 1, passive_unread_count: 0 }),
        ),
      ],
      conversations: [],
      folders: [],
    });
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(activeReadMessage);

    await applier.applyEvent(
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

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(0);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(0);
    expect(pending).toHaveLength(0);
  });

  it("does not publish the applied epoch before the unread projection is durable", async () => {
    const context = createContext();
    let releaseStreamWrite: (() => void) | undefined;
    const streamWrite = new Promise<void>((resolve) => {
      releaseStreamWrite = resolve;
    });
    const cache = {
      upsertCachedStream: vi.fn(() => streamWrite),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    useMessengerStore.getState().replaceBootstrapState(context.ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 13,
          type: "message",
          kind: "message.created",
          message: createMessageDto({
            author_uuid: USER_B,
            is_own: false,
            read: false,
          }),
        },
        context,
      ),
    );

    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();

    releaseStreamWrite?.();
    await application;

    expect(useMessengerStore.getState().lastEpochVersion).toBe(13);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(context.ownerKey, 13);
  });

  it("applies messages.read as an exact batch without advancing a boundary", async () => {
    const context = createContext();
    const cache = { markCachedMessagesRead: vi.fn(), writeRealtimeCursor: vi.fn() };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    await applier.applyEvent(
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

    await applier.applyEvent(
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
    expect(cache.markCachedMessagesRead).toHaveBeenCalledWith(
      context.ownerKey,
      [MESSAGE_A],
      expect.any(Number),
      [expect.objectContaining({ uuid: MESSAGE_A, read: false })],
    );
  });

  it("does not advance the realtime cursor when exact read-batch staging fails", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cache = {
      markCachedMessagesRead: vi.fn(() => Promise.reject(new Error("IndexedDB aborted"))),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(
      adaptMessengerMessage(
        createMessageDto({
          uuid: MESSAGE_A,
          author_uuid: USER_B,
          is_own: false,
          read: false,
        }),
      ),
    );

    await expect(
      applier.applyEvent(
        {
          epoch_version: 13,
          type: "messages",
          kind: "messages.read",
          messageUuids: [MESSAGE_A],
        },
        context,
      ),
    ).rejects.toThrow("IndexedDB aborted");

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(false);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
  });

  it("does not decrement counters after cache staging cancels an unapplied create/read pair", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cache = {
      markCachedMessagesRead: vi.fn(() => Promise.resolve([])),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(
        adaptMessengerMessage(
          createMessageDto({ author_uuid: USER_B, is_own: false, read: false }),
        ),
      );

    await applier.applyEvent(
      {
        epoch_version: 13,
        type: "messages",
        kind: "messages.read",
        messageUuids: [MESSAGE_A],
      },
      context,
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
  });

  it("does not replay a stale cached decrement for an optimistically read batch entry", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const activeReadMessage = adaptMessengerMessage(
      createMessageDto({ author_uuid: USER_B, is_own: false, read: true }),
    );
    const pending = new Map<
      string,
      {
        message: MessengerMessage;
        operation: "decrement";
        delta: -1;
        mutationRevision: number;
      }
    >();
    const cache = {
      markCachedMessagesRead: vi.fn(
        (_ownerKey: string, _messageUuids: readonly string[], mutationRevision = 0) => {
          pending.set(activeReadMessage.uuid, {
            message: { ...activeReadMessage, read: false },
            operation: "decrement",
            delta: -1,
            mutationRevision,
          });
          return Promise.resolve();
        },
      ),
      readPendingUnreadProjections: vi.fn(() => Promise.resolve([...pending.values()])),
      completePendingUnreadProjections: vi.fn(
        (
          _ownerKey: string,
          projections: readonly { messageUuid: string; mutationRevision: number }[],
        ) => {
          for (const projection of projections) pending.delete(projection.messageUuid);
          return Promise.resolve();
        },
      ),
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [
        adaptMessengerStream(
          createStreamDto({ unread_count: 2, active_unread_count: 2, passive_unread_count: 0 }),
        ),
      ],
      streamBindings: [],
      topics: [
        adaptMessengerTopic(
          createTopicDto({ unread_count: 1, active_unread_count: 1, passive_unread_count: 0 }),
        ),
      ],
      conversations: [],
      folders: [],
    });
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(activeReadMessage);

    await applier.applyEvent(
      {
        epoch_version: 13,
        type: "messages",
        kind: "messages.read",
        messageUuids: [MESSAGE_A],
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(1);
    expect(pending).toHaveLength(0);
  });

  it("decrements counters for messages.read entries found only in durable cache", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cachedMessage = adaptMessengerMessage(
      createMessageDto({
        author_uuid: USER_B,
        user_uuid: USER_A,
        is_own: false,
        read: false,
      }),
    );
    const cache = {
      readCachedMessages: vi.fn(() => Promise.resolve([cachedMessage])),
      markCachedMessagesRead: vi.fn(() => Promise.resolve()),
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    await applier.applyEvent(
      {
        epoch_version: 13,
        type: "messages",
        kind: "messages.read",
        messageUuids: [MESSAGE_A],
      },
      context,
    );

    expect(cache.readCachedMessages).toHaveBeenCalledWith(ownerKey, [MESSAGE_A]);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(1);
    expect(cache.markCachedMessagesRead).toHaveBeenCalledWith(
      ownerKey,
      [MESSAGE_A],
      expect.any(Number),
      [expect.objectContaining({ uuid: MESSAGE_A, read: false })],
    );
  });

  it("does not partially apply messages.read while an unloaded entry is being resolved", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let isCurrent = true;
    let resolveCachedMessages: ((messages: MessengerMessage[]) => void) | undefined;
    const cachedMessages = new Promise<MessengerMessage[]>((resolve) => {
      resolveCachedMessages = resolve;
    });
    const cache = {
      readCachedMessages: vi.fn(() => cachedMessages),
      markCachedMessagesRead: vi.fn(() => Promise.resolve()),
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({
      cache,
      isOwnerCurrent: () => isCurrent,
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto({ unread_count: 4, active_unread_count: 4 }))],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto({ unread_count: 3, active_unread_count: 3 }))],
      conversations: [],
      folders: [],
    });
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(
      adaptMessengerMessage(
        createMessageDto({
          uuid: MESSAGE_A,
          author_uuid: USER_B,
          is_own: false,
          read: false,
        }),
      ),
    );

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 13,
          type: "messages",
          kind: "messages.read",
          messageUuids: [MESSAGE_A, MESSAGE_B],
        },
        context,
      ),
    );
    await vi.waitFor(() =>
      expect(cache.readCachedMessages).toHaveBeenCalledWith(ownerKey, [MESSAGE_B]),
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(false);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(4);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(3);

    isCurrent = false;
    resolveCachedMessages?.([]);
    await application;

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(false);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(4);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(3);
    expect(cache.markCachedMessagesRead).not.toHaveBeenCalled();
  });

  it("persists a background message.read boundary without touching the active message store", async () => {
    const context = createContext(createOwner(), { surface: "background" });
    const cache = { advanceReadBoundary: vi.fn(), markCachedMessagesRead: vi.fn() };
    const applier = createMessengerRealtimeBackgroundApplier({ cache });

    await applier.applyEvent(
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

  it("awaits a background message cache write before publishing its lightweight projection", async () => {
    const context = createContext(createOwner(), { surface: "background" });
    let releaseMessageWrite: (() => void) | undefined;
    const messageWrite = new Promise<void>((resolve) => {
      releaseMessageWrite = resolve;
    });
    const cache = {
      writeConversationMessagePage: vi.fn(() => messageWrite),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeBackgroundApplier({ cache });

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 15,
          type: "message",
          kind: "message.created",
          message: createMessageDto({
            uuid: MESSAGE_C,
            author_uuid: USER_B,
            is_own: false,
            read: false,
          }),
        },
        context,
      ),
    );

    await vi.waitFor(() => expect(cache.writeConversationMessagePage).toHaveBeenCalledOnce());
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey],
    ).toBeUndefined();
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_C]).toBeUndefined();

    releaseMessageWrite?.();
    await application;

    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(context.ownerKey, 15);
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey]
        ?.messageIdSnapshotsById[MESSAGE_C],
    ).toEqual(expect.objectContaining({ messageUuid: MESSAGE_C }));
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_C]).toBeUndefined();
  });

  it("does not start background cache work for an initially stale owner", async () => {
    const context = createContext(createOwner(), { surface: "background" });
    const cache = {
      writeConversationMessagePage: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeBackgroundApplier({
      cache,
      isOwnerCurrent: () => false,
    });

    await applier.applyEvent(
      {
        epoch_version: 16,
        type: "message",
        kind: "message.created",
        message: createMessageDto(),
      },
      context,
    );

    expect(cache.writeConversationMessagePage).not.toHaveBeenCalled();
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey],
    ).toBeUndefined();
  });

  it("does not start background cache work for an initially aborted owner", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const context = createContext(createOwner(), {
      surface: "background",
      signal: abortController.signal,
    });
    const cache = {
      writeConversationMessagePage: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeBackgroundApplier({ cache });

    await applier.applyEvent(
      {
        epoch_version: 17,
        type: "message",
        kind: "message.created",
        message: createMessageDto(),
      },
      context,
    );

    expect(cache.writeConversationMessagePage).not.toHaveBeenCalled();
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey],
    ).toBeUndefined();
  });

  it("does not publish a cursor or projection when the owner becomes stale during a cache write", async () => {
    const context = createContext(createOwner(), { surface: "background" });
    let isCurrent = true;
    let releaseMessageWrite: (() => void) | undefined;
    const messageWrite = new Promise<void>((resolve) => {
      releaseMessageWrite = resolve;
    });
    const cache = {
      writeConversationMessagePage: vi.fn(() => messageWrite),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeBackgroundApplier({
      cache,
      isOwnerCurrent: () => isCurrent,
    });

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 18,
          type: "message",
          kind: "message.created",
          message: createMessageDto(),
        },
        context,
      ),
    );
    await vi.waitFor(() => expect(cache.writeConversationMessagePage).toHaveBeenCalledOnce());

    isCurrent = false;
    releaseMessageWrite?.();
    await application;

    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey],
    ).toBeUndefined();
  });

  it("does not publish a cursor or projection when the owner aborts during a cache write", async () => {
    const abortController = new AbortController();
    const context = createContext(createOwner(), {
      surface: "background",
      signal: abortController.signal,
    });
    let releaseMessageWrite: (() => void) | undefined;
    const messageWrite = new Promise<void>((resolve) => {
      releaseMessageWrite = resolve;
    });
    const cache = {
      writeConversationMessagePage: vi.fn(() => messageWrite),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeBackgroundApplier({ cache });

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 19,
          type: "message",
          kind: "message.created",
          message: createMessageDto(),
        },
        context,
      ),
    );
    await vi.waitFor(() => expect(cache.writeConversationMessagePage).toHaveBeenCalledOnce());

    abortController.abort();
    releaseMessageWrite?.();
    await application;

    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey],
    ).toBeUndefined();
  });

  it("does not publish an active cursor when the runtime becomes stale during a cache lookup", async () => {
    const context = createContext();
    let isCurrent = true;
    let resolveCachedMessages: ((messages: never[]) => void) | undefined;
    const cachedMessages = new Promise<never[]>((resolve) => {
      resolveCachedMessages = resolve;
    });
    const cache = {
      readCachedMessages: vi.fn(() => cachedMessages),
      writeRealtimeCursor: vi.fn(),
    };
    const onMessageCreated = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({
      cache,
      isOwnerCurrent: () => isCurrent,
      onMessageCreated,
    });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 20,
          type: "message",
          kind: "message.created",
          message: createMessageDto({ author_uuid: USER_B, is_own: false, read: false }),
        },
        context,
      ),
    );
    await vi.waitFor(() => expect(cache.readCachedMessages).toHaveBeenCalledOnce());

    isCurrent = false;
    resolveCachedMessages?.([]);
    await application;

    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(onMessageCreated).not.toHaveBeenCalled();
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

  it("projects a cached-only unread message before deleting it", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cachedMessage = adaptMessengerMessage(
      createMessageDto({
        author_uuid: USER_B,
        user_uuid: USER_A,
        is_own: false,
        read: false,
      }),
    );
    const cache = {
      readCachedMessages: vi.fn(() => Promise.resolve([cachedMessage])),
      deleteCachedMessage: vi.fn(() => Promise.resolve()),
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    await applier.applyEvent(
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

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(1);
    expect(cache.deleteCachedMessage).toHaveBeenCalledWith(ownerKey, MESSAGE_A, [
      `stream:${STREAM_A}`,
      `topic:${STREAM_A}:${TOPIC_A}`,
    ]);
  });

  it("cancels a staged unread increment when a deleted message body is unavailable", async () => {
    const context = createContext();
    const cancelPendingUnreadIncrement = vi.fn(() => Promise.resolve());
    const cache = {
      readCachedMessages: vi.fn(() => Promise.resolve([])),
      deleteCachedMessage: vi.fn(() => Promise.resolve()),
      cancelPendingUnreadIncrement,
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    await applier.applyEvent(
      {
        epoch_version: 14,
        type: "message",
        kind: "message.deleted",
        message: { uuid: MESSAGE_A, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
      },
      context,
    );

    expect(cancelPendingUnreadIncrement).toHaveBeenCalledWith(context.ownerKey, MESSAGE_A);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(context.ownerKey, 14);
  });

  it("projects message create and read events into stream and topic unread counters", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cache = {
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const message = createMessageDto({
      author_uuid: USER_B,
      user_uuid: USER_A,
      is_own: false,
      read: false,
    });

    applier.applyEvent(
      {
        epoch_version: 14,
        type: "message",
        kind: "message.created",
        message,
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ unreadCount: 4, activeUnreadCount: 4, passiveUnreadCount: 0 }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ unreadCount: 3, activeUnreadCount: 3, passiveUnreadCount: 0 }),
    );

    applier.applyEvent(
      {
        epoch_version: 15,
        type: "message",
        kind: "message.read",
        message: { ...message, read: true },
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ unreadCount: 3, activeUnreadCount: 3, passiveUnreadCount: 0 }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ unreadCount: 2, activeUnreadCount: 2, passiveUnreadCount: 0 }),
    );
    expect(cache.upsertCachedStream).toHaveBeenLastCalledWith(
      ownerKey,
      expect.objectContaining({ uuid: STREAM_A, unreadCount: 3 }),
    );
    expect(cache.upsertCachedTopic).toHaveBeenLastCalledWith(
      ownerKey,
      expect.objectContaining({ uuid: TOPIC_A, unreadCount: 2 }),
    );
  });

  it("keeps unread deltas in the confirmed bucket during an optimistic mode transition", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier({ cache: {} });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    const confirmedStream = useMessengerStore.getState().streamsById[STREAM_A];
    expect(confirmedStream).toBeDefined();
    if (confirmedStream == null) return;
    const optimisticStream = { ...confirmedStream, notificationMode: "muted" as const };
    projectWorkspaceStreamNotificationTransition(confirmedStream, optimisticStream);
    useMessengerStore.getState().upsertStream(ownerKey, optimisticStream, { kind: "transient" });

    const message = createMessageDto({
      author_uuid: USER_B,
      user_uuid: USER_A,
      is_own: false,
      read: false,
    });
    applier.applyEvent(
      { epoch_version: 14, type: "message", kind: "message.created", message },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ unreadCount: 4, activeUnreadCount: 4, passiveUnreadCount: 0 }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ unreadCount: 3, activeUnreadCount: 3, passiveUnreadCount: 0 }),
    );

    applier.applyEvent(
      {
        epoch_version: 15,
        type: "message",
        kind: "message.read",
        message: { ...message, read: true },
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ unreadCount: 3, activeUnreadCount: 3, passiveUnreadCount: 0 }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ unreadCount: 2, activeUnreadCount: 2, passiveUnreadCount: 0 }),
    );
  });

  it("does not double-count duplicate message.created events", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier({ cache: {} });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const event = {
      epoch_version: 16,
      type: "message" as const,
      kind: "message.created" as const,
      message: createMessageDto({
        author_uuid: USER_B,
        user_uuid: USER_A,
        is_own: false,
        read: false,
      }),
    };

    applier.applyEvent(event, context);
    applier.applyEvent({ ...event, epoch_version: 17 }, context);

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(4);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(3);
  });

  it("does not double-count a message.created event already present in durable cache", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cachedMessage = adaptMessengerMessage(
      createMessageDto({
        author_uuid: USER_B,
        user_uuid: USER_A,
        is_own: false,
        read: false,
      }),
    );
    const onMessageCreated = vi.fn();
    const cache = {
      readCachedMessages: vi.fn(() => Promise.resolve([cachedMessage])),
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache, onMessageCreated });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    await applier.applyEvent(
      {
        epoch_version: 17,
        type: "message",
        kind: "message.created",
        message: createMessageDto({
          author_uuid: USER_B,
          user_uuid: USER_A,
          is_own: false,
          read: false,
        }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeDefined();
    expect(cache.upsertCachedStream).not.toHaveBeenCalled();
    expect(cache.upsertCachedTopic).not.toHaveBeenCalled();
    expect(onMessageCreated).not.toHaveBeenCalled();
  });

  it("waits for complete notification metadata before classifying unread counters", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cache = {
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [
        adaptMessengerStream(
          createStreamDto({
            notification_mode: "muted",
            unread_count: 3,
            active_unread_count: 1,
            passive_unread_count: 2,
          }),
        ),
      ],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [],
    });

    applier.applyEvent(
      {
        epoch_version: 18,
        type: "message",
        kind: "message.created",
        message: createMessageDto({
          author_uuid: USER_B,
          user_uuid: USER_A,
          is_own: false,
          read: false,
        }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ unreadCount: 3, activeUnreadCount: 1, passiveUnreadCount: 2 }),
    );
    expect(cache.upsertCachedStream).not.toHaveBeenCalled();
    expect(cache.upsertCachedTopic).not.toHaveBeenCalled();
  });

  it("replays a durable unread increment after missing topic metadata arrives", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const pending = new Map<
      string,
      {
        message: MessengerMessage;
        operation: "increment" | "decrement";
        delta: -1 | 1;
        mutationRevision: number;
      }
    >();
    const cache = {
      queuePendingUnreadProjection: vi.fn(
        (
          _ownerKey: string,
          message: MessengerMessage,
          operation: "increment" | "decrement",
          mutationRevision: number,
        ) => {
          pending.set(message.uuid, {
            message,
            operation,
            delta: operation === "increment" ? 1 : -1,
            mutationRevision,
          });
          return Promise.resolve();
        },
      ),
      readPendingUnreadProjections: vi.fn(() => Promise.resolve([...pending.values()])),
      completePendingUnreadProjections: vi.fn(
        (
          _ownerKey: string,
          projections: readonly { messageUuid: string; mutationRevision: number }[],
        ) => {
          for (const projection of projections) pending.delete(projection.messageUuid);
          return Promise.resolve();
        },
      ),
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    const catalogMutationFence = createMessengerCatalogMutationFence(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [],
    });

    await applier.applyEvent(
      {
        epoch_version: 18,
        type: "message",
        kind: "message.created",
        message: createMessageDto({ author_uuid: USER_B, is_own: false, read: false }),
      },
      context,
    );

    expect(pending.get(MESSAGE_A)?.delta).toBe(1);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);

    useMessengerStore.getState().replaceBootstrapState(
      ownerKey,
      {
        streams: [adaptMessengerStream(createStreamDto())],
        streamBindings: [],
        topics: [adaptMessengerTopic(createTopicDto({ unread_count: 2, active_unread_count: 2 }))],
        conversations: [],
        folders: [],
      },
      { catalogMutationFence, coversCatalogMutationFence: true },
    );
    await vi.waitFor(() => expect(pending.size).toBe(0));

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(4);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(3);
    expect(pending).toHaveLength(0);
    expect(cache.completePendingUnreadProjections).toHaveBeenCalledWith(ownerKey, [
      expect.objectContaining({ messageUuid: MESSAGE_A }),
    ]);
  });

  it("replays every pending unread row against pre-flush coverage", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const pending = new Map<
      string,
      {
        message: MessengerMessage;
        operation: "increment" | "decrement";
        delta: -1 | 1;
        mutationRevision: number;
      }
    >();
    const cache = {
      queuePendingUnreadProjection: vi.fn(
        (
          _ownerKey: string,
          message: MessengerMessage,
          operation: "increment" | "decrement",
          mutationRevision: number,
        ) => {
          pending.set(message.uuid, {
            message,
            operation,
            delta: operation === "increment" ? 1 : -1,
            mutationRevision,
          });
          return Promise.resolve();
        },
      ),
      readPendingUnreadProjections: vi.fn(() => Promise.resolve([...pending.values()])),
      completePendingUnreadProjections: vi.fn(
        (
          _ownerKey: string,
          projections: readonly { messageUuid: string; mutationRevision: number }[],
        ) => {
          for (const projection of projections) pending.delete(projection.messageUuid);
          return Promise.resolve();
        },
      ),
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    const catalogMutationFence = createMessengerCatalogMutationFence(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [],
    });

    for (const [epochVersion, messageUuid] of [
      [18, MESSAGE_A],
      [19, MESSAGE_B],
    ] as const) {
      await applier.applyEvent(
        {
          epoch_version: epochVersion,
          type: "message",
          kind: "message.created",
          message: createMessageDto({
            uuid: messageUuid,
            author_uuid: USER_B,
            is_own: false,
            read: false,
          }),
        },
        context,
      );
    }
    expect(pending).toHaveLength(2);

    useMessengerStore.getState().replaceBootstrapState(
      ownerKey,
      {
        streams: [adaptMessengerStream(createStreamDto())],
        streamBindings: [],
        topics: [adaptMessengerTopic(createTopicDto({ unread_count: 2, active_unread_count: 2 }))],
        conversations: [],
        folders: [],
      },
      { catalogMutationFence, coversCatalogMutationFence: true },
    );
    await vi.waitFor(() => expect(pending.size).toBe(0));

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(5);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(4);
  });

  it("replays an atomic unread recovery row when only the message body survived", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let isCurrent = true;
    let cachedMessage: MessengerMessage | null = null;
    let atomicWrites = 0;
    const pending = new Map<
      string,
      {
        message: MessengerMessage;
        operation: "increment" | "decrement";
        delta: -1 | 0 | 1;
        mutationRevision: number;
      }
    >();
    const cache = {
      readCachedMessages: vi.fn(() =>
        Promise.resolve(cachedMessage == null ? [] : [cachedMessage]),
      ),
      writeConversationMessagePage: vi.fn(() => Promise.resolve()),
      writeConversationMessagePageWithUnreadProjection: vi.fn(
        (
          _ownerKey: string,
          _conversationId: string,
          page: { messages: readonly MessengerMessage[] },
          mutationRevision: number,
        ) => {
          const [message] = page.messages;
          if (message != null) {
            cachedMessage = message;
            pending.set(message.uuid, {
              message,
              operation: "increment",
              delta: 1,
              mutationRevision,
            });
          }
          atomicWrites += 1;
          if (atomicWrites === 2) isCurrent = false;
          return Promise.resolve();
        },
      ),
      readPendingUnreadProjections: vi.fn(() => Promise.resolve([...pending.values()])),
      completePendingUnreadProjections: vi.fn(
        (
          _ownerKey: string,
          projections: readonly { messageUuid: string; mutationRevision: number }[],
        ) => {
          for (const projection of projections) pending.delete(projection.messageUuid);
          return Promise.resolve();
        },
      ),
      persistPendingUnreadProjection: vi.fn(() => Promise.resolve(true)),
      verifyPendingUnreadProjection: vi.fn(() => Promise.resolve(true)),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({
      cache,
      isOwnerCurrent: () => isCurrent,
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const event = {
      epoch_version: 23,
      type: "message" as const,
      kind: "message.created" as const,
      message: createMessageDto({ author_uuid: USER_B, is_own: false, read: false }),
    };

    await applier.applyEvent(event, context);
    expect(cachedMessage).toEqual(expect.objectContaining({ uuid: MESSAGE_A }));
    expect(pending).toHaveLength(1);
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();

    useWorkspaceMessageStore.getState().clear();
    isCurrent = true;
    await applier.applyEvent(event, context);

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(4);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(3);
    expect(pending).toHaveLength(0);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(ownerKey, 23);
  });

  it("does not replay a pending topic increment over a newer authoritative topic event", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const pending = new Map<
      string,
      {
        message: MessengerMessage;
        operation: "increment" | "decrement";
        delta: -1 | 1;
        mutationRevision: number;
      }
    >();
    const cache = {
      queuePendingUnreadProjection: vi.fn(
        (
          _ownerKey: string,
          message: MessengerMessage,
          operation: "increment" | "decrement",
          mutationRevision: number,
        ) => {
          pending.set(message.uuid, {
            message,
            operation,
            delta: operation === "increment" ? 1 : -1,
            mutationRevision,
          });
          return Promise.resolve();
        },
      ),
      readPendingUnreadProjections: vi.fn(() => Promise.resolve([...pending.values()])),
      completePendingUnreadProjections: vi.fn(
        (
          _ownerKey: string,
          projections: readonly { messageUuid: string; mutationRevision: number }[],
        ) => {
          for (const projection of projections) pending.delete(projection.messageUuid);
          return Promise.resolve();
        },
      ),
      verifyPendingUnreadProjection: vi.fn(() => Promise.resolve(false)),
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [],
    });
    await applier.applyEvent(
      {
        epoch_version: 18,
        type: "message",
        kind: "message.created",
        message: createMessageDto({ author_uuid: USER_B, is_own: false, read: false }),
      },
      context,
    );

    await applier.applyEvent(
      {
        epoch_version: 19,
        type: "topic",
        kind: "topic.updated",
        topic: createTopicDto({ unread_count: 2, active_unread_count: 2 }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(4);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
    expect(pending.size).toBe(1);

    cache.verifyPendingUnreadProjection.mockResolvedValue(true);
    await applier.applyEvent(
      {
        epoch_version: 20,
        type: "topic",
        kind: "topic.updated",
        topic: createTopicDto({ unread_count: 2, active_unread_count: 2 }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(4);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
    expect(pending.size).toBe(0);
  });

  it("replays a cached-only read decrement after the originating runtime becomes stale", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let isCurrent = true;
    let releaseBoundary: ((messages: readonly MessengerMessage[]) => void) | undefined;
    const firstBoundary = new Promise<readonly MessengerMessage[]>((resolve) => {
      releaseBoundary = resolve;
    });
    const cachedUnreadMessage = adaptMessengerMessage(
      createMessageDto({ author_uuid: USER_B, is_own: false, read: false }),
    );
    const pending = new Map<
      string,
      {
        message: MessengerMessage;
        operation: "increment" | "decrement";
        delta: -1 | 1;
        mutationRevision: number;
      }
    >();
    const cache = {
      advanceReadBoundary: vi
        .fn()
        .mockImplementationOnce(() => firstBoundary)
        .mockResolvedValue([]),
      queuePendingUnreadProjection: vi.fn(
        (
          _ownerKey: string,
          message: MessengerMessage,
          operation: "increment" | "decrement",
          mutationRevision: number,
        ) => {
          pending.set(message.uuid, {
            message,
            operation,
            delta: operation === "increment" ? 1 : -1,
            mutationRevision,
          });
          return Promise.resolve();
        },
      ),
      readPendingUnreadProjections: vi.fn(() => Promise.resolve([...pending.values()])),
      completePendingUnreadProjections: vi.fn(
        (
          _ownerKey: string,
          projections: readonly { messageUuid: string; mutationRevision: number }[],
        ) => {
          for (const projection of projections) pending.delete(projection.messageUuid);
          return Promise.resolve();
        },
      ),
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({
      cache,
      isOwnerCurrent: () => isCurrent,
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const readEvent = {
      epoch_version: 20,
      type: "message" as const,
      kind: "message.read" as const,
      message: createMessageDto({ author_uuid: USER_B, is_own: false, read: true }),
    };

    const firstApplication = Promise.resolve(applier.applyEvent(readEvent, context));
    await vi.waitFor(() => expect(cache.advanceReadBoundary).toHaveBeenCalledOnce());
    isCurrent = false;
    releaseBoundary?.([cachedUnreadMessage]);
    await firstApplication;

    expect(pending.get(MESSAGE_A)?.delta).toBe(-1);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();

    isCurrent = true;
    await applier.applyEvent(readEvent, context);

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(1);
    expect(pending).toHaveLength(0);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(ownerKey, 20);
  });

  it("replays an exact cached read batch after its originating runtime becomes stale", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let isCurrent = true;
    let releaseFirstCacheWrite: (() => void) | undefined;
    const firstCacheWrite = new Promise<void>((resolve) => {
      releaseFirstCacheWrite = resolve;
    });
    const cachedUnreadMessage = adaptMessengerMessage(
      createMessageDto({ author_uuid: USER_B, is_own: false, read: false }),
    );
    const pending = new Map<
      string,
      {
        message: MessengerMessage;
        operation: "increment" | "decrement";
        delta: -1 | 1;
        mutationRevision: number;
      }
    >();
    const stageDecrement = (message: MessengerMessage, mutationRevision: number) => {
      pending.set(message.uuid, {
        message,
        operation: "decrement",
        delta: -1,
        mutationRevision,
      });
    };
    const cache = {
      readCachedMessages: vi
        .fn()
        .mockResolvedValueOnce([cachedUnreadMessage])
        .mockResolvedValue([]),
      markCachedMessagesRead: vi
        .fn()
        .mockImplementationOnce(
          (_ownerKey: string, _messageUuids: readonly string[], mutationRevision: number) => {
            stageDecrement(cachedUnreadMessage, mutationRevision);
            return firstCacheWrite;
          },
        )
        .mockResolvedValue(undefined),
      queuePendingUnreadProjection: vi.fn(
        (
          _ownerKey: string,
          message: MessengerMessage,
          _operation: "increment" | "decrement",
          mutationRevision: number,
        ) => {
          stageDecrement(message, mutationRevision);
          return Promise.resolve();
        },
      ),
      readPendingUnreadProjections: vi.fn(() => Promise.resolve([...pending.values()])),
      completePendingUnreadProjections: vi.fn(
        (
          _ownerKey: string,
          projections: readonly { messageUuid: string; mutationRevision: number }[],
        ) => {
          for (const projection of projections) pending.delete(projection.messageUuid);
          return Promise.resolve();
        },
      ),
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({
      cache,
      isOwnerCurrent: () => isCurrent,
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const readEvent = {
      epoch_version: 21,
      type: "messages" as const,
      kind: "messages.read" as const,
      messageUuids: [MESSAGE_A],
    };

    const firstApplication = Promise.resolve(applier.applyEvent(readEvent, context));
    await vi.waitFor(() => expect(cache.markCachedMessagesRead).toHaveBeenCalledOnce());
    isCurrent = false;
    releaseFirstCacheWrite?.();
    await firstApplication;

    expect(pending.get(MESSAGE_A)?.delta).toBe(-1);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(cache.writeRealtimeCursor).not.toHaveBeenCalled();

    isCurrent = true;
    await applier.applyEvent(readEvent, context);

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(1);
    expect(pending).toHaveLength(0);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(ownerKey, 21);
  });

  it("tracks read-state flips delivered through message.updated before message.read", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier({ cache: {} });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const message = createMessageDto({
      author_uuid: USER_B,
      user_uuid: USER_A,
      is_own: false,
      read: false,
    });
    applier.applyEvent(
      { epoch_version: 18, type: "message", kind: "message.created", message },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 19,
        type: "message",
        kind: "message.updated",
        message: { ...message, read: true },
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 20,
        type: "message",
        kind: "message.created",
        message,
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 21,
        type: "message",
        kind: "message.read",
        message: { ...message, read: true },
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
    expect(useWorkspaceMessageStore.getState().messagesById[message.uuid]?.read).toBe(true);
  });

  it("projects a cached-only message.updated read flip", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const cachedMessage = adaptMessengerMessage(
      createMessageDto({
        author_uuid: USER_B,
        user_uuid: USER_A,
        is_own: false,
        read: false,
      }),
    );
    const cache = {
      readCachedMessages: vi.fn(() => Promise.resolve([cachedMessage])),
      patchCachedMessage: vi.fn(() => Promise.resolve()),
      upsertCachedStream: vi.fn(),
      upsertCachedTopic: vi.fn(),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    await applier.applyEvent(
      {
        epoch_version: 21,
        type: "message",
        kind: "message.updated",
        message: createMessageDto({
          author_uuid: USER_B,
          user_uuid: USER_A,
          is_own: false,
          read: true,
        }),
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(1);
    expect(cache.patchCachedMessage).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({ uuid: MESSAGE_A, read: true }),
    );
  });

  it("serializes durable unread projections for the same stream", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let releaseFirstStreamWrite: (() => void) | undefined;
    const firstStreamWrite = new Promise<void>((resolve) => {
      releaseFirstStreamWrite = resolve;
    });
    const cache = {
      upsertCachedStream: vi
        .fn()
        .mockImplementationOnce(() => firstStreamWrite)
        .mockResolvedValue(undefined),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const message = createMessageDto({
      author_uuid: USER_B,
      user_uuid: USER_A,
      is_own: false,
      read: false,
    });

    applier.applyEvent(
      { epoch_version: 22, type: "message", kind: "message.created", message },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 23,
        type: "message",
        kind: "message.updated",
        message: { ...message, read: true },
      },
      context,
    );

    expect(cache.upsertCachedStream).toHaveBeenCalledTimes(1);
    expect(cache.upsertCachedTopic).not.toHaveBeenCalled();
    expect(cache.upsertCachedStream).toHaveBeenLastCalledWith(
      ownerKey,
      expect.objectContaining({ unreadCount: 4 }),
    );

    releaseFirstStreamWrite?.();
    await vi.waitFor(() => {
      expect(cache.upsertCachedStream).toHaveBeenCalledTimes(2);
      expect(cache.upsertCachedTopic).toHaveBeenCalledTimes(2);
    });
    expect(cache.upsertCachedStream).toHaveBeenLastCalledWith(
      ownerKey,
      expect.objectContaining({ unreadCount: 3 }),
    );
    expect(cache.upsertCachedTopic).toHaveBeenLastCalledWith(
      ownerKey,
      expect.objectContaining({ unreadCount: 2 }),
    );
  });

  it("serializes cached message deletion after its unread projection", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let releaseFirstStreamWrite: (() => void) | undefined;
    const firstStreamWrite = new Promise<void>((resolve) => {
      releaseFirstStreamWrite = resolve;
    });
    const cache = {
      upsertCachedStream: vi
        .fn()
        .mockImplementationOnce(() => firstStreamWrite)
        .mockResolvedValue(undefined),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
      deleteCachedMessage: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const message = createMessageDto({
      author_uuid: USER_B,
      is_own: false,
      read: false,
    });

    const createApplication = Promise.resolve(
      applier.applyEvent(
        { epoch_version: 22, type: "message", kind: "message.created", message },
        context,
      ),
    );
    const deleteApplication = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 23,
          type: "message",
          kind: "message.deleted",
          message: { uuid: MESSAGE_A, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
        },
        context,
      ),
    );

    expect(cache.deleteCachedMessage).not.toHaveBeenCalled();

    releaseFirstStreamWrite?.();
    await Promise.all([createApplication, deleteApplication]);

    expect(cache.upsertCachedStream).toHaveBeenCalledTimes(2);
    expect(cache.upsertCachedStream).toHaveBeenNthCalledWith(
      2,
      ownerKey,
      expect.objectContaining({ lastMessageUuid: MESSAGE_A }),
    );
    expect(cache.deleteCachedMessage).toHaveBeenCalledWith(ownerKey, MESSAGE_A, [
      `stream:${STREAM_A}`,
      `topic:${STREAM_A}:${TOPIC_A}`,
    ]);
    expect(cache.upsertCachedStream.mock.invocationCallOrder[1]).toBeLessThan(
      cache.deleteCachedMessage.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("serializes durable unread projections across streams that can share folders", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let releaseFirstStreamWrite: (() => void) | undefined;
    const firstStreamWrite = new Promise<void>((resolve) => {
      releaseFirstStreamWrite = resolve;
    });
    const cache = {
      upsertCachedStream: vi
        .fn()
        .mockImplementationOnce(() => firstStreamWrite)
        .mockResolvedValue(undefined),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [
        adaptMessengerStream(createStreamDto()),
        adaptMessengerStream(createStreamDto({ uuid: STREAM_B })),
      ],
      streamBindings: [],
      topics: [
        adaptMessengerTopic(createTopicDto()),
        adaptMessengerTopic(createTopicDto({ uuid: TOPIC_B, stream_uuid: STREAM_B })),
      ],
      conversations: [],
      folders: [],
    });

    const firstApplication = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 24,
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
      ),
    );
    const secondApplication = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 25,
          type: "message",
          kind: "message.created",
          message: createMessageDto({
            uuid: MESSAGE_B,
            stream_uuid: STREAM_B,
            topic_uuid: TOPIC_B,
            author_uuid: USER_B,
            is_own: false,
            read: false,
          }),
        },
        context,
      ),
    );

    expect(cache.upsertCachedStream).toHaveBeenCalledTimes(1);
    expect(cache.upsertCachedTopic).not.toHaveBeenCalled();

    releaseFirstStreamWrite?.();
    await Promise.all([firstApplication, secondApplication]);

    expect(cache.upsertCachedStream).toHaveBeenCalledTimes(2);
    expect(cache.upsertCachedStream).toHaveBeenNthCalledWith(
      2,
      ownerKey,
      expect.objectContaining({ uuid: STREAM_B }),
    );
    expect(cache.upsertCachedTopic).toHaveBeenCalledTimes(2);
  });

  it("serializes authoritative folder snapshots behind unread projections", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let releaseStreamWrite: (() => void) | undefined;
    const streamWrite = new Promise<void>((resolve) => {
      releaseStreamWrite = resolve;
    });
    const cache = {
      upsertCachedStream: vi.fn(() => streamWrite),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
      upsertCachedFolder: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    const unreadApplication = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 26,
          type: "message",
          kind: "message.created",
          message: createMessageDto({
            author_uuid: USER_B,
            is_own: false,
            read: false,
          }),
        },
        context,
      ),
    );
    const folderApplication = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 27,
          type: "folder",
          kind: "folder.updated",
          folder: createFolderDto({ title: "Backend inbox", updated_at: DATE_LATER }),
        },
        context,
      ),
    );

    expect(cache.upsertCachedFolder).not.toHaveBeenCalled();

    releaseStreamWrite?.();
    await Promise.all([unreadApplication, folderApplication]);

    expect(cache.upsertCachedFolder).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({ uuid: FOLDER_A, title: "Backend inbox" }),
    );
  });

  it("serializes authoritative catalog events behind unread projections", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let releaseFirstStreamWrite: (() => void) | undefined;
    const firstStreamWrite = new Promise<void>((resolve) => {
      releaseFirstStreamWrite = resolve;
    });
    const cache = {
      upsertCachedStream: vi
        .fn()
        .mockImplementationOnce(() => firstStreamWrite)
        .mockResolvedValue(undefined),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    applier.applyEvent(
      {
        epoch_version: 24,
        type: "message",
        kind: "message.created",
        message: createMessageDto({
          author_uuid: USER_B,
          user_uuid: USER_A,
          is_own: false,
          read: false,
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 25,
        type: "stream",
        kind: "stream.updated",
        stream: createStreamDto({
          unread_count: 9,
          active_unread_count: 7,
          passive_unread_count: 2,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 26,
        type: "topic",
        kind: "topic.updated",
        topic: createTopicDto({
          unread_count: 8,
          active_unread_count: 6,
          passive_unread_count: 2,
          updated_at: DATE_LATER,
        }),
      },
      context,
    );

    expect(cache.upsertCachedStream).toHaveBeenCalledTimes(1);
    expect(cache.upsertCachedTopic).not.toHaveBeenCalled();

    releaseFirstStreamWrite?.();
    await vi.waitFor(() => {
      expect(cache.upsertCachedStream).toHaveBeenCalledTimes(2);
      expect(cache.upsertCachedTopic).toHaveBeenCalledTimes(2);
    });
    expect(cache.upsertCachedStream).toHaveBeenLastCalledWith(
      ownerKey,
      expect.objectContaining({ unreadCount: 9, activeUnreadCount: 7 }),
    );
    expect(cache.upsertCachedTopic).toHaveBeenLastCalledWith(
      ownerKey,
      expect.objectContaining({ unreadCount: 8, activeUnreadCount: 6 }),
    );
  });

  it("drops queued cache projections after the runtime generation becomes stale", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let isCurrent = true;
    let releaseFirstStreamWrite: (() => void) | undefined;
    const firstStreamWrite = new Promise<void>((resolve) => {
      releaseFirstStreamWrite = resolve;
    });
    const cache = {
      upsertCachedStream: vi
        .fn()
        .mockImplementationOnce(() => firstStreamWrite)
        .mockResolvedValue(undefined),
      upsertCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({
      cache,
      isOwnerCurrent: () => isCurrent,
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const message = createMessageDto({
      author_uuid: USER_B,
      user_uuid: USER_A,
      is_own: false,
      read: false,
    });

    applier.applyEvent(
      { epoch_version: 27, type: "message", kind: "message.created", message },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 28,
        type: "message",
        kind: "message.updated",
        message: { ...message, read: true },
      },
      context,
    );
    isCurrent = false;
    releaseFirstStreamWrite?.();
    await firstStreamWrite;
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.upsertCachedStream).toHaveBeenCalledTimes(1);
    expect(cache.upsertCachedTopic).not.toHaveBeenCalled();
  });

  it("serializes topic deletion behind an older queued projection", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    let releaseTopicWrite: (() => void) | undefined;
    const topicWrite = new Promise<void>((resolve) => {
      releaseTopicWrite = resolve;
    });
    const cache = {
      upsertCachedStream: vi.fn(() => Promise.resolve()),
      upsertCachedTopic: vi.fn(() => topicWrite),
      deleteCachedTopic: vi.fn(() => Promise.resolve()),
    };
    const applier = createMessengerRealtimeActiveApplier({ cache });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });

    applier.applyEvent(
      {
        epoch_version: 29,
        type: "message",
        kind: "message.created",
        message: createMessageDto({
          author_uuid: USER_B,
          user_uuid: USER_A,
          is_own: false,
          read: false,
        }),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 30,
        type: "topic",
        kind: "topic.deleted",
        topic: { uuid: TOPIC_A, stream_uuid: STREAM_A },
      },
      context,
    );

    expect(cache.deleteCachedTopic).not.toHaveBeenCalled();
    releaseTopicWrite?.();
    await vi.waitFor(() => {
      expect(cache.deleteCachedTopic).toHaveBeenCalledWith(ownerKey, TOPIC_A, STREAM_A);
    });
  });

  it("projects exact messages.read batches without double-decrementing duplicate UUIDs", () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(createStreamDto())],
      streamBindings: [],
      topics: [adaptMessengerTopic(createTopicDto())],
      conversations: [],
      folders: [],
    });
    const message = createMessageDto({
      author_uuid: USER_B,
      user_uuid: USER_A,
      is_own: false,
      read: false,
    });
    applier.applyEvent(
      {
        epoch_version: 18,
        type: "message",
        kind: "message.created",
        message,
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 19,
        type: "messages",
        kind: "messages.read",
        messageUuids: [message.uuid, message.uuid],
      },
      context,
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(2);
  });

  it("repairs last-message pointers when the deleted tail arrives through realtime", async () => {
    const context = createContext();
    const runtimeContext = {
      ...context.owner,
      organizationOrigin: "https://organization-a.example.com",
      accessToken: "access-token-a",
    };
    const previousDto = createMessageDto({
      uuid: MESSAGE_A,
      created_at: "2026-06-22T10:00:00Z",
      updated_at: "2026-06-22T10:00:00Z",
    });
    const deletedDto = createMessageDto({
      uuid: MESSAGE_B,
      created_at: DATE_LATER,
      updated_at: DATE_LATER,
    });
    const getMessagesPage = vi.fn(() =>
      Promise.resolve({ items: [previousDto], nextPageMarker: null, pageLimit: 1 }),
    );
    const applier = createMessengerRealtimeActiveApplier({
      onMessageDeleted: (_ownerKey, _message, plan) =>
        repairDeletedMessagePointers({
          runtimeContext,
          plan,
          getRuntimeContext: () => runtimeContext,
          client: { getMessagesPage },
        }),
    });
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    applyStreamAndTopicSnapshot(applier, context, {
      stream: { last_message_uuid: MESSAGE_B, updated_at: DATE_LATER },
      topic: { last_message_uuid: MESSAGE_B, updated_at: DATE_LATER },
    });
    applier.applyEvent(
      {
        epoch_version: 3,
        type: "message",
        kind: "message.created",
        message: previousDto,
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 4,
        type: "message",
        kind: "message.created",
        message: deletedDto,
      },
      context,
    );

    applier.applyEvent(
      {
        epoch_version: 5,
        type: "message",
        kind: "message.deleted",
        message: { uuid: MESSAGE_B, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
      },
      context,
    );

    await vi.waitFor(() => {
      const state = useMessengerStore.getState();
      expect(state.streamsById[STREAM_A]?.lastMessageUuid).toBe(MESSAGE_A);
      expect(state.topicsById[TOPIC_A]?.lastMessageUuid).toBe(MESSAGE_A);
      expect(state.conversationsById[`stream:${STREAM_A}`]?.lastMessageUuid).toBe(MESSAGE_A);
      expect(state.conversationsById[`topic:${STREAM_A}:${TOPIC_A}`]?.lastMessageUuid).toBe(
        MESSAGE_A,
      );
    });
    expect(getMessagesPage).toHaveBeenCalledTimes(2);
  });

  it("publishes the deleted-message cursor without waiting for pointer repair", async () => {
    const context = createContext();
    let releaseRepair: (() => void) | undefined;
    const repair = new Promise<void>((resolve) => {
      releaseRepair = resolve;
    });
    const cache = { writeRealtimeCursor: vi.fn() };
    const onMessageDeleted = vi.fn(() => repair);
    const applier = createMessengerRealtimeActiveApplier({ cache, onMessageDeleted });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    const application = applier.applyEvent(
      {
        epoch_version: 5,
        type: "message",
        kind: "message.deleted",
        message: { uuid: MESSAGE_B, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
      },
      context,
    );

    expect(application).toBeUndefined();
    expect(onMessageDeleted).toHaveBeenCalledOnce();
    expect(useMessengerStore.getState().lastEpochVersion).toBe(5);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(context.ownerKey, 5);

    releaseRepair?.();
    await repair;
  });

  it("treats a rejected deleted-message pointer repair as best effort", async () => {
    const context = createContext();
    const cache = { writeRealtimeCursor: vi.fn() };
    const onMessageDeleted = vi.fn(() => Promise.reject(new Error("repair unavailable")));
    const applier = createMessengerRealtimeActiveApplier({ cache, onMessageDeleted });
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    expect(() =>
      applier.applyEvent(
        {
          epoch_version: 5,
          type: "message",
          kind: "message.deleted",
          message: { uuid: MESSAGE_B, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
        },
        context,
      ),
    ).not.toThrow();

    await Promise.resolve();
    expect(useMessengerStore.getState().lastEpochVersion).toBe(5);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(context.ownerKey, 5);
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

  it("stores old live provider messages without running message-created live side effects", () => {
    const context = createContext();
    const onMessageCreated = vi.fn();
    const applier = createMessengerRealtimeActiveApplier({ onMessageCreated });
    const oldCreatedAt = new Date(Date.now() - 60 * 60 * 1000 - 1).toISOString();
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 13,
        type: "message",
        message: createMessageDto({
          created_at: oldCreatedAt,
          updated_at: oldCreatedAt,
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

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        uuid: MESSAGE_A,
        createdAt: oldCreatedAt,
        provider: expect.objectContaining({ delivery_class: "live" }),
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

  it("does not mark external operation realtime events as unsupported in messenger appliers", () => {
    const activeContext = createContext();
    const backgroundContext = createContext(createOwner(), { surface: "background" });
    const activeApplier = createMessengerRealtimeActiveApplier();
    const backgroundApplier = createMessengerRealtimeBackgroundApplier();
    const event: WorkspaceRealtimeEvent = {
      epoch_version: 24,
      type: "external_operation",
      kind: "external_operation.updated",
      external_operation: { uuid: MESSAGE_A, status: "succeeded" },
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
    let releaseCleanup: (() => void) | undefined;
    const cleanup = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const deleteCachedStream = vi.fn();
    const writeRealtimeCursor = vi.fn();
    const removeProjection = vi.fn((options: RemoveMessengerStreamProjectionOptions) => {
      void options.deleteCachedStream?.(options.ownerKey, options.streamUuid);
      return cleanup;
    });
    const applier = createMessengerRealtimeBackgroundApplier({
      cache: { deleteCachedStream, writeRealtimeCursor },
      removeProjection,
    });

    const application = Promise.resolve(
      applier.applyEvent(
        {
          epoch_version: 43,
          type: "stream",
          kind: "stream.deleted",
          stream: createStreamDto(),
        },
        context,
      ),
    );
    let settled = false;
    void application.then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(removeProjection).toHaveBeenCalledOnce());
    expect(deleteCachedStream).toHaveBeenCalledOnce();
    expect(deleteCachedStream).toHaveBeenCalledWith(context.ownerKey, STREAM_A);
    expect(writeRealtimeCursor).toHaveBeenCalledWith(context.ownerKey, 43);
    expect(removeProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: context.ownerKey,
        streamUuid: STREAM_A,
        removeActiveProjection: false,
        isOwnerCurrent: expect.any(Function),
        deleteCachedStream: expect.any(Function),
      }),
    );
    expect(deleteCachedStream).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    releaseCleanup?.();
    await application;

    expect(settled).toBe(true);
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey]
        ?.lastEpochVersion,
    ).toBe(43);
  });

  it("writes background stream bindings without adding a deferred projection event", async () => {
    const context = createContext(createOwner(), { surface: "background" });
    const cache = {
      upsertCachedStreamBindings: vi.fn(),
      writeRealtimeCursor: vi.fn(),
    };
    const applier = createMessengerRealtimeBackgroundApplier({ cache });

    await applier.applyEvent(
      {
        epoch_version: 44,
        type: "stream_binding",
        kind: "stream_bindings.created",
        stream_uuid: STREAM_A,
        stream_bindings: [createStreamBindingDto()],
      },
      context,
    );

    expect(cache.upsertCachedStreamBindings).toHaveBeenCalledWith(context.ownerKey, [
      expect.objectContaining({ uuid: STREAM_BINDING_A, streamUuid: STREAM_A }),
    ]);
    expect(cache.writeRealtimeCursor).toHaveBeenCalledWith(context.ownerKey, 44);
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey],
    ).toBeUndefined();
  });

  it("keeps background file events deferred", async () => {
    const context = createContext(createOwner(), { surface: "background" });
    const writeRealtimeCursor = vi.fn();
    const applier = createMessengerRealtimeBackgroundApplier({
      cache: { writeRealtimeCursor },
    });

    await applier.applyEvent(
      {
        epoch_version: 45,
        type: "file",
        kind: "file.deleted",
        file: { uuid: MESSAGE_A, stream_uuid: STREAM_A },
      },
      context,
    );

    expect(writeRealtimeCursor).not.toHaveBeenCalled();
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey]
        ?.skippedEvents,
    ).toEqual([
      expect.objectContaining({
        epochVersion: 45,
        reason: "background_apply_deferred",
      }),
    ]);
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

  it("projects active owner realtime messages into the shared notification projection store", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);

    await applier.applyEvent(
      {
        epoch_version: 1,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto({
          private: true,
          notification_mode: "mentions_only",
        }),
      },
      context,
    );
    await applier.applyEvent(
      {
        epoch_version: 2,
        type: "topic",
        kind: "topic.created",
        topic: createTopicDto({
          name: "Releases",
          notification_mode: "follow",
        }),
      },
      context,
    );

    await applier.applyEvent(
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

  it("applies stream, binding, topic, folder, and delete skeleton mappings", async () => {
    const context = createContext();
    const ownerKey = context.ownerKey;
    const applier = createMessengerRealtimeActiveApplier();
    useMessengerStore.getState().startBootstrap(ownerKey);

    await applier.applyEvent(
      {
        epoch_version: 51,
        type: "stream",
        kind: "stream.created",
        stream: createStreamDto(),
      },
      context,
    );
    await applier.applyEvent(
      {
        epoch_version: 52,
        type: "stream_binding",
        kind: "stream_bindings.created",
        stream_uuid: STREAM_A,
        stream_bindings: [createStreamBindingDto()],
      },
      context,
    );
    await applier.applyEvent(
      {
        epoch_version: 53,
        type: "topic",
        kind: "topic.created",
        topic: createTopicDto(),
      },
      context,
    );
    await applier.applyEvent(
      {
        epoch_version: 54,
        type: "folder",
        kind: "folder.created",
        folder: createFolderDto(),
      },
      context,
    );

    await applier.applyEvent(
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
    await applier.applyEvent(
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
    await applier.applyEvent(
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

    await applier.applyEvent(
      {
        epoch_version: 58,
        type: "folder_item",
        kind: "folder_item.deleted",
        folder_item: { uuid: FOLDER_ITEM_A },
      },
      context,
    );
    await applier.applyEvent(
      {
        epoch_version: 59,
        type: "topic",
        kind: "topic.deleted",
        topic: { uuid: TOPIC_A, stream_uuid: STREAM_A },
      },
      context,
    );
    await applier.applyEvent(
      {
        epoch_version: 60,
        type: "stream",
        kind: "stream.deleted",
        stream: { uuid: STREAM_A },
      },
      context,
    );
    await applier.applyEvent(
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
          uuid: MESSENGER_ALL_CHATS_FOLDER_UUID,
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
          uuid: MESSENGER_ALL_CHATS_FOLDER_UUID,
          title: "All chats",
          unread_count: 7,
          system_type: "all",
          folder_items: [
            {
              uuid: FOLDER_ITEM_A,
              project_id: PROJECT_A,
              folder_uuid: MESSENGER_ALL_CHATS_FOLDER_UUID,
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
        folderUuid: MESSENGER_ALL_CHATS_FOLDER_UUID,
        title: "All chats",
        unreadCount: 7,
        systemType: "all",
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A, unreadCount: 1 })],
      }),
    ]);
  });
});
