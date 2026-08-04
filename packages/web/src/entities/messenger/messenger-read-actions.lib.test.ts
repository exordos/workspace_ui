import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import {
  adaptMessengerMessage,
  adaptMessengerStream,
  adaptMessengerTopic,
} from "./messenger-adapters.lib";
import { runWorkspaceStreamRead, runWorkspaceTopicRead } from "./messenger-read-actions.lib";
import { useMessengerStore } from "./messenger.model";

const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const OTHER_TOPIC_UUID = "5ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const OTHER_MESSAGE_UUID = "b93dca35-3061-4748-bda4-7f6f8c660ea5";
const NEW_MESSAGE_UUID = "c93dca35-3061-4748-bda4-7f6f8c660ea5";
const AFTER_MESSAGE_UUID = "d83dca35-3061-4748-bda4-7f6f8c660ea5";
const FOLDER_UUID = "d93dca35-3061-4748-bda4-7f6f8c660ea5";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-06-22T10:10:00Z";

function runtimeContext(overrides: Partial<WorkspaceRuntimeContext> = {}): WorkspaceRuntimeContext {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "organization-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: PROJECT_UUID,
    userUuid: USER_UUID,
    accessToken: "access-token",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function streamDto(
  overrides: Partial<WorkspaceMessengerStreamDto> = {},
): WorkspaceMessengerStreamDto {
  return {
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
    direct_user_uuid: null,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function topicDto(overrides: Partial<WorkspaceMessengerTopicDto> = {}): WorkspaceMessengerTopicDto {
  return {
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
    notification_mode: "default",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function messageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_UUID,
    project_id: PROJECT_UUID,
    stream_uuid: STREAM_UUID,
    topic_uuid: TOPIC_UUID,
    author_uuid: "author-a",
    user_uuid: USER_UUID,
    payload: { kind: "markdown", content: "Unread" },
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

function seed(runtime: WorkspaceRuntimeContext): string {
  const ownerKey = workspaceRuntimeOwnerKey(runtime);
  const store = useMessengerStore.getState();
  store.startBootstrap(ownerKey);
  store.upsertStream(ownerKey, adaptMessengerStream(streamDto()));
  store.upsertTopic(ownerKey, adaptMessengerTopic(topicDto()));
  store.upsertTopic(
    ownerKey,
    adaptMessengerTopic(
      topicDto({
        uuid: OTHER_TOPIC_UUID,
        name: "General",
        unread_count: 1,
        active_unread_count: 1,
        passive_unread_count: 0,
      }),
    ),
  );
  useWorkspaceMessageStore.getState().upsertMessage(adaptMessengerMessage(messageDto()));
  return ownerKey;
}

function seedFolder(ownerKey: string, unreadCount = 3): void {
  useMessengerStore.getState().applyFolderSnapshot(ownerKey, {
    uuid: FOLDER_UUID,
    title: "Channels",
    backgroundColorValue: null,
    unreadCount,
    systemType: "channels",
    items: [
      {
        uuid: "e93dca35-3061-4748-bda4-7f6f8c660ea5",
        projectId: PROJECT_UUID,
        folderUuid: FOLDER_UUID,
        userUuid: USER_UUID,
        streamUuid: STREAM_UUID,
        conversationId: `stream:${STREAM_UUID}`,
        chatType: "stream",
        orderIndex: 0,
        pinnedAt: null,
        unreadCount,
        createdAt: DATE,
        updatedAt: DATE,
      },
    ],
    createdAt: DATE,
    updatedAt: DATE,
  });
}

function deferred<T>(): {
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

describe("workspace read actions", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  it("optimistically reads one topic and persists the confirmed result", async () => {
    const runtime = runtimeContext();
    const ownerKey = seed(runtime);
    const request = deferred<WorkspaceMessengerTopicDto>();
    const markCachedMessagesRead = vi.fn(() => Promise.resolve());
    const upsertCachedTopic = vi.fn(() => Promise.resolve());

    const action = runWorkspaceTopicRead(
      { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID },
      {
        runtimeContext: runtime,
        getRuntimeContext: () => runtime,
        client: { markStreamTopicRead: () => request.promise },
        cache: { markCachedMessagesRead, upsertCachedTopic },
      },
    );

    expect(useMessengerStore.getState().topicsById[TOPIC_UUID]?.unreadCount).toBe(0);
    expect(useMessengerStore.getState().streamsById[STREAM_UUID]?.unreadCount).toBe(1);
    expect(useMessengerStore.getState().topicsById[OTHER_TOPIC_UUID]?.unreadCount).toBe(1);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]?.read).toBe(true);

    request.resolve(topicDto({ unread_count: 0 }));
    await expect(action).resolves.toEqual({ status: "applied", ownerKey });
    expect(markCachedMessagesRead).toHaveBeenCalledWith(
      ownerKey,
      [MESSAGE_UUID],
      [`topic:${STREAM_UUID}:${TOPIC_UUID}`],
    );
    expect(upsertCachedTopic).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({ uuid: TOPIC_UUID, unreadCount: 0 }),
    );
  });

  it("reads every known topic in a stream", async () => {
    const runtime = runtimeContext();
    const ownerKey = seed(runtime);
    const markCachedMessagesRead = vi.fn(() => Promise.resolve());

    await expect(
      runWorkspaceStreamRead(
        { streamUuid: STREAM_UUID },
        {
          runtimeContext: runtime,
          getRuntimeContext: () => runtime,
          client: { markStreamRead: () => Promise.resolve(streamDto({ unread_count: 0 })) },
          cache: {
            markCachedMessagesRead,
            upsertCachedStream: () => Promise.resolve(),
          },
        },
      ),
    ).resolves.toEqual({ status: "applied", ownerKey });

    expect(useMessengerStore.getState().streamsById[STREAM_UUID]?.unreadCount).toBe(0);
    expect(useMessengerStore.getState().topicsById[TOPIC_UUID]?.unreadCount).toBe(0);
    expect(useMessengerStore.getState().topicsById[OTHER_TOPIC_UUID]?.unreadCount).toBe(0);
    expect(markCachedMessagesRead).toHaveBeenCalledWith(
      ownerKey,
      [MESSAGE_UUID],
      [`stream:${STREAM_UUID}`],
    );
  });

  it("skips every read action for the same stream while one is in flight", async () => {
    const runtime = runtimeContext();
    const ownerKey = seed(runtime);
    const request = deferred<WorkspaceMessengerTopicDto>();
    const firstAction = runWorkspaceTopicRead(
      { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID },
      {
        runtimeContext: runtime,
        getRuntimeContext: () => runtime,
        client: { markStreamTopicRead: () => request.promise },
        cache: {},
      },
    );

    await expect(
      runWorkspaceTopicRead(
        { streamUuid: STREAM_UUID, topicUuid: OTHER_TOPIC_UUID },
        { runtimeContext: runtime, getRuntimeContext: () => runtime },
      ),
    ).resolves.toEqual({ status: "skipped", ownerKey, reason: "in-flight" });
    await expect(
      runWorkspaceStreamRead(
        { streamUuid: STREAM_UUID },
        { runtimeContext: runtime, getRuntimeContext: () => runtime },
      ),
    ).resolves.toEqual({ status: "skipped", ownerKey, reason: "in-flight" });

    request.resolve(topicDto({ unread_count: 0 }));
    await firstAction;
    await expect(
      runWorkspaceTopicRead(
        { streamUuid: STREAM_UUID, topicUuid: OTHER_TOPIC_UUID },
        {
          runtimeContext: runtime,
          getRuntimeContext: () => runtime,
          client: {
            markStreamTopicRead: () =>
              Promise.resolve(topicDto({ uuid: OTHER_TOPIC_UUID, unread_count: 0 })),
          },
          cache: {},
        },
      ),
    ).resolves.toEqual({ status: "applied", ownerKey });
  });

  it("rolls back its own optimistic projections when the request fails", async () => {
    const runtime = runtimeContext();
    seed(runtime);
    const request = deferred<WorkspaceMessengerTopicDto>();
    const action = runWorkspaceTopicRead(
      { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID },
      {
        runtimeContext: runtime,
        getRuntimeContext: () => runtime,
        client: { markStreamTopicRead: () => request.promise },
        cache: {},
      },
    );

    request.reject(new Error("network unavailable"));
    await expect(action).rejects.toThrow("network unavailable");

    expect(useMessengerStore.getState().topicsById[TOPIC_UUID]?.unreadCount).toBe(2);
    expect(useMessengerStore.getState().streamsById[STREAM_UUID]?.unreadCount).toBe(3);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]?.read).toBe(false);
  });

  it("does not overwrite a newer folder snapshot during rollback", async () => {
    const runtime = runtimeContext();
    const ownerKey = seed(runtime);
    seedFolder(ownerKey);
    const request = deferred<WorkspaceMessengerTopicDto>();
    const action = runWorkspaceTopicRead(
      { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID },
      {
        runtimeContext: runtime,
        getRuntimeContext: () => runtime,
        client: { markStreamTopicRead: () => request.promise },
        cache: {},
      },
    );
    const freshFolder = {
      ...useMessengerStore.getState().foldersById[FOLDER_UUID]!,
      unreadCount: 9,
      updatedAt: "2026-06-22T10:11:00Z",
    };
    useMessengerStore.getState().applyFolderSnapshot(ownerKey, freshFolder);

    request.reject(new Error("network unavailable"));
    await expect(action).rejects.toThrow("network unavailable");
    expect(useMessengerStore.getState().foldersById[FOLDER_UUID]).toBe(freshFolder);
  });

  it("keeps neighboring and newly arrived messages unread", async () => {
    const runtime = runtimeContext();
    seed(runtime);
    useWorkspaceMessageStore
      .getState()
      .upsertMessage(
        adaptMessengerMessage(
          messageDto({ uuid: OTHER_MESSAGE_UUID, topic_uuid: OTHER_TOPIC_UUID }),
        ),
      );
    const request = deferred<WorkspaceMessengerTopicDto>();
    const action = runWorkspaceTopicRead(
      { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID },
      {
        runtimeContext: runtime,
        getRuntimeContext: () => runtime,
        client: { markStreamTopicRead: () => request.promise },
        cache: {},
      },
    );
    useWorkspaceMessageStore
      .getState()
      .upsertMessage(adaptMessengerMessage(messageDto({ uuid: NEW_MESSAGE_UUID })));

    request.resolve(topicDto({ unread_count: 0 }));
    await action;
    useWorkspaceMessageStore
      .getState()
      .upsertMessage(adaptMessengerMessage(messageDto({ uuid: AFTER_MESSAGE_UUID })));

    expect(useWorkspaceMessageStore.getState().messagesById[OTHER_MESSAGE_UUID]?.read).toBe(false);
    expect(useWorkspaceMessageStore.getState().messagesById[NEW_MESSAGE_UUID]?.read).toBe(false);
    expect(useWorkspaceMessageStore.getState().messagesById[AFTER_MESSAGE_UUID]?.read).toBe(false);
  });

  it("treats synchronous and rejected cache failures as best effort", async () => {
    const runtime = runtimeContext();
    const ownerKey = seed(runtime);

    await expect(
      runWorkspaceTopicRead(
        { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID },
        {
          runtimeContext: runtime,
          getRuntimeContext: () => runtime,
          client: {
            markStreamTopicRead: () => Promise.resolve(topicDto({ unread_count: 0 })),
          },
          cache: {
            markCachedMessagesRead: () => {
              throw new Error("sync cache error");
            },
          },
        },
      ),
    ).resolves.toEqual({ status: "applied", ownerKey });

    useMessengerStore.getState().upsertTopic(ownerKey, adaptMessengerTopic(topicDto()));
    useMessengerStore.getState().upsertStream(ownerKey, adaptMessengerStream(streamDto()));
    await expect(
      runWorkspaceTopicRead(
        { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID },
        {
          runtimeContext: runtime,
          getRuntimeContext: () => runtime,
          client: {
            markStreamTopicRead: () => Promise.resolve(topicDto({ unread_count: 0 })),
          },
          cache: {
            markCachedMessagesRead: () => Promise.reject(new Error("async cache error")),
          },
        },
      ),
    ).resolves.toEqual({ status: "applied", ownerKey });
  });

  it("does not overwrite newer stream or topic snapshots after success", async () => {
    const runtime = runtimeContext();
    const ownerKey = seed(runtime);
    const request = deferred<WorkspaceMessengerTopicDto>();
    const action = runWorkspaceTopicRead(
      { streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID },
      {
        runtimeContext: runtime,
        getRuntimeContext: () => runtime,
        client: { markStreamTopicRead: () => request.promise },
        cache: {},
      },
    );
    const freshStream = adaptMessengerStream(
      streamDto({ unread_count: 8, updated_at: "2026-06-22T10:11:00Z" }),
    );
    const freshTopic = adaptMessengerTopic(
      topicDto({ unread_count: 7, updated_at: "2026-06-22T10:11:00Z" }),
    );
    useMessengerStore.getState().upsertStream(ownerKey, freshStream);
    useMessengerStore.getState().upsertTopic(ownerKey, freshTopic);

    request.resolve(topicDto({ unread_count: 0 }));
    await action;
    expect(useMessengerStore.getState().streamsById[STREAM_UUID]).toBe(freshStream);
    expect(useMessengerStore.getState().topicsById[TOPIC_UUID]).toBe(freshTopic);
  });

  it("does not overwrite a newer folder snapshot with the confirmed stream", async () => {
    const runtime = runtimeContext();
    const ownerKey = seed(runtime);
    seedFolder(ownerKey);
    const request = deferred<WorkspaceMessengerStreamDto>();
    const action = runWorkspaceStreamRead(
      { streamUuid: STREAM_UUID },
      {
        runtimeContext: runtime,
        getRuntimeContext: () => runtime,
        client: { markStreamRead: () => request.promise },
        cache: {},
      },
    );
    const freshFolder = {
      ...useMessengerStore.getState().foldersById[FOLDER_UUID]!,
      unreadCount: 9,
      updatedAt: "2026-06-22T10:11:00Z",
    };
    useMessengerStore.getState().applyFolderSnapshot(ownerKey, freshFolder);

    request.resolve(streamDto({ unread_count: 0 }));
    await action;
    expect(useMessengerStore.getState().foldersById[FOLDER_UUID]).toBe(freshFolder);
  });

  it("drops a successful response after the runtime changes", async () => {
    const runtimeA = runtimeContext();
    const runtimeB = runtimeContext({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "organization-b",
      runtimeGeneration: 2,
    });
    const ownerKey = seed(runtimeA);
    const request = deferred<WorkspaceMessengerStreamDto>();
    const upsertCachedStream = vi.fn(() => Promise.resolve());
    let currentRuntime = runtimeA;
    const action = runWorkspaceStreamRead(
      { streamUuid: STREAM_UUID },
      {
        runtimeContext: runtimeA,
        getRuntimeContext: () => currentRuntime,
        client: { markStreamRead: () => request.promise },
        cache: { upsertCachedStream },
      },
    );

    currentRuntime = runtimeB;
    request.resolve(streamDto({ unread_count: 0 }));
    await expect(action).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(upsertCachedStream).not.toHaveBeenCalled();
  });

  it("drops an old response after an A to B to A runtime cycle", async () => {
    const runtimeA = runtimeContext();
    const runtimeAAfterSwitch = runtimeContext({ runtimeGeneration: 3 });
    const ownerKey = seed(runtimeA);
    const request = deferred<WorkspaceMessengerStreamDto>();
    const markCachedMessagesRead = vi.fn(() => Promise.resolve());
    let currentRuntime = runtimeA;
    const action = runWorkspaceStreamRead(
      { streamUuid: STREAM_UUID },
      {
        runtimeContext: runtimeA,
        getRuntimeContext: () => currentRuntime,
        client: { markStreamRead: () => request.promise },
        cache: { markCachedMessagesRead },
      },
    );

    currentRuntime = runtimeAAfterSwitch;
    request.resolve(streamDto({ unread_count: 0 }));

    await expect(action).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(markCachedMessagesRead).not.toHaveBeenCalled();
    expect(useMessengerStore.getState().streamsById[STREAM_UUID]?.unreadCount).toBe(3);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]?.read).toBe(false);
  });

  it("does not let an old generation lock block a new A runtime", async () => {
    const runtimeA = runtimeContext();
    const runtimeAAfterSwitch = runtimeContext({ runtimeGeneration: 3 });
    const oldRequest = deferred<WorkspaceMessengerStreamDto>();
    let currentRuntime = runtimeA;
    seed(runtimeA);
    const oldAction = runWorkspaceStreamRead(
      { streamUuid: STREAM_UUID },
      {
        runtimeContext: runtimeA,
        getRuntimeContext: () => currentRuntime,
        client: { markStreamRead: () => oldRequest.promise },
        cache: {},
      },
    );

    currentRuntime = runtimeAAfterSwitch;
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    const ownerKey = seed(runtimeAAfterSwitch);

    await expect(
      runWorkspaceStreamRead(
        { streamUuid: STREAM_UUID },
        {
          runtimeContext: runtimeAAfterSwitch,
          getRuntimeContext: () => runtimeAAfterSwitch,
          client: { markStreamRead: () => Promise.resolve(streamDto({ unread_count: 0 })) },
          cache: {},
        },
      ),
    ).resolves.toEqual({ status: "applied", ownerKey });

    oldRequest.resolve(streamDto({ unread_count: 0 }));
    await expect(oldAction).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]?.read).toBe(true);
  });
});
