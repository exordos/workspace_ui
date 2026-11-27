import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { workspaceRuntimeOwnerKey } from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "~/shared/api/messenger.types";
import {
  openWorkspaceMessengerCacheDb,
  deleteCachedMessage,
  resetWorkspaceMessengerCacheDbSingletonForTests,
} from "~/shared/lib/workspace-messenger-cache-db";
import { selectMessengerSidebarStreams } from "../../features/sidebar/messenger-sidebar.lib";
import { useMessengerBackgroundProjectionStore } from "../../runtime/sync/messenger-background-projection.model";
import { createMessengerRealtimeApplier } from "../../runtime/sync/messenger-realtime-applier.lib";
import {
  adaptMessengerStream,
  adaptMessengerTopic,
  adaptStreamToMessengerConversation,
  adaptTopicToMessengerConversation,
} from "../chats/messenger-catalog-adapters.lib";
import { repairDeletedMessagePointers } from "../chats/messenger-deleted-message-pointer-repair.lib";
import { useMessengerStore } from "../chats/messenger.model";
import {
  markMessengerCachedMessagesRead,
  deleteMessengerCachedMessage,
  patchMessengerCachedMessage,
  advanceMessengerCachedReadBoundary,
  readMessengerCatalogPayloadCache,
  readMessengerCachedReadBoundaries,
  readMessengerConversationWindowCache,
  readMessengerMessageBodyCache,
  repairMessengerCachedMessagePointers,
  writeMessengerCatalogPayloadCache,
  writeMessengerConversationWindowCache,
} from "../messenger-cache.lib";
import * as messengerRequestOptions from "../messenger-request-options.lib";
import { loadMessengerConversationMessages } from "./history/messenger-messages-loader.lib";
import { selectWorkspaceMessagesForConversation, useWorkspaceMessageStore } from "./message.model";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  markMessengerMessageRead,
  markMessengerMessagesReadUpTo,
  sendMessengerE2eePayload,
  sendMessengerMessage,
  type MessengerMessageActionCacheWriter,
  type MessengerMessageActionClientDeps,
  type MessengerMessageActionResult,
} from "./messenger-message-actions.lib";
import { adaptMessengerMessage } from "./messenger-message-adapter.lib";
import { createMessengerPlacementUuid } from "./messenger-message-identity.lib";
import { readMessengerReadBoundary } from "./messenger-read-boundary.lib";
import { useMessengerOutboxStore } from "./outgoing/messenger-outbox.model";
import type { ChatE2eePayload } from "../crypto/chat-e2ee.types";
import type { MessengerMessagePayload, MessengerConversationId } from "../messenger.types";

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
  useMessengerStore.getState().upsertStream(ownerKey, adaptMessengerStream(createStreamDto()));
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
    vi.restoreAllMocks();
    useActivityStore.getState().clear();
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useMessengerOutboxStore.getState().clear();
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
    const canonicalMessageUuid = "00000000-0000-4000-8000-000000000002";

    await expect(
      sendMessengerMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        markdown: "Hello, workspace",
        canonicalMessageUuid,
        includeStreamConversation: true,
        client: { createMessage },
        cache,
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
        uuid: canonicalMessageUuid,
        stream_uuid: STREAM_A,
        topic_uuid: TOPIC_A,
        payload: { kind: "markdown", content: "Hello, workspace" },
      },
    );
    expect(cache.writeConversationMessagePage).toHaveBeenCalledTimes(2);
    expect(cache.writeConversationMessagePage).toHaveBeenNthCalledWith(
      1,
      ownerKey,
      `topic:${STREAM_A}:${TOPIC_A}`,
      {
        messages: [expect.objectContaining({ uuid: MESSAGE_A })],
        source: "message-action",
      },
      expect.any(Function),
    );
    expect(cache.writeConversationMessagePage).toHaveBeenNthCalledWith(
      2,
      ownerKey,
      `stream:${STREAM_A}`,
      {
        messages: [expect.objectContaining({ uuid: MESSAGE_A })],
        source: "message-action",
      },
      expect.any(Function),
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

  it("settles the matching outbox row after the HTTP message is indexed", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceTailWindow(conversationId, []);
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey,
      conversationId,
      projectId: PROJECT_A,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      authorUuid: USER_A,
      markdown: "Hello, workspace",
      status: "sending",
      includeStreamConversation: false,
    });
    const receipt = createMessageDto({ uuid: outgoing.placementUuid });

    await sendMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      markdown: outgoing.markdown,
      canonicalMessageUuid: outgoing.canonicalMessageUuid,
      client: { createMessage: () => Promise.resolve(receipt) },
      cache: {},
    });

    expect(useWorkspaceMessageStore.getState().messagesById[outgoing.placementUuid]).toBeDefined();
    expect(
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[outgoing.placementUuid],
    ).toBeUndefined();
    await createMessengerRealtimeApplier({ requireOwnerCatalog: false, cache: {} }).applyEvent(
      { type: "message", kind: "message.created", epoch_version: 1, message: receipt },
      { owner: runtimeContext, ownerKey, surface: "active", source: "websocket" },
    );
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.messageUuids,
    ).toEqual([receipt.uuid]);
  });

  it.each(["single", "batch"] as const)(
    "preserves the newer server history after POST and a delayed %s create",
    async (delivery) => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      replaceTailWindow(conversationId, []);
      const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
        ownerKey,
        conversationId,
        projectId: PROJECT_A,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        authorUuid: USER_A,
        markdown: "Original send",
        status: "sending",
        includeStreamConversation: false,
      });
      const receipt = createMessageDto({
        uuid: outgoing.placementUuid,
        payload: { kind: "markdown", content: outgoing.markdown },
      });
      const onSettled = vi.fn();
      const unsubscribe = useMessengerOutboxStore.subscribe((state, previous) => {
        if (
          previous.outgoingMessagesByPlacementUuid[receipt.uuid] != null &&
          state.outgoingMessagesByPlacementUuid[receipt.uuid] == null
        )
          onSettled();
      });
      try {
        await expect(
          sendMessengerMessage({
            runtimeContext,
            streamUuid: STREAM_A,
            topicUuid: TOPIC_A,
            markdown: outgoing.markdown,
            canonicalMessageUuid: outgoing.canonicalMessageUuid,
            client: { createMessage: () => Promise.resolve(receipt) },
            cache: {},
          }),
        ).resolves.toMatchObject({ status: "applied" });
        expect(onSettled).toHaveBeenCalledOnce();
        const newer = createMessageDto({
          ...receipt,
          updated_at: DATE.replace("Z", ".000001Z"),
          payload: { kind: "markdown", content: "Edited server history" },
        });
        const writeHistoryPage = vi.fn();
        await expect(
          loadMessengerConversationMessages({
            runtimeContext,
            conversationId,
            client: {
              getMessagesPage: () =>
                Promise.resolve({ items: [newer], nextPageMarker: null, pageLimit: 50 }),
            },
            cache: {
              readReadBoundaries: () => Promise.resolve([]),
              readConversationMessageWindow: () =>
                Promise.resolve({ messages: [], nextPageMarker: null, hasMore: false }),
              writeConversationMessagePage: writeHistoryPage,
            },
          }),
        ).resolves.toMatchObject({ status: "applied" });
        expect(writeHistoryPage).toHaveBeenCalledWith(
          ownerKey,
          conversationId,
          expect.objectContaining({
            messages: [expect.objectContaining({ uuid: receipt.uuid, payload: newer.payload })],
          }),
          expect.any(Function),
        );

        const writeCreatedMessages = vi.fn();
        const writeRealtimeCursor = vi.fn();
        const applier = createMessengerRealtimeApplier({
          requireOwnerCatalog: false,
          cache: { writeCreatedMessages, writeRealtimeCursor },
        });
        const stale = {
          type: "message",
          kind: "message.created",
          epoch_version: 2,
          message: receipt,
        } as const;
        const fresh = {
          ...stale,
          epoch_version: 1,
          message: createMessageDto({ uuid: MESSAGE_C }),
        };
        if (delivery === "batch") {
          await applier.applyEvents?.([fresh, stale], {
            owner: runtimeContext,
            ownerKey,
            surface: "active",
            source: "catch_up",
          });
          expect(writeCreatedMessages).toHaveBeenCalledExactlyOnceWith(
            ownerKey,
            [expect.objectContaining({ uuid: fresh.message.uuid })],
            stale.epoch_version,
            expect.any(Function),
          );
        } else {
          await applier.applyEvent(stale, {
            owner: runtimeContext,
            ownerKey,
            surface: "active",
            source: "websocket",
          });
          expect(writeCreatedMessages).not.toHaveBeenCalled();
          expect(writeRealtimeCursor).toHaveBeenCalledExactlyOnceWith(
            ownerKey,
            stale.epoch_version,
            expect.any(Function),
          );
        }
        expect(useMessengerStore.getState().lastEpochVersion).toBe(stale.epoch_version);
        const state = useWorkspaceMessageStore.getState();
        expect(state.messagesById[receipt.uuid]?.payload).toEqual(newer.payload);
        expect(
          state.conversationWindowsById[conversationId]?.messageUuids.filter(
            (uuid) => uuid === receipt.uuid,
          ),
        ).toEqual([receipt.uuid]);
        expect(onSettled).toHaveBeenCalledOnce();
      } finally {
        unsubscribe();
      }
    },
  );

  it.each(["message store", "outbox"])(
    "stops projecting a send when its %s publication aborts the request",
    async (source) => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
        ownerKey,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        projectId: PROJECT_A,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        authorUuid: USER_A,
        markdown: "Hello, workspace",
        status: "sending",
        includeStreamConversation: false,
      });
      const controller = new AbortController();
      const writeConversationMessagePage = vi.fn();
      const unsubscribe =
        source === "outbox"
          ? useMessengerOutboxStore.subscribe((state) => {
              if (state.outgoingMessagesByPlacementUuid[outgoing.placementUuid] == null)
                controller.abort();
            })
          : useWorkspaceMessageStore.subscribe((state) => {
              if (state.messagesById[outgoing.placementUuid] != null) controller.abort();
            });
      try {
        await expect(
          sendMessengerMessage({
            runtimeContext,
            streamUuid: STREAM_A,
            topicUuid: TOPIC_A,
            canonicalMessageUuid: outgoing.canonicalMessageUuid,
            markdown: outgoing.markdown,
            signal: controller.signal,
            client: {
              createMessage: () =>
                Promise.resolve(createMessageDto({ uuid: outgoing.placementUuid })),
            },
            cache: { writeConversationMessagePage },
          }),
        ).resolves.toMatchObject({ status: "skipped", reason: "stale-owner" });
        expect(useMessengerStore.getState().streamsById[STREAM_A]?.lastMessageUuid).toBeNull();
        expect(writeConversationMessagePage).not.toHaveBeenCalled();
        expect(
          Boolean(
            useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[
              outgoing.placementUuid
            ],
          ),
        ).toBe(source === "message store");
      } finally {
        unsubscribe();
      }
    },
  );

  it("does not wait for the cache before reporting a sent message", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const generatedCanonicalMessageUuid = "00000000-0000-4000-8000-000000000003";
    const randomUuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue(generatedCanonicalMessageUuid);
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
    expect(randomUuid).toHaveBeenCalledOnce();
    expect(createMessage).toHaveBeenCalledWith(expect.any(Object), {
      uuid: generatedCanonicalMessageUuid,
      stream_uuid: STREAM_A,
      topic_uuid: TOPIC_A,
      payload: { kind: "markdown", content: "Hello, workspace" },
    });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toEqual(
      expect.objectContaining({ uuid: MESSAGE_A }),
    );

    cacheWrite.resolve();
  });

  it.each(["edit", "deletion"])(
    "keeps a cache write current through an optimistic reaction until %s",
    async (mutation) => {
      const runtimeContext = createRuntimeContext();
      prepareStoreOwner(runtimeContext);
      const receipt = createMessageDto();
      const writeConversationMessagePage =
        vi.fn<NonNullable<MessengerMessageActionCacheWriter["writeConversationMessagePage"]>>();
      await expect(
        sendMessengerMessage({
          runtimeContext,
          streamUuid: STREAM_A,
          topicUuid: TOPIC_A,
          markdown: "Hello, workspace",
          client: { createMessage: () => Promise.resolve(receipt) },
          cache: { writeConversationMessagePage },
        }),
      ).resolves.toMatchObject({ status: "applied" });
      const isWriteCurrent = writeConversationMessagePage.mock.calls[0]?.[3];
      expect(isWriteCurrent?.()).toBe(true);
      const state = useWorkspaceMessageStore.getState();
      state.beginOptimisticOwnMessageReaction(receipt.uuid, "smile", "add", "add-reaction", USER_A);
      expect(useWorkspaceMessageStore.getState().messagesById[receipt.uuid]).not.toBe(
        state.messagesById[receipt.uuid],
      );
      expect(isWriteCurrent?.()).toBe(true);

      if (mutation === "deletion") state.removeMessage(receipt.uuid);
      else
        state.applyLiveKnownBodyMutation(
          adaptMessengerMessage({ ...receipt, payload: { kind: "markdown", content: "Edited" } }),
        );
      expect(isWriteCurrent?.()).toBe(false);
    },
  );

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
    expect(
      readMarkdownPayload(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload),
    ).not.toBe("Edited");
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
    expect(
      readMarkdownPayload(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload),
    ).toBe("New realtime body");
  });

  describe("message mutation cache reconciliation", () => {
    beforeEach(() => {
      vi.stubGlobal("indexedDB", new IDBFactory());
      vi.stubGlobal("IDBKeyRange", IDBKeyRange);
      resetWorkspaceMessengerCacheDbSingletonForTests();
    });

    afterEach(async () => {
      const db = await openWorkspaceMessengerCacheDb();
      db.close();
      resetWorkspaceMessengerCacheDbSingletonForTests();
      vi.unstubAllGlobals();
    });

    async function seedMessageWindow(ownerKey: string, dto: WorkspaceMessengerMessageDto) {
      const message = adaptMessengerMessage(dto);
      replaceTailWindow(message.conversationId, [message]);
      await writeMessengerConversationWindowCache(ownerKey, message.conversationId, {
        messages: [message],
        nextPageMarker: null,
        hasMore: false,
      });
      return message.conversationId;
    }

    async function seedDeletionPointers(ownerKey: string) {
      const stream = createStreamDto({ last_message_uuid: MESSAGE_A });
      const topic = createTopicDto({ last_message_uuid: MESSAGE_A });
      const payload = {
        streams: [adaptMessengerStream(stream)],
        streamBindings: [],
        topics: [adaptMessengerTopic(topic)],
        conversations: [
          { ...adaptStreamToMessengerConversation(stream), updatedAt: DATE },
          { ...adaptTopicToMessengerConversation(topic, stream), updatedAt: DATE },
        ],
        folders: [],
      };
      useMessengerStore.getState().replaceBootstrapState(ownerKey, payload);
      await writeMessengerCatalogPayloadCache(ownerKey, payload);
      await seedMessageWindow(ownerKey, createMessageDto());
    }

    async function expectCachedTail(ownerKey: string, uuid: string | null) {
      const cached = await readMessengerCatalogPayloadCache(ownerKey);
      const catalog = cached?.payload;
      expect(catalog?.streams[0]?.lastMessageUuid).toBe(uuid);
      expect(catalog?.topics[0]?.lastMessageUuid).toBe(uuid);
      expect(catalog?.conversations.map((conversation) => conversation.lastMessageUuid)).toEqual([
        uuid,
        uuid,
      ]);
    }

    it.each(["single HTTP", "bulk HTTP", "realtime"] as const)(
      "persists the same inclusive topic boundary for %s and keeps a later exact batch scoped",
      async (source) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        const otherOwner = workspaceRuntimeOwnerKey(
          createRuntimeContext({ organizationId: ORGANIZATION_B }),
        );
        useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
        const earlier = createMessageDto({ is_own: false, created_at: "2026-06-22T10:01:00Z" });
        const anchor = createMessageDto({ uuid: MESSAGE_B, is_own: false });
        const untouched = createMessageDto({
          uuid: MESSAGE_C,
          is_own: false,
          created_at: "2026-06-22T10:15:00Z",
        });
        const exact = createMessageDto({
          uuid: "85e4d7f0-56c1-4ce8-92ef-04d917ab38b0",
          is_own: false,
          created_at: "2026-06-22T10:20:00Z",
        });
        const neighbor = createMessageDto({
          uuid: "fcf1d74e-8b2a-4278-8ded-166af905acaf",
          topic_uuid: "ed25f944-8106-4386-b2f9-65e9db32d465",
          is_own: false,
          created_at: earlier.created_at,
        });
        const messages = [earlier, anchor, untouched, exact].map(adaptMessengerMessage);
        const conversationId = messages[0]!.conversationId;
        replaceTailWindow(conversationId, messages);
        await writeMessengerConversationWindowCache(ownerKey, conversationId, {
          messages,
          hasMore: false,
        });
        await writeMessengerConversationWindowCache(otherOwner, conversationId, {
          messages,
          hasMore: false,
        });
        await seedMessageWindow(ownerKey, neighbor);
        const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false });
        const context = {
          owner: runtimeContext,
          ownerKey,
          surface: "active",
          source: "websocket",
        } as const;
        if (source === "realtime") {
          await applier.applyEvent(
            {
              type: "message",
              kind: "message.read",
              epoch_version: 1,
              message: { ...anchor, read: true },
            },
            context,
          );
        } else {
          const markRead =
            source === "single HTTP" ? markMessengerMessageRead : markMessengerMessagesReadUpTo;
          await expect(
            markRead({
              runtimeContext,
              messageUuid: MESSAGE_B,
              client: { markMessagesReadUpTo: () => Promise.resolve({ ...anchor, read: true }) },
            }),
          ).resolves.toMatchObject({ status: "applied" });
        }

        await applier.applyEvent(
          {
            type: "message",
            kind: "message.read",
            epoch_version: 2,
            message: { ...earlier, read: true },
          },
          context,
        );
        await applier.applyEvent(
          { type: "messages", kind: "messages.read", epoch_version: 3, messageUuids: [exact.uuid] },
          context,
        );
        const expected = new Map([
          [earlier.uuid, true],
          [anchor.uuid, true],
          [untouched.uuid, false],
          [exact.uuid, true],
          [neighbor.uuid, false],
        ]);
        const state = useWorkspaceMessageStore.getState();
        const ids = [...expected.keys()];
        const rows = await readMessengerMessageBodyCache(ownerKey, ids);
        expect(new Map(rows.map(({ uuid, read }) => [uuid, read]))).toEqual(expected);
        expect(new Map(ids.map((uuid) => [uuid, state.messagesById[uuid]?.read]))).toEqual(
          expected,
        );
        const otherRows = await readMessengerMessageBodyCache(otherOwner, ids);
        expect(otherRows).toHaveLength(4);
        expect(otherRows.every(({ read }) => !read)).toBe(true);
        expect(readMessengerReadBoundary(ownerKey, STREAM_A, TOPIC_A)?.messageUuid).toBe(
          anchor.uuid,
        );
        await expect(readMessengerCachedReadBoundaries(ownerKey)).resolves.toEqual([
          expect.objectContaining({ topicUuid: TOPIC_A, messageUuid: anchor.uuid }),
        ]);
      },
    );

    it.each(["http", "realtime"] as const)(
      "preserves a moved body and only marks the reported topic prefix for late %s read evidence",
      async (source) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
        const original = createMessageDto({ is_own: false });
        const earlier = createMessageDto({
          uuid: MESSAGE_B,
          is_own: false,
          created_at: "2026-06-22T10:01:00Z",
        });
        const originalWindow = [adaptMessengerMessage(earlier), adaptMessengerMessage(original)];
        const originalId = originalWindow[0]!.conversationId;
        replaceTailWindow(originalId, originalWindow);
        await writeMessengerConversationWindowCache(ownerKey, originalId, {
          messages: originalWindow,
          hasMore: false,
        });
        const moved = createMessageDto({
          topic_uuid: "ed25f944-8106-4386-b2f9-65e9db32d465",
          is_own: false,
          payload: { kind: "markdown", content: "Moved and revised" },
          reactions: { eyes: 2 },
          updated_at: "2026-06-22T10:21:00Z",
        });
        const neighbor = createMessageDto({
          uuid: MESSAGE_C,
          topic_uuid: moved.topic_uuid,
          is_own: false,
          created_at: earlier.created_at,
        });
        const movedId = await seedMessageWindow(ownerKey, neighbor);
        const response = createDeferred<WorkspaceMessengerMessageDto>();
        const read =
          source === "http"
            ? markMessengerMessagesReadUpTo({
                runtimeContext,
                messageUuid: MESSAGE_A,
                client: { markMessagesReadUpTo: () => response.promise },
              })
            : undefined;
        const context = {
          owner: runtimeContext,
          ownerKey,
          surface: "active",
          source: "websocket",
        } as const;
        const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false });
        await applier.applyEvent(
          { type: "message", kind: "message.updated", epoch_version: 1, message: moved },
          context,
        );
        const serverRead = { ...original, read: true };
        if (read != null) {
          response.resolve(serverRead);
          await expect(read).resolves.toMatchObject({ status: "applied" });
        } else {
          await applier.applyEvent(
            { type: "message", kind: "message.read", epoch_version: 2, message: serverRead },
            context,
          );
          expect(
            useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[ownerKey]
              ?.messageIdSnapshotsById[MESSAGE_A],
          ).toMatchObject({ topicUuid: moved.topic_uuid, updatedAt: moved.updated_at, read: true });
        }
        const state = useWorkspaceMessageStore.getState();
        expect(state.messagesById[MESSAGE_A]).toMatchObject({
          topicUuid: moved.topic_uuid,
          payload: moved.payload,
          reactions: { eyes: 2 },
          read: true,
        });
        expect(state.messagesById[MESSAGE_B]?.read).toBe(true);
        expect(state.messagesById[MESSAGE_C]?.read).toBe(false);
        const cachedOriginal = await readMessengerConversationWindowCache(ownerKey, originalId);
        const cachedMoved = await readMessengerConversationWindowCache(ownerKey, movedId);
        expect(cachedOriginal.messages).toEqual([
          expect.objectContaining({ uuid: MESSAGE_B, read: true }),
        ]);
        expect(cachedMoved.messages).toEqual([
          expect.objectContaining({ uuid: MESSAGE_C, read: false }),
          expect.objectContaining({
            uuid: MESSAGE_A,
            topicUuid: moved.topic_uuid,
            payload: moved.payload,
            reactions: { eyes: 2 },
            read: true,
          }),
        ]);
        await expect(readMessengerCachedReadBoundaries(ownerKey)).resolves.toEqual([
          expect.objectContaining({ topicUuid: TOPIC_A, messageUuid: MESSAGE_A }),
        ]);
      },
    );

    it.each(["boundary abort", "exact owner round trip"] as const)(
      "aborts confirmed read cache writes and withholds the cursor after %s at commit",
      async (invalidation) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
        const original = createMessageDto({ is_own: false });
        await seedMessageWindow(ownerKey, original);
        const signal = new AbortController();
        let currentGeneration = runtimeContext.runtimeGeneration;
        const invalidate = vi.fn(() => {
          if (invalidation === "boundary abort") signal.abort();
          else {
            const store = useWorkspaceMessageStore.getState();
            store.setOwner("other-owner", false);
            currentGeneration += 2;
            store.setOwner(ownerKey, false);
          }
        });
        const invalidateBeforeCommit = (canWrite?: () => boolean) => {
          let checks = 0;
          return () => {
            checks += 1;
            if (checks === 2) invalidate();
            return canWrite?.() ?? false;
          };
        };
        const writeRealtimeCursor = vi.fn();
        const applier = createMessengerRealtimeApplier({
          requireOwnerCatalog: false,
          isOwnerCurrent: (owner) => owner.runtimeGeneration === currentGeneration,
          cache: {
            advanceReadBoundary: (boundary, canWrite) =>
              advanceMessengerCachedReadBoundary(boundary, invalidateBeforeCommit(canWrite)),
            markCachedMessagesRead: (owner, uuids, conversationIds, canWrite) =>
              markMessengerCachedMessagesRead(
                owner,
                uuids,
                conversationIds,
                invalidateBeforeCommit(canWrite),
              ),
            writeRealtimeCursor,
          },
        });
        const application = applier.applyEvent(
          invalidation === "boundary abort"
            ? {
                type: "message",
                kind: "message.read",
                epoch_version: 1,
                message: { ...original, read: true },
              }
            : {
                type: "messages",
                kind: "messages.read",
                epoch_version: 1,
                messageUuids: [MESSAGE_A],
              },
          {
            owner: runtimeContext,
            ownerKey,
            surface: "active",
            source: "websocket",
            signal: signal.signal,
          },
        );
        expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
        expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
        await application;
        expect(invalidate).toHaveBeenCalledOnce();
        expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
        expect(writeRealtimeCursor).not.toHaveBeenCalled();
        await expect(readMessengerCachedReadBoundaries(ownerKey)).resolves.toEqual([]);
        await expect(readMessengerMessageBodyCache(ownerKey, [MESSAGE_A])).resolves.toEqual([
          expect.objectContaining({ uuid: MESSAGE_A, read: false }),
        ]);
      },
    );

    it.each(["http", "realtime"] as const)(
      "keeps a moved UUID deleted through late history when %s acknowledges first",
      async (first) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
        const original = createMessageDto();
        const originalId = await seedMessageWindow(ownerKey, original);
        const moved = createMessageDto({
          topic_uuid: "ed25f944-8106-4386-b2f9-65e9db32d465",
          updated_at: "2026-06-22T10:12:00Z",
        });
        const sibling = createMessageDto({ uuid: MESSAGE_B, topic_uuid: moved.topic_uuid });
        const destinationId = await seedMessageWindow(ownerKey, sibling);
        const streamId = `stream:${STREAM_A}` as const;
        const streamMessages = [adaptMessengerMessage(original), adaptMessengerMessage(sibling)];
        replaceTailWindow(streamId, streamMessages);
        await writeMessengerConversationWindowCache(ownerKey, streamId, {
          messages: streamMessages,
          hasMore: false,
        });

        const response = createDeferred<void>();
        const requestDelete = vi.fn(() => response.promise);
        const deleting = deleteMessengerMessage({
          runtimeContext,
          messageUuid: MESSAGE_A,
          streamUuid: STREAM_A,
          topicUuid: TOPIC_A,
          client: { deleteMessage: requestDelete },
        });
        expect(requestDelete).toHaveBeenCalledOnce();
        const context = {
          owner: runtimeContext,
          ownerKey,
          surface: "active",
          source: "websocket",
        } as const;
        const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false });
        await applier.applyEvent(
          { type: "message", kind: "message.updated", epoch_version: 1, message: moved },
          context,
        );
        const movedWindow = await readMessengerConversationWindowCache(ownerKey, destinationId);
        expect(movedWindow.messages.some((message) => message.uuid === MESSAGE_A)).toBe(true);

        const historyResponse = createDeferred<{
          items: WorkspaceMessengerMessageDto[];
          nextPageMarker: null;
          pageLimit: number;
        }>();
        const historyClient = vi
          .fn(() => Promise.resolve({ items: [sibling], nextPageMarker: null, pageLimit: 50 }))
          .mockImplementationOnce(() => historyResponse.promise);
        const history = loadMessengerConversationMessages({
          runtimeContext,
          conversationId: destinationId,
          client: { getMessagesPage: historyClient },
        });
        await vi.waitFor(() => expect(historyClient).toHaveBeenCalledOnce());

        const acknowledgeRealtime = () =>
          applier.applyEvent(
            {
              type: "message",
              kind: "message.deleted",
              epoch_version: 2,
              message: { uuid: MESSAGE_A, stream_uuid: STREAM_A, topic_uuid: moved.topic_uuid },
            },
            context,
          );
        const acknowledgeHttp = async () => {
          response.resolve();
          await expect(deleting).resolves.toMatchObject({ status: "applied", message: null });
        };
        const assertDeleted = async () => {
          const state = useWorkspaceMessageStore.getState();
          expect(state.messagesById[MESSAGE_A]).toBeUndefined();
          expect(state.deletedMessageRevisionById[MESSAGE_A]).toBeGreaterThan(0);
          for (const id of [originalId, destinationId, streamId]) {
            expect(state.conversationWindowsById[id]?.messageUuids).not.toContain(MESSAGE_A);
            const cachedWindow = await readMessengerConversationWindowCache(ownerKey, id);
            expect(cachedWindow.messages.map((message) => message.uuid)).not.toContain(MESSAGE_A);
          }
          await expect(readMessengerMessageBodyCache(ownerKey, [MESSAGE_A])).resolves.toEqual([]);
        };

        if (first === "http") await acknowledgeHttp();
        else await acknowledgeRealtime();
        await assertDeleted();
        const revived = vi.fn();
        const unsubscribe = useWorkspaceMessageStore.subscribe((state) => {
          if (state.messagesById[MESSAGE_A] != null) revived();
        });
        try {
          historyResponse.resolve({ items: [moved, sibling], nextPageMarker: null, pageLimit: 50 });
          await expect(history).resolves.toMatchObject({ status: "applied" });
        } finally {
          unsubscribe();
        }
        expect(revived).not.toHaveBeenCalled();
        await assertDeleted();
        if (first === "http") await acknowledgeRealtime();
        else await acknowledgeHttp();
        await assertDeleted();
        expect(useMessengerStore.getState().lastEpochVersion).toBe(2);
      },
    );

    it("repairs both durable pointers when realtime receives a replacement before cache deletion", async () => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
      await seedDeletionPointers(ownerKey);
      const releaseDelete = createDeferred<void>();
      const older = createMessageDto({ uuid: MESSAGE_B, created_at: "2026-06-22T10:05:00Z" });
      const completedRepair = vi.fn();
      const writeRealtimeCursor = vi.fn();
      const applier = createMessengerRealtimeApplier({
        requireOwnerCatalog: false,
        cache: {
          deleteCachedMessage: async (...args) => {
            await releaseDelete.promise;
            await deleteMessengerCachedMessage(...args);
          },
          writeRealtimeCursor,
        },
        onMessageDeleted: (_owner, _message, plan, _event, isCurrent) =>
          repairDeletedMessagePointers({
            runtimeContext,
            plan,
            isCurrent,
            client: {
              getMessagesPage: () =>
                Promise.resolve({ items: [older], nextPageMarker: null, pageLimit: 1 }),
            },
            cache: { repairMessagePointers: repairMessengerCachedMessagePointers },
          }).then(completedRepair),
      });
      const realtime = applier.applyEvent(
        {
          type: "message",
          kind: "message.deleted",
          epoch_version: 2,
          message: { uuid: MESSAGE_A, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
        },
        { owner: runtimeContext, ownerKey, surface: "active", source: "websocket" },
      );
      try {
        await vi.waitFor(() => expect(completedRepair).toHaveBeenCalledOnce());
        await expectCachedTail(ownerKey, MESSAGE_B);
        expect(writeRealtimeCursor).not.toHaveBeenCalled();
      } finally {
        releaseDelete.resolve();
        await realtime;
      }
      await expectCachedTail(ownerKey, MESSAGE_B);
      await expect(readMessengerMessageBodyCache(ownerKey, [MESSAGE_A])).resolves.toEqual([]);
      expect(writeRealtimeCursor).toHaveBeenCalledExactlyOnceWith(
        ownerKey,
        2,
        expect.any(Function),
      );
    });

    it("repairs the same durable tail after its read flag changes during the transaction", async () => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
      await seedDeletionPointers(ownerKey);
      const replacement = createMessageDto({ uuid: MESSAGE_B });
      const beforeCommit = vi.fn(() => {
        const store = useWorkspaceMessageStore.getState();
        store.markMessagesRead([MESSAGE_B]);
        store.beginOptimisticOwnMessageReaction(MESSAGE_B, "eyes", "add", "local-reaction", USER_A);
      });
      const repairMessagePointers = vi.fn<typeof repairMessengerCachedMessagePointers>();
      repairMessagePointers
        .mockImplementationOnce((owner, message, targets, options) => {
          let checks = 0;
          return repairMessengerCachedMessagePointers(owner, message, targets, {
            ...options,
            isWriteCurrent: () => {
              // The wrapper, transaction entry and precommit checks run in that order.
              checks += 1;
              if (checks === 3) beforeCommit();
              return options?.isWriteCurrent?.() ?? false;
            },
          });
        })
        .mockImplementation(repairMessengerCachedMessagePointers);

      await expect(
        deleteMessengerMessage({
          runtimeContext,
          messageUuid: MESSAGE_A,
          streamUuid: STREAM_A,
          topicUuid: TOPIC_A,
          client: {
            deleteMessage: () => Promise.resolve(),
            getMessagesPage: () =>
              Promise.resolve({ items: [replacement], nextPageMarker: null, pageLimit: 1 }),
          },
          cache: { deleteCachedMessage: deleteMessengerCachedMessage, repairMessagePointers },
        }),
      ).resolves.toMatchObject({ status: "applied" });

      expect(beforeCommit).toHaveBeenCalledOnce();
      expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]).toMatchObject({
        read: true,
        reactions: { eyes: 1 },
      });
      await expectCachedTail(ownerKey, MESSAGE_B);
      await expect(readMessengerMessageBodyCache(ownerKey, [MESSAGE_B])).resolves.toEqual([
        expect.objectContaining({
          uuid: MESSAGE_B,
          payload: replacement.payload,
          read: true,
          reactions: {},
        }),
      ]);
    });

    it.each(["newer pointer", "replacement deletion"] as const)(
      "protects a %s while HTTP waits for a delayed replacement",
      async (change) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
        await seedDeletionPointers(ownerKey);
        const response = createDeferred<{
          items: WorkspaceMessengerMessageDto[];
          nextPageMarker: null;
          pageLimit: number;
        }>();
        const requestReplacement = vi.fn(() => response.promise);
        const deleting = deleteMessengerMessage({
          runtimeContext,
          messageUuid: MESSAGE_A,
          streamUuid: STREAM_A,
          topicUuid: TOPIC_A,
          client: { deleteMessage: () => Promise.resolve(), getMessagesPage: requestReplacement },
        });
        await vi.waitFor(() => expect(requestReplacement).toHaveBeenCalledTimes(2));
        const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false });
        const context = {
          owner: runtimeContext,
          ownerKey,
          surface: "active",
          source: "websocket",
        } as const;
        let expected: string | null = null;
        if (change === "newer pointer") {
          expected = MESSAGE_C;
          const newer = createMessageDto({ uuid: MESSAGE_C, created_at: "2026-06-22T10:20:00Z" });
          await applier.applyEvent(
            { type: "message", kind: "message.created", epoch_version: 2, message: newer },
            context,
          );
        } else {
          await applier.applyEvent(
            {
              type: "message",
              kind: "message.deleted",
              epoch_version: 2,
              message: { uuid: MESSAGE_B, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
            },
            context,
          );
        }
        response.resolve({
          items: [createMessageDto({ uuid: MESSAGE_B })],
          nextPageMarker: null,
          pageLimit: 1,
        });
        await expect(deleting).resolves.toMatchObject({ status: "applied" });
        const state = useMessengerStore.getState();
        expect(state.streamsById[STREAM_A]?.lastMessageUuid).toBe(expected);
        expect(state.topicsById[TOPIC_A]?.lastMessageUuid).toBe(expected);
        await expectCachedTail(ownerKey, expected);
        if (change === "replacement deletion") {
          expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]).toBeUndefined();
          await expect(readMessengerMessageBodyCache(ownerKey, [MESSAGE_B])).resolves.toEqual([]);
        }
      },
    );

    it.each(["http abort", "realtime generation"] as const)(
      "aborts the deletion transaction on %s at commit",
      async (invalidation) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
        const original = createMessageDto();
        const conversationId = await seedMessageWindow(ownerKey, original);
        const signal = new AbortController();
        let currentGeneration = runtimeContext.runtimeGeneration;
        let checks = 0;
        const patchCache: NonNullable<MessengerMessageActionCacheWriter["deleteCachedMessage"]> = (
          owner,
          uuid,
          _ids,
          options,
        ) =>
          deleteCachedMessage(owner, uuid, [], () => {
            checks += 1;
            if (checks === 2) {
              if (invalidation === "http abort") signal.abort();
              else currentGeneration += 1;
            }
            return options?.isWriteCurrent() ?? false;
          });
        const writeRealtimeCursor = vi.fn();
        if (invalidation === "http abort") {
          await expect(
            deleteMessengerMessage({
              runtimeContext,
              messageUuid: MESSAGE_A,
              streamUuid: STREAM_A,
              topicUuid: TOPIC_A,
              signal: signal.signal,
              client: { deleteMessage: () => Promise.resolve() },
              cache: { deleteCachedMessage: patchCache },
            }),
          ).resolves.toMatchObject({ status: "applied" });
        } else {
          const applier = createMessengerRealtimeApplier({
            requireOwnerCatalog: false,
            isOwnerCurrent: (owner) => owner.runtimeGeneration === currentGeneration,
            cache: { writeRealtimeCursor, deleteCachedMessage: patchCache },
          });
          await applier.applyEvent(
            {
              type: "message",
              kind: "message.deleted",
              epoch_version: 2,
              message: { uuid: MESSAGE_A, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
            },
            { owner: runtimeContext, ownerKey, surface: "active", source: "websocket" },
          );
        }
        expect(checks).toBe(2);
        expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
        const window = await readMessengerConversationWindowCache(ownerKey, conversationId);
        expect(window.messages).toEqual([
          expect.objectContaining({ uuid: MESSAGE_A, payload: original.payload }),
        ]);
        expect(writeRealtimeCursor).not.toHaveBeenCalled();
        expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
      },
    );

    it("keeps a realtime move in loaded and cached windows through a late edit and duplicate event", async () => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
      const destinationTopic = "ed25f944-8106-4386-b2f9-65e9db32d465";
      const originId = await seedMessageWindow(ownerKey, createMessageDto());
      const destinationId = await seedMessageWindow(
        ownerKey,
        createMessageDto({ uuid: MESSAGE_B, topic_uuid: destinationTopic }),
      );
      const response = createDeferred<WorkspaceMessengerMessageDto>();
      const requestEdit = vi.fn(() => response.promise);
      const edit = editMessengerMessage({
        runtimeContext,
        messageUuid: MESSAGE_A,
        markdown: "Delayed edit",
        client: { editMessage: requestEdit },
      });
      expect(requestEdit).toHaveBeenCalledOnce();
      const moved = createMessageDto({
        topic_uuid: destinationTopic,
        updated_at: "2026-06-22T10:12:00Z",
        payload: { kind: "markdown", content: "Moved and edited" },
      });
      const event = {
        type: "message",
        kind: "message.updated",
        epoch_version: 1,
        message: moved,
      } as const;
      const context = {
        owner: runtimeContext,
        ownerKey,
        surface: "active",
        source: "websocket",
      } as const;
      const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false });
      await applier.applyEvent(event, context);
      response.resolve(
        createMessageDto({ payload: { kind: "markdown", content: "Delayed edit" } }),
      );
      await expect(edit).resolves.toMatchObject({
        status: "applied",
        message: { conversationId: destinationId, payload: moved.payload },
      });
      const state = useWorkspaceMessageStore.getState();
      expect(selectWorkspaceMessagesForConversation(state, originId)).toEqual([]);
      expect(
        selectWorkspaceMessagesForConversation(state, destinationId)
          .map((message) => message.uuid)
          .sort((left, right) => left.localeCompare(right)),
      ).toEqual([MESSAGE_A, MESSAGE_B]);
      expect(state.messagesById[MESSAGE_A]).toMatchObject({
        conversationId: destinationId,
        payload: moved.payload,
      });
      await expect(readMessengerMessageBodyCache(ownerKey, [MESSAGE_A])).resolves.toEqual([
        expect.objectContaining({ conversationId: destinationId, payload: moved.payload }),
      ]);
      const sourceCache = await readMessengerConversationWindowCache(ownerKey, originId);
      const targetCache = await readMessengerConversationWindowCache(ownerKey, destinationId);
      expect(sourceCache.messages).toEqual([]);
      expect(targetCache.messages.filter((message) => message.uuid === MESSAGE_A)).toEqual([
        expect.objectContaining({ conversationId: destinationId, payload: moved.payload }),
      ]);
      await applier.applyEvent({ ...event, epoch_version: 2 }, context);
      const replayed = useWorkspaceMessageStore.getState();
      expect(
        replayed.conversationWindowsById[destinationId]?.messageUuids.filter(
          (uuid) => uuid === MESSAGE_A,
        ),
      ).toEqual([MESSAGE_A]);
      const replayedCache = await readMessengerConversationWindowCache(ownerKey, destinationId);
      expect(replayedCache.messages.filter((message) => message.uuid === MESSAGE_A)).toHaveLength(
        1,
      );
    });

    it.each(["http", "realtime"] as const)(
      "persists a %s body-only edit after a read-only update without persisting an optimistic reaction",
      async (source) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
        const conversationId = await seedMessageWindow(ownerKey, createMessageDto());
        const entered = createDeferred<void>();
        const release = createDeferred<void>();
        const patchCache = vi.fn<typeof patchMessengerCachedMessage>();
        patchCache
          .mockImplementationOnce(async (...args) => {
            entered.resolve();
            await release.promise;
            await patchMessengerCachedMessage(...args);
          })
          .mockImplementation(patchMessengerCachedMessage);
        const edited = createMessageDto({ payload: { kind: "markdown", content: "Updated body" } });
        const context = {
          owner: runtimeContext,
          ownerKey,
          surface: "active",
          source: "websocket",
        } as const;
        const applier = createMessengerRealtimeApplier({
          requireOwnerCatalog: false,
          cache: {
            patchCachedMessage: patchCache,
            markCachedMessagesRead: markMessengerCachedMessagesRead,
          },
        });
        const edit =
          source === "http"
            ? editMessengerMessage({
                runtimeContext,
                messageUuid: MESSAGE_A,
                markdown: "Updated body",
                client: { editMessage: () => Promise.resolve(edited) },
                cache: { patchCachedMessage: patchCache },
              })
            : applier.applyEvent(
                { type: "message", kind: "message.updated", epoch_version: 1, message: edited },
                context,
              );
        try {
          await entered.promise;
          useWorkspaceMessageStore
            .getState()
            .beginOptimisticOwnMessageReaction(MESSAGE_A, "eyes", "add", "local-reaction", USER_A);
          await applier.applyEvent(
            {
              type: "messages",
              kind: "messages.read",
              epoch_version: 2,
              messageUuids: [MESSAGE_A],
            },
            context,
          );
        } finally {
          release.resolve();
        }
        const result = await edit;
        if (source === "http") expect(result).toMatchObject({ status: "applied" });
        else
          expect(
            useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[ownerKey]
              ?.messageIdSnapshotsById[MESSAGE_A]?.read,
          ).toBe(true);
        expect(patchCache).toHaveBeenCalledTimes(2);
        const window = await readMessengerConversationWindowCache(ownerKey, conversationId);
        expect(window.messages).toEqual([
          expect.objectContaining({
            uuid: MESSAGE_A,
            payload: edited.payload,
            read: true,
            reactions: {},
          }),
        ]);
        expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toMatchObject({
          payload: edited.payload,
          read: true,
          reactions: { eyes: 1 },
        });
      },
    );

    it.each(["abort", "same-owner generation"] as const)(
      "aborts the realtime cache transaction and cursor on %s at commit",
      async (invalidation) => {
        const runtimeContext = createRuntimeContext();
        const ownerKey = prepareStoreOwner(runtimeContext);
        useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
        const original = createMessageDto();
        await seedMessageWindow(ownerKey, original);
        const controller = new AbortController();
        let currentGeneration = runtimeContext.runtimeGeneration;
        let calls = 0;
        const writeRealtimeCursor = vi.fn();
        const applier = createMessengerRealtimeApplier({
          requireOwnerCatalog: false,
          isOwnerCurrent: (owner) => owner.runtimeGeneration === currentGeneration,
          cache: {
            writeRealtimeCursor,
            patchCachedMessage: (owner, message, isWriteCurrent) =>
              patchMessengerCachedMessage(owner, message, () => {
                calls += 1;
                if (calls === 2) {
                  if (invalidation === "abort") controller.abort();
                  else currentGeneration += 1;
                }
                return isWriteCurrent?.() ?? false;
              }),
          },
        });
        await applier.applyEvent(
          {
            type: "message",
            kind: "message.updated",
            epoch_version: 2,
            message: createMessageDto({
              payload: { kind: "markdown", content: "Aborted cache write" },
            }),
          },
          {
            owner: runtimeContext,
            ownerKey,
            surface: "active",
            source: "websocket",
            signal: controller.signal,
          },
        );
        expect(calls).toBe(2);
        await expect(readMessengerMessageBodyCache(ownerKey, [MESSAGE_A])).resolves.toEqual([
          expect.objectContaining({ payload: original.payload }),
        ]);
        expect(writeRealtimeCursor).not.toHaveBeenCalled();
        expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
      },
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
      patchCachedMessage: vi.fn<typeof patchMessengerCachedMessage>(() => Promise.resolve()),
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
      expect.any(Function),
    );
    const canWrite = cache.patchCachedMessage.mock.calls[0]?.[2];
    useWorkspaceMessageStore
      .getState()
      .beginOptimisticOwnMessageReaction(MESSAGE_A, "eyes", "add", "local-reaction", USER_A);
    expect(canWrite?.()).toBe(true);
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
      expect.any(Function),
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
    expect(cache.deleteCachedMessage).toHaveBeenCalledWith(
      ownerKey,
      MESSAGE_A,
      [`stream:${STREAM_A}`, `topic:${STREAM_A}:${TOPIC_A}`],
      { allMemberships: true, isWriteCurrent: expect.any(Function) },
    );
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
    expect(repairMessagePointers).toHaveBeenNthCalledWith(
      1,
      ownerKey,
      expect.any(Object),
      {
        stream: true,
        conversationIds: [`stream:${STREAM_A}`],
      },
      { isWriteCurrent: expect.any(Function), replacingDeletedUuid: MESSAGE_A },
    );
    expect(repairMessagePointers).toHaveBeenNthCalledWith(
      2,
      ownerKey,
      expect.any(Object),
      {
        topic: true,
        conversationIds: [`topic:${STREAM_A}:${TOPIC_A}`],
      },
      { isWriteCurrent: expect.any(Function), replacingDeletedUuid: MESSAGE_A },
    );
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
    expect(cache.patchCachedMessage).not.toHaveBeenCalled();
    expect(cache.markCachedMessagesRead).toHaveBeenCalledWith(
      ownerKey,
      [MESSAGE_B, MESSAGE_A],
      [],
      expect.any(Function),
    );
    expect(cache.advanceReadBoundary).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        messageUuid: MESSAGE_B,
      }),
      expect.any(Function),
    );
  });

  it.each([
    ["markMessengerMessageRead", markMessengerMessageRead],
    ["markMessengerMessagesReadUpTo", markMessengerMessagesReadUpTo],
  ] as const)(
    "%s preserves last-message pointers during partial reads and a concurrent new message",
    async (_name, markRead) => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      const messageDto = (number: number) =>
        createMessageDto({
          uuid: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
          is_own: false,
          created_at: new Date(Date.UTC(2026, 5, 22, 10, number)).toISOString(),
        });
      const latest = adaptMessengerMessage(messageDto(70));
      const streamDto = createStreamDto({
        last_message_uuid: latest.uuid,
        unread_count: 70,
        active_unread_count: 70,
      });
      const topicDto = createTopicDto({
        last_message_uuid: latest.uuid,
        unread_count: 70,
        active_unread_count: 70,
      });
      const peerStreamUuid = "37a28696-153d-431e-a5fb-36f0c0209765";
      const peer = adaptMessengerMessage(
        createMessageDto({
          uuid: MESSAGE_C,
          stream_uuid: peerStreamUuid,
          topic_uuid: "ed25f944-8106-4386-b2f9-65e9db32d465",
          created_at: "2026-06-22T10:50:00Z",
        }),
      );
      useMessengerStore.getState().replaceBootstrapState(ownerKey, {
        streams: [
          adaptMessengerStream(streamDto),
          adaptMessengerStream(
            createStreamDto({ uuid: peerStreamUuid, last_message_uuid: peer.uuid }),
          ),
        ],
        streamBindings: [],
        topics: [adaptMessengerTopic(topicDto)],
        conversations: [
          adaptStreamToMessengerConversation(streamDto),
          adaptTopicToMessengerConversation(topicDto, streamDto),
        ],
        folders: [],
      });
      replaceTailWindow(
        latest.conversationId,
        Array.from({ length: 70 }, (_, index) => adaptMessengerMessage(messageDto(index + 1))),
      );
      useWorkspaceMessageStore.getState().applyLiveCreatedMessage(peer);

      const sidebarActivity = () =>
        selectMessengerSidebarStreams(useMessengerStore.getState(), {
          organizationId: ORGANIZATION_A,
          projectId: PROJECT_A,
          messagesById: useWorkspaceMessageStore.getState().messagesById,
        }).map((stream) => ({
          id: stream.id,
          preview: stream.preview,
          createdAt: stream.lastMessageCreatedAt,
          topics: stream.topics.map((topic) => ({
            id: topic.id,
            preview: topic.preview,
            createdAt: topic.lastMessageCreatedAt,
          })),
        }));
      const expectPointers = (uuid: string) => {
        const state = useMessengerStore.getState();
        expect(state.streamsById[STREAM_A]?.lastMessageUuid).toBe(uuid);
        expect(state.topicsById[TOPIC_A]?.lastMessageUuid).toBe(uuid);
        expect(state.conversationsById[`stream:${STREAM_A}`]?.lastMessageUuid).toBe(uuid);
        expect(state.conversationsById[latest.conversationId]?.lastMessageUuid).toBe(uuid);
      };
      const before = sidebarActivity();
      for (const number of [20, 30]) {
        const dto = messageDto(number);
        await markRead({
          runtimeContext,
          messageUuid: dto.uuid,
          client: { markMessagesReadUpTo: () => Promise.resolve({ ...dto, read: true }) },
          cache: {},
        });
        expectPointers(latest.uuid);
        expect(sidebarActivity()).toEqual(before);
        expect(useWorkspaceMessageStore.getState().messagesById[dto.uuid]?.read).toBe(true);
        expect(useWorkspaceMessageStore.getState().messagesById[latest.uuid]?.read).toBe(false);
        expect(readMessengerReadBoundary(ownerKey, STREAM_A, TOPIC_A)?.messageUuid).toBe(dto.uuid);
        if (markRead === markMessengerMessagesReadUpTo) {
          expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(70 - number);
          expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(70 - number);
        }
      }

      const response = createDeferred<WorkspaceMessengerMessageDto>();
      const anchor = messageDto(40);
      const action = markRead({
        runtimeContext,
        messageUuid: anchor.uuid,
        client: { markMessagesReadUpTo: () => response.promise },
        cache: {},
      });
      const incoming = adaptMessengerMessage(messageDto(71));
      useWorkspaceMessageStore.getState().applyLiveCreatedMessage(incoming);
      useMessengerStore
        .getState()
        .applyMessagePointer(ownerKey, incoming, useWorkspaceMessageStore.getState().messagesById);
      const afterIncoming = sidebarActivity();
      response.resolve({ ...anchor, read: true });
      await action;

      expectPointers(incoming.uuid);
      expect(sidebarActivity()).toEqual(afterIncoming);
      expect(useWorkspaceMessageStore.getState().messagesById[anchor.uuid]?.read).toBe(true);
      expect(useWorkspaceMessageStore.getState().messagesById[incoming.uuid]?.read).toBe(false);

      const catalog = useMessengerStore.getState();
      const stream = catalog.streamsById[STREAM_A];
      const topic = catalog.topicsById[TOPIC_A];
      if (stream == null || topic == null) throw new Error("Missing read fixture catalog");
      catalog.upsertStream(ownerKey, { ...stream, lastMessageUuid: latest.uuid });
      catalog.upsertTopic(ownerKey, { ...topic, lastMessageUuid: latest.uuid });
      await markRead({
        runtimeContext,
        messageUuid: incoming.uuid,
        client: { markMessagesReadUpTo: () => Promise.resolve({ ...messageDto(71), read: true }) },
        cache: {},
      });
      expectPointers(incoming.uuid);
      expect(sidebarActivity()).toEqual(afterIncoming);
    },
  );

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

  async function readUpToAnchorB(
    runtimeContext: WorkspaceRuntimeContext,
    client: MessengerMessageActionClientDeps = {
      markMessagesReadUpTo: vi.fn(() =>
        Promise.resolve(createMessageDto({ uuid: MESSAGE_B, read: true })),
      ),
    },
    getRuntimeContext: () => WorkspaceRuntimeContext = () => runtimeContext,
    signal?: AbortSignal,
  ): Promise<MessengerMessageActionResult> {
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
    return markMessengerMessagesReadUpTo({
      runtimeContext,
      getRuntimeContext,
      messageUuid: MESSAGE_B,
      conversationIds: [earlier.conversationId],
      client,
      cache: {},
      signal,
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

    // Two loaded messages flipped: the badge shrinks by two, the server settles the rest.
    const state = useMessengerStore.getState();
    expect(state.topicsById[TOPIC_A]?.unreadCount).toBe(1);
    expect(state.streamsById[STREAM_A]?.unreadCount).toBe(3);
  });

  it("projects counters but keeps unread messages until the server confirms read_up_to", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    bootstrapCountersForReadUpTo(ownerKey, MESSAGE_B);
    const response = createDeferred<WorkspaceMessengerMessageDto>();

    const result = readUpToAnchorB(runtimeContext, {
      markMessagesReadUpTo: () => response.promise,
    });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(false);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.read).toBe(false);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(0);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(2);

    response.resolve(createMessageDto({ uuid: MESSAGE_B, read: true }));
    await expect(result).resolves.toEqual(expect.objectContaining({ status: "applied", ownerKey }));
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.read).toBe(true);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(0);
  });

  it("rolls back the projected read when read_up_to fails", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    bootstrapCountersForReadUpTo(ownerKey, MESSAGE_B);

    await expect(
      readUpToAnchorB(runtimeContext, {
        markMessagesReadUpTo: () => Promise.reject(new Error("offline")),
      }),
    ).rejects.toThrow("offline");

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(false);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.read).toBe(false);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(3);
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.unreadCount).toBe(5);
  });

  it("keeps the projected read when read_up_to is aborted", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    bootstrapCountersForReadUpTo(ownerKey, MESSAGE_B);
    const controller = new AbortController();

    const result = readUpToAnchorB(
      runtimeContext,
      {
        markMessagesReadUpTo: () =>
          new Promise((_resolve, reject) => {
            controller.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      },
      () => runtimeContext,
      controller.signal,
    );
    controller.abort();

    await expect(result).rejects.toThrow("aborted");
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(false);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(0);
  });

  it("does not mutate stores after a stale read_up_to response", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    bootstrapCountersForReadUpTo(ownerKey, MESSAGE_B);
    const response = createDeferred<WorkspaceMessengerMessageDto>();
    let currentRuntime = runtimeContext;

    const result = readUpToAnchorB(
      runtimeContext,
      { markMessagesReadUpTo: () => response.promise },
      () => currentRuntime,
    );
    currentRuntime = createRuntimeContext({ organizationId: ORGANIZATION_B });
    const rollback = vi.spyOn(
      useWorkspaceMessageStore.getState(),
      "rollbackOptimisticMessagesRead",
    );
    response.resolve(createMessageDto({ uuid: MESSAGE_B, read: true }));

    await expect(result).resolves.toEqual({ status: "skipped", ownerKey, reason: "stale-owner" });
    expect(rollback).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(false);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.unreadCount).toBe(0);
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

    expect(cache.markCachedMessagesRead).toHaveBeenCalledWith(
      ownerKey,
      [MESSAGE_B, MESSAGE_A],
      [],
      expect.any(Function),
    );
  });

  it("confirms an evicted anchor using the server response", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const cache = { advanceReadBoundary: vi.fn() };
    await expect(
      markMessengerMessagesReadUpTo({
        runtimeContext,
        messageUuid: MESSAGE_B,
        cache,
        client: {
          markMessagesReadUpTo: () =>
            Promise.resolve(createMessageDto({ uuid: MESSAGE_B, read: true })),
        },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]).toBeUndefined();
    expect(cache.advanceReadBoundary).toHaveBeenCalledWith(
      expect.objectContaining({ ownerKey, messageUuid: MESSAGE_B }),
      expect.any(Function),
    );
  });

  it("stops cache writes when the runtime changes during boundary persistence", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    bootstrapCountersForReadUpTo(ownerKey, MESSAGE_B);
    let currentRuntime = runtimeContext;
    const cache = {
      advanceReadBoundary: vi.fn(() => {
        currentRuntime = {
          ...runtimeContext,
          runtimeGeneration: runtimeContext.runtimeGeneration + 2,
        };
      }),
      patchCachedMessage: vi.fn(),
      markCachedMessagesRead: vi.fn(),
    };
    await expect(
      markMessengerMessagesReadUpTo({
        runtimeContext,
        getRuntimeContext: () => currentRuntime,
        messageUuid: MESSAGE_B,
        cache,
        client: {
          markMessagesReadUpTo: () =>
            Promise.resolve(createMessageDto({ uuid: MESSAGE_B, read: true })),
        },
      }),
    ).resolves.toMatchObject({ status: "skipped", reason: "stale-owner" });
    expect(cache.advanceReadBoundary).toHaveBeenCalledOnce();
    expect(cache.patchCachedMessage).not.toHaveBeenCalled();
    expect(cache.markCachedMessagesRead).not.toHaveBeenCalled();
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

function readMarkdownPayload(payload: MessengerMessagePayload | undefined): string | undefined {
  return payload?.kind === "markdown" ? payload.content : undefined;
}

it("blocks plaintext retries to a known encrypted stream before creating any message", async () => {
  const runtimeContext = createRuntimeContext();
  const ownerKey = prepareStoreOwner(runtimeContext);
  useMessengerStore.getState().upsertStream(
    ownerKey,
    adaptMessengerStream(
      createStreamDto({
        encryption: true,
        current_encryption_key_uuid: MESSAGE_A,
      }),
    ),
  );
  const createMessage = vi.fn();
  await expect(
    sendMessengerMessage({
      runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      markdown: "private text",
      client: { createMessage },
    }),
  ).rejects.toThrow("crypto provider");
  expect(createMessage).not.toHaveBeenCalled();
});

it("resolves unknown stream encryption before sending and blocks encrypted results", async () => {
  const runtimeContext = createRuntimeContext();
  useMessengerStore.getState().clear();
  const createMessage = vi.fn();
  const getStream = vi.fn().mockResolvedValue(createStreamDto({ encryption: true }));
  await expect(
    sendMessengerMessage({
      runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      markdown: "private text",
      client: { createMessage, getStream },
    }),
  ).rejects.toThrow("crypto provider");
  expect(getStream).toHaveBeenCalledWith(expect.any(Object), STREAM_A);
  expect(createMessage).not.toHaveBeenCalled();
});

it("does not send after the runtime owner changes during unknown stream preflight", async () => {
  const runtimeContext = createRuntimeContext();
  let current = runtimeContext;
  useMessengerStore.getState().clear();
  const createMessage = vi.fn();
  const getStream = vi.fn(() => {
    current = createRuntimeContext({ organizationId: ORGANIZATION_B, projectId: PROJECT_B });
    return Promise.resolve(createStreamDto());
  });
  await expect(
    sendMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => current,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      markdown: "private text",
      client: { createMessage, getStream },
    }),
  ).resolves.toMatchObject({ status: "skipped", reason: "stale-owner" });
  expect(createMessage).not.toHaveBeenCalled();
});

describe("encrypted payload local dispatch guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useMessengerOutboxStore.getState().clear();
  });

  function prepareEncryptedSend() {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    const stream = adaptMessengerStream(
      createStreamDto({ encryption: true, current_encryption_key_uuid: MESSAGE_A }),
    );
    useMessengerStore.getState().upsertStream(ownerKey, stream);
    const payload: ChatE2eePayload = {
      kind: "e2ee",
      keyUuid: MESSAGE_A,
      content: { bytes: new Uint8Array([1, 2, 3]) },
    };
    const getStream = vi.fn().mockRejectedValue(new Error("Catalog GET must not run"));
    const createMessage = vi.fn(
      (_options: MessengerClientOptions, body: WorkspaceMessengerCreateMessageRequestBody) =>
        Promise.resolve(
          createMessageDto({
            uuid: createMessengerPlacementUuid(TOPIC_A, body.uuid ?? MESSAGE_B),
            payload: body.payload,
          }),
        ),
    );
    const cache = { writeConversationMessagePage: vi.fn(() => Promise.resolve()) };
    const input = {
      runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      payload,
      expectedCurrentKey: { keyUuid: MESSAGE_A },
      canonicalMessageUuid: MESSAGE_B,
      isCurrent: () => true,
      client: { getStream, createMessage },
      cache,
    };
    return { runtimeContext, ownerKey, stream, getStream, createMessage, cache, input };
  }

  function opaquePayload(kind: "e2ee" | "key_grant", byteLength: number): ChatE2eePayload {
    const content = { bytes: new Uint8Array(byteLength) };
    return kind === "e2ee"
      ? { kind, keyUuid: MESSAGE_A, content }
      : {
          kind,
          keyUuid: MESSAGE_A,
          requestMessageUuid: MESSAGE_C,
          senderDeviceId: "sender-device",
          recipientDeviceId: "recipient-device",
          content,
        };
  }

  it.each(["e2ee", "key_grant"] as const)(
    "sends %s content above the former wire limit to the backend",
    async (kind) => {
      const f = prepareEncryptedSend();
      await expect(
        sendMessengerE2eePayload({ ...f.input, payload: opaquePayload(kind, 30_003) }),
      ).resolves.toMatchObject({ status: "applied" });
      expect(f.createMessage).toHaveBeenCalledOnce();
      const wire = f.createMessage.mock.calls[0]?.[1].payload;
      if (wire?.kind !== "e2ee" && wire?.kind !== "key_grant")
        throw new Error("Expected opaque content");
      expect(wire.content).toHaveLength(40_004);
    },
  );

  it.each(["e2ee", "key_grant"] as const)(
    "does not write rejected %s content to the store or cache",
    async (kind) => {
      const f = prepareEncryptedSend();
      const error = new Error("Backend rejected payload");
      f.createMessage.mockRejectedValueOnce(error);
      await expect(
        sendMessengerE2eePayload({ ...f.input, payload: opaquePayload(kind, 30_001) }),
      ).rejects.toBe(error);
      expect(f.getStream).not.toHaveBeenCalled();
      expect(f.createMessage).toHaveBeenCalledOnce();
      expect(f.cache.writeConversationMessagePage).not.toHaveBeenCalled();
      expect(
        useWorkspaceMessageStore.getState().messagesById[
          createMessengerPlacementUuid(TOPIC_A, MESSAGE_B)
        ],
      ).toBeUndefined();
      expect(useMessengerStore.getState().streamsById[STREAM_A]?.lastMessageUuid).toBeNull();
    },
  );

  it("posts opaque payloads directly from the owned catalog without a stream GET", async () => {
    const f = prepareEncryptedSend();
    await expect(sendMessengerE2eePayload(f.input)).resolves.toMatchObject({ status: "applied" });
    expect(f.getStream).not.toHaveBeenCalled();
    expect(f.createMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        uuid: MESSAGE_B,
        payload: { kind: "e2ee", key_uuid: MESSAGE_A, content: "AQID" },
      }),
    );
    expect(
      useWorkspaceMessageStore.getState().messagesById[
        createMessengerPlacementUuid(TOPIC_A, MESSAGE_B)
      ]?.payload.kind,
    ).toBe("e2ee");
    expect(f.cache.writeConversationMessagePage).toHaveBeenCalledTimes(2);
  });

  it.each([
    "first receipt",
    "realtime echo",
    "realtime edit",
    "history edit",
    "deletion",
    "unknown update",
  ])("reconciles an encrypted POST receipt after %s", async (observed) => {
    const f = prepareEncryptedSend();
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: f.ownerKey,
      conversationId,
      projectId: PROJECT_A,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      authorUuid: USER_A,
      markdown: "local secret",
      status: "sending",
      includeStreamConversation: false,
      encryption: { keyUuid: MESSAGE_A, deviceId: "device-a", payload: f.input.payload },
    });
    const receipt = createMessageDto({
      uuid: outgoing.placementUuid,
      payload: { kind: "e2ee", key_uuid: MESSAGE_A, content: "AQID" },
    });
    const edit = {
      ...receipt,
      payload: { kind: "e2ee" as const, key_uuid: MESSAGE_A, content: "BAUG" },
      updated_at: DATE.replace("Z", ".000001Z"),
    };
    const alreadyLoaded = observed === "realtime edit" || observed === "deletion";
    replaceTailWindow(conversationId, alreadyLoaded ? [adaptMessengerMessage(receipt)] : []);
    if (observed === "deletion") {
      useMessengerStore
        .getState()
        .applyMessagePointer(
          f.ownerKey,
          adaptMessengerMessage(receipt),
          useWorkspaceMessageStore.getState().messagesById,
        );
    }

    const deferred = createDeferred<WorkspaceMessengerMessageDto>();
    f.createMessage.mockReturnValue(deferred.promise);
    const sending = sendMessengerE2eePayload({
      ...f.input,
      canonicalMessageUuid: outgoing.canonicalMessageUuid,
    });
    expect(f.createMessage).toHaveBeenCalledOnce();
    const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false, cache: {} });
    const context = {
      owner: f.runtimeContext,
      ownerKey: f.ownerKey,
      surface: "active",
      source: "websocket",
    } as const;
    if (observed === "deletion") {
      await applier.applyEvent(
        {
          type: "message",
          kind: "message.deleted",
          epoch_version: 1,
          message: { uuid: receipt.uuid, stream_uuid: STREAM_A, topic_uuid: TOPIC_A },
        },
        context,
      );
    } else if (observed === "realtime echo") {
      await applier.applyEvent(
        { type: "message", kind: "message.created", epoch_version: 1, message: receipt },
        context,
      );
    } else if (observed === "history edit") {
      replaceTailWindow(conversationId, [adaptMessengerMessage(edit)]);
    } else if (observed !== "first receipt") {
      await applier.applyEvent(
        { type: "message", kind: "message.updated", epoch_version: 1, message: edit },
        context,
      );
    }
    if (observed === "unknown update")
      expect(useWorkspaceMessageStore.getState().messagesById[receipt.uuid]).toBeUndefined();
    if (observed !== "realtime echo")
      expect(
        useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[receipt.uuid],
      ).toBeDefined();
    deferred.resolve(receipt);

    await expect(sending).resolves.toMatchObject({
      status: "applied",
      message: { uuid: receipt.uuid },
    });
    expect(
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[receipt.uuid],
    ).toBeUndefined();
    const state = useWorkspaceMessageStore.getState();
    if (observed === "deletion") {
      expect(state.messagesById[receipt.uuid]).toBeUndefined();
      expect(state.conversationWindowsById[conversationId]?.messageUuids).toEqual([]);
      expect(useMessengerStore.getState().streamsById[STREAM_A]?.lastMessageUuid).toBeNull();
    } else {
      const effective =
        observed === "realtime edit" || observed === "history edit" ? edit : receipt;
      expect(state.messagesById[receipt.uuid]?.payload).toEqual(
        adaptMessengerMessage(effective).payload,
      );
      expect(state.conversationWindowsById[conversationId]?.messageUuids).toEqual([receipt.uuid]);
    }
    expect(f.cache.writeConversationMessagePage).toHaveBeenCalledTimes(
      observed === "first receipt" || observed === "unknown update" ? 2 : 0,
    );
  });

  it.each([MESSAGE_B, MESSAGE_C])("rejects an unexpected public message UUID %s", async (uuid) => {
    const f = prepareEncryptedSend();
    f.createMessage.mockImplementation((_options, body) =>
      Promise.resolve(createMessageDto({ uuid, payload: body.payload })),
    );
    await expect(sendMessengerE2eePayload(f.input)).rejects.toThrow("invalid-message");
    expect(f.cache.writeConversationMessagePage).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[uuid]).toBeUndefined();
  });

  it("uses the injected browser catalog for authorization and message pointers", async () => {
    const f = prepareEncryptedSend();
    const applyMessagePointer = vi.fn();
    const catalog = { ...useMessengerStore.getState(), applyMessagePointer };
    useMessengerStore.getState().clear();
    await expect(
      sendMessengerE2eePayload({
        ...f.input,
        messengerStore: { getState: () => catalog },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    expect(applyMessagePointer).toHaveBeenCalledWith(
      f.ownerKey,
      expect.objectContaining({ uuid: createMessengerPlacementUuid(TOPIC_A, MESSAGE_B) }),
      useWorkspaceMessageStore.getState().messagesById,
    );
    expect(useMessengerStore.getState().streamsById[STREAM_A]).toBeUndefined();
    expect(f.getStream).not.toHaveBeenCalled();
  });

  it.each(["missing", "foreign-owner", "wrong-project", "wrong-user", "unencrypted"])(
    "does not hydrate or send from an invalid %s catalog",
    async (invalid) => {
      const f = prepareEncryptedSend();
      if (invalid === "missing")
        useMessengerStore.getState().removeStream(f.ownerKey, { uuid: STREAM_A });
      if (invalid === "foreign-owner") useMessengerStore.setState({ ownerKey: "foreign-owner" });
      if (invalid === "wrong-project")
        useMessengerStore
          .getState()
          .upsertStream(f.ownerKey, { ...f.stream, projectId: PROJECT_B });
      if (invalid === "wrong-user")
        useMessengerStore.getState().upsertStream(f.ownerKey, { ...f.stream, userUuid: USER_B });
      if (invalid === "unencrypted")
        useMessengerStore.getState().upsertStream(f.ownerKey, { ...f.stream, encryption: false });
      await expect(sendMessengerE2eePayload(f.input)).rejects.toThrow("invalid-key");
      expect(f.getStream).not.toHaveBeenCalled();
      expect(f.createMessage).not.toHaveBeenCalled();
      expect(f.cache.writeConversationMessagePage).not.toHaveBeenCalled();
    },
  );

  it("keeps historical ciphertext bound to its own UUID under the current dispatch guard", async () => {
    const f = prepareEncryptedSend();
    useMessengerStore.getState().upsertStream(f.ownerKey, {
      ...f.stream,
      currentEncryptionKey: { keyUuid: MESSAGE_C },
    });
    const input = { ...f.input, expectedCurrentKey: { keyUuid: MESSAGE_C } };
    await expect(sendMessengerE2eePayload(input)).rejects.toThrow("invalid-key");
    await expect(
      sendMessengerE2eePayload({ ...input, allowHistoricalKey: true }),
    ).resolves.toMatchObject({ status: "applied" });
    expect(f.createMessage.mock.calls[0]?.[1].payload).toMatchObject({ key_uuid: MESSAGE_A });
    expect(f.getStream).not.toHaveBeenCalled();
  });

  it.each(["permission", "generation", "stream-deletion", "runtime-aba"])(
    "discards a pending POST response after %s invalidation",
    async (invalidation) => {
      const f = prepareEncryptedSend();
      const deferred = createDeferred<WorkspaceMessengerMessageDto>();
      f.createMessage.mockReturnValue(deferred.promise);
      let permitted = true;
      let live = f.runtimeContext;
      const sending = sendMessengerE2eePayload({
        ...f.input,
        getRuntimeContext: () => live,
        isCurrent: () => permitted,
      });
      expect(f.createMessage).toHaveBeenCalledOnce();
      if (invalidation === "permission") permitted = false;
      if (invalidation === "generation")
        useMessengerStore
          .getState()
          .upsertStream(f.ownerKey, { ...f.stream, currentEncryptionKey: { keyUuid: MESSAGE_C } });
      if (invalidation === "stream-deletion")
        useMessengerStore.getState().removeStream(f.ownerKey, { uuid: STREAM_A });
      if (invalidation === "runtime-aba") live = { ...f.runtimeContext, runtimeGeneration: 3 };
      const body = f.createMessage.mock.calls[0]?.[1];
      if (!body) throw new Error("Missing POST fixture");
      deferred.resolve(
        createMessageDto({
          uuid: createMessengerPlacementUuid(TOPIC_A, MESSAGE_B),
          payload: body.payload,
        }),
      );
      await expect(sending).resolves.toMatchObject({ status: "skipped", reason: "stale-owner" });
      expect(
        useWorkspaceMessageStore.getState().messagesById[
          createMessengerPlacementUuid(TOPIC_A, MESSAGE_B)
        ],
      ).toBeUndefined();
      expect(f.cache.writeConversationMessagePage).not.toHaveBeenCalled();
      expect(f.getStream).not.toHaveBeenCalled();
    },
  );

  it("accepts its own announced generation arriving over realtime before the POST response", async () => {
    const f = prepareEncryptedSend();
    f.createMessage.mockImplementation((_options, body) => {
      useMessengerStore
        .getState()
        .upsertStream(f.ownerKey, { ...f.stream, currentEncryptionKey: { keyUuid: MESSAGE_C } });
      return Promise.resolve(
        createMessageDto({
          uuid: createMessengerPlacementUuid(TOPIC_A, MESSAGE_B),
          payload: body.payload,
        }),
      );
    });
    await expect(
      sendMessengerE2eePayload({
        ...f.input,
        rotateKey: true,
        payload: { kind: "key_announced", keyUuid: MESSAGE_C },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    expect(useMessengerStore.getState().streamsById[STREAM_A]?.currentEncryptionKey?.keyUuid).toBe(
      MESSAGE_C,
    );
    expect(f.getStream).not.toHaveBeenCalled();
  });

  it("checks the captured generation after token loading before the first actual POST", async () => {
    const f = prepareEncryptedSend();
    const token = createDeferred<string>();
    const fetchImpl = vi.fn<typeof fetch>();
    vi.spyOn(messengerRequestOptions, "buildMessengerRequestOptions").mockReturnValue({
      accessToken: null,
      baseUrl: "https://org-a.example.com/api/workspace/v1/messenger",
      projectId: PROJECT_A,
      getAccessToken: () => token.promise,
      fetchImpl,
    });
    const sending = sendMessengerE2eePayload({
      ...f.input,
      client: { getStream: f.getStream },
      rotateKey: true,
      payload: { kind: "key_announced", keyUuid: MESSAGE_C },
    });
    useMessengerStore.getState().upsertStream(f.ownerKey, {
      ...f.stream,
      currentEncryptionKey: { keyUuid: MESSAGE_C },
    });
    const rejected = expect(sending).rejects.toThrow("stale");
    token.resolve("fixture-access-token");
    await rejected;
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      useWorkspaceMessageStore.getState().messagesById[
        createMessengerPlacementUuid(TOPIC_A, MESSAGE_B)
      ],
    ).toBeUndefined();
    expect(f.cache.writeConversationMessagePage).not.toHaveBeenCalled();
    expect(f.getStream).not.toHaveBeenCalled();
  });

  it("accepts the exact own generation after the real POST has started", async () => {
    const f = prepareEncryptedSend();
    const response = createDeferred<Response>();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      useMessengerStore.getState().upsertStream(f.ownerKey, {
        ...f.stream,
        currentEncryptionKey: { keyUuid: MESSAGE_C },
      });
      return response.promise;
    });
    vi.spyOn(messengerRequestOptions, "buildMessengerRequestOptions").mockReturnValue({
      accessToken: null,
      baseUrl: "https://org-a.example.com/api/workspace/v1/messenger",
      projectId: PROJECT_A,
      getAccessToken: () => Promise.resolve("fixture-access-token"),
      fetchImpl,
    });
    const sending = sendMessengerE2eePayload({
      ...f.input,
      client: { getStream: f.getStream },
      rotateKey: true,
      payload: { kind: "key_announced", keyUuid: MESSAGE_C },
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    response.resolve(
      Response.json(
        createMessageDto({
          uuid: createMessengerPlacementUuid(TOPIC_A, MESSAGE_B),
          payload: { kind: "key_announced", key_uuid: MESSAGE_C },
        }),
      ),
    );
    await expect(sending).resolves.toMatchObject({ status: "applied" });
    expect(f.getStream).not.toHaveBeenCalled();
  });

  it("does not accept a newer foreign generation while its own announcement is pending", async () => {
    const f = prepareEncryptedSend();
    f.createMessage.mockImplementation((_options, body) => {
      useMessengerStore.getState().upsertStream(f.ownerKey, {
        ...f.stream,
        currentEncryptionKey: { keyUuid: crypto.randomUUID() },
      });
      return Promise.resolve(
        createMessageDto({
          uuid: createMessengerPlacementUuid(TOPIC_A, MESSAGE_B),
          payload: body.payload,
        }),
      );
    });
    await expect(
      sendMessengerE2eePayload({
        ...f.input,
        rotateKey: true,
        payload: { kind: "key_announced", keyUuid: MESSAGE_C },
      }),
    ).resolves.toMatchObject({ status: "skipped" });
    expect(
      useWorkspaceMessageStore.getState().messagesById[
        createMessengerPlacementUuid(TOPIC_A, MESSAGE_B)
      ],
    ).toBeUndefined();
    expect(f.cache.writeConversationMessagePage).not.toHaveBeenCalled();
  });

  it("stops later cache writes when a synchronous subscriber invalidates the operation", async () => {
    const f = prepareEncryptedSend();
    let permitted = true;
    f.cache.writeConversationMessagePage.mockImplementation(() => {
      permitted = false;
      return Promise.resolve();
    });
    await expect(
      sendMessengerE2eePayload({ ...f.input, isCurrent: () => permitted }),
    ).resolves.toMatchObject({ status: "applied" });
    expect(f.cache.writeConversationMessagePage).toHaveBeenCalledOnce();
  });
});

it("rejects editor-only secret fences before ordinary send or edit transport", async () => {
  const runtimeContext = createRuntimeContext();
  const createMessage = vi.fn();
  const editMessage = vi.fn();
  const markdown = "Public :::private:::";
  await expect(
    sendMessengerMessage({
      runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      markdown,
      client: { createMessage },
    }),
  ).rejects.toThrow("invalid-secret");
  await expect(
    editMessengerMessage({
      runtimeContext,
      messageUuid: MESSAGE_A,
      markdown,
      client: { editMessage },
    }),
  ).rejects.toThrow("invalid-secret");
  expect(createMessage).not.toHaveBeenCalled();
  expect(editMessage).not.toHaveBeenCalled();
});

it.each(["native", "zulip"] as const)(
  "sends a standalone %s poll with an idempotent canonical UUID and checks its placement",
  async (sourceName) => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    useMessengerStore
      .getState()
      .upsertStream(ownerKey, adaptMessengerStream(createStreamDto({ source_name: sourceName })));
    const pollPayload = {
      kind: "poll" as const,
      questions: [{ uuid: MESSAGE_B, text: "Q", options: [{ uuid: MESSAGE_C, text: "A" }] }],
      multiple_answers: false,
      is_anonymous: true,
      allow_revote: false,
      results_visibility: "always" as const,
    };
    const createMessage = vi.fn(() =>
      Promise.resolve(
        createMessageDto({
          uuid: createMessengerPlacementUuid(TOPIC_A, MESSAGE_A),
          payload: pollPayload,
          poll_state: {
            revision: 1,
            is_closed: false,
            voter_count: 0,
            questions: [],
            my_votes: [],
          },
        }),
      ),
    );
    const result = await sendMessengerMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      canonicalMessageUuid: MESSAGE_A,
      pollPayload,
      client: { createMessage },
      cache: {},
    });
    expect(result.status).toBe("applied");
    expect(createMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ uuid: MESSAGE_A, payload: pollPayload }),
    );
  },
);
