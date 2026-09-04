import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import {
  selectWorkspaceMessagesForConversation,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "~/shared/api/messenger.types";
import {
  adaptMessengerMessage,
  adaptMessengerStream,
  adaptMessengerTopic,
  adaptStreamToMessengerConversation,
  adaptTopicToMessengerConversation,
} from "./messenger-adapters.lib";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  markMessengerMessageRead,
  markMessengerMessagesReadUpTo,
  sendMessengerMessage,
} from "./messenger-message-actions.lib";
import { readMessengerReadBoundary } from "./messenger-read-boundary.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerConversationId } from "./messenger.types";

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
const MESSAGE_B = "b93dca35-3061-4748-bda4-7f6f8c660ea5";
const MESSAGE_C = "c93dca35-3061-4748-bda4-7f6f8c660ea5";
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
    read: false,
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
    unread_count: 0,
    active_unread_count: 0,
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
    name: "General",
    stream_uuid: STREAM_A,
    user_uuid: USER_A,
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    is_default: true,
    is_done: false,
    notification_mode: "default",
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

function seedUnreadMention(ownerKey: string, runtimeGeneration = 1): void {
  const store = useActivityStore.getState();
  store.setUnreadMentionsOwner(ownerKey);
  const token = store.startUnreadMentionsBootstrap(ownerKey, runtimeGeneration);
  store.finishUnreadMentionsBootstrap(ownerKey, runtimeGeneration, token, [
    {
      uuid: MESSAGE_A,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      createdAt: DATE,
    },
  ]);
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

function replaceTailWindow(
  conversationId: MessengerConversationId,
  messages: ReturnType<typeof adaptMessengerMessage>[],
): void {
  const state = useWorkspaceMessageStore.getState();
  state.replaceConversationWindow({
    conversationId,
    expectedRevision: state.conversationWindowsById[conversationId]?.revision ?? null,
    capturedMutationRevision: state.messageMutationRevision,
    mode: "tail",
    anchorMessageUuid: null,
    messages,
    markers: { beforePageMarker: null, afterPageMarker: null },
  });
}

describe("messenger message actions", () => {
  beforeEach(() => {
    useActivityStore.getState().clear();
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  it("creates a markdown message without inventing a visible window", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const createMessage = vi.fn(
      (
        _options: MessengerClientOptions,
        _body: WorkspaceMessengerCreateMessageRequestBody,
      ): Promise<WorkspaceMessengerMessageDto> => Promise.resolve(createMessageDto()),
    );
    const cache = {
      writeConversationMessagePage: vi.fn(() => Promise.resolve()),
    };
    const onBeforeMessageIndexed = vi.fn((message) => {
      expect(useWorkspaceMessageStore.getState().messagesById[message.uuid]).toBeUndefined();
    });

    await expect(
      sendMessengerMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        markdown: "Hello, workspace",
        includeStreamConversation: true,
        client: { createMessage },
        cache,
        onBeforeMessageIndexed,
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      message: expect.objectContaining({
        uuid: MESSAGE_A,
        payload: { kind: "markdown", content: "Hello, workspace" },
      }),
    });

    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      {
        stream_uuid: STREAM_A,
        topic_uuid: TOPIC_A,
        payload: { kind: "markdown", content: "Hello, workspace" },
      },
    );
    expect(cache.writeConversationMessagePage).toHaveBeenCalledTimes(2);
    expect(onBeforeMessageIndexed).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: MESSAGE_A }),
    );
    expect(cache.writeConversationMessagePage).toHaveBeenNthCalledWith(
      1,
      ownerKey,
      `topic:${STREAM_A}:${TOPIC_A}`,
      {
        messages: [expect.objectContaining({ uuid: MESSAGE_A })],
        source: "message-action",
      },
    );
    expect(cache.writeConversationMessagePage).toHaveBeenNthCalledWith(
      2,
      ownerKey,
      `stream:${STREAM_A}`,
      {
        messages: [expect.objectContaining({ uuid: MESSAGE_A })],
        source: "message-action",
      },
    );
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({ uuid: MESSAGE_A }),
    );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([]);
  });

  it("does not wait for the cache before reporting a sent message", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const cacheWrite = createDeferred<void>();
    const cache = {
      writeConversationMessagePage: vi.fn(() => cacheWrite.promise),
    };
    const createMessage = vi.fn(
      (
        _options: MessengerClientOptions,
        _body: WorkspaceMessengerCreateMessageRequestBody,
      ): Promise<WorkspaceMessengerMessageDto> => Promise.resolve(createMessageDto()),
    );
    const action = sendMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      markdown: "Hello, workspace",
      client: { createMessage },
      cache,
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timed-out">((resolve) => {
      timeoutId = setTimeout(() => resolve("timed-out"), 100);
    });

    const result = await Promise.race([action, timeout]);
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }

    expect(result).toEqual({
      status: "applied",
      ownerKey,
      message: expect.objectContaining({ uuid: MESSAGE_A }),
    });
    expect(cache.writeConversationMessagePage).toHaveBeenCalledTimes(1);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({ uuid: MESSAGE_A }),
    );

    cacheWrite.resolve();
  });

  it("skips stale edit results after the runtime owner changes", async () => {
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
    useWorkspaceMessageStore
      .getState()
      .applyLiveKnownBodyMutation(adaptMessengerMessage(createMessageDto()));
    const editRequest = createDeferred<WorkspaceMessengerMessageDto>();
    const editMessage = vi.fn(
      (
        _options: MessengerClientOptions,
        _messageUuid: string,
        _body: WorkspaceMessengerUpdateMessageRequestBody,
      ) => editRequest.promise,
    );
    const cache = {
      patchCachedMessage: vi.fn(() => Promise.resolve()),
    };
    const actionPromise = editMessengerMessage({
      runtimeContext: runtimeA,
      getRuntimeContext: () => runtimeB,
      messageUuid: MESSAGE_A,
      markdown: "Edited",
      client: { editMessage },
      cache,
    });

    editRequest.resolve(createMessageDto({ payload: { kind: "markdown", content: "Edited" } }));

    await expect(actionPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).not.toBe(
      "Edited",
    );
    expect(cache.patchCachedMessage).not.toHaveBeenCalled();
  });

  it("does not let a late edit response overwrite a newer realtime update", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(adaptMessengerMessage(createMessageDto()));
    const editRequest = createDeferred<WorkspaceMessengerMessageDto>();

    const action = editMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      markdown: "Old action response",
      client: { editMessage: () => editRequest.promise },
      cache: { patchCachedMessage: vi.fn(() => Promise.resolve()) },
    });
    useWorkspaceMessageStore
      .getState()
      .applyLiveKnownBodyMutation(
        adaptMessengerMessage(
          createMessageDto({ payload: { kind: "markdown", content: "New realtime body" } }),
        ),
      );
    editRequest.resolve(
      createMessageDto({ payload: { kind: "markdown", content: "Old action response" } }),
    );

    await action;
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
      "New realtime body",
    );
  });

  it("does not resurrect a realtime-deleted message from a late read response", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(adaptMessengerMessage(createMessageDto()));
    const readRequest = createDeferred<WorkspaceMessengerMessageDto>();

    const action = markMessengerMessageRead({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      client: { markMessagesReadUpTo: () => readRequest.promise },
      cache: {},
    });
    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);
    readRequest.resolve(createMessageDto({ read: true }));

    await action;
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
  });

  it("writes the effective body to cache after a newer realtime update wins the read fence", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const initial = adaptMessengerMessage(createMessageDto());
    replaceTailWindow(initial.conversationId, [initial]);
    const readRequest = createDeferred<WorkspaceMessengerMessageDto>();
    const cache = {
      patchCachedMessage: vi.fn(() => Promise.resolve()),
      markCachedMessagesRead: vi.fn(() => Promise.resolve()),
    };
    const action = markMessengerMessagesReadUpTo({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      conversationIds: [initial.conversationId],
      client: { markMessagesReadUpTo: () => readRequest.promise },
      cache,
    });
    useWorkspaceMessageStore
      .getState()
      .applyLiveKnownBodyMutation(
        adaptMessengerMessage(
          createMessageDto({ payload: { kind: "markdown", content: "New realtime body" } }),
        ),
      );
    readRequest.resolve(
      createMessageDto({ read: true, payload: { kind: "markdown", content: "Old HTTP body" } }),
    );

    await action;
    expect(cache.patchCachedMessage).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({
        uuid: MESSAGE_A,
        payload: { kind: "markdown", content: "New realtime body" },
        read: true,
      }),
    );
  });

  it("does not cache a late read body after realtime delete", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const initial = adaptMessengerMessage(createMessageDto());
    replaceTailWindow(initial.conversationId, [initial]);
    const readRequest = createDeferred<WorkspaceMessengerMessageDto>();
    const cache = {
      patchCachedMessage: vi.fn(() => Promise.resolve()),
      markCachedMessagesRead: vi.fn(() => Promise.resolve()),
    };
    const action = markMessengerMessagesReadUpTo({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      conversationIds: [initial.conversationId],
      client: { markMessagesReadUpTo: () => readRequest.promise },
      cache,
    });
    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);
    readRequest.resolve(createMessageDto({ read: true }));

    await action;
    expect(cache.patchCachedMessage).not.toHaveBeenCalled();
    expect(cache.markCachedMessagesRead).not.toHaveBeenCalled();
  });

  it("keeps a newer unread-mentions index when a message read cache write finishes late", async () => {
    const runtimeA = createRuntimeContext();
    const runtimeAAfterSwitch = createRuntimeContext({ runtimeGeneration: 3 });
    const ownerKey = prepareStoreOwner(runtimeA);
    seedUnreadMention(ownerKey, runtimeA.runtimeGeneration);
    const cacheWrite = createDeferred<void>();
    const advanceReadBoundary = vi.fn(() => cacheWrite.promise);
    let currentRuntime = runtimeA;

    const action = markMessengerMessageRead({
      runtimeContext: runtimeA,
      getRuntimeContext: () => currentRuntime,
      messageUuid: MESSAGE_A,
      client: { markMessagesReadUpTo: () => Promise.resolve(createMessageDto({ read: true })) },
      cache: { advanceReadBoundary },
    });
    await vi.waitFor(() => expect(advanceReadBoundary).toHaveBeenCalledOnce());

    currentRuntime = runtimeAAfterSwitch;
    seedUnreadMention(ownerKey, runtimeAAfterSwitch.runtimeGeneration);
    cacheWrite.resolve();

    await expect(action).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useActivityStore.getState()).toMatchObject({
      staleVersion: 0,
      unreadMentionsCount: 1,
      unreadMentionsStatus: "ready",
      unreadMentionsRuntimeGeneration: runtimeAAfterSwitch.runtimeGeneration,
    });
  });

  it("keeps a newer unread-mentions index when a bulk read cache write finishes late", async () => {
    const runtimeA = createRuntimeContext();
    const runtimeAAfterSwitch = createRuntimeContext({ runtimeGeneration: 3 });
    const ownerKey = prepareStoreOwner(runtimeA);
    seedUnreadMention(ownerKey, runtimeA.runtimeGeneration);
    const cacheWrite = createDeferred<void>();
    const advanceReadBoundary = vi.fn(() => cacheWrite.promise);
    let currentRuntime = runtimeA;

    const action = markMessengerMessagesReadUpTo({
      runtimeContext: runtimeA,
      getRuntimeContext: () => currentRuntime,
      messageUuid: MESSAGE_A,
      client: { markMessagesReadUpTo: () => Promise.resolve(createMessageDto({ read: true })) },
      cache: { advanceReadBoundary },
    });
    await vi.waitFor(() => expect(advanceReadBoundary).toHaveBeenCalledOnce());

    currentRuntime = runtimeAAfterSwitch;
    seedUnreadMention(ownerKey, runtimeAAfterSwitch.runtimeGeneration);
    cacheWrite.resolve();

    await expect(action).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useActivityStore.getState()).toMatchObject({
      staleVersion: 0,
      unreadMentionsCount: 1,
      unreadMentionsStatus: "ready",
      unreadMentionsRuntimeGeneration: runtimeAAfterSwitch.runtimeGeneration,
    });
  });

  it("deletes and marks messages as read through Workspace actions", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    seedUnreadMention(ownerKey, runtimeContext.runtimeGeneration);
    await sendMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      markdown: "Hello, workspace",
      includeStreamConversation: true,
      client: { createMessage: () => Promise.resolve(createMessageDto()) },
    });
    const cache = {
      patchCachedMessage: vi.fn(() => Promise.resolve()),
      deleteCachedMessage: vi.fn(() => Promise.resolve()),
    };

    await markMessengerMessageRead({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      conversationIds: [`topic:${STREAM_A}:${TOPIC_A}`],
      client: { markMessagesReadUpTo: () => Promise.resolve(createMessageDto({ read: true })) },
      cache,
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
    expect(cache.patchCachedMessage).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({ uuid: MESSAGE_A, read: true }),
    );
    expect(useActivityStore.getState()).toMatchObject({
      staleVersion: 1,
      unreadMentionsCount: null,
      unreadMentionsStatus: "idle",
    });

    const deleteMessage = vi.fn(() => Promise.resolve());
    await deleteMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      client: { deleteMessage },
      cache,
    });

    expect(deleteMessage).toHaveBeenCalledWith(expect.any(Object), MESSAGE_A);
    expect(cache.deleteCachedMessage).toHaveBeenCalledWith(ownerKey, MESSAGE_A, [
      `stream:${STREAM_A}`,
      `topic:${STREAM_A}:${TOPIC_A}`,
    ]);
    expect(useMessengerStore.getState().ownerKey).toBe(ownerKey);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
  });

  it("repairs sidebar last-message pointers after deleting the current tail", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const previousDto = createMessageDto({
      uuid: MESSAGE_B,
      payload: { kind: "markdown", content: "Previous message" },
      created_at: "2026-06-22T10:05:00Z",
      updated_at: "2026-06-22T10:05:00Z",
    });
    const deletedDto = createMessageDto();
    const serverPreviousDto = createMessageDto({
      uuid: MESSAGE_C,
      payload: { kind: "markdown", content: "Authoritative previous message" },
      created_at: "2026-06-22T10:08:00Z",
      updated_at: "2026-06-22T10:08:00Z",
    });
    const streamDto = createStreamDto({ last_message_uuid: MESSAGE_A });
    const topicDto = createTopicDto({ last_message_uuid: MESSAGE_A });
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(streamDto)],
      streamBindings: [],
      topics: [adaptMessengerTopic(topicDto)],
      conversations: [
        adaptStreamToMessengerConversation(streamDto),
        adaptTopicToMessengerConversation(topicDto, streamDto),
      ],
      folders: [],
    });
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(adaptMessengerMessage(previousDto));
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(adaptMessengerMessage(deletedDto));
    const getMessagesPage = vi.fn(() =>
      Promise.resolve({ items: [serverPreviousDto], nextPageMarker: null, pageLimit: 1 }),
    );
    const repairMessagePointers = vi.fn(() => Promise.resolve());

    await deleteMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      client: { deleteMessage: vi.fn(() => Promise.resolve()), getMessagesPage },
      cache: { repairMessagePointers },
    });

    const state = useMessengerStore.getState();
    expect(state.streamsById[STREAM_A]?.lastMessageUuid).toBe(MESSAGE_C);
    expect(state.topicsById[TOPIC_A]?.lastMessageUuid).toBe(MESSAGE_C);
    expect(state.conversationsById[`stream:${STREAM_A}`]?.lastMessageUuid).toBe(MESSAGE_C);
    expect(state.conversationsById[`topic:${STREAM_A}:${TOPIC_A}`]?.lastMessageUuid).toBe(
      MESSAGE_C,
    );
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_C]).toBeDefined();
    expect(getMessagesPage).toHaveBeenCalledTimes(2);
    expect(repairMessagePointers).toHaveBeenNthCalledWith(1, ownerKey, expect.any(Object), {
      stream: true,
      conversationIds: [`stream:${STREAM_A}`],
    });
    expect(repairMessagePointers).toHaveBeenNthCalledWith(2, ownerKey, expect.any(Object), {
      topic: true,
      conversationIds: [`topic:${STREAM_A}:${TOPIC_A}`],
    });
  });

  it("uses read_up_to and updates loaded messages after the response", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const earlier = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_A,
        is_own: false,
        read: false,
        created_at: "2026-06-22T10:00:00Z",
      }),
    );
    const anchor = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_B,
        is_own: false,
        read: false,
        created_at: "2026-06-22T10:10:00Z",
      }),
    );
    replaceTailWindow(earlier.conversationId, [earlier, anchor]);

    const markMessagesReadUpTo = vi.fn(() =>
      Promise.resolve(createMessageDto({ uuid: MESSAGE_B, read: true })),
    );
    const cache = {
      advanceReadBoundary: vi.fn(() => Promise.resolve()),
      patchCachedMessage: vi.fn(() => Promise.resolve()),
      markCachedMessagesRead: vi.fn(() => Promise.resolve()),
    };

    await markMessengerMessagesReadUpTo({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_B,
      conversationIds: [earlier.conversationId],
      client: { markMessagesReadUpTo },
      cache,
    });

    expect(markMessagesReadUpTo).toHaveBeenCalledTimes(1);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.read).toBe(true);
    expect(cache.patchCachedMessage).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({ uuid: MESSAGE_B, read: true }),
    );
    expect(cache.markCachedMessagesRead).toHaveBeenCalledWith(ownerKey, [MESSAGE_A]);
    expect(cache.advanceReadBoundary).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        messageUuid: MESSAGE_B,
      }),
    );
  });

  function bootstrapCountersForReadUpTo(ownerKey: string, topicLastMessageUuid: string): void {
    const streamDto = createStreamDto({
      unread_count: 5,
      active_unread_count: 5,
      passive_unread_count: 0,
      last_message_uuid: topicLastMessageUuid,
    });
    const topicDto = createTopicDto({
      unread_count: 3,
      active_unread_count: 3,
      passive_unread_count: 0,
      last_message_uuid: topicLastMessageUuid,
    });
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [adaptMessengerStream(streamDto)],
      streamBindings: [],
      topics: [adaptMessengerTopic(topicDto)],
      conversations: [
        adaptStreamToMessengerConversation(streamDto),
        adaptTopicToMessengerConversation(topicDto, streamDto),
      ],
      folders: [],
    });
  }

  async function readUpToAnchorB(runtimeContext: WorkspaceRuntimeContext): Promise<void> {
    const earlier = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_A,
        is_own: false,
        read: false,
        created_at: "2026-06-22T10:00:00Z",
      }),
    );
    const anchor = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_B,
        is_own: false,
        read: false,
        created_at: "2026-06-22T10:10:00Z",
      }),
    );
    replaceTailWindow(earlier.conversationId, [earlier, anchor]);
    await markMessengerMessagesReadUpTo({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_B,
      conversationIds: [earlier.conversationId],
      client: {
        markMessagesReadUpTo: vi.fn(() =>
          Promise.resolve(createMessageDto({ uuid: MESSAGE_B, read: true })),
        ),
      },
      cache: {},
    });
  }

  it("settles topic and stream counters when read_up_to reaches the topic's last message", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    bootstrapCountersForReadUpTo(ownerKey, MESSAGE_B);

    await readUpToAnchorB(runtimeContext);

    const state = useMessengerStore.getState();
    expect(state.topicsById[TOPIC_A]).toMatchObject({
      unreadCount: 0,
      activeUnreadCount: 0,
      passiveUnreadCount: 0,
    });
    expect(state.streamsById[STREAM_A]).toMatchObject({
      unreadCount: 2,
      activeUnreadCount: 2,
    });
    expect(state.conversationsById[`topic:${STREAM_A}:${TOPIC_A}`]?.unreadCount).toBe(0);
  });

  it("settles counters when the read_up_to boundary is later than the topic's loaded last message", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    bootstrapCountersForReadUpTo(ownerKey, MESSAGE_A);

    await readUpToAnchorB(runtimeContext);

    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(0);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);
  });

  it("leaves counters to the server when the read_up_to boundary is not the topic's last message", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    bootstrapCountersForReadUpTo(ownerKey, MESSAGE_C);

    await readUpToAnchorB(runtimeContext);

    const state = useMessengerStore.getState();
    expect(state.topicsById[TOPIC_A]?.unreadCount).toBe(3);
    expect(state.streamsById[STREAM_A]?.unreadCount).toBe(5);
  });

  it("includes the read_up_to anchor in a bulk-only cache update", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const earlier = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_A,
        is_own: false,
        read: false,
        created_at: "2026-06-22T10:00:00Z",
      }),
    );
    const anchor = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_B,
        is_own: false,
        read: false,
        created_at: "2026-06-22T10:10:00Z",
      }),
    );
    replaceTailWindow(earlier.conversationId, [earlier, anchor]);
    const cache = {
      markCachedMessagesRead: vi.fn(() => Promise.resolve()),
    };

    await markMessengerMessagesReadUpTo({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_B,
      conversationIds: [earlier.conversationId],
      client: {
        markMessagesReadUpTo: () =>
          Promise.resolve(createMessageDto({ uuid: MESSAGE_B, read: true })),
      },
      cache,
    });

    expect(cache.markCachedMessagesRead).toHaveBeenCalledWith(ownerKey, [MESSAGE_B, MESSAGE_A]);
  });

  it("does not advance a boundary after a stale read response", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const response = createDeferred<WorkspaceMessengerMessageDto>();
    const cache = { advanceReadBoundary: vi.fn(() => Promise.resolve()) };
    let currentRuntime = runtimeContext;
    const result = markMessengerMessageRead({
      runtimeContext,
      getRuntimeContext: () => currentRuntime,
      messageUuid: MESSAGE_A,
      client: { markMessagesReadUpTo: () => response.promise },
      cache,
    });
    currentRuntime = createRuntimeContext({ organizationId: ORGANIZATION_B });
    response.resolve(createMessageDto({ read: true }));

    await expect(result).resolves.toEqual({ status: "skipped", ownerKey, reason: "stale-owner" });
    expect(cache.advanceReadBoundary).not.toHaveBeenCalled();
    expect(readMessengerReadBoundary(ownerKey, STREAM_A, TOPIC_A)).toBeNull();
  });

  it("keeps the send result applied when the cache write fails", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const cache = {
      writeConversationMessagePage: vi.fn(() => {
        throw new Error("cache unavailable");
      }),
    };

    await expect(
      sendMessengerMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        markdown: "Hello, workspace",
        includeStreamConversation: true,
        client: { createMessage: () => Promise.resolve(createMessageDto()) },
        cache,
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      message: expect.objectContaining({ uuid: MESSAGE_A }),
    });

    expect(cache.writeConversationMessagePage).toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({ uuid: MESSAGE_A }),
    );
  });
});
