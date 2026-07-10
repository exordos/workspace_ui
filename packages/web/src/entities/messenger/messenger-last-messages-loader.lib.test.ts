import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import { adaptMessengerBootstrapPayload, adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  collectMessengerLastMessageUuids,
  loadMessengerLastMessagesForSidebar,
} from "./messenger-last-messages-loader.lib";
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
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const MESSAGE_B = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";
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
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function seedBootstrap(ownerKey: string): void {
  useMessengerStore.getState().startBootstrap(ownerKey);
  useMessengerStore.getState().replaceBootstrapState(
    ownerKey,
    adaptMessengerBootstrapPayload({
      streams: [createStreamDto({ last_message_uuid: MESSAGE_A })],
      topics: [createTopicDto({ last_message_uuid: MESSAGE_B })],
      folders: [],
    }),
  );
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

describe("messenger last messages loader", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  it("collects unique last message uuids from sidebar state", () => {
    const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
    seedBootstrap(ownerKey);
    useWorkspaceMessageStore
      .getState()
      .upsertMessageBody(adaptMessengerMessage(createMessageDto()));

    expect(collectMessengerLastMessageUuids(useMessengerStore.getState())).toEqual([
      MESSAGE_A,
      MESSAGE_B,
    ]);
  });

  it("loads missing last messages through the injected bulk client", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    seedBootstrap(ownerKey);
    const getMessagesByUuids = vi.fn(() => Promise.resolve([createMessageDto()]));
    const writeMessages = vi.fn(() => Promise.resolve());

    await expect(
      loadMessengerLastMessagesForSidebar({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: { getMessagesByUuids },
        cache: { writeMessages },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      requested: 2,
      applied: 1,
    });

    expect(getMessagesByUuids).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      [MESSAGE_A, MESSAGE_B],
    );
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
      "Hello, workspace",
    );
    expect(writeMessages).toHaveBeenCalledWith(ownerKey, [
      expect.objectContaining({
        uuid: MESSAGE_A,
        payload: { kind: "markdown", content: "Hello, workspace" },
      }),
    ]);
  });

  it("applies cached last messages without calling the client", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    seedBootstrap(ownerKey);
    const cachedMessageA = adaptMessengerMessage(createMessageDto());
    const cachedMessageB = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, payload: { kind: "markdown", content: "Cached B" } }),
    );
    const getMessagesByUuids = vi.fn(() => Promise.resolve([]));
    const writeMessages = vi.fn(() => Promise.resolve());

    await expect(
      loadMessengerLastMessagesForSidebar({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: { getMessagesByUuids },
        cache: {
          readMessagesByUuids: () => Promise.resolve([cachedMessageA, cachedMessageB]),
          writeMessages,
        },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      requested: 0,
      applied: 2,
    });

    expect(getMessagesByUuids).not.toHaveBeenCalled();
    expect(writeMessages).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
      "Hello, workspace",
    );
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.payload.content).toBe(
      "Cached B",
    );
  });

  it("loads only cache misses from the client", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    seedBootstrap(ownerKey);
    const cachedMessageA = adaptMessengerMessage(createMessageDto());
    const getMessagesByUuids = vi.fn(() =>
      Promise.resolve([
        createMessageDto({ uuid: MESSAGE_B, payload: { kind: "markdown", content: "Network B" } }),
      ]),
    );

    await expect(
      loadMessengerLastMessagesForSidebar({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: { getMessagesByUuids },
        cache: { readMessagesByUuids: () => Promise.resolve([cachedMessageA]) },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      requested: 1,
      applied: 2,
    });

    expect(getMessagesByUuids).toHaveBeenCalledWith(expect.any(Object), [MESSAGE_B]);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
      "Hello, workspace",
    );
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.payload.content).toBe(
      "Network B",
    );
  });

  it("writes network responses back to the message cache", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    seedBootstrap(ownerKey);
    const writeMessages = vi.fn(() => Promise.resolve());

    await loadMessengerLastMessagesForSidebar({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: { getMessagesByUuids: () => Promise.resolve([createMessageDto()]) },
      cache: {
        readMessagesByUuids: () => Promise.resolve([]),
        writeMessages,
      },
    });

    expect(writeMessages).toHaveBeenCalledWith(ownerKey, [
      expect.objectContaining({
        uuid: MESSAGE_A,
        payload: { kind: "markdown", content: "Hello, workspace" },
      }),
    ]);
  });

  it("checks IndexedDB even when last messages already exist in memory", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    seedBootstrap(ownerKey);
    useWorkspaceMessageStore
      .getState()
      .upsertMessageBody(adaptMessengerMessage(createMessageDto()));
    useWorkspaceMessageStore
      .getState()
      .upsertMessageBody(adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_B })));
    const readMessagesByUuids = vi.fn(() => Promise.resolve([]));
    const getMessagesByUuids = vi.fn(() => Promise.resolve([createMessageDto()]));

    await expect(
      loadMessengerLastMessagesForSidebar({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: { getMessagesByUuids },
        cache: { readMessagesByUuids },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      requested: 2,
      applied: 1,
    });

    expect(readMessagesByUuids).toHaveBeenCalledWith(ownerKey, [MESSAGE_A, MESSAGE_B]);
    expect(getMessagesByUuids).toHaveBeenCalledWith(expect.any(Object), [MESSAGE_A, MESSAGE_B]);
  });

  it("does not write messages when the runtime owner becomes stale", async () => {
    let currentContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(currentContext);
    seedBootstrap(ownerKey);
    const messageRequest = createDeferred<WorkspaceMessengerMessageDto[]>();
    const writeMessages = vi.fn(() => Promise.resolve());

    const loading = loadMessengerLastMessagesForSidebar({
      runtimeContext: currentContext,
      getRuntimeContext: () => currentContext,
      client: { getMessagesByUuids: () => messageRequest.promise },
      cache: {
        readMessagesByUuids: () => Promise.resolve([]),
        writeMessages,
      },
    });

    currentContext = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
    });
    messageRequest.resolve([createMessageDto()]);

    await expect(loading).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(writeMessages).not.toHaveBeenCalled();
  });

  it("does not apply cached messages when the runtime owner becomes stale", async () => {
    let currentContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(currentContext);
    seedBootstrap(ownerKey);
    const cacheRequest = createDeferred<ReturnType<typeof adaptMessengerMessage>[]>();
    const getMessagesByUuids = vi.fn(() => Promise.resolve([]));

    const loading = loadMessengerLastMessagesForSidebar({
      runtimeContext: currentContext,
      getRuntimeContext: () => currentContext,
      client: { getMessagesByUuids },
      cache: { readMessagesByUuids: () => cacheRequest.promise },
    });

    currentContext = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
    });
    cacheRequest.resolve([adaptMessengerMessage(createMessageDto())]);

    await expect(loading).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(getMessagesByUuids).not.toHaveBeenCalled();
  });

  it("falls back to the client when reading the message cache fails", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    seedBootstrap(ownerKey);
    const getMessagesByUuids = vi.fn(() => Promise.resolve([createMessageDto()]));

    await expect(
      loadMessengerLastMessagesForSidebar({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: { getMessagesByUuids },
        cache: {
          readMessagesByUuids: () => Promise.reject(new Error("idb failed")),
        },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      requested: 2,
      applied: 1,
    });

    expect(getMessagesByUuids).toHaveBeenCalledWith(expect.any(Object), [MESSAGE_A, MESSAGE_B]);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
      "Hello, workspace",
    );
  });

  it("keeps the sidebar snapshot when last message loading fails", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    seedBootstrap(ownerKey);

    await expect(
      loadMessengerLastMessagesForSidebar({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: {
          getMessagesByUuids: () => Promise.reject(new Error("bulk API is missing")),
        },
      }),
    ).resolves.toEqual({
      status: "failed",
      ownerKey,
      error: "bulk API is missing",
    });

    expect(useMessengerStore.getState().streamsById[STREAM_A]?.name).toBe("Engineering");
    expect(useMessengerStore.getState().error).toBeNull();
  });
});
