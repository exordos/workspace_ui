import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectWorkspaceMessagesForConversation,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import { adaptMessengerBootstrapPayload, adaptMessengerMessage } from "./messenger-adapters.lib";
import { bootstrapMessengerStore } from "./messenger-bootstrap.lib";
import { selectWorkspaceChatHeaderView } from "./messenger-chat-header.lib";
import {
  selectMessengerFolders,
  selectMessengerSidebarConversations,
  useMessengerStore,
} from "./messenger.model";
import type { MessengerBootstrapClientDeps } from "./messenger-bootstrap.lib";

const loadWorkspaceComposerDrafts = vi.hoisted(() => vi.fn());

vi.mock("~/entities/composer-draft/composer-draft-loader.lib", () => ({
  loadWorkspaceComposerDrafts,
}));

type BootstrapUserDto = Awaited<
  ReturnType<NonNullable<MessengerBootstrapClientDeps["getUsers"]>>
>[number];

// Bootstrap tests protect the first project snapshot and stale-owner behavior.
const ACCOUNT_A = "account-a";
const ACCOUNT_B = "account-b";
const INSTANCE_A = "instance-a";
const INSTANCE_B = "instance-b";
const ORGANIZATION_A = "organization-a";
const ORGANIZATION_B = "organization-b";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "44444444-4444-4444-8444-444444444444";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_B = "37a28696-153d-431e-a5fb-36f0c0209765";
const STREAM_BINDING_A = "ea4364f4-96e3-4b33-b80d-fd53e5697151";
const STREAM_BINDING_B = "c06b5276-5438-40f3-85c0-1ae25ba6811b";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const TOPIC_B = "ed25f944-8106-4386-b2f9-65e9db32d465";
const FOLDER_A = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_B = "0fcdf284-7197-4d83-ae34-1134129bc064";
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const MESSAGE_B = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";
const DATE = "2026-06-22T10:10:00Z";
const DATE_LATER = "2026-06-22T10:20:00Z";

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: ACCOUNT_A,
    instanceId: INSTANCE_A,
    organizationId: ORGANIZATION_A,
    organizationOrigin: "https://org-a.example.com",
    projectId: PROJECT_A,
    userUuid: USER_A,
    accessToken: "access-token-a",
    runtimeGeneration: 1,
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

function createFolderDto(
  overrides: Partial<WorkspaceMessengerFolderDto> = {},
): WorkspaceMessengerFolderDto {
  return {
    uuid: FOLDER_A,
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
    ...overrides,
  };
}

function applyFolderSnapshots(
  ownerKey: string,
  folders: WorkspaceMessengerFolderDto[],
): ReturnType<typeof adaptMessengerBootstrapPayload>["folders"] {
  const adaptedFolders = adaptMessengerBootstrapPayload({
    streams: [],
    topics: [],
    folders,
  }).folders;

  for (const folder of adaptedFolders) {
    useMessengerStore.getState().applyFolderSnapshot(ownerKey, folder);
  }

  return adaptedFolders;
}

function createUserDto(overrides: Partial<BootstrapUserDto> = {}): BootstrapUserDto {
  return {
    uuid: USER_A,
    username: "alice",
    source: "iam",
    avatar: `urn:gavatar:${USER_A}`,
    status: "active",
    status_emoji: null,
    status_text: null,
    first_name: "Alice",
    last_name: "Tester",
    email: "alice@example.test",
    last_ping_at: DATE,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createUserFromDto(dto: BootstrapUserDto): User {
  const displayName = [dto.first_name, dto.last_name].filter(Boolean).join(" ").trim();
  return {
    uuid: dto.uuid,
    username: dto.username,
    firstName: dto.first_name ?? null,
    lastName: dto.last_name ?? null,
    displayName: displayName.length > 0 ? displayName : dto.username,
    email: dto.email ?? null,
    avatarUrl: null,
    status: dto.status,
    statusEmoji: dto.status_emoji ?? null,
    statusText: dto.status_text ?? null,
    lastPingAt: dto.last_ping_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function createClient(
  overrides: Partial<MessengerBootstrapClientDeps> = {},
): MessengerBootstrapClientDeps {
  return {
    getStreams: () => Promise.resolve([createStreamDto()]),
    getTopics: () => Promise.resolve([createTopicDto()]),
    getFolders: () => Promise.resolve([createFolderDto()]),
    getUsers: () => Promise.resolve([createUserDto()]),
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("messenger bootstrap store", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useUsersStore.getState().clear();
    loadWorkspaceComposerDrafts.mockReset();
    loadWorkspaceComposerDrafts.mockResolvedValue(undefined);
  });

  it("applies a successful Workspace payload to domain state", async () => {
    const runtimeContext = createRuntimeContext();
    const getStreams = vi.fn(() => Promise.resolve([createStreamDto()]));

    const result = await bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({ getStreams }),
    });

    const state = useMessengerStore.getState();
    expect(result).toEqual({
      status: "applied",
      ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    });
    expect(state.ownerKey).toBe(workspaceRuntimeOwnerKey(runtimeContext));
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.streamsById[STREAM_A]?.name).toBe("Engineering");
    expect(state.streamBindingIds).toEqual([]);
    expect(state.streamBindingsById).toEqual({});
    expect(state.streamBindingIdsByStreamId).toEqual({});
    expect(state.topicsById[TOPIC_A]?.name).toBe("Releases");
    expect(useWorkspaceMessageStore.getState().messagesById).toEqual({});
    expect(useWorkspaceMessageStore.getState().conversationWindowsById).toEqual({});
    expect(state.foldersById[FOLDER_A]?.title).toBe("Inbox");
    expect(useUsersStore.getState().getUser(USER_A)).toEqual(
      expect.objectContaining({
        username: "alice",
        firstName: "Alice",
      }),
    );
    expect(getStreams).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
    );
  });

  it("loads drafts for bootstrap but lets a realtime snapshot refresh skip them", async () => {
    const runtimeContext = createRuntimeContext();

    await bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient(),
    });

    expect(loadWorkspaceComposerDrafts).toHaveBeenCalledWith({
      runtimeContext,
      getRuntimeContext: expect.any(Function),
      signal: undefined,
      resumePending: true,
    });

    loadWorkspaceComposerDrafts.mockClear();
    await bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient(),
      loadDrafts: false,
    });

    expect(loadWorkspaceComposerDrafts).not.toHaveBeenCalled();
  });

  it("does not reconcile cached folders from the first folderless bootstrap payload", async () => {
    const runtimeContext = createRuntimeContext();
    const writeMessengerCatalogPayloadCache = vi.fn();

    await bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({ getFolders: () => Promise.resolve([]) }),
      cache: {
        writeMessengerCatalogPayloadCache,
        createMessengerCatalogCacheReconcileFence: () => 42,
      },
    });

    expect(writeMessengerCatalogPayloadCache).toHaveBeenCalledWith(
      workspaceRuntimeOwnerKey(runtimeContext),
      expect.objectContaining({
        folders: [],
        streams: [expect.objectContaining({ uuid: STREAM_A })],
        topics: [expect.objectContaining({ uuid: TOPIC_A })],
      }),
      {
        mode: "reconcile",
        reconcileFence: 42,
        reconcileFolders: false,
      },
    );
  });

  it("indexes stream bindings when the bootstrap payload provides them", () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    useMessengerStore.getState().startBootstrap(ownerKey);

    useMessengerStore.getState().replaceBootstrapState(
      ownerKey,
      adaptMessengerBootstrapPayload({
        streams: [createStreamDto()],
        streamBindings: [createStreamBindingDto()],
        topics: [createTopicDto()],
        folders: [createFolderDto()],
      }),
    );

    const state = useMessengerStore.getState();
    expect(state.streamBindingIds).toEqual([STREAM_BINDING_A]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([STREAM_BINDING_A]);
    expect(state.streamBindingsById[STREAM_BINDING_A]).toMatchObject({
      streamUuid: STREAM_A,
      notificationMode: "all_messages",
    });
  });

  it("keeps side-loaded stream bindings when a fresh bootstrap payload omits the bindings catalog", () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    useMessengerStore.getState().startBootstrap(ownerKey);

    const initialPayload = adaptMessengerBootstrapPayload({
      streams: [createStreamDto()],
      topics: [createTopicDto()],
      folders: [],
    });
    useUsersStore.getState().replaceUsers(
      [
        createUserDto(),
        createUserDto({
          uuid: USER_B,
          username: "bob",
          status: "offline",
          first_name: "Bob",
          last_name: "Tester",
          email: "bob@example.test",
        }),
      ].map(createUserFromDto),
    );
    useMessengerStore.getState().replaceBootstrapState(ownerKey, initialPayload);
    useMessengerStore.getState().upsertStreamBindings(
      ownerKey,
      adaptMessengerBootstrapPayload({
        streams: [],
        streamBindings: [
          createStreamBindingDto(),
          createStreamBindingDto({
            uuid: STREAM_BINDING_B,
            user_uuid: USER_B,
            who_uuid: USER_B,
            role: "member",
          }),
        ],
        topics: [],
        folders: [],
      }).streamBindings,
    );

    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      ...initialPayload,
      streamBindings: [],
    });

    const state = useMessengerStore.getState();
    expect(state.streamBindingIds).toEqual([STREAM_BINDING_A, STREAM_BINDING_B]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([
      STREAM_BINDING_A,
      STREAM_BINDING_B,
    ]);
    expect(
      selectWorkspaceChatHeaderView(state, {
        route: {
          kind: "stream",
          orgId: ORGANIZATION_A,
          projectId: PROJECT_A,
          streamUuid: STREAM_A,
        },
        usersById: useUsersStore.getState().usersById,
        fallbackTitle: "Messenger",
        missingDirectUserTitle: "Временно не подключено",
      }),
    ).toMatchObject({
      kind: "channel",
      participantsCount: 2,
      onlineCount: 1,
    });
  });

  it("keeps old bootstrap payloads without stream bindings compatible", () => {
    const payload = adaptMessengerBootstrapPayload({
      streams: [createStreamDto()],
      topics: [createTopicDto()],
      folders: [],
    });

    expect(payload.streamBindings).toEqual([]);
  });

  it("does not call the legacy messages endpoint during project bootstrap", async () => {
    const runtimeContext = createRuntimeContext();
    const client = createClient();

    await bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client,
    });

    expect("getMessages" in client).toBe(false);
  });

  it("applies the base sidebar snapshot before last messages finish loading", async () => {
    const runtimeContext = createRuntimeContext();
    const messageRequest = createDeferred<WorkspaceMessengerMessageDto[]>();
    const getMessagesByUuids = vi.fn(() => messageRequest.promise);

    const bootstrap = bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({
        getStreams: () => Promise.resolve([createStreamDto({ last_message_uuid: MESSAGE_A })]),
        getTopics: () => Promise.resolve([createTopicDto({ last_message_uuid: MESSAGE_A })]),
        getFolders: () => Promise.resolve([]),
        getMessagesByUuids,
      }),
      lastMessagesCache: { readMessagesByUuids: () => Promise.resolve([]) },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.name).toBe("Engineering");
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.name).toBe("Releases");
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(getMessagesByUuids).toHaveBeenCalledWith(expect.any(Object), [MESSAGE_A]);

    messageRequest.resolve([createMessageDto()]);
    await bootstrap;
    await flushPromises();

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
      "Hello, workspace",
    );
  });

  it("restores cached last messages after cached sidebar snapshot before network bootstrap", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const streamRequest = createDeferred<WorkspaceMessengerStreamDto[]>();
    const cachedPayload = adaptMessengerBootstrapPayload({
      streams: [createStreamDto({ last_message_uuid: MESSAGE_A, color: 0x2563eb })],
      topics: [createTopicDto({ last_message_uuid: MESSAGE_A })],
      folders: [],
    });
    const cachedMessage = adaptMessengerMessage(
      createMessageDto({ payload: { kind: "markdown", content: "Cached preview" } }),
    );
    const getMessagesByUuids = vi.fn(() => Promise.resolve([]));
    const readMessagesByUuids = vi.fn(() => Promise.resolve([cachedMessage]));

    const bootstrap = bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({
        getStreams: () => streamRequest.promise,
        getFolders: () => Promise.resolve([]),
        getMessagesByUuids,
      }),
      cache: {
        readMessengerCatalogPayloadCache: () =>
          Promise.resolve({ payload: cachedPayload, epochVersion: null }),
      },
      lastMessagesCache: { readMessagesByUuids },
    });
    await flushPromises();
    await flushPromises();

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.name).toBe("Engineering");
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.color).toBe(0x2563eb);
    expect(readMessagesByUuids).toHaveBeenCalledWith(ownerKey, [MESSAGE_A]);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
      "Cached preview",
    );
    expect(getMessagesByUuids).not.toHaveBeenCalled();

    streamRequest.resolve([createStreamDto({ last_message_uuid: MESSAGE_A })]);
    await bootstrap;
  });

  it("does not let a delayed cache hydrate replace fresh topic names", async () => {
    const runtimeContext = createRuntimeContext();
    const cachedMessagesRequest = createDeferred<ReturnType<typeof adaptMessengerMessage>[]>();
    const cachedPayload = adaptMessengerBootstrapPayload({
      streams: [createStreamDto({ last_message_uuid: MESSAGE_A })],
      topics: [createTopicDto({ name: "general chat", last_message_uuid: MESSAGE_A })],
      folders: [],
    });

    const bootstrap = bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({
        getStreams: () => Promise.resolve([createStreamDto()]),
        getTopics: () => Promise.resolve([createTopicDto({ name: "UI" })]),
        getFolders: () => Promise.resolve([]),
      }),
      cache: {
        readMessengerCatalogPayloadCache: () =>
          Promise.resolve({ payload: cachedPayload, epochVersion: null }),
      },
      lastMessagesCache: {
        readMessagesByUuids: () => cachedMessagesRequest.promise,
      },
    });

    await bootstrap;
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.name).toBe("UI");

    cachedMessagesRequest.resolve([]);
    await flushPromises();
    await flushPromises();

    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.name).toBe("UI");
  });

  it("does not let an older same-owner bootstrap replace a newer response", async () => {
    const runtimeContext = createRuntimeContext();
    const olderStreamsRequest = createDeferred<WorkspaceMessengerStreamDto[]>();
    const olderBootstrap = bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({
        getStreams: () => olderStreamsRequest.promise,
        getTopics: () => Promise.resolve([createTopicDto({ name: "general chat" })]),
        getFolders: () => Promise.resolve([]),
      }),
    });

    const newerBootstrap = bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({
        getStreams: () => Promise.resolve([createStreamDto()]),
        getTopics: () => Promise.resolve([createTopicDto({ name: "UI" })]),
        getFolders: () => Promise.resolve([]),
      }),
    });

    await expect(newerBootstrap).resolves.toEqual({
      status: "applied",
      ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    });
    olderStreamsRequest.resolve([createStreamDto()]);
    await expect(olderBootstrap).resolves.toEqual({
      status: "skipped",
      ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
      reason: "superseded",
    });
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.name).toBe("UI");
  });

  it("hydrates cached users before the users network request finishes", async () => {
    const runtimeContext = createRuntimeContext();
    const usersRequest = createDeferred<BootstrapUserDto[]>();
    const readUsersCache = vi.fn(() =>
      Promise.resolve([
        {
          uuid: USER_A,
          username: "cached-alice",
          displayName: "Cached Alice",
          firstName: "Cached",
          lastName: "Alice",
          email: "cached-alice@example.test",
          avatarUrl: null,
          createdAt: DATE,
          updatedAt: DATE,
        },
      ]),
    );
    const replaceUsersCache = vi.fn();

    const bootstrap = bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({
        getUsers: () => usersRequest.promise,
        getFolders: () => Promise.resolve([]),
      }),
      userCache: { readUsersCache, replaceUsersCache },
    });
    await flushPromises();
    await flushPromises();

    expect(readUsersCache).toHaveBeenCalledWith(workspaceRuntimeOwnerKey(runtimeContext));
    expect(useUsersStore.getState().getUser(USER_A)).toEqual(
      expect.objectContaining({
        username: "cached-alice",
        status: "offline",
      }),
    );
    expect(replaceUsersCache).not.toHaveBeenCalled();

    usersRequest.resolve([createUserDto({ username: "fresh-alice", updated_at: DATE_LATER })]);
    await bootstrap;

    expect(useUsersStore.getState().getUser(USER_A)).toEqual(
      expect.objectContaining({
        username: "fresh-alice",
        status: "active",
      }),
    );
    expect(replaceUsersCache).toHaveBeenCalledWith(workspaceRuntimeOwnerKey(runtimeContext), [
      expect.objectContaining({ uuid: USER_A, username: "fresh-alice" }),
    ]);
  });

  it("keeps cached folders while the background folder request is pending", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const streamRequest = createDeferred<WorkspaceMessengerStreamDto[]>();
    const folderRequest = createDeferred<WorkspaceMessengerFolderDto[]>();
    const cachedPayload = adaptMessengerBootstrapPayload({
      streams: [createStreamDto()],
      topics: [createTopicDto()],
      folders: [createFolderDto({ title: "Cached folders" })],
    });
    const replaceMessengerFolderSnapshotsCache = vi.fn();

    const bootstrap = bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({
        getStreams: () => streamRequest.promise,
        getFolders: () => folderRequest.promise,
      }),
      cache: {
        readMessengerCatalogPayloadCache: () =>
          Promise.resolve({ payload: cachedPayload, epochVersion: null }),
        replaceMessengerFolderSnapshotsCache,
      },
    });
    await flushPromises();
    await flushPromises();

    expect(useMessengerStore.getState().foldersById[FOLDER_A]?.title).toBe("Cached folders");

    streamRequest.resolve([createStreamDto({ name: "Fresh engineering" })]);
    await flushPromises();
    await flushPromises();

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.name).toBe("Fresh engineering");
    expect(useMessengerStore.getState().foldersById[FOLDER_A]?.title).toBe("Cached folders");

    folderRequest.resolve([
      createFolderDto({
        uuid: FOLDER_B,
        title: "Fresh folders",
        folder_items: createFolderDto().folder_items.map((item) => ({
          ...item,
          folder_uuid: FOLDER_B,
        })),
      }),
    ]);
    await bootstrap;

    expect(useMessengerStore.getState().folderIds).toEqual([FOLDER_B]);
    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toBeUndefined();
    expect(useMessengerStore.getState().foldersById[FOLDER_B]?.title).toBe("Fresh folders");
    expect(replaceMessengerFolderSnapshotsCache).toHaveBeenCalledWith(ownerKey, [
      expect.objectContaining({ uuid: FOLDER_B, title: "Fresh folders" }),
    ]);
  });

  it("keeps private stream conversations as stream and topic ids", async () => {
    const runtimeContext = createRuntimeContext();

    await bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient({
        getStreams: () => Promise.resolve([createStreamDto({ name: "Alice", private: true })]),
      }),
    });

    const conversations = selectMessengerSidebarConversations(useMessengerStore.getState());

    expect(conversations).toEqual([
      expect.objectContaining({
        id: `stream:${STREAM_A}`,
        audience: "private",
        isPrivate: true,
      }),
      expect.objectContaining({
        id: `topic:${STREAM_A}:${TOPIC_A}`,
        audience: "private",
        isPrivate: true,
      }),
    ]);
    expect(conversations.every((conversation) => !conversation.id.startsWith("dm:"))).toBe(true);
  });

  it("skips store writes when owner becomes stale after awaiting client data", async () => {
    let currentContext = createRuntimeContext();
    const streamRequest = createDeferred<WorkspaceMessengerStreamDto[]>();

    const bootstrap = bootstrapMessengerStore({
      runtimeContext: currentContext,
      getRuntimeContext: () => currentContext,
      client: createClient({
        getStreams: () => streamRequest.promise,
      }),
    });

    currentContext = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 1,
    });
    streamRequest.resolve([createStreamDto()]);

    await expect(bootstrap).resolves.toEqual({
      status: "skipped",
      ownerKey: workspaceRuntimeOwnerKey(createRuntimeContext()),
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().streamIds).toHaveLength(0);
    expect(useMessengerStore.getState().conversationIds).toHaveLength(0);
    expect(useUsersStore.getState().userIds).toEqual([]);
  });

  it("skips user writes when bootstrap signal is aborted after awaiting client data", async () => {
    const runtimeContext = createRuntimeContext();
    const streamRequest = createDeferred<WorkspaceMessengerStreamDto[]>();
    const controller = new AbortController();

    const bootstrap = bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      signal: controller.signal,
      client: createClient({
        getStreams: () => streamRequest.promise,
      }),
    });

    controller.abort();
    streamRequest.resolve([createStreamDto()]);

    await expect(bootstrap).resolves.toEqual({
      status: "skipped",
      ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().streamIds).toEqual([]);
    expect(useMessengerStore.getState().isLoading).toBe(false);
    expect(useMessengerStore.getState().error).toBeNull();
    expect(useUsersStore.getState().userIds).toEqual([]);
  });

  it("ignores abort errors from streams bootstrap without showing a sidebar error", async () => {
    const runtimeContext = createRuntimeContext();

    await expect(
      bootstrapMessengerStore({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: createClient({
          getStreams: () => Promise.reject(new DOMException("Aborted", "AbortError")),
        }),
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
      reason: "aborted",
    });

    const messengerState = useMessengerStore.getState();
    expect(messengerState.streamIds).toEqual([]);
    expect(messengerState.isLoading).toBe(false);
    expect(messengerState.error).toBeNull();
  });

  it("keeps streams and topics bootstrap when users request fails", async () => {
    const runtimeContext = createRuntimeContext();

    await expect(
      bootstrapMessengerStore({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: createClient({
          getUsers: () => Promise.reject(new Error("users failed")),
          getFolders: () => Promise.resolve([]),
        }),
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    });

    const messengerState = useMessengerStore.getState();
    const usersState = useUsersStore.getState();
    expect(messengerState.streamsById[STREAM_A]?.name).toBe("Engineering");
    expect(messengerState.topicsById[TOPIC_A]?.name).toBe("Releases");
    expect(usersState.loadStatus).toBe("error");
    expect(usersState.error).toBe("users failed");
    expect(usersState.userIds).toEqual([]);
  });

  it("clears previous owner users when the next owner users request fails", async () => {
    const runtimeA = createRuntimeContext();
    const runtimeB = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 1,
    });

    await bootstrapMessengerStore({
      runtimeContext: runtimeA,
      getRuntimeContext: () => runtimeA,
      client: createClient(),
    });
    expect(useUsersStore.getState().userIds).toEqual([USER_A]);

    await expect(
      bootstrapMessengerStore({
        runtimeContext: runtimeB,
        getRuntimeContext: () => runtimeB,
        client: createClient({
          getStreams: () =>
            Promise.resolve([
              createStreamDto({
                uuid: STREAM_B,
                project_id: PROJECT_B,
                owner: USER_B,
                user_uuid: USER_B,
              }),
            ]),
          getTopics: () => Promise.resolve([]),
          getFolders: () => Promise.resolve([]),
          getUsers: () => Promise.reject(new Error("users failed")),
        }),
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey: workspaceRuntimeOwnerKey(runtimeB),
    });

    const usersState = useUsersStore.getState();
    expect(usersState.ownerKey).toBe(workspaceRuntimeOwnerKey(runtimeB));
    expect(usersState.userIds).toEqual([]);
    expect(usersState.usersById[USER_A]).toBeUndefined();
    expect(usersState.loadStatus).toBe("error");
    expect(usersState.error).toBe("users failed");
  });

  it("keeps bootstrap users out of both stores when user DTO shape is legacy", async () => {
    const runtimeContext = createRuntimeContext();
    const legacyUserDto = {
      ...createUserDto(),
      uuid: 123,
    } as unknown as BootstrapUserDto;

    await expect(
      bootstrapMessengerStore({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: createClient({
          getUsers: () => Promise.resolve([legacyUserDto]),
          getFolders: () => Promise.resolve([]),
        }),
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    });

    const messengerState = useMessengerStore.getState();
    const usersState = useUsersStore.getState();
    expect(messengerState.streamsById[STREAM_A]?.name).toBe("Engineering");
    expect(usersState.userIds).toEqual([]);
    expect(usersState.loadStatus).toBe("error");
    expect(usersState.error).toBe("Expected at least one valid messenger user");
  });

  it("clears old owner data before replacing it with the next owner payload", async () => {
    const runtimeA = createRuntimeContext();
    const runtimeB = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 1,
    });
    let currentContext = runtimeA;

    await bootstrapMessengerStore({
      runtimeContext: runtimeA,
      getRuntimeContext: () => currentContext,
      client: createClient(),
    });
    expect(useMessengerStore.getState().streamIds).toEqual([STREAM_A]);

    currentContext = runtimeB;
    const streamRequest = createDeferred<WorkspaceMessengerStreamDto[]>();
    const bootstrapB = bootstrapMessengerStore({
      runtimeContext: runtimeB,
      getRuntimeContext: () => currentContext,
      client: createClient({
        getStreams: () => streamRequest.promise,
        getTopics: () =>
          Promise.resolve([
            createTopicDto({
              uuid: TOPIC_B,
              project_id: PROJECT_B,
              stream_uuid: STREAM_B,
              user_uuid: USER_B,
            }),
          ]),
        getFolders: () => Promise.resolve([]),
        getUsers: () =>
          Promise.resolve([
            createUserDto({
              uuid: USER_B,
              username: "bob",
              first_name: "Bob",
              email: "bob@example.test",
            }),
          ]),
      }),
    });

    expect(useMessengerStore.getState().ownerKey).toBe(workspaceRuntimeOwnerKey(runtimeB));
    expect(useMessengerStore.getState().streamIds).toHaveLength(0);
    expect(useUsersStore.getState().ownerKey).toBe(workspaceRuntimeOwnerKey(runtimeB));
    expect(useUsersStore.getState().userIds).toEqual([]);
    expect(useUsersStore.getState().loadStatus).toBe("loading");

    streamRequest.resolve([
      createStreamDto({
        uuid: STREAM_B,
        name: "Support",
        project_id: PROJECT_B,
        owner: USER_B,
        user_uuid: USER_B,
      }),
    ]);
    await expect(bootstrapB).resolves.toEqual({
      status: "applied",
      ownerKey: workspaceRuntimeOwnerKey(runtimeB),
    });

    const state = useMessengerStore.getState();
    expect(state.streamIds).toEqual([STREAM_B]);
    expect(state.streamsById[STREAM_A]).toBeUndefined();
    expect(state.streamsById[STREAM_B]?.name).toBe("Support");
    expect(useUsersStore.getState().usersById[USER_B]?.username).toBe("bob");
  });

  it("returns stable selector arrays while store references do not change", async () => {
    const runtimeContext = createRuntimeContext();

    await bootstrapMessengerStore({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: createClient(),
    });

    const state = useMessengerStore.getState();
    const sidebarConversations = selectMessengerSidebarConversations(state);
    const sameSidebarConversations = selectMessengerSidebarConversations(state);
    const messageState = useWorkspaceMessageStore.getState();
    const conversationMessages = selectWorkspaceMessagesForConversation(
      messageState,
      `topic:${STREAM_A}:${TOPIC_A}`,
    );
    const sameConversationMessages = selectWorkspaceMessagesForConversation(
      messageState,
      `topic:${STREAM_A}:${TOPIC_A}`,
    );
    const folders = selectMessengerFolders(state);
    const sameFolders = selectMessengerFolders(state);
    const emptyMessages = selectWorkspaceMessagesForConversation(
      messageState,
      `stream:${STREAM_A}`,
    );
    const sameEmptyMessages = selectWorkspaceMessagesForConversation(
      messageState,
      `stream:${STREAM_A}`,
    );

    expect(sameSidebarConversations).toBe(sidebarConversations);
    expect(sameConversationMessages).toBe(conversationMessages);
    expect(sameFolders).toBe(folders);
    expect(sameEmptyMessages).toBe(emptyMessages);
  });

  it("keeps new store actions scoped to the active owner", () => {
    const runtimeA = createRuntimeContext();
    const runtimeB = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 1,
    });
    const ownerA = workspaceRuntimeOwnerKey(runtimeA);
    const ownerB = workspaceRuntimeOwnerKey(runtimeB);
    useMessengerStore.getState().startBootstrap(ownerA);

    useMessengerStore.getState().upsertStream(
      ownerB,
      adaptMessengerBootstrapPayload({
        streams: [createStreamDto()],
        topics: [],
        folders: [],
      }).streams[0]!,
    );
    useMessengerStore.getState().markRealtimeEventSkipped(ownerB, 10, "stale-owner-test");

    expect(useMessengerStore.getState().streamIds).toEqual([]);
    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
  });

  it("upserts and removes streams with conversations, bindings, and topics", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    const payload = adaptMessengerBootstrapPayload({
      streams: [createStreamDto()],
      streamBindings: [createStreamBindingDto()],
      topics: [createTopicDto()],
      folders: [],
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, payload);

    expect(useMessengerStore.getState().conversationIds).toContain(`stream:${STREAM_A}`);
    expect(useMessengerStore.getState().conversationIds).toContain(`topic:${STREAM_A}:${TOPIC_A}`);

    useMessengerStore.getState().removeStream(ownerKey, { uuid: STREAM_A });

    const state = useMessengerStore.getState();
    expect(state.streamsById[STREAM_A]).toBeUndefined();
    expect(state.topicsById[TOPIC_A]).toBeUndefined();
    expect(state.conversationIds).toEqual([]);
    expect(state.streamBindingIds).toEqual([]);
  });

  it("upserts stream bindings without duplicating binding indexes", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    const [binding] = adaptMessengerBootstrapPayload({
      streams: [],
      streamBindings: [createStreamBindingDto()],
      topics: [],
      folders: [],
    }).streamBindings;
    useMessengerStore.getState().startBootstrap(ownerKey);

    useMessengerStore.getState().upsertStreamBindings(ownerKey, [binding!, binding!]);

    expect(useMessengerStore.getState().streamBindingIds).toEqual([STREAM_BINDING_A]);
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toEqual([
      STREAM_BINDING_A,
    ]);
  });

  it("upserts topics and removes topic conversations", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    const [stream] = adaptMessengerBootstrapPayload({
      streams: [createStreamDto()],
      topics: [],
      folders: [],
    }).streams;
    const [topic] = adaptMessengerBootstrapPayload({
      streams: [],
      topics: [createTopicDto({ is_done: true, notification_mode: "follow" })],
      folders: [],
    }).topics;
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().upsertStream(ownerKey, stream!);
    useMessengerStore.getState().upsertTopic(ownerKey, topic!);

    expect(useMessengerStore.getState().conversationsById[`topic:${STREAM_A}:${TOPIC_A}`]).toEqual(
      expect.objectContaining({
        notificationMode: "follow",
        isDone: true,
        isDefaultTopic: false,
      }),
    );

    useMessengerStore.getState().removeTopic(ownerKey, { uuid: TOPIC_A, streamUuid: STREAM_A });

    const state = useMessengerStore.getState();
    expect(state.topicsById[TOPIC_A]).toBeUndefined();
    expect(state.conversationsById[`topic:${STREAM_A}:${TOPIC_A}`]).toBeUndefined();
  });

  it("merges message pages without duplicates and removes messages by delete payload", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    const messageA = adaptMessengerMessage(createMessageDto());
    const messageB = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
    );
    useMessengerStore.getState().startBootstrap(ownerKey);

    const messageStore = useWorkspaceMessageStore.getState();
    messageStore.replaceConversationWindow({
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      expectedRevision: null,
      capturedMutationRevision: messageStore.messageMutationRevision,
      mode: "tail",
      anchorMessageUuid: null,
      messages: [
        messageB,
        messageA,
        { ...messageA, payload: { kind: "markdown", content: "Edited" } },
      ],
      markers: { beforePageMarker: null, afterPageMarker: null },
    });

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([
      expect.objectContaining({
        uuid: MESSAGE_A,
        payload: { kind: "markdown", content: "Edited" },
      }),
      expect.objectContaining({ uuid: MESSAGE_B }),
    ]);

    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_B })]);
  });

  it("indexes messages into stream and topic buckets and applies message mutations", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    const message = adaptMessengerMessage(createMessageDto());
    useMessengerStore.getState().startBootstrap(ownerKey);

    const messageStore = useWorkspaceMessageStore.getState();
    messageStore.replaceConversationWindow({
      conversationId: `stream:${STREAM_A}`,
      expectedRevision: null,
      capturedMutationRevision: messageStore.messageMutationRevision,
      mode: "tail",
      anchorMessageUuid: null,
      messages: [message],
      markers: { beforePageMarker: null, afterPageMarker: null },
    });
    messageStore.replaceConversationWindow({
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      expectedRevision: null,
      capturedMutationRevision: messageStore.messageMutationRevision,
      mode: "tail",
      anchorMessageUuid: null,
      messages: [message],
      markers: { beforePageMarker: null, afterPageMarker: null },
    });

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `stream:${STREAM_A}`,
      ),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_A })]);
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_A })]);
    expect(Object.keys(useWorkspaceMessageStore.getState().messagesById)).toEqual([MESSAGE_A]);

    useWorkspaceMessageStore.getState().applyMessageEdit(MESSAGE_A, {
      markdown: "Edited workspace message",
      updatedAt: "2026-06-22T10:20:00Z",
    });
    useWorkspaceMessageStore.getState().markMessageRead(MESSAGE_A, {
      conversationIds: [`stream:${STREAM_A}`],
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({
        payload: { kind: "markdown", content: "Edited workspace message" },
        read: true,
        updatedAt: "2026-06-22T10:20:00Z",
      }),
    );

    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `stream:${STREAM_A}`,
      ),
    ).toEqual([]);
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([]);
  });

  it("applies folder snapshots and removes folder items from every folder", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    const [folderA] = adaptMessengerBootstrapPayload({
      streams: [],
      topics: [],
      folders: [createFolderDto()],
    }).folders;
    const [folderB] = adaptMessengerBootstrapPayload({
      streams: [],
      topics: [],
      folders: [
        createFolderDto({
          uuid: FOLDER_B,
          title: "Pinned",
          folder_items: createFolderDto().folder_items.map((item) => ({
            ...item,
            folder_uuid: FOLDER_B,
          })),
        }),
      ],
    }).folders;
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().applyFolderSnapshot(ownerKey, folderA!);
    useMessengerStore.getState().applyFolderSnapshot(ownerKey, folderB!);

    useMessengerStore.getState().removeFolderItem(ownerKey, { uuid: FOLDER_ITEM_A });

    expect(selectMessengerFolders(useMessengerStore.getState())).toEqual([
      expect.objectContaining({ uuid: FOLDER_A, items: [] }),
      expect.objectContaining({ uuid: FOLDER_B, items: [] }),
    ]);

    useMessengerStore.getState().removeFolder(ownerKey, { uuid: FOLDER_A });

    expect(useMessengerStore.getState().folderIds).toEqual([FOLDER_B]);
  });

  it("upserts a single folder item without rebuilding folder snapshots", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    useMessengerStore.getState().startBootstrap(ownerKey);
    const [, folderB] = applyFolderSnapshots(ownerKey, [
      createFolderDto({ folder_items: [] }),
      createFolderDto({
        uuid: FOLDER_B,
        title: "Pinned",
        folder_items: createFolderDto().folder_items.map((item) => ({
          ...item,
          folder_uuid: FOLDER_B,
        })),
      }),
    ]);

    const folderIds = useMessengerStore.getState().folderIds;
    const [folderItem] = folderB!.items;
    useMessengerStore.getState().upsertFolderItem(ownerKey, {
      ...folderItem!,
      folderUuid: FOLDER_A,
      orderIndex: 1,
    });
    useMessengerStore.getState().upsertFolderItem("stale-owner", {
      ...folderItem!,
      uuid: "ignored-item",
      folderUuid: FOLDER_A,
    });
    useMessengerStore.getState().upsertFolderItem(ownerKey, {
      ...folderItem!,
      uuid: "missing-folder-item",
      folderUuid: "missing-folder",
    });

    expect(useMessengerStore.getState().folderIds).toBe(folderIds);
    expect(selectMessengerFolders(useMessengerStore.getState())).toEqual([
      expect.objectContaining({
        uuid: FOLDER_A,
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A, orderIndex: 1 })],
      }),
      expect.objectContaining({ uuid: FOLDER_B, items: [] }),
    ]);
  });

  it("raises folder unread count when a local folder item is added", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyFolderSnapshots(ownerKey, [createFolderDto({ unread_count: 0, folder_items: [] })]);

    useMessengerStore.getState().upsertFolderItem(ownerKey, {
      uuid: FOLDER_ITEM_A,
      projectId: PROJECT_A,
      folderUuid: FOLDER_A,
      userUuid: USER_A,
      streamUuid: STREAM_A,
      conversationId: `stream:${STREAM_A}`,
      chatType: "private",
      orderIndex: 10,
      pinnedAt: null,
      unreadCount: 4,
      createdAt: DATE,
      updatedAt: "2026-06-22T10:20:00Z",
    });

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toEqual(
      expect.objectContaining({
        unreadCount: 4,
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A, unreadCount: 4 })],
      }),
    );
  });

  it("recomputes folder unread count when an existing folder item changes locally", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    useMessengerStore.getState().startBootstrap(ownerKey);
    const [folder] = applyFolderSnapshots(ownerKey, [createFolderDto()]);
    const [folderItem] = folder!.items;

    useMessengerStore.getState().upsertFolderItem(ownerKey, {
      ...folderItem!,
      unreadCount: 7,
      activeUnreadCount: 7,
      updatedAt: "2026-06-22T10:30:00Z",
    });

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toEqual(
      expect.objectContaining({
        unreadCount: 7,
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A, unreadCount: 7 })],
      }),
    );
  });

  it("lowers folder unread count when a local folder item is removed", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    useMessengerStore.getState().startBootstrap(ownerKey);
    applyFolderSnapshots(ownerKey, [createFolderDto()]);

    useMessengerStore.getState().removeFolderItem(ownerKey, { uuid: FOLDER_ITEM_A });

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toEqual(
      expect.objectContaining({
        unreadCount: 0,
        items: [],
      }),
    );
  });

  it("recomputes unread counts for both folders when a folder item moves locally", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    useMessengerStore.getState().startBootstrap(ownerKey);
    const [, folderB] = applyFolderSnapshots(ownerKey, [
      createFolderDto({ unread_count: 0, folder_items: [] }),
      createFolderDto({
        uuid: FOLDER_B,
        title: "Pinned",
        unread_count: 3,
        folder_items: createFolderDto().folder_items.map((item) => ({
          ...item,
          folder_uuid: FOLDER_B,
          unread_count: 3,
          active_unread_count: 3,
          passive_unread_count: 0,
        })),
      }),
    ]);

    useMessengerStore.getState().upsertFolderItem(ownerKey, {
      ...folderB!.items[0]!,
      folderUuid: FOLDER_A,
      unreadCount: 6,
      activeUnreadCount: 6,
      updatedAt: "2026-06-22T10:40:00Z",
    });

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toEqual(
      expect.objectContaining({
        unreadCount: 6,
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A, folderUuid: FOLDER_A })],
      }),
    );
    expect(useMessengerStore.getState().foldersById[FOLDER_B]).toEqual(
      expect.objectContaining({
        unreadCount: 0,
        items: [],
      }),
    );
  });

  it("keeps realtime cursor monotonic and records skipped events", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    useMessengerStore.getState().startBootstrap(ownerKey);

    useMessengerStore.getState().setRealtimeCursor(ownerKey, 5);
    useMessengerStore.getState().setRealtimeCursor(ownerKey, 3);
    useMessengerStore.getState().markRealtimeEventSkipped(ownerKey, 7, "unknown-event");
    useMessengerStore.getState().markRealtimeEventSkipped(ownerKey, 6, "duplicate-event");

    expect(useMessengerStore.getState().lastEpochVersion).toBe(7);
    expect(useMessengerStore.getState().skippedRealtimeEvents).toEqual([
      { epochVersion: 7, reason: "unknown-event" },
      { epochVersion: 6, reason: "duplicate-event" },
    ]);
  });
});
