import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerCreateFolderItemRequestBody,
  WorkspaceMessengerCreateTopicRequestBody,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerStreamNotificationRequestBody,
  WorkspaceMessengerUpdateStreamRequestBody,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerTopicNotificationRequestBody,
  WorkspaceMessengerUpdateTopicRequestBody,
} from "~/shared/api/messenger.types";
import {
  adaptMessengerFolder,
  adaptMessengerStream,
  adaptMessengerTopic,
} from "./messenger-adapters.lib";
import { inheritWorkspaceStreamNotificationTransition } from "./messenger-notification-mode.lib";
import {
  createMessengerFolderItem,
  createMessengerTopic,
  deleteMessengerFolderItem,
  pinMessengerFolderItem,
  renameMessengerStream,
  renameMessengerTopic,
  setMessengerTopicNotificationMode,
  toggleMessengerTopicDone,
  unpinMessengerFolderItem,
  updateMessengerStreamNotificationMode,
} from "./messenger-sidebar-actions.lib";
import {
  createMessengerCatalogMutationFence,
  createMessengerPendingUnreadProjectionRevision,
  messengerPendingUnreadProjectionCoverage,
  useMessengerStore,
} from "./messenger.model";

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
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const FOLDER_A = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const DATE = "2026-06-22T10:10:00Z";

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

function createFolderItemDto(
  overrides: Partial<WorkspaceMessengerFolderItemDto> = {},
): WorkspaceMessengerFolderItemDto {
  return {
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
    ...overrides,
  };
}

function prepareStoreOwner(runtimeContext: WorkspaceRuntimeContext): string {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  useMessengerStore.getState().startBootstrap(ownerKey);
  return ownerKey;
}

function seedFolder(ownerKey: string): void {
  useMessengerStore.getState().applyFolderSnapshot(
    ownerKey,
    adaptMessengerFolder({
      uuid: FOLDER_A,
      title: "Inbox",
      background_color_value: null,
      unread_count: 0,
      system_type: "created",
      folder_items: [],
      created_at: DATE,
      updated_at: DATE,
    }),
  );
}

function seedStream(ownerKey: string, dto: WorkspaceMessengerStreamDto = createStreamDto()): void {
  useMessengerStore.getState().upsertStream(ownerKey, adaptMessengerStream(dto));
}

function seedFolderWithItem(ownerKey: string): void {
  useMessengerStore.getState().applyFolderSnapshot(
    ownerKey,
    adaptMessengerFolder({
      uuid: FOLDER_A,
      title: "Inbox",
      background_color_value: null,
      unread_count: 3,
      system_type: "created",
      folder_items: [createFolderItemDto()],
      created_at: DATE,
      updated_at: DATE,
    }),
  );
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("messenger sidebar actions", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
  });

  it("updates stream notification mode and upserts the adapted stream", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const updateStreamNotifications = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerStreamNotificationRequestBody,
      ) => Promise.resolve(createStreamDto({ notification_mode: "muted" })),
    );

    await expect(
      updateMessengerStreamNotificationMode({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        streamUuid: STREAM_A,
        notificationMode: "muted",
        client: { updateStreamNotifications },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      stream: expect.objectContaining({ uuid: STREAM_A, notificationMode: "muted" }),
    });

    expect(updateStreamNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      STREAM_A,
      { notification_mode: "muted" },
    );
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");
  });

  it("applies stream notification mode optimistically while the request is pending", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const updateRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const updateStreamNotifications = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerStreamNotificationRequestBody,
      ) => updateRequest.promise,
    );

    const actionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications },
    });

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    updateRequest.resolve(createStreamDto({ notification_mode: "muted" }));
    await expect(actionPromise).resolves.toEqual({
      status: "applied",
      ownerKey,
      stream: expect.objectContaining({ uuid: STREAM_A, notificationMode: "muted" }),
    });
  });

  it("preserves realtime unread counters while an optimistic mode request finishes", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(
      ownerKey,
      createStreamDto({
        notification_mode: "all_messages",
        unread_count: 3,
        active_unread_count: 3,
        passive_unread_count: 0,
      }),
    );
    const updateRequest = createDeferred<WorkspaceMessengerStreamDto>();

    const actionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications: vi.fn(() => updateRequest.promise) },
    });

    const optimisticStream = useMessengerStore.getState().streamsById[STREAM_A];
    expect(optimisticStream).toBeDefined();
    if (optimisticStream == null) return;
    const realtimeStream = {
      ...optimisticStream,
      unreadCount: 2,
      activeUnreadCount: 2,
      updatedAt: "2026-06-22T10:20:00Z",
    };
    inheritWorkspaceStreamNotificationTransition(optimisticStream, realtimeStream);
    useMessengerStore.getState().upsertStream(ownerKey, realtimeStream, { kind: "derived" });

    updateRequest.resolve(createStreamDto({ notification_mode: "muted" }));
    await actionPromise;

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({
        notificationMode: "muted",
        unreadCount: 2,
        activeUnreadCount: 2,
        passiveUnreadCount: 0,
        updatedAt: "2026-06-22T10:20:00Z",
      }),
    );
  });

  it("reclassifies retained default-topic unread counters after a mode update succeeds", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(
      ownerKey,
      createStreamDto({
        notification_mode: "all_messages",
        unread_count: 1,
        active_unread_count: 1,
        passive_unread_count: 0,
      }),
    );
    useMessengerStore.getState().upsertTopic(
      ownerKey,
      adaptMessengerTopic(
        createTopicDto({
          unread_count: 1,
          active_unread_count: 1,
          passive_unread_count: 0,
          notification_mode: "default",
        }),
      ),
    );
    const updateRequest = createDeferred<WorkspaceMessengerStreamDto>();

    const actionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications: vi.fn(() => updateRequest.promise) },
    });

    updateRequest.resolve(createStreamDto({ notification_mode: "muted" }));
    await actionPromise;

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({
        notificationMode: "muted",
        unreadCount: 1,
        activeUnreadCount: 0,
        passiveUnreadCount: 1,
      }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ unreadCount: 1, activeUnreadCount: 0, passiveUnreadCount: 1 }),
    );
  });

  it("finishes unread reclassification when missing topic metadata arrives", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(
      ownerKey,
      createStreamDto({
        notification_mode: "all_messages",
        unread_count: 1,
        active_unread_count: 1,
        passive_unread_count: 0,
      }),
    );

    await updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: {
        updateStreamNotifications: vi.fn(() =>
          Promise.resolve(createStreamDto({ notification_mode: "muted" })),
        ),
      },
    });

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ activeUnreadCount: 1, passiveUnreadCount: 0 }),
    );

    useMessengerStore.getState().upsertTopic(
      ownerKey,
      adaptMessengerTopic(
        createTopicDto({
          unread_count: 1,
          active_unread_count: 1,
          passive_unread_count: 0,
          notification_mode: "default",
        }),
      ),
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ activeUnreadCount: 0, passiveUnreadCount: 1 }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ activeUnreadCount: 0, passiveUnreadCount: 1 }),
    );
  });

  it("reclassifies missing topic metadata supplied by an older bootstrap", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(
      ownerKey,
      createStreamDto({
        notification_mode: "all_messages",
        unread_count: 1,
        active_unread_count: 1,
        passive_unread_count: 0,
      }),
    );
    const catalogMutationFence = createMessengerCatalogMutationFence(ownerKey);

    await updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: {
        updateStreamNotifications: vi.fn(() =>
          Promise.resolve(createStreamDto({ notification_mode: "muted" })),
        ),
      },
    });

    useMessengerStore.getState().replaceBootstrapState(
      ownerKey,
      {
        streams: [
          adaptMessengerStream(
            createStreamDto({
              notification_mode: "all_messages",
              unread_count: 1,
              active_unread_count: 1,
              passive_unread_count: 0,
            }),
          ),
        ],
        streamBindings: [],
        topics: [
          adaptMessengerTopic(
            createTopicDto({
              notification_mode: "default",
              unread_count: 1,
              active_unread_count: 1,
              passive_unread_count: 0,
            }),
          ),
        ],
        conversations: [],
        folders: [],
      },
      { catalogMutationFence },
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({
        notificationMode: "muted",
        activeUnreadCount: 0,
        passiveUnreadCount: 1,
      }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ activeUnreadCount: 0, passiveUnreadCount: 1 }),
    );
  });

  it("does not treat notification bucket reclassification as pending unread coverage", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(
      ownerKey,
      createStreamDto({
        notification_mode: "all_messages",
        unread_count: 1,
        active_unread_count: 1,
        passive_unread_count: 0,
      }),
    );
    useMessengerStore.getState().upsertTopic(
      ownerKey,
      adaptMessengerTopic(
        createTopicDto({
          unread_count: 1,
          active_unread_count: 1,
          passive_unread_count: 0,
          notification_mode: "default",
        }),
      ),
    );
    const pendingRevision = createMessengerPendingUnreadProjectionRevision(ownerKey);

    await updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: {
        updateStreamNotifications: vi.fn(() =>
          Promise.resolve(createStreamDto({ notification_mode: "muted" })),
        ),
      },
    });

    expect(
      messengerPendingUnreadProjectionCoverage(
        ownerKey,
        MESSAGE_A,
        STREAM_A,
        TOPIC_A,
        pendingRevision,
      ),
    ).toEqual({ stream: false, topic: false });
  });

  it("rolls back optimistic stream notification mode when the request fails", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const updateRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const updateStreamNotifications = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerStreamNotificationRequestBody,
      ) => updateRequest.promise,
    );

    const actionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications },
    });

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    updateRequest.reject(new Error("Update failed"));
    await expect(actionPromise).rejects.toThrow("Update failed");
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe(
      "all_messages",
    );
  });

  it("does not retain an optimistic notification projection over a bootstrap snapshot", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const catalogMutationFence = createMessengerCatalogMutationFence(ownerKey);
    const updateRequest = createDeferred<WorkspaceMessengerStreamDto>();

    const actionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications: vi.fn(() => updateRequest.promise) },
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    useMessengerStore.getState().replaceBootstrapState(
      ownerKey,
      {
        streams: [
          adaptMessengerStream(
            createStreamDto({
              notification_mode: "all_messages",
              unread_count: 9,
              active_unread_count: 7,
              passive_unread_count: 2,
            }),
          ),
        ],
        streamBindings: [],
        topics: [],
        conversations: [],
        folders: [],
      },
      { catalogMutationFence },
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({
        notificationMode: "all_messages",
        unreadCount: 9,
        activeUnreadCount: 7,
        passiveUnreadCount: 2,
      }),
    );

    updateRequest.reject(new Error("Update failed"));
    await expect(actionPromise).rejects.toThrow("Update failed");
    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ notificationMode: "all_messages", unreadCount: 9 }),
    );
  });

  it("applies a successful notification update over a same-owner bootstrap replacement", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const catalogMutationFence = createMessengerCatalogMutationFence(ownerKey);
    const updateRequest = createDeferred<WorkspaceMessengerStreamDto>();

    const actionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications: vi.fn(() => updateRequest.promise) },
    });

    useMessengerStore.getState().replaceBootstrapState(
      ownerKey,
      {
        streams: [
          adaptMessengerStream(
            createStreamDto({
              name: "Bootstrap name",
              notification_mode: "all_messages",
              unread_count: 9,
              active_unread_count: 7,
              passive_unread_count: 2,
            }),
          ),
        ],
        streamBindings: [],
        topics: [
          adaptMessengerTopic(
            createTopicDto({
              unread_count: 7,
              active_unread_count: 7,
              passive_unread_count: 0,
              notification_mode: "default",
            }),
          ),
        ],
        conversations: [],
        folders: [],
      },
      { catalogMutationFence },
    );

    updateRequest.resolve(createStreamDto({ notification_mode: "muted" }));
    await expect(actionPromise).resolves.toEqual({
      status: "applied",
      ownerKey,
      stream: expect.objectContaining({ notificationMode: "muted" }),
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({
        name: "Bootstrap name",
        notificationMode: "muted",
        unreadCount: 9,
        activeUnreadCount: 0,
        passiveUnreadCount: 9,
      }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({ unreadCount: 7, activeUnreadCount: 0, passiveUnreadCount: 7 }),
    );
  });

  it("preserves a successful notification reclassification over an older bootstrap response", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(
      ownerKey,
      createStreamDto({
        notification_mode: "all_messages",
        unread_count: 1,
        active_unread_count: 1,
        passive_unread_count: 0,
      }),
    );
    useMessengerStore.getState().upsertTopic(
      ownerKey,
      adaptMessengerTopic(
        createTopicDto({
          notification_mode: "default",
          unread_count: 1,
          active_unread_count: 1,
          passive_unread_count: 0,
        }),
      ),
    );
    const catalogMutationFence = createMessengerCatalogMutationFence(ownerKey);

    await updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: {
        updateStreamNotifications: vi.fn(() =>
          Promise.resolve(createStreamDto({ notification_mode: "muted" })),
        ),
      },
    });

    useMessengerStore.getState().replaceBootstrapState(
      ownerKey,
      {
        streams: [
          adaptMessengerStream(
            createStreamDto({
              notification_mode: "all_messages",
              unread_count: 1,
              active_unread_count: 1,
              passive_unread_count: 0,
            }),
          ),
        ],
        streamBindings: [],
        topics: [
          adaptMessengerTopic(
            createTopicDto({
              notification_mode: "default",
              unread_count: 1,
              active_unread_count: 1,
              passive_unread_count: 0,
            }),
          ),
        ],
        conversations: [],
        folders: [],
      },
      { catalogMutationFence },
    );

    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({
        notificationMode: "muted",
        unreadCount: 1,
        activeUnreadCount: 0,
        passiveUnreadCount: 1,
      }),
    );
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({
        notificationMode: "default",
        unreadCount: 1,
        activeUnreadCount: 0,
        passiveUnreadCount: 1,
      }),
    );
  });

  it("rolls overlapping failed stream notification updates back to the confirmed mode", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const firstRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const secondRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const updateRequests = [firstRequest, secondRequest];
    const updateStreamNotifications = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerStreamNotificationRequestBody,
      ) => {
        const request = updateRequests.shift();
        return request?.promise ?? Promise.reject(new Error("Unexpected request"));
      },
    );

    const firstActionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications },
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    const secondActionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "mentions_only",
      client: { updateStreamNotifications },
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe(
      "mentions_only",
    );

    firstRequest.reject(new Error("First update failed"));
    await expect(firstActionPromise).rejects.toThrow("First update failed");
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe(
      "mentions_only",
    );

    secondRequest.reject(new Error("Second update failed"));
    await expect(secondActionPromise).rejects.toThrow("Second update failed");
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe(
      "all_messages",
    );
  });

  it("keeps external stream notification updates when later overlapping requests fail", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const firstRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const secondRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const updateRequests = [firstRequest, secondRequest];
    const updateStreamNotifications = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerStreamNotificationRequestBody,
      ) => {
        const request = updateRequests.shift();
        return request?.promise ?? Promise.reject(new Error("Unexpected request"));
      },
    );

    const firstActionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications },
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    seedStream(ownerKey, createStreamDto({ notification_mode: "mentions_only" }));

    const secondActionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications },
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    firstRequest.reject(new Error("First update failed"));
    await expect(firstActionPromise).rejects.toThrow("First update failed");
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    secondRequest.reject(new Error("Second update failed"));
    await expect(secondActionPromise).rejects.toThrow("Second update failed");
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe(
      "mentions_only",
    );
  });

  it("rolls back a single stale stream notification update without external replacement", async () => {
    const runtimeContext = createRuntimeContext();
    const nextRuntimeContext = createRuntimeContext({ runtimeGeneration: 2 });
    let currentRuntimeContext: WorkspaceRuntimeContext = runtimeContext;
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const updateRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const updateStreamNotifications = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerStreamNotificationRequestBody,
      ) => updateRequest.promise,
    );

    const actionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => currentRuntimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications },
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    currentRuntimeContext = nextRuntimeContext;

    updateRequest.resolve(createStreamDto({ notification_mode: "muted" }));
    await expect(actionPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe(
      "all_messages",
    );
  });

  it("does not rollback over newer state when a same-owner generation becomes stale", async () => {
    const runtimeContext = createRuntimeContext();
    const nextRuntimeContext = createRuntimeContext({ runtimeGeneration: 2 });
    let currentRuntimeContext: WorkspaceRuntimeContext = runtimeContext;
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const updateRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const updateStreamNotifications = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerStreamNotificationRequestBody,
      ) => updateRequest.promise,
    );

    const actionPromise = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => currentRuntimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications },
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");

    currentRuntimeContext = nextRuntimeContext;
    seedStream(ownerKey, createStreamDto({ notification_mode: "mentions_only" }));

    updateRequest.resolve(createStreamDto({ notification_mode: "muted" }));
    await expect(actionPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe(
      "mentions_only",
    );
  });

  it("creates and updates topics through Workspace actions", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const createStreamTopic = vi.fn(
      (_options: MessengerClientOptions, _body: WorkspaceMessengerCreateTopicRequestBody) =>
        Promise.resolve(createTopicDto({ name: "Planning" })),
    );
    const renameStreamTopic = vi.fn(
      (
        _options: MessengerClientOptions,
        _topicUuid: string,
        _body: WorkspaceMessengerUpdateTopicRequestBody,
      ) => Promise.resolve(createTopicDto({ name: "Launch" })),
    );
    const toggleStreamTopicDone = vi.fn((_options: MessengerClientOptions, _topicUuid: string) =>
      Promise.resolve(createTopicDto({ name: "Launch", is_done: true })),
    );
    const setStreamTopicNotificationMode = vi.fn(
      (
        _options: MessengerClientOptions,
        _topicUuid: string,
        _body: WorkspaceMessengerTopicNotificationRequestBody,
      ) => Promise.resolve(createTopicDto({ name: "Launch", notification_mode: "follow" })),
    );

    await createMessengerTopic({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      name: "Planning",
      client: { createStreamTopic },
    });
    await renameMessengerTopic({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      topicUuid: TOPIC_A,
      name: "Launch",
      client: { renameStreamTopic },
    });
    await toggleMessengerTopicDone({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      topicUuid: TOPIC_A,
      client: { toggleStreamTopicDone },
    });
    await setMessengerTopicNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      topicUuid: TOPIC_A,
      notificationMode: "follow",
      client: { setStreamTopicNotificationMode },
    });

    expect(createStreamTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      {
        stream_uuid: STREAM_A,
        name: "Planning",
      },
    );
    expect(renameStreamTopic).toHaveBeenCalledWith(expect.any(Object), TOPIC_A, {
      name: "Launch",
    });
    expect(toggleStreamTopicDone).toHaveBeenCalledWith(expect.any(Object), TOPIC_A);
    expect(setStreamTopicNotificationMode).toHaveBeenCalledWith(expect.any(Object), TOPIC_A, {
      notification_mode: "follow",
    });
    expect(useMessengerStore.getState().ownerKey).toBe(ownerKey);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toEqual(
      expect.objectContaining({
        name: "Launch",
        notificationMode: "follow",
      }),
    );
  });

  it("renames a stream and applies the returned projection", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto());
    const updateStream = vi.fn(
      (
        _options: MessengerClientOptions,
        _streamUuid: string,
        _body: WorkspaceMessengerUpdateStreamRequestBody,
      ) => Promise.resolve(createStreamDto({ name: "Group planning" })),
    );

    await expect(
      renameMessengerStream({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        streamUuid: STREAM_A,
        name: "Group planning",
        client: { updateStream },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "applied",
        ownerKey,
        stream: expect.objectContaining({ name: "Group planning" }),
      }),
    );

    expect(updateStream).toHaveBeenCalledWith(expect.any(Object), STREAM_A, {
      name: "Group planning",
    });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.name).toBe("Group planning");
  });

  it("preserves a concurrent notification projection while a stream rename finishes", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedStream(ownerKey, createStreamDto({ notification_mode: "all_messages" }));
    const renameRequest = createDeferred<WorkspaceMessengerStreamDto>();
    const notificationRequest = createDeferred<WorkspaceMessengerStreamDto>();

    const renameAction = renameMessengerStream({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      name: "Group planning",
      client: { updateStream: () => renameRequest.promise },
    });
    const notificationAction = updateMessengerStreamNotificationMode({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      notificationMode: "muted",
      client: { updateStreamNotifications: () => notificationRequest.promise },
    });

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.notificationMode).toBe("muted");
    renameRequest.resolve(
      createStreamDto({ name: "Group planning", notification_mode: "all_messages" }),
    );
    await renameAction;
    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ name: "Group planning", notificationMode: "muted" }),
    );

    notificationRequest.resolve(createStreamDto({ notification_mode: "muted" }));
    await notificationAction;
    expect(useMessengerStore.getState().streamsById[STREAM_A]).toEqual(
      expect.objectContaining({ name: "Group planning", notificationMode: "muted" }),
    );
  });

  it("creates, pins, unpins, and deletes folder items in the messenger store", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedFolder(ownerKey);
    const createFolderItem = vi.fn(
      (_options: MessengerClientOptions, _body: WorkspaceMessengerCreateFolderItemRequestBody) =>
        Promise.resolve(createFolderItemDto()),
    );
    const pinFolderItem = vi.fn((_options: MessengerClientOptions, _folderItemUuid: string) =>
      Promise.resolve(createFolderItemDto({ pinned_at: "2026-06-22T10:20:00Z" })),
    );
    const unpinFolderItem = vi.fn((_options: MessengerClientOptions, _folderItemUuid: string) =>
      Promise.resolve(createFolderItemDto({ pinned_at: null })),
    );
    const deleteFolderItem = vi.fn((_options: MessengerClientOptions, _folderItemUuid: string) =>
      Promise.resolve(),
    );

    await createMessengerFolderItem({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      folderUuid: FOLDER_A,
      streamUuid: STREAM_A,
      chatType: "private",
      orderIndex: 10,
      client: { createFolderItem },
    });
    await pinMessengerFolderItem({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      folderItemUuid: FOLDER_ITEM_A,
      client: { pinFolderItem },
    });
    await unpinMessengerFolderItem({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      folderItemUuid: FOLDER_ITEM_A,
      client: { unpinFolderItem },
    });
    await deleteMessengerFolderItem({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      folderItemUuid: FOLDER_ITEM_A,
      client: { deleteFolderItem },
    });

    expect(createFolderItem).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      {
        folder_uuid: FOLDER_A,
        stream_uuid: STREAM_A,
        chat_type: "private",
        order_index: 10,
      },
    );
    expect(pinFolderItem).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      FOLDER_ITEM_A,
    );
    expect(unpinFolderItem).toHaveBeenCalledWith(expect.any(Object), FOLDER_ITEM_A);
    expect(deleteFolderItem).toHaveBeenCalledWith(expect.any(Object), FOLDER_ITEM_A);
    expect(useMessengerStore.getState().foldersById[FOLDER_A]?.items).toEqual([]);
  });

  it("skips stale folder item results after the runtime owner changes", async () => {
    const runtimeA = createRuntimeContext();
    const runtimeB = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 2,
    });
    const ownerKey = prepareStoreOwner(runtimeA);
    seedFolder(ownerKey);
    const createRequest = createDeferred<WorkspaceMessengerFolderItemDto>();
    const createFolderItem = vi.fn(
      (_options: MessengerClientOptions, _body: WorkspaceMessengerCreateFolderItemRequestBody) =>
        createRequest.promise,
    );
    const actionPromise = createMessengerFolderItem({
      runtimeContext: runtimeA,
      getRuntimeContext: () => runtimeB,
      folderUuid: FOLDER_A,
      streamUuid: STREAM_A,
      chatType: "private",
      client: { createFolderItem },
    });

    createRequest.resolve(createFolderItemDto());

    await expect(actionPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().foldersById[FOLDER_A]?.items).toEqual([]);
  });

  it("keeps folder unread and item presence stable across pin and unpin upserts", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedFolderWithItem(ownerKey);
    const pinFolderItem = vi.fn((_options: MessengerClientOptions, _folderItemUuid: string) =>
      Promise.resolve(createFolderItemDto({ pinned_at: "2026-06-22T10:20:00Z", unread_count: 3 })),
    );
    const unpinFolderItem = vi.fn((_options: MessengerClientOptions, _folderItemUuid: string) =>
      Promise.resolve(createFolderItemDto({ pinned_at: null, unread_count: 3 })),
    );

    await pinMessengerFolderItem({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      folderItemUuid: FOLDER_ITEM_A,
      client: { pinFolderItem },
    });

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toEqual(
      expect.objectContaining({
        unreadCount: 3,
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A, pinnedAt: "2026-06-22T10:20:00Z" })],
      }),
    );

    await unpinMessengerFolderItem({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      folderItemUuid: FOLDER_ITEM_A,
      client: { unpinFolderItem },
    });

    expect(useMessengerStore.getState().foldersById[FOLDER_A]).toEqual(
      expect.objectContaining({
        unreadCount: 3,
        items: [expect.objectContaining({ uuid: FOLDER_ITEM_A, pinnedAt: null, unreadCount: 3 })],
      }),
    );
  });
});
