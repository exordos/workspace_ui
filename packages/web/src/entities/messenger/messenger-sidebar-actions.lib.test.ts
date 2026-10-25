import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
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
import * as messengerCacheDb from "~/shared/lib/workspace-messenger-cache-db";
import {
  deleteWorkspaceMessengerCacheDatabase,
  readMessengerCatalogCache,
  resetWorkspaceMessengerCacheDbSingletonForTests,
} from "~/shared/lib/workspace-messenger-cache-db";
import { adaptMessengerFolder, adaptMessengerStream } from "./messenger-adapters.lib";
import { upsertMessengerStreamCache } from "./messenger-cache.lib";
import {
  archiveMessengerStream,
  createMessengerFolderItem,
  createMessengerTopic,
  deleteMessengerFolderItem,
  pinMessengerFolderItem,
  renameMessengerStream,
  renameMessengerTopic,
  setMessengerTopicNotificationMode,
  toggleMessengerTopicDone,
  unarchiveMessengerStream,
  unpinMessengerFolderItem,
  updateMessengerStreamNotificationMode,
} from "./messenger-sidebar-actions.lib";
import { useMessengerStore } from "./messenger.model";

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

  afterEach(async () => {
    vi.restoreAllMocks();
    await deleteWorkspaceMessengerCacheDatabase();
    resetWorkspaceMessengerCacheDbSingletonForTests();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
  });

  describe.each([true, false])("archive state %s", (isArchived) => {
    const changeArchiveState = isArchived ? archiveMessengerStream : unarchiveMessengerStream;

    it.each([null, USER_B])(
      "changes archive state for a channel or direct chat through the Workspace endpoint and persists it (%s)",
      async (directUserUuid) => {
        const runtimeContext = createRuntimeContext();
        useWorkspaceAuthStore.setState({
          sessions: [
            {
              ...runtimeContext,
              login: "user@example.com",
              profile: {
                uuid: USER_A,
                username: "User A",
                firstName: null,
                lastName: null,
                email: "user@example.com",
              },
            },
          ],
        });
        const ownerKey = prepareStoreOwner(runtimeContext);
        seedStream(
          ownerKey,
          createStreamDto({ is_archived: !isArchived, direct_user_uuid: directUserUuid }),
        );
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify(
              createStreamDto({ is_archived: isArchived, direct_user_uuid: directUserUuid }),
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );

        await expect(
          changeArchiveState({
            runtimeContext,
            getRuntimeContext: () => runtimeContext,
            streamUuid: STREAM_A,
            clientOptions: { fetchImpl },
          }),
        ).resolves.toMatchObject({ status: "applied", ownerKey, stream: { isArchived } });

        expect(fetchImpl).toHaveBeenCalledWith(
          expect.stringContaining(
            `/streams/${STREAM_A}/actions/${isArchived ? "archive" : "unarchive"}/invoke`,
          ),
          expect.objectContaining({ method: "POST" }),
        );
        expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
          "Bearer access-token-a",
        );
        expect(useMessengerStore.getState().streamsById[STREAM_A]).toMatchObject({
          isArchived,
          directUserUuid,
        });
        const cached = await readMessengerCatalogCache(ownerKey);
        expect(cached.streams).toEqual([
          expect.objectContaining({ uuid: STREAM_A, isArchived, directUserUuid }),
        ]);
        expect(cached.conversations).toEqual([
          expect.objectContaining({ id: `stream:${STREAM_A}`, streamUuid: STREAM_A }),
        ]);
      },
    );

    it.each(["success", "failure"] as const)(
      "skips stale archive state response %s after leaving and returning to the same runtime owner",
      async (outcome) => {
        const runtimeContext = createRuntimeContext();
        let currentRuntime = runtimeContext;
        const ownerKey = prepareStoreOwner(runtimeContext);
        seedStream(ownerKey, createStreamDto({ is_archived: !isArchived }));
        const deferred = createDeferred<WorkspaceMessengerStreamDto>();
        const action = changeArchiveState({
          runtimeContext,
          getRuntimeContext: () => currentRuntime,
          streamUuid: STREAM_A,
          client: { [isArchived ? "archiveStream" : "unarchiveStream"]: () => deferred.promise },
        });
        currentRuntime = createRuntimeContext({ runtimeGeneration: 3 });
        if (outcome === "success") deferred.resolve(createStreamDto({ is_archived: isArchived }));
        else deferred.reject(new Error("Request failed"));

        await expect(action).resolves.toEqual({
          status: "skipped",
          ownerKey,
          reason: "stale-owner",
        });
        expect(useMessengerStore.getState().streamsById[STREAM_A]?.isArchived).toBe(!isArchived);
        const cached = await readMessengerCatalogCache(ownerKey);
        expect(cached.streams).toEqual([]);
      },
    );

    it.each(["success", "failure", "newer-realtime"] as const)(
      "reconciles only notification-owned cache replacements during its cache read (%s)",
      async (outcome) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        const initial = adaptMessengerStream(createStreamDto({ is_archived: !isArchived }));
        useMessengerStore.getState().upsertStream(ownerKey, initial);
        await upsertMessengerStreamCache(ownerKey, initial);
        const notificationResponse = createDeferred<WorkspaceMessengerStreamDto>();
        const notificationAction = updateMessengerStreamNotificationMode({
          runtimeContext,
          streamUuid: STREAM_A,
          notificationMode: "muted",
          client: { updateStreamNotifications: () => notificationResponse.promise },
        });
        const cacheReadStarted = createDeferred<void>();
        const releaseCacheRead = createDeferred<void>();
        const originalReadCatalog = messengerCacheDb.readMessengerCatalogCache;
        vi.spyOn(messengerCacheDb, "readMessengerCatalogCache").mockImplementationOnce(
          async (key) => {
            const snapshot = await originalReadCatalog(key);
            cacheReadStarted.resolve();
            await releaseCacheRead.promise;
            return snapshot;
          },
        );
        const unarchiveAction = changeArchiveState({
          runtimeContext,
          streamUuid: STREAM_A,
          client: {
            [isArchived ? "archiveStream" : "unarchiveStream"]: () =>
              Promise.resolve(createStreamDto({ is_archived: isArchived })),
          },
        });
        await cacheReadStarted.promise;

        if (outcome === "newer-realtime") {
          const authoritativeStream = adaptMessengerStream(
            createStreamDto({ is_archived: !isArchived, updated_at: "2026-06-22T10:15:00Z" }),
          );
          useMessengerStore.getState().upsertStream(ownerKey, authoritativeStream);
          await upsertMessengerStreamCache(ownerKey, authoritativeStream);
        }
        if (outcome === "success") {
          notificationResponse.resolve(
            createStreamDto({ is_archived: !isArchived, notification_mode: "muted" }),
          );
          await expect(notificationAction).resolves.toMatchObject({ status: "applied" });
        } else {
          notificationResponse.reject(new Error("Notification update failed"));
          await expect(notificationAction).rejects.toThrow("Notification update failed");
        }
        releaseCacheRead.resolve();
        await expect(unarchiveAction).resolves.toMatchObject({ status: "applied" });

        const notificationMode = outcome === "success" ? "muted" : "all_messages";
        const expectedArchived = outcome === "newer-realtime" ? !isArchived : isArchived;
        expect(useMessengerStore.getState().streamsById[STREAM_A]).toMatchObject({
          isArchived: expectedArchived,
          notificationMode,
        });
        const cached = await readMessengerCatalogCache(ownerKey);
        expect(cached.streams[0]).toMatchObject({ isArchived: expectedArchived, notificationMode });
      },
    );

    it("skips an archive state change when the catalog belongs to another runtime owner", async () => {
      const runtimeContext = createRuntimeContext();
      prepareStoreOwner(createRuntimeContext({ projectId: PROJECT_B }));
      const unarchiveStream = vi.fn();

      await expect(
        changeArchiveState({
          runtimeContext,
          streamUuid: STREAM_A,
          client: { [isArchived ? "archiveStream" : "unarchiveStream"]: unarchiveStream },
        }),
      ).resolves.toMatchObject({ status: "skipped", reason: "stale-owner" });
      expect(unarchiveStream).not.toHaveBeenCalled();
    });

    it("keeps newer catalog fields while applying the archive state response", async () => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      seedStream(ownerKey, createStreamDto({ is_archived: !isArchived }));
      const deferred = createDeferred<WorkspaceMessengerStreamDto>();
      const action = changeArchiveState({
        runtimeContext,
        streamUuid: STREAM_A,
        client: { [isArchived ? "archiveStream" : "unarchiveStream"]: () => deferred.promise },
      });
      seedStream(
        ownerKey,
        createStreamDto({
          is_archived: isArchived,
          name: "Renamed",
          unread_count: 20,
          updated_at: "2026-06-22T10:15:00Z",
        }),
      );
      deferred.resolve(createStreamDto({ is_archived: isArchived }));

      await expect(action).resolves.toMatchObject({
        status: "applied",
        stream: {
          isArchived,
          name: "Renamed",
          unreadCount: 20,
          updatedAt: "2026-06-22T10:15:00Z",
        },
      });
      const cached = await readMessengerCatalogCache(ownerKey);
      expect(cached.streams[0]).toMatchObject({
        isArchived,
        name: "Renamed",
        unreadCount: 20,
      });
    });

    it("preserves a newer archive state event over the earlier response", async () => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      seedStream(ownerKey, createStreamDto({ is_archived: !isArchived }));
      const deferred = createDeferred<WorkspaceMessengerStreamDto>();
      const action = changeArchiveState({
        runtimeContext,
        streamUuid: STREAM_A,
        client: { [isArchived ? "archiveStream" : "unarchiveStream"]: () => deferred.promise },
      });
      seedStream(
        ownerKey,
        createStreamDto({ is_archived: !isArchived, updated_at: "2026-06-22T10:15:00Z" }),
      );
      const newerSnapshot = useMessengerStore.getState().streamsById[STREAM_A];
      deferred.resolve(createStreamDto({ is_archived: isArchived }));

      await expect(action).resolves.toMatchObject({
        status: "applied",
        stream: { isArchived: !isArchived, updatedAt: "2026-06-22T10:15:00Z" },
      });
      expect(useMessengerStore.getState().streamsById[STREAM_A]).toBe(newerSnapshot);
      const cached = await readMessengerCatalogCache(ownerKey);
      expect(cached.streams[0]).toMatchObject({
        isArchived: !isArchived,
        updatedAt: "2026-06-22T10:15:00Z",
      });
    });

    it.each(["success", "failure"] as const)(
      "persists confirmed notifications while changing archive state with a pending notification %s",
      async (outcome) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        seedStream(ownerKey, createStreamDto({ is_archived: !isArchived }));
        const deferred = createDeferred<WorkspaceMessengerStreamDto>();
        const notificationAction = updateMessengerStreamNotificationMode({
          runtimeContext,
          streamUuid: STREAM_A,
          notificationMode: "muted",
          client: { updateStreamNotifications: () => deferred.promise },
        });

        await changeArchiveState({
          runtimeContext,
          streamUuid: STREAM_A,
          client: {
            [isArchived ? "archiveStream" : "unarchiveStream"]: () =>
              Promise.resolve(createStreamDto({ is_archived: isArchived })),
          },
        });

        expect(useMessengerStore.getState().streamsById[STREAM_A]).toMatchObject({
          isArchived,
          notificationMode: "muted",
        });
        const cachedWhilePending = await readMessengerCatalogCache(ownerKey);
        expect(cachedWhilePending.streams[0]).toMatchObject({
          isArchived,
          notificationMode: "all_messages",
        });

        if (outcome === "success") {
          deferred.resolve(
            createStreamDto({ is_archived: !isArchived, notification_mode: "muted" }),
          );
          await expect(notificationAction).resolves.toMatchObject({ status: "applied" });
        } else {
          deferred.reject(new Error("Notification update failed"));
          await expect(notificationAction).rejects.toThrow("Notification update failed");
        }
        expect(useMessengerStore.getState().streamsById[STREAM_A]).toMatchObject({
          isArchived,
          notificationMode: outcome === "success" ? "muted" : "all_messages",
        });
        const cached = await readMessengerCatalogCache(ownerKey);
        expect(cached.streams[0]).toMatchObject({ isArchived });
        if (outcome === "failure") {
          expect(cached.streams[0]).toMatchObject({ notificationMode: "all_messages" });
        }
      },
    );

    it.each([
      { uuid: TOPIC_A },
      { project_id: PROJECT_B },
      { user_uuid: USER_B },
      { is_archived: !isArchived },
    ])(
      "rejects an invalid archive state response without changing the catalog (%j)",
      async (overrides) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        seedStream(ownerKey, createStreamDto({ is_archived: !isArchived }));

        await expect(
          changeArchiveState({
            runtimeContext,
            streamUuid: STREAM_A,
            client: {
              [isArchived ? "archiveStream" : "unarchiveStream"]: () =>
                Promise.resolve(createStreamDto({ is_archived: isArchived, ...overrides })),
            },
          }),
        ).rejects.toThrow(`Invalid ${isArchived ? "archived" : "unarchived"} stream response`);
        expect(useMessengerStore.getState().streamsById[STREAM_A]?.isArchived).toBe(!isArchived);
        const cached = await readMessengerCatalogCache(ownerKey);
        expect(cached.streams).toEqual([]);
      },
    );
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
