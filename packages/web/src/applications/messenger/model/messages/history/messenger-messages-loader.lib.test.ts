import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import * as messengerClient from "~/shared/api/messenger-client";
import { MessengerApiError } from "~/shared/api/messenger-client";
import type {
  MessengerCollectionPage,
  MessengerClientOptions,
} from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerMessageReactionDto,
} from "~/shared/api/messenger.types";
import {
  openWorkspaceMessengerCacheDb,
  readConversationMessageWindow,
  resetWorkspaceMessengerCacheDbSingletonForTests,
} from "~/shared/lib/workspace-messenger-cache-db";
import { createMessengerRealtimeActiveApplier } from "../../../runtime/sync/messenger-realtime-applier.lib";
import { useMessengerStore } from "../../chats/messenger.model";
import * as messengerCache from "../../messenger-cache.lib";
import {
  captureWorkspaceConversationWindowBoundary,
  selectWorkspaceMessagesForConversation,
  selectWorkspaceMessageStatusForConversation,
  useWorkspaceMessageStore,
} from "../message.model";
import { createMessages } from "../messages";
import { adaptMessengerMessage } from "../messenger-message-adapter.lib";
import * as messengerReactions from "../messenger-message-reactions-actions.lib";
import { syncMessengerOwnerOwnMessageReactions } from "../messenger-message-reactions-actions.lib";
import {
  advanceMessengerReadBoundary,
  clearMessengerReadBoundariesForOwner,
  readMessengerReadBoundary,
  type MessengerReadBoundary,
} from "../messenger-read-boundary.lib";
import {
  isMessengerOutgoingMessageReceipt,
  useMessengerOutboxStore,
} from "../outgoing/messenger-outbox.model";
import {
  applyMessengerMessageWindow,
  fetchMessengerMessageWindow,
  loadMessengerConversationMessages,
  loadMessengerMessageWindowPage,
  resolveMessengerMessageAnchor,
  type MessengerFetchedMessageWindow,
  type MessengerMessagesCacheDeps,
} from "./messenger-messages-loader.lib";
import type { MessengerConversationId, MessengerMessagePayload } from "../../messenger.types";

// Message loader tests keep pagination scoped to the active conversation owner.
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
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const TOPIC_B = "ed25f944-8106-4386-b2f9-65e9db32d465";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const MESSAGE_B = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";
const MESSAGE_C = "24e84035-ae0a-46ce-a20d-88dcc2612059";
const MESSAGE_D = "ae1f6b08-1653-4c1f-84d0-582b83579650";
const REACTION_A = "4b1213e6-4e90-4c78-9040-5a0a82a842d4";
const REACTION_B = "c37d4128-ab06-469b-9878-886dd7cd3c26";
const DATE = "2026-06-22T10:10:00Z";
const DATE_LATER = "2026-06-22T10:20:00Z";
const DATE_LATEST = "2026-06-22T10:30:00Z";

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
    payload: { kind: "markdown", content: "Hello, workspace" },
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

function createReactionDto(
  overrides: Partial<WorkspaceMessengerMessageReactionDto> = {},
): WorkspaceMessengerMessageReactionDto {
  return {
    uuid: REACTION_A,
    project_id: PROJECT_A,
    message_uuid: MESSAGE_A,
    user_uuid: USER_A,
    emoji_name: "thumbs_up",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createMessagesPage(
  items: WorkspaceMessengerMessageDto[],
): MessengerCollectionPage<WorkspaceMessengerMessageDto> {
  return { items, nextPageMarker: "next-page", pageLimit: 50 };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function prepareStoreOwner(runtimeContext: WorkspaceRuntimeContext): string {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  useMessengerStore.getState().startBootstrap(ownerKey);
  useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
  return ownerKey;
}

function createResolvedAnchor(
  runtimeContext: WorkspaceRuntimeContext,
  message = adaptMessengerMessage(createMessageDto()),
) {
  return {
    status: "resolved" as const,
    ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    conversationId: message.conversationId,
    message,
  };
}

function createFetchedWindow(
  runtimeContext: WorkspaceRuntimeContext,
  message = adaptMessengerMessage(createMessageDto()),
): MessengerFetchedMessageWindow {
  const state = useWorkspaceMessageStore.getState();
  return {
    ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
    conversationId: message.conversationId,
    anchorUuid: message.uuid,
    messages: [message],
    beforePageMarker: "before-page",
    afterPageMarker: "after-page",
    expectedWindowRevision: state.conversationWindowsById[message.conversationId]?.revision ?? null,
    capturedMutationRevision: state.messageMutationRevision,
  };
}

// Captures the same side of an installed test window as the public messages model.
function captureBoundary(conversationId: MessengerConversationId, direction: "before" | "after") {
  const window = useWorkspaceMessageStore.getState().conversationWindowsById[conversationId];
  const boundary = captureWorkspaceConversationWindowBoundary(window, direction);
  if (boundary == null) throw new Error("Expected a pagination boundary");
  return boundary;
}

function replaceConversationWindow({
  conversationId,
  messages,
  beforePageMarker = null,
  afterPageMarker = null,
  mode = "tail",
  anchorMessageUuid = null,
}: {
  conversationId: MessengerFetchedMessageWindow["conversationId"];
  messages: MessengerFetchedMessageWindow["messages"];
  beforePageMarker?: string | null;
  afterPageMarker?: string | null;
  mode?: "tail" | "around-anchor";
  anchorMessageUuid?: string | null;
}): void {
  const state = useWorkspaceMessageStore.getState();
  state.replaceConversationWindow({
    conversationId,
    expectedRevision: state.conversationWindowsById[conversationId]?.revision ?? null,
    capturedMutationRevision: state.messageMutationRevision,
    mode,
    anchorMessageUuid,
    messages,
    markers: { beforePageMarker, afterPageMarker },
  });
}

// Создаёт исходящее и серверный снимок, который подтверждает его placement.
function enqueueHistoryReceipt(
  ownerKey: string,
  conversationId: MessengerFetchedMessageWindow["conversationId"],
  keyUuid?: string,
): WorkspaceMessengerMessageDto {
  const outbox = useMessengerOutboxStore.getState();
  const outgoing = outbox.enqueueOutgoingMessage({
    ownerKey,
    conversationId,
    projectId: PROJECT_A,
    streamUuid: STREAM_A,
    topicUuid: TOPIC_A,
    authorUuid: USER_A,
    markdown: "Confirmed from history",
    status: "sending",
    includeStreamConversation: false,
    encryption: keyUuid == null ? undefined : { keyUuid, deviceId: "test-device" },
  });
  if (keyUuid != null) {
    outbox.retainEncryptedPayload(outgoing.placementUuid, {
      kind: "e2ee",
      keyUuid,
      content: { bytes: new Uint8Array([1, 2, 3]) },
    });
    return createMessageDto({
      uuid: outgoing.placementUuid,
      payload: { kind: "e2ee", key_uuid: keyUuid, content: "AQID" },
    });
  }
  return createMessageDto({
    uuid: outgoing.placementUuid,
    payload: { kind: "markdown", content: outgoing.markdown },
  });
}

describe("messenger conversation messages loader", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().setOwner(null, false);
    useWorkspaceMessageStore.getState().clear();
    useMessengerOutboxStore.getState().clear();
    clearMessengerReadBoundariesForOwner(workspaceRuntimeOwnerKey(createRuntimeContext()));
  });

  it("only starts public older pagination after the authoritative opening window applies", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const cached = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER }),
    );
    const { conversationId } = cached;
    const options = { runtimeContext, getRuntimeContext: () => runtimeContext };
    const facade = createMessages(options);
    const pagination = createMessages(options);
    const serverWindow = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const reactionRead = createDeferred<void>();
    const controller = new AbortController();
    const readCache = vi
      .spyOn(messengerCache, "readMessengerConversationWindowCache")
      .mockResolvedValue({ messages: [cached], nextPageMarker: "cached-older", hasMore: true });
    const getMessagesPage = vi
      .spyOn(messengerClient, "getMessagesPage")
      .mockImplementation((_options, query) => {
        if (query?.pageMarker != null) {
          return Promise.resolve({
            items: [createMessageDto()],
            nextPageMarker: null,
            pageLimit: 50,
          });
        }
        if (query?.read === false) {
          return Promise.resolve({ items: [], nextPageMarker: null, pageLimit: 1 });
        }
        return serverWindow.promise;
      });
    const hydrateReactions = vi
      .spyOn(messengerReactions, "hydrateMessengerOwnMessageReactionsFromCache")
      .mockImplementation(async ({ messageUuids }) => {
        if (messageUuids.includes(MESSAGE_C)) await reactionRead.promise;
        return { status: "applied", ownerKey, messageUuids: [...messageUuids], reactions: 0 };
      });
    const syncReactions = vi
      .spyOn(messengerReactions, "syncMessengerOwnerOwnMessageReactions")
      .mockResolvedValue({ status: "applied", ownerKey, messageUuids: [], reactions: 0 });
    const loadOlder = () =>
      pagination.loadMore({
        conversationId,
        direction: "before",
        signal: controller.signal,
      });
    const onServerWindowApplied = vi.fn(loadOlder);
    const openingSettled = vi.fn();
    const opening = facade.openWindow({
      conversationId,
      at: "latest",
      signal: controller.signal,
      onServerWindowApplied,
    });
    void opening.then(openingSettled, openingSettled);
    try {
      await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledTimes(2));
      expect(facade.getWindow(conversationId)).toMatchObject({
        messages: [{ uuid: MESSAGE_B }],
        hasOlder: true,
        loading: false,
      });
      await expect(loadOlder()).resolves.toEqual({ status: "skipped", reason: "busy" });
      expect(getMessagesPage).toHaveBeenCalledTimes(2);
      expect(onServerWindowApplied).not.toHaveBeenCalled();

      serverWindow.resolve({
        items: [createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST })],
        nextPageMarker: "server-older",
        pageLimit: 50,
      });
      await vi.waitFor(() => expect(onServerWindowApplied).toHaveBeenCalledOnce());
      await expect(onServerWindowApplied.mock.results[0]?.value).resolves.toEqual({
        status: "applied",
      });
      expect(hydrateReactions).toHaveBeenCalledWith(
        expect.objectContaining({ messageUuids: [MESSAGE_C] }),
      );
      expect(openingSettled).not.toHaveBeenCalled();
      expect(getMessagesPage).toHaveBeenCalledTimes(3);
      expect(getMessagesPage).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ pageMarker: "server-older" }),
      );
      expect(facade.getWindow(conversationId).messages.map(({ uuid }) => uuid)).toEqual([
        MESSAGE_A,
        MESSAGE_C,
      ]);
    } finally {
      controller.abort();
      serverWindow.resolve(createMessagesPage([]));
      reactionRead.resolve();
      await opening.catch(() => undefined);
      readCache.mockRestore();
      getMessagesPage.mockRestore();
      hydrateReactions.mockRestore();
      syncReactions.mockRestore();
    }
  });

  it("does not settle a delayed public history page in the next owner's store", async () => {
    const runtimeA = createRuntimeContext();
    prepareStoreOwner(runtimeA);
    let activeRuntime = runtimeA;
    const message = adaptMessengerMessage(createMessageDto());
    const { conversationId } = message;
    replaceConversationWindow({
      conversationId,
      messages: [message],
      beforePageMarker: "next-page",
    });

    const facade = createMessages({
      runtimeContext: runtimeA,
      getRuntimeContext: () => activeRuntime,
    });
    const response = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const getMessagesPage = vi
      .spyOn(messengerClient, "getMessagesPage")
      .mockReturnValue(response.promise);
    try {
      const request = facade.loadMore({
        conversationId,
        direction: "before",
        signal: new AbortController().signal,
      });
      await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledTimes(1));
      expect(facade.getWindow(conversationId).loading).toBe(true);

      activeRuntime = createRuntimeContext({ accountId: ACCOUNT_B, runtimeGeneration: 2 });
      prepareStoreOwner(activeRuntime);
      const nextState = useWorkspaceMessageStore.getState();
      expect(facade.getWindow(conversationId).messages).toEqual([]);
      response.resolve(createMessagesPage([createMessageDto({ uuid: MESSAGE_B })]));

      await expect(request).resolves.toEqual({ status: "skipped", reason: "stale-owner" });
      expect(useWorkspaceMessageStore.getState()).toBe(nextState);
    } finally {
      getMessagesPage.mockRestore();
    }
  });

  it("accepts a repeated server-unread frontier that contradicts an unchanged cached cursor", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const frontier = createMessageDto({ read: false, is_own: false });
    const boundary = {
      ownerKey,
      streamUuid: STREAM_A,
      topicUuid: TOPIC_A,
      createdAt: DATE_LATER,
      messageUuid: MESSAGE_B,
    };
    const deleteReadBoundary = vi.fn(
      (_boundary: MessengerReadBoundary, isCurrent: () => boolean) => {
        expect(isCurrent()).toBe(true);
        return Promise.resolve();
      },
    );
    const getMessagesPage = vi.fn(() => Promise.resolve(createMessagesPage([frontier])));
    const onServerWindowApplied = vi.fn();

    const result = await loadMessengerConversationMessages({
      runtimeContext,
      conversationId,
      resolveUnreadBoundary: true,
      onServerWindowApplied,
      cache: {
        readReadBoundaries: () => Promise.resolve([boundary]),
        deleteReadBoundary,
        readConversationMessageWindow: () =>
          Promise.resolve({
            messages: [adaptMessengerMessage(frontier)],
            nextPageMarker: null,
            hasMore: false,
          }),
        writeConversationMessagePage: vi.fn(),
      },
      client: { getMessagesPage },
    });

    expect(result.status).toBe("applied");
    expect(getMessagesPage).toHaveBeenCalledTimes(4);
    expect(deleteReadBoundary).toHaveBeenCalledExactlyOnceWith(boundary, expect.any(Function));
    expect(readMessengerReadBoundary(ownerKey, STREAM_A, TOPIC_A)).toBeNull();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(false);
    expect(
      useWorkspaceMessageStore.getState().messagesErrorByConversationId[conversationId],
    ).toBeNull();
    expect(onServerWindowApplied).toHaveBeenCalledOnce();
  });

  it.each(["new-read", "same-boundary-read", "owner-switch"] as const)(
    "preserves newer state during unread cursor reconciliation after %s",
    async (transition) => {
      const runtimeContext = createRuntimeContext();
      let activeRuntime = runtimeContext;
      const ownerKey = prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const frontier = createMessageDto({ read: false, is_own: false });
      const boundary = advanceMessengerReadBoundary({
        ownerKey,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        createdAt: DATE_LATER,
        messageUuid: MESSAGE_B,
      });
      const pending = createDeferred<void>();
      const deleteReadBoundary = vi.fn(
        (_boundary: MessengerReadBoundary, _isCurrent: () => boolean) => pending.promise,
      );
      const onServerWindowApplied = vi.fn();
      const loading = loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => activeRuntime,
        conversationId,
        resolveUnreadBoundary: true,
        onServerWindowApplied,
        cache: {
          readReadBoundaries: () => Promise.resolve([]),
          deleteReadBoundary,
          readConversationMessageWindow: () =>
            Promise.resolve({
              messages: [],
              nextPageMarker: null,
              hasMore: false,
            }),
          writeConversationMessagePage: vi.fn(),
        },
        client: { getMessagesPage: () => Promise.resolve(createMessagesPage([frontier])) },
      });
      await vi.waitFor(() => expect(deleteReadBoundary).toHaveBeenCalledOnce());
      if (transition === "new-read") {
        advanceMessengerReadBoundary({
          ...boundary,
          createdAt: DATE_LATEST,
          messageUuid: MESSAGE_C,
        });
      } else if (transition === "same-boundary-read") {
        advanceMessengerReadBoundary({ ...boundary });
        useWorkspaceMessageStore
          .getState()
          .applyLiveKnownBodyMutation(
            adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER })),
          );
      } else {
        activeRuntime = createRuntimeContext({ accountId: ACCOUNT_B, userUuid: USER_B });
        prepareStoreOwner(activeRuntime);
      }
      expect(deleteReadBoundary.mock.calls[0]?.[1]()).toBe(false);
      pending.resolve();

      await expect(loading).resolves.toMatchObject({
        status: transition === "owner-switch" ? "skipped" : "failed",
      });
      expect(readMessengerReadBoundary(ownerKey, STREAM_A, TOPIC_A)).toMatchObject({
        messageUuid: transition === "new-read" ? MESSAGE_C : MESSAGE_B,
      });
      expect(onServerWindowApplied).not.toHaveBeenCalled();
    },
  );

  it("exposes a retryable opening error after two live window races and recovers on retry", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const first = createMessageDto({ read: true });
    const second = createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, read: true });
    const remaining = createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST, read: true });
    const stalePage = createMessagesPage([remaining, second, first]);
    const initialResponse = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const retriedResponse = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const responses = [initialResponse, retriedResponse];
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, query: { read?: boolean }) => {
      if (query.read === false) return Promise.resolve(createMessagesPage([]));
      const response = responses.shift();
      if (response == null) throw new Error("Unexpected automatic history retry");
      return response.promise;
    });
    const onServerWindowApplied = vi.fn();
    const writeConversationMessagePage = vi.fn();
    const loading = loadMessengerConversationMessages({
      runtimeContext,
      conversationId,
      resolveUnreadBoundary: true,
      onServerWindowApplied,
      cache: {
        readConversationMessageWindow: () =>
          Promise.resolve({
            messages: [first, second, remaining].map(adaptMessengerMessage),
            nextPageMarker: null,
            hasMore: false,
          }),
        writeConversationMessagePage,
      },
      client: { getMessagesPage },
    });
    await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledTimes(2));
    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);
    initialResponse.resolve(stalePage);
    await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledTimes(4));
    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_B);
    retriedResponse.resolve(stalePage);

    await expect(loading).resolves.toMatchObject({ status: "failed", ownerKey, conversationId });
    const failedState = useWorkspaceMessageStore.getState();
    expect(selectWorkspaceMessageStatusForConversation(failedState, conversationId)).toMatchObject({
      loading: false,
      error: expect.any(String),
    });
    expect(failedState.conversationWindowsById[conversationId]?.messageUuids).toEqual([MESSAGE_C]);
    expect(getMessagesPage).toHaveBeenCalledTimes(4);
    expect(onServerWindowApplied).not.toHaveBeenCalled();
    expect(writeConversationMessagePage).not.toHaveBeenCalled();

    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        retainCurrentWindow: () => true,
        resolveUnreadBoundary: true,
        onServerWindowApplied,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({
              messages: [adaptMessengerMessage(remaining)],
              nextPageMarker: null,
              hasMore: false,
            }),
          writeConversationMessagePage,
        },
        client: { getMessagesPage: () => Promise.resolve(createMessagesPage([remaining])) },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ),
    ).toMatchObject({ loading: false, error: null });
    expect(onServerWindowApplied).toHaveBeenCalledExactlyOnceWith();
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.messageUuids,
    ).toEqual([MESSAGE_C]);
  });

  it("allows the asynchronous cache write to finish after its successful history request settles", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const writeConversationMessagePage = vi.fn();
    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({
              messages: [],
              nextPageMarker: null,
              hasMore: false,
            }),
          writeConversationMessagePage,
        },
        client: {
          getMessagesPage: () =>
            Promise.resolve({
              items: [createMessageDto()],
              nextPageMarker: null,
              pageLimit: 50,
            }),
        },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    const isWriteCurrent = writeConversationMessagePage.mock.calls[0]?.[3] as
      | (() => boolean)
      | undefined;
    expect(isWriteCurrent).toEqual(expect.any(Function));
    expect(isWriteCurrent?.()).toBe(true);
    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);
    expect(isWriteCurrent?.()).toBe(false);
  });

  it("loads around the remembered bottom when the fresh tail no longer contains it", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const savedBottom = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER }),
    );
    const newer = createMessageDto({
      uuid: MESSAGE_C,
      read: false,
      is_own: false,
      created_at: DATE_LATEST,
    });
    const getMessagesPage = vi.fn(() =>
      Promise.resolve({
        items: [newer],
        nextPageMarker: MESSAGE_C,
        pageLimit: 50,
      }),
    );
    const getMessagePagesAroundResolvedMessage = vi.fn(() =>
      Promise.resolve({
        before: [createMessageDto({ read: false, is_own: false })],
        after: [newer],
        beforePageMarker: null,
        afterPageMarker: null,
      }),
    );
    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        openingAnchorUuid: MESSAGE_B,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({
              messages: [savedBottom],
              nextPageMarker: null,
              hasMore: false,
            }),
          writeConversationMessagePage: vi.fn(),
        },
        client: { getMessagesPage, getMessagePagesAroundResolvedMessage },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    expect(getMessagesPage).toHaveBeenCalledTimes(1);
    expect(getMessagePagesAroundResolvedMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ messageUuid: MESSAGE_B }),
    );
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toMatchObject({
      messageUuids: [MESSAGE_A, MESSAGE_B, MESSAGE_C],
      anchorMessageUuid: MESSAGE_B,
    });
  });

  it("keeps a reader-owned cached window contiguous when the fresh tail is disjoint", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const cached = adaptMessengerMessage(createMessageDto());
    const response = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const getMessagesPage = vi.fn(() => response.promise);
    let readerTookControl = false;
    const writeConversationMessagePage = vi.fn();
    const loading = loadMessengerConversationMessages({
      runtimeContext,
      conversationId,
      retainCurrentWindow: () => readerTookControl,
      cache: {
        readConversationMessageWindow: () =>
          Promise.resolve({
            messages: [cached],
            nextPageMarker: "older",
            hasMore: true,
          }),
        writeConversationMessagePage,
      },
      client: { getMessagesPage },
    });
    await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledTimes(1));
    readerTookControl = true;
    response.resolve({
      items: [createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST })],
      nextPageMarker: MESSAGE_B,
      pageLimit: 50,
    });
    await expect(loading).resolves.toMatchObject({ status: "applied" });
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toMatchObject({
      messageUuids: [MESSAGE_A],
      beforePageMarker: "older",
      afterPageMarker: MESSAGE_A,
    });
    expect(writeConversationMessagePage).not.toHaveBeenCalled();
  });

  it.each(["automatic", "reader"] as const)(
    "handles another-device read during the around-window fetch with %s control",
    async (control) => {
      let readerTookControl = false;
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const frontier = createMessageDto({
        uuid: MESSAGE_B,
        read: false,
        is_own: false,
        created_at: DATE_LATER,
      });
      const nextUnread = createMessageDto({
        uuid: MESSAGE_C,
        read: false,
        is_own: false,
        created_at: DATE_LATEST,
      });
      const around = createDeferred<{
        before: WorkspaceMessengerMessageDto[];
        after: WorkspaceMessengerMessageDto[];
        beforePageMarker: string | null;
        afterPageMarker: string | null;
      }>();
      let unreadQueries = 0;
      const getMessagesPage = vi.fn((_options: MessengerClientOptions, query: { read?: boolean }) =>
        Promise.resolve({
          items:
            query.read === false ? [++unreadQueries === 1 ? frontier : nextUnread] : [nextUnread],
          nextPageMarker: null,
          pageLimit: query.read === false ? 1 : 50,
        }),
      );
      const getMessagePagesAroundResolvedMessage = vi.fn(() => around.promise);
      const onServerWindowApplied = vi.fn();
      const loading = loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        resolveUnreadBoundary: true,
        retainCurrentWindow: () => readerTookControl,
        onServerWindowApplied,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({
              messages: [adaptMessengerMessage(createMessageDto())],
              nextPageMarker: null,
              hasMore: false,
            }),
          writeConversationMessagePage: vi.fn(),
        },
        client: { getMessagesPage, getMessagePagesAroundResolvedMessage },
      });
      await vi.waitFor(() => expect(getMessagePagesAroundResolvedMessage).toHaveBeenCalledTimes(1));
      readerTookControl = control === "reader";
      advanceMessengerReadBoundary({
        ownerKey,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        createdAt: DATE_LATER,
        messageUuid: MESSAGE_B,
      });
      around.resolve({
        before: [createMessageDto()],
        after: [],
        beforePageMarker: null,
        afterPageMarker: MESSAGE_B,
      });
      await expect(loading).resolves.toMatchObject({ status: "applied" });
      expect(onServerWindowApplied).toHaveBeenCalledExactlyOnceWith();
      const window = useWorkspaceMessageStore.getState().conversationWindowsById[conversationId];
      if (control === "reader") {
        expect(unreadQueries).toBe(1);
        expect(getMessagesPage).toHaveBeenCalledTimes(2);
        expect(window).toMatchObject({ messageUuids: [MESSAGE_A], afterPageMarker: MESSAGE_A });
      } else {
        expect(unreadQueries).toBe(2);
        expect(window?.messageUuids).toContain(MESSAGE_C);
      }
    },
  );

  it("loads the server unread frontier outside the fresh tail with its surrounding window", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const frontier = createMessageDto({
      uuid: MESSAGE_B,
      read: false,
      is_own: false,
      created_at: DATE_LATER,
    });
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, query: { read?: boolean }) =>
      Promise.resolve({
        items:
          query.read === false
            ? [frontier]
            : [createMessageDto({ uuid: MESSAGE_C, read: false, created_at: DATE_LATEST })],
        nextPageMarker: query.read === false ? null : MESSAGE_C,
        pageLimit: query.read === false ? 1 : 50,
      }),
    );
    const getMessagePagesAroundResolvedMessage = vi.fn(() =>
      Promise.resolve({
        before: [createMessageDto()],
        after: [],
        beforePageMarker: null,
        afterPageMarker: MESSAGE_B,
      }),
    );
    const onServerWindowApplied = vi.fn();
    const writeConversationMessagePage = vi.fn();
    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        resolveUnreadBoundary: true,
        onServerWindowApplied,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({
              messages: [],
              nextPageMarker: null,
              hasMore: false,
            }),
          writeConversationMessagePage,
        },
        client: { getMessagesPage, getMessagePagesAroundResolvedMessage },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ read: false, sortDir: "asc", pageLimit: 1 }),
    );
    expect(getMessagePagesAroundResolvedMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ messageUuid: MESSAGE_B, streamUuid: STREAM_A, topicUuid: TOPIC_A }),
    );
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toMatchObject({
      messageUuids: [MESSAGE_A, MESSAGE_B],
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_B,
      afterPageMarker: MESSAGE_B,
    });
    expect(onServerWindowApplied).toHaveBeenCalledExactlyOnceWith();
    expect(writeConversationMessagePage).not.toHaveBeenCalled();
  });

  it.each([undefined, "older"])(
    "accepts a history receipt while preserving the realtime edit during HTTP (marker %s)",
    async (pageMarker) => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const keyUuid = "3d422317-12f3-4840-9c31-a9ba3a652acb";
      const receipt = enqueueHistoryReceipt(ownerKey, conversationId, keyUuid);
      replaceConversationWindow({
        conversationId,
        messages: [
          adaptMessengerMessage({
            ...receipt,
            payload: { kind: "e2ee", key_uuid: keyUuid, content: "BwgJ" },
          }),
        ],
        beforePageMarker: pageMarker,
      });
      const page = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
      const getMessagesPage = vi.fn(() => page.promise);
      const writeConversationMessagePage = vi.fn();
      const onServerWindowApplied = vi.fn(() => {
        expect(
          useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[receipt.uuid],
        ).toBeUndefined();
      });
      const loading = loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        boundary: pageMarker == null ? undefined : captureBoundary(conversationId, "before"),
        cache: { writeConversationMessagePage },
        client: { getMessagesPage },
        onServerWindowApplied,
      });
      await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledOnce());

      const edit = createMessageDto({
        ...receipt,
        updated_at: DATE_LATER,
        payload: { kind: "e2ee", key_uuid: keyUuid, content: "BAUG" },
      });
      await createMessengerRealtimeActiveApplier({ cache: {} }).applyEvent(
        {
          epoch_version: 2,
          type: "message",
          kind: "message.updated",
          message: edit,
        },
        { owner: runtimeContext, ownerKey, surface: "active", source: "websocket" },
      );
      const { payload } = adaptMessengerMessage(edit);
      const realtimeMessage = useWorkspaceMessageStore.getState().messagesById[receipt.uuid];
      const outgoing =
        useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[receipt.uuid];
      expect(realtimeMessage?.payload).toEqual(payload);
      expect(
        outgoing && realtimeMessage && isMessengerOutgoingMessageReceipt(outgoing, realtimeMessage),
      ).toBe(false);
      page.resolve(createMessagesPage([receipt]));

      await expect(loading).resolves.toMatchObject({
        status: "applied",
        nextPageMarker: "next-page",
      });
      const expectedMessages = [expect.objectContaining({ uuid: receipt.uuid, payload })];
      expect(
        selectWorkspaceMessagesForConversation(useWorkspaceMessageStore.getState(), conversationId),
      ).toEqual(expectedMessages);
      expect(writeConversationMessagePage).toHaveBeenCalledWith(
        ownerKey,
        conversationId,
        { messages: expectedMessages, nextPageMarker: "next-page", hasMore: true },
        expect.any(Function),
      );
      expect(onServerWindowApplied).toHaveBeenCalledOnce();
    },
  );

  it.each(["edit", "delete", "move"] as const)(
    "applies a delayed older page and caches the realtime tail and %s",
    async (mutation) => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      const olderEdge = adaptMessengerMessage(
        createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER }),
      );
      const snapshotDto = createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST });
      const { conversationId } = olderEdge;
      replaceConversationWindow({
        conversationId,
        messages: [olderEdge, adaptMessengerMessage(snapshotDto)],
        beforePageMarker: "older",
      });
      const response = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
      const getMessagesPage = vi.fn(() => response.promise);
      const writeConversationMessagePage =
        vi.fn<NonNullable<MessengerMessagesCacheDeps["writeConversationMessagePage"]>>();
      const boundary = captureBoundary(conversationId, "before");
      const loading = loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        boundary,
        cache: { writeConversationMessagePage },
        client: { getMessagesPage },
      });
      await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledOnce());
      const state = useWorkspaceMessageStore.getState();
      if (mutation === "delete") {
        state.removeMessage(MESSAGE_C);
      } else {
        state.applyLiveKnownBodyMutation(
          adaptMessengerMessage({
            ...snapshotDto,
            topic_uuid: mutation === "move" ? TOPIC_B : TOPIC_A,
            payload: { kind: "markdown", content: "Live content" },
            updated_at: "2026-06-22T10:35:00Z",
          }),
        );
      }
      state.applyLiveCreatedMessage(
        adaptMessengerMessage(
          createMessageDto({ uuid: MESSAGE_D, created_at: "2026-06-22T10:40:00Z" }),
        ),
      );
      expect(captureBoundary(conversationId, "before")).toEqual(boundary);
      response.resolve(createMessagesPage([snapshotDto, createMessageDto()]));

      await expect(loading).resolves.toMatchObject({
        status: "applied",
        nextPageMarker: "next-page",
      });
      const currentState = useWorkspaceMessageStore.getState();
      const messages = selectWorkspaceMessagesForConversation(currentState, conversationId);
      expect(messages.map(({ uuid }) => uuid)).toEqual(
        mutation === "edit"
          ? [MESSAGE_A, MESSAGE_B, MESSAGE_C, MESSAGE_D]
          : [MESSAGE_A, MESSAGE_B, MESSAGE_D],
      );
      if (mutation === "delete") {
        expect(currentState.messagesById[MESSAGE_C]).toBeUndefined();
      } else {
        expect(currentState.messagesById[MESSAGE_C]).toMatchObject({
          topicUuid: mutation === "move" ? TOPIC_B : TOPIC_A,
          payload: { kind: "markdown", content: "Live content" },
        });
      }
      expect(writeConversationMessagePage).toHaveBeenCalledOnce();
      expect(writeConversationMessagePage).toHaveBeenCalledWith(
        ownerKey,
        conversationId,
        { messages, nextPageMarker: "next-page", hasMore: true },
        expect.any(Function),
      );
      expect(writeConversationMessagePage.mock.calls[0]?.[3]?.()).toBe(true);
    },
  );

  it.each(["opposite insert", "same-side delete", "replacement", "cancel"] as const)(
    "guards the cache for a loaded older page when %s occurs during reaction hydration",
    async (change) => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      const tail = adaptMessengerMessage(
        createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER }),
      );
      const { conversationId } = tail;
      replaceConversationWindow({ conversationId, messages: [tail], beforePageMarker: "older" });
      const ready = createDeferred<void>();
      const hydrateFromCache = vi.fn(async () => {
        await ready.promise;
        return { status: "applied" as const, ownerKey, messageUuids: [], reactions: 0 };
      });
      const controller = new AbortController();
      const writeConversationMessagePage =
        vi.fn<NonNullable<MessengerMessagesCacheDeps["writeConversationMessagePage"]>>();
      if (change === "opposite insert") {
        vi.stubGlobal("indexedDB", new IDBFactory());
        vi.stubGlobal("IDBKeyRange", IDBKeyRange);
        resetWorkspaceMessengerCacheDbSingletonForTests();
        writeConversationMessagePage.mockImplementation(
          messengerCache.writeMessengerConversationWindowCache,
        );
        onTestFinished(async () => {
          const db = await openWorkspaceMessengerCacheDb();
          db.close();
          resetWorkspaceMessengerCacheDbSingletonForTests();
          vi.unstubAllGlobals();
        });
      }
      const loading = loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        boundary: captureBoundary(conversationId, "before"),
        signal: controller.signal,
        cache: { writeConversationMessagePage },
        client: {
          getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])),
        },
        ownReactionSync: { hydrateFromCache },
      });
      await vi.waitFor(() => expect(hydrateFromCache).toHaveBeenCalledOnce());
      const state = useWorkspaceMessageStore.getState();
      const appliedWindow = state.conversationWindowsById[conversationId];
      const realtime = adaptMessengerMessage(
        createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST, reactions: { thumbs_up: 2 } }),
      );
      if (change === "opposite insert") {
        state.applyLiveCreatedMessage(realtime);
        state.beginOptimisticOwnMessageReaction(MESSAGE_C, "thumbs_up", "add", REACTION_A, USER_A);
        expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_C]?.reactions).toEqual({
          thumbs_up: 3,
        });
      } else if (change === "same-side delete") {
        state.removeMessage(MESSAGE_A);
      } else if (change === "replacement") {
        replaceConversationWindow({
          conversationId,
          messages: selectWorkspaceMessagesForConversation(state, conversationId),
          beforePageMarker: appliedWindow?.beforePageMarker,
        });
      } else {
        controller.abort();
      }
      ready.resolve();

      await expect(loading).resolves.toMatchObject({
        status: change === "cancel" ? "skipped" : "applied",
      });
      if (change !== "opposite insert") {
        expect(writeConversationMessagePage).not.toHaveBeenCalled();
        return;
      }
      expect(writeConversationMessagePage).toHaveBeenCalledOnce();
      expect(writeConversationMessagePage).toHaveBeenCalledWith(
        ownerKey,
        conversationId,
        {
          messages: [expect.objectContaining({ uuid: MESSAGE_A }), tail, realtime],
          nextPageMarker: "next-page",
          hasMore: true,
        },
        expect.any(Function),
      );
      const isWriteCurrent = writeConversationMessagePage.mock.calls[0]?.[3];
      expect(isWriteCurrent?.()).toBe(true);
      await Promise.resolve(writeConversationMessagePage.mock.results[0]?.value);
      const cached = await readConversationMessageWindow(ownerKey, conversationId);
      expect(cached.window).toMatchObject({ nextPageMarker: "next-page", hasMore: true });
      expect(cached.messages.map(({ uuid }) => uuid)).toEqual([MESSAGE_A, MESSAGE_B, MESSAGE_C]);
      expect(cached.messages[2]).toMatchObject({ reactions: { thumbs_up: 2 } });
      expect(cached.messages[2]).not.toHaveProperty("pendingOwnReactionsByEmojiName");
      expect(cached.messages[2]).not.toHaveProperty("optimisticReactionUserUuidsByEmojiName");
      state.applyLiveKnownBodyMutation({
        ...realtime,
        payload: { kind: "markdown", content: "Changed after cache snapshot" },
      });
      expect(isWriteCurrent?.()).toBe(false);
    },
  );

  it("does not cache an opening after a synchronous subscriber recreates its revision", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const replacement = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER }),
    );
    const { conversationId } = replacement;
    const writeConversationMessagePage = vi.fn();
    const unsubscribe = useWorkspaceMessageStore.subscribe((state) => {
      if (state.conversationWindowsById[conversationId]?.messageUuids[0] !== MESSAGE_A) return;
      unsubscribe();
      state.clear();
      replaceConversationWindow({
        conversationId,
        messages: [replacement],
        beforePageMarker: "replacement-marker",
      });
    });

    try {
      await expect(
        loadMessengerConversationMessages({
          runtimeContext,
          conversationId,
          client: {
            getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])),
          },
          cache: { writeConversationMessagePage },
        }),
      ).resolves.toMatchObject({ status: "applied" });
      expect(
        useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
      ).toMatchObject({
        revision: 1,
        beforePageMarker: "replacement-marker",
        messageUuids: [MESSAGE_B],
      });
      expect(writeConversationMessagePage).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("rejects a lower boundary at the ordinary history loader before HTTP", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const messages = [adaptMessengerMessage(createMessageDto())];
    const conversationId = messages[0]!.conversationId;
    replaceConversationWindow({ conversationId, messages, afterPageMarker: "newer" });
    const getMessagesPage = vi.fn();

    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        boundary: captureBoundary(conversationId, "after"),
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({ status: "skipped", ownerKey, reason: "stale-window" });
    expect(getMessagesPage).not.toHaveBeenCalled();
  });

  it.each([
    { scenario: "opening is cancelled", pageMarker: undefined, reason: "stale-owner" },
    { scenario: "older request is cancelled", pageMarker: "older", reason: "stale-owner" },
    { scenario: "older boundary changes", pageMarker: "older", reason: "stale-window" },
  ])("skips a history receipt when $scenario during HTTP", async ({ pageMarker, reason }) => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const receipt = enqueueHistoryReceipt(ownerKey, conversationId);
    if (pageMarker != null)
      replaceConversationWindow({ conversationId, messages: [], beforePageMarker: pageMarker });
    const controller = new AbortController();
    const page = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const getMessagesPage = vi.fn(() => page.promise);
    const writeConversationMessagePage = vi.fn();
    const onServerWindowApplied = vi.fn();
    const loading = loadMessengerConversationMessages({
      runtimeContext,
      conversationId,
      boundary: pageMarker == null ? undefined : captureBoundary(conversationId, "before"),
      signal: controller.signal,
      cache: { writeConversationMessagePage },
      client: { getMessagesPage },
      onServerWindowApplied,
    });
    await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledOnce());
    if (reason === "stale-window") {
      replaceConversationWindow({ conversationId, messages: [], beforePageMarker: "new-marker" });
    } else {
      controller.abort();
    }
    const window = useWorkspaceMessageStore.getState().conversationWindowsById[conversationId];
    page.resolve(createMessagesPage([receipt]));

    await expect(loading).resolves.toEqual({ status: "skipped", ownerKey, reason });
    const state = useWorkspaceMessageStore.getState();
    expect(state.conversationWindowsById[conversationId]).toBe(window);
    expect(state.messagesById[receipt.uuid]).toBeUndefined();
    expect(state.messagesLoadingByConversationId[conversationId]).toBe(false);
    expect(
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[receipt.uuid],
    ).toBeDefined();
    expect(onServerWindowApplied).not.toHaveBeenCalled();
    expect(writeConversationMessagePage).not.toHaveBeenCalled();
  });

  it.each(["window", "receipt"] as const)(
    "stops history side effects after a synchronous %s subscriber aborts the request",
    async (abortOn) => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const firstReceipt = enqueueHistoryReceipt(ownerKey, conversationId);
      const secondReceipt = enqueueHistoryReceipt(ownerKey, conversationId);
      const controller = new AbortController();
      const page = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
      const getMessagesPage = vi.fn(() => page.promise);
      const writeConversationMessagePage = vi.fn();
      const onServerWindowApplied = vi.fn();
      const loading = loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        signal: controller.signal,
        cache: { writeConversationMessagePage },
        client: { getMessagesPage },
        onServerWindowApplied,
      });
      await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledOnce());
      const unsubscribe =
        abortOn === "window"
          ? useWorkspaceMessageStore.subscribe((state) => {
              if (state.messagesById[firstReceipt.uuid] != null) controller.abort();
            })
          : useMessengerOutboxStore.subscribe((state) => {
              if (state.outgoingMessagesByPlacementUuid[firstReceipt.uuid] == null)
                controller.abort();
            });
      try {
        page.resolve(createMessagesPage([firstReceipt, secondReceipt]));
        await expect(loading).resolves.toEqual({
          status: "skipped",
          ownerKey,
          reason: "stale-owner",
        });
        const { outgoingMessagesByPlacementUuid } = useMessengerOutboxStore.getState();
        expect(outgoingMessagesByPlacementUuid[secondReceipt.uuid]).toBeDefined();
        expect(outgoingMessagesByPlacementUuid[firstReceipt.uuid] == null).toBe(
          abortOn === "receipt",
        );
        expect(onServerWindowApplied).not.toHaveBeenCalled();
        expect(writeConversationMessagePage).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    },
  );

  it.each([403, 404])(
    "returns unavailable without backend response details for HTTP %s",
    async (status) => {
      const runtimeContext = createRuntimeContext();
      prepareStoreOwner(runtimeContext);
      const failure = new MessengerApiError("private backend response", status, {
        content: "private",
      });
      const result = await resolveMessengerMessageAnchor({
        runtimeContext,
        messageUuid: MESSAGE_A,
        client: { getMessage: () => Promise.reject(failure) },
      });
      expect(result).toMatchObject({
        status: "failed",
        error: "Message unavailable",
        reason: status === 403 ? "access-denied" : "not-found",
      });
      const anchor = await resolveMessengerMessageAnchor({
        runtimeContext,
        messageUuid: MESSAGE_A,
        client: { getMessage: () => Promise.resolve(createMessageDto()) },
      });
      if (anchor.status !== "resolved") throw new Error("Expected resolved anchor");
      await expect(
        fetchMessengerMessageWindow({
          runtimeContext,
          anchor,
          targetConversationId: anchor.conversationId,
          client: { getMessagePagesAroundResolvedMessage: () => Promise.reject(failure) },
        }),
      ).resolves.toMatchObject({
        status: "failed",
        error: "Message unavailable",
        reason: status === 403 ? "access-denied" : "not-found",
      });
    },
  );

  it("resolves an anchor body without changing its visible window", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "older",
      afterPageMarker: "newer",
    });

    await expect(
      resolveMessengerMessageAnchor({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_A,
        client: { getMessage: () => Promise.resolve(createMessageDto()) },
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      conversationId,
      message: { uuid: MESSAGE_A },
    });

    const state = useWorkspaceMessageStore.getState();
    expect(state.messagesById[MESSAGE_A]?.uuid).toBe(MESSAGE_A);
    expect(state.conversationWindowsById[conversationId]).toMatchObject({
      messageUuids: [],
      beforePageMarker: "older",
      afterPageMarker: "newer",
      mode: "tail",
    });
  });

  it("refreshes a stale cached anchor body through the exact message endpoint", async () => {
    const runtimeContext = createRuntimeContext();
    const stale = adaptMessengerMessage(
      createMessageDto({ payload: { kind: "markdown", content: "stale" } }),
    );
    const messageState = useWorkspaceMessageStore.getState();
    messageState.upsertMessageBodyFromSnapshot(stale, messageState.messageMutationRevision);
    const getMessage = vi.fn(() =>
      Promise.resolve(createMessageDto({ payload: { kind: "markdown", content: "fresh" } })),
    );

    await expect(
      resolveMessengerMessageAnchor({
        runtimeContext,
        messageUuid: MESSAGE_A,
        client: { getMessage },
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      message: { payload: { content: "fresh" } },
    });
    expect(getMessage).toHaveBeenCalledTimes(1);
    expect(
      readMarkdownPayload(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload),
    ).toBe("fresh");
  });

  it.each(["update", "delete"] as const)(
    "does not let a %s newer than an anchor resolve be overwritten by its snapshot",
    async (mutation) => {
      const runtimeContext = createRuntimeContext();
      const initialState = useWorkspaceMessageStore.getState();
      initialState.upsertMessageBodyFromSnapshot(
        adaptMessengerMessage(createMessageDto()),
        initialState.messageMutationRevision,
      );
      const response = createDeferred<WorkspaceMessengerMessageDto>();
      const resolving = resolveMessengerMessageAnchor({
        runtimeContext,
        messageUuid: MESSAGE_A,
        client: { getMessage: () => response.promise },
      });

      if (mutation === "update") {
        useWorkspaceMessageStore
          .getState()
          .applyLiveKnownBodyMutation(
            adaptMessengerMessage(
              createMessageDto({ payload: { kind: "markdown", content: "newer realtime body" } }),
            ),
          );
      } else {
        useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);
      }
      response.resolve(createMessageDto({ payload: { kind: "markdown", content: "stale body" } }));

      if (mutation === "delete") {
        await expect(resolving).resolves.toMatchObject({
          status: "skipped",
          reason: "stale-window",
        });
        expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
        return;
      }

      await expect(resolving).resolves.toMatchObject({
        status: "resolved",
        message: { payload: { content: "newer realtime body" } },
      });
      expect(
        readMarkdownPayload(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload),
      ).toBe("newer realtime body");
    },
  );

  it("rejects an exact anchor from another project without writing its body", async () => {
    const runtimeContext = createRuntimeContext();

    await expect(
      resolveMessengerMessageAnchor({
        runtimeContext,
        messageUuid: MESSAGE_A,
        client: {
          getMessage: () => Promise.resolve(createMessageDto({ project_id: PROJECT_B })),
        },
      }),
    ).resolves.toMatchObject({ status: "failed" });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
  });

  it.each(["owner", "runtime", "abort"] as const)(
    "does not write a resolved anchor body after stale %s context",
    async (staleKind) => {
      const runtimeContext = createRuntimeContext();
      let currentContext = runtimeContext;
      const controller = new AbortController();
      const request = createDeferred<WorkspaceMessengerMessageDto>();
      const loading = resolveMessengerMessageAnchor({
        runtimeContext,
        getRuntimeContext: () => currentContext,
        messageUuid: MESSAGE_A,
        signal: controller.signal,
        client: { getMessage: () => request.promise },
      });

      if (staleKind === "abort") {
        controller.abort();
      } else if (staleKind === "runtime") {
        currentContext = { ...runtimeContext, runtimeGeneration: 2 };
      } else {
        currentContext = createRuntimeContext({
          accountId: ACCOUNT_B,
          instanceId: INSTANCE_B,
          organizationId: ORGANIZATION_B,
          projectId: PROJECT_B,
          userUuid: USER_B,
        });
      }
      request.resolve(createMessageDto());

      await expect(loading).resolves.toMatchObject({
        status: "skipped",
        reason: "stale-owner",
      });
      expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    },
  );

  it("fetches a domain window without changing the store", async () => {
    const runtimeContext = createRuntimeContext();
    const anchor = createResolvedAnchor(runtimeContext);
    const stateBefore = useWorkspaceMessageStore.getState();

    const result = await fetchMessengerMessageWindow({
      runtimeContext,
      anchor,
      targetConversationId: anchor.conversationId,
      getRuntimeContext: () => runtimeContext,
      client: {
        getMessagePagesAroundResolvedMessage: () =>
          Promise.resolve({
            before: [createMessageDto({ uuid: MESSAGE_B, created_at: DATE })],
            after: [createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST })],
            beforePageMarker: "older",
            afterPageMarker: "newer",
          }),
      },
    });

    expect(result).toMatchObject({
      status: "fetched",
      window: {
        anchorUuid: MESSAGE_A,
        beforePageMarker: "older",
        afterPageMarker: "newer",
      },
    });
    if (result.status !== "fetched") throw new Error("Expected fetched window");
    expect(result.window.messages.map((message) => message.uuid)).toEqual([
      MESSAGE_B,
      MESSAGE_A,
      MESSAGE_C,
    ]);
    expect(result.window.messages.filter((message) => message.uuid === MESSAGE_A)).toHaveLength(1);
    expect(useWorkspaceMessageStore.getState()).toBe(stateBefore);
  });

  it.each([
    {
      name: "topic",
      targetConversationId: `topic:${STREAM_A}:${TOPIC_A}` as const,
      expectedTopicUuid: TOPIC_A,
    },
    {
      name: "stream",
      targetConversationId: `stream:${STREAM_A}` as const,
      expectedTopicUuid: undefined,
    },
  ])(
    "fetches and applies a $name-scoped anchor window",
    async ({ targetConversationId, expectedTopicUuid }) => {
      const runtimeContext = createRuntimeContext();
      const querySpy = vi.fn(() =>
        Promise.resolve({
          before: [],
          after: [],
          beforePageMarker: null,
          afterPageMarker: null,
        }),
      );
      const fetched = await fetchMessengerMessageWindow({
        runtimeContext,
        anchor: createResolvedAnchor(runtimeContext),
        targetConversationId,
        client: { getMessagePagesAroundResolvedMessage: querySpy },
      });

      expect(querySpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ streamUuid: STREAM_A, topicUuid: expectedTopicUuid }),
      );
      expect(fetched).toMatchObject({
        status: "fetched",
        window: { conversationId: targetConversationId },
      });
      if (fetched.status !== "fetched") throw new Error("Expected fetched window");
      await applyMessengerMessageWindow({
        runtimeContext,
        window: fetched.window,
        isRequestCurrent: () => true,
      });
      expect(
        useWorkspaceMessageStore.getState().conversationWindowsById[targetConversationId]
          ?.messageUuids,
      ).toEqual([MESSAGE_A]);
      expect(
        useWorkspaceMessageStore.getState().conversationWindowsById[targetConversationId],
      ).toMatchObject({
        mode: "around-anchor",
        anchorMessageUuid: MESSAGE_A,
      });
    },
  );

  it("rejects W1 after W2 has replaced the same conversation window", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const windowA = createFetchedWindow(runtimeContext);
    const messageB = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
    );
    const windowB = createFetchedWindow(runtimeContext, messageB);

    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window: windowB,
        isRequestCurrent: () => true,
      }),
    ).resolves.toMatchObject({ status: "applied", ownerKey, anchorUuid: MESSAGE_B });
    const writes = vi.fn();
    const unsubscribe = useWorkspaceMessageStore.subscribe(writes);
    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window: windowA,
        isRequestCurrent: () => true,
      }),
    ).resolves.toEqual({ status: "skipped", ownerKey, reason: "stale-window" });
    unsubscribe();

    expect(writes).not.toHaveBeenCalled();
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[windowB.conversationId],
    ).toMatchObject({ messageUuids: [MESSAGE_B], anchorMessageUuid: MESSAGE_B });
  });

  it("rejects a target topic that does not contain the resolved anchor", async () => {
    const runtimeContext = createRuntimeContext();
    const getPages = vi.fn();

    await expect(
      fetchMessengerMessageWindow({
        runtimeContext,
        anchor: createResolvedAnchor(runtimeContext),
        targetConversationId: `topic:${STREAM_A}:${TOPIC_B}`,
        client: { getMessagePagesAroundResolvedMessage: getPages },
      }),
    ).resolves.toMatchObject({ status: "failed" });
    expect(getPages).not.toHaveBeenCalled();
  });

  it.each(["guard", "owner", "runtime"] as const)(
    "does not apply a window with stale %s ownership",
    async (staleKind) => {
      const runtimeContext = createRuntimeContext();
      let currentContext = runtimeContext;
      const window = createFetchedWindow(runtimeContext);
      if (staleKind === "owner") {
        window.ownerKey = "another-owner";
      } else if (staleKind === "runtime") {
        currentContext = { ...runtimeContext, runtimeGeneration: 2 };
      }

      await expect(
        applyMessengerMessageWindow({
          runtimeContext,
          window,
          getRuntimeContext: () => currentContext,
          isRequestCurrent: () => staleKind !== "guard",
        }),
      ).resolves.toMatchObject({ status: "skipped", reason: "stale-owner" });
      expect(useWorkspaceMessageStore.getState().messagesById).toEqual({});
    },
  );

  it("skips a fetched window when runtime ownership changes while pages are loading", async () => {
    const runtimeContext = createRuntimeContext();
    let currentContext = runtimeContext;
    const pages = createDeferred<{
      before: WorkspaceMessengerMessageDto[];
      after: WorkspaceMessengerMessageDto[];
      beforePageMarker: string | null;
      afterPageMarker: string | null;
    }>();
    const loading = fetchMessengerMessageWindow({
      runtimeContext,
      anchor: createResolvedAnchor(runtimeContext),
      targetConversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      getRuntimeContext: () => currentContext,
      client: { getMessagePagesAroundResolvedMessage: () => pages.promise },
    });

    currentContext = { ...runtimeContext, runtimeGeneration: 2 };
    pages.resolve({
      before: [],
      after: [],
      beforePageMarker: null,
      afterPageMarker: null,
    });

    await expect(loading).resolves.toMatchObject({
      status: "skipped",
      reason: "stale-owner",
    });
    expect(useWorkspaceMessageStore.getState().messagesById).toEqual({});
  });

  it("skips a fetched window after its page request is aborted", async () => {
    const runtimeContext = createRuntimeContext();
    const controller = new AbortController();
    const pages = createDeferred<{
      before: WorkspaceMessengerMessageDto[];
      after: WorkspaceMessengerMessageDto[];
      beforePageMarker: string | null;
      afterPageMarker: string | null;
    }>();
    const loading = fetchMessengerMessageWindow({
      runtimeContext,
      anchor: createResolvedAnchor(runtimeContext),
      targetConversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      signal: controller.signal,
      client: { getMessagePagesAroundResolvedMessage: () => pages.promise },
    });
    controller.abort();
    pages.resolve({ before: [], after: [], beforePageMarker: null, afterPageMarker: null });

    await expect(loading).resolves.toMatchObject({ status: "skipped" });
    expect(useWorkspaceMessageStore.getState().messagesById).toEqual({});
  });

  it("applies restored read boundaries and hydrates reactions for the published window", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const messages = [
      adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_A, read: false, is_own: false })),
      adaptMessengerMessage(
        createMessageDto({
          uuid: MESSAGE_B,
          read: false,
          is_own: false,
          created_at: DATE_LATER,
          updated_at: DATE_LATER,
        }),
      ),
    ];
    const hydrateFromCache = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A, MESSAGE_B],
        reactions: 0,
      }),
    );
    const syncOwner = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A, MESSAGE_B],
        reactions: 0,
      }),
    );

    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        isRequestCurrent: () => true,
        window: { ...createFetchedWindow(runtimeContext), messages },
        boundaryCache: {
          readReadBoundaries: () =>
            Promise.resolve([
              {
                ownerKey,
                streamUuid: STREAM_A,
                topicUuid: TOPIC_A,
                createdAt: DATE_LATER,
                messageUuid: MESSAGE_B,
              },
            ]),
        },
        ownReactionSync: { hydrateFromCache, syncOwner },
      }),
    ).resolves.toMatchObject({ status: "applied", anchorUuid: MESSAGE_A });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.read).toBe(true);
    expect(hydrateFromCache).toHaveBeenCalledWith(
      expect.objectContaining({ messageUuids: [MESSAGE_A, MESSAGE_B] }),
    );
    expect(syncOwner).toHaveBeenCalledWith(
      expect.objectContaining({ messageUuids: [MESSAGE_A, MESSAGE_B] }),
    );
  });

  it("publishes only M2 when M1 and M2 are applied in reverse intent order", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    let activeMessageUuid = MESSAGE_B;
    const messageB = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_B,
        created_at: DATE_LATER,
        updated_at: DATE_LATER,
      }),
    );
    const windowB = createFetchedWindow(runtimeContext, messageB);
    const windowA = createFetchedWindow(runtimeContext);

    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window: windowB,
        isRequestCurrent: () => activeMessageUuid === MESSAGE_B,
      }),
    ).resolves.toMatchObject({ status: "applied", anchorUuid: MESSAGE_B });
    activeMessageUuid = MESSAGE_B;
    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window: windowA,
        isRequestCurrent: () => activeMessageUuid === MESSAGE_A,
      }),
    ).resolves.toMatchObject({ status: "skipped" });

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        windowB.conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_B]);
  });

  it("keeps an applied result terminal while stale reaction hydration is discarded", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const hydration = createDeferred<{
      status: "applied";
      ownerKey: string;
      messageUuids: string[];
      reactions: number;
    }>();
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const firstLoading = applyMessengerMessageWindow({
      runtimeContext,
      window: createFetchedWindow(runtimeContext),
      isRequestCurrent: () => true,
      ownReactionSync: {
        hydrateFromCache: () => hydration.promise,
        syncOwner: vi.fn(() =>
          Promise.resolve({
            status: "applied" as const,
            ownerKey,
            messageUuids: [MESSAGE_A],
            reactions: 0,
          }),
        ),
      },
    });
    await vi.waitFor(() =>
      expect(
        useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.messageUuids,
      ).toEqual([MESSAGE_A]),
    );

    const secondLoading = applyMessengerMessageWindow({
      runtimeContext,
      window: createFetchedWindow(
        runtimeContext,
        adaptMessengerMessage(
          createMessageDto({
            uuid: MESSAGE_B,
            created_at: DATE_LATER,
            updated_at: DATE_LATER,
          }),
        ),
      ),
      isRequestCurrent: () => true,
      ownReactionSync: {
        hydrateFromCache: () =>
          Promise.resolve({
            status: "applied",
            ownerKey,
            messageUuids: [MESSAGE_B],
            reactions: 0,
          }),
        syncOwner: vi.fn(() =>
          Promise.resolve({
            status: "applied" as const,
            ownerKey,
            messageUuids: [MESSAGE_B],
            reactions: 0,
          }),
        ),
      },
    });
    await secondLoading;
    const staleWrite = vi.fn();
    const unsubscribe = useWorkspaceMessageStore.subscribe(staleWrite);
    hydration.resolve({
      status: "applied",
      ownerKey,
      messageUuids: [MESSAGE_A],
      reactions: 0,
    });

    await expect(firstLoading).resolves.toEqual({
      status: "applied",
      ownerKey,
      conversationId,
      anchorUuid: MESSAGE_A,
    });
    unsubscribe();
    expect(staleWrite).not.toHaveBeenCalled();
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.messageUuids,
    ).toEqual([MESSAGE_B]);
    expect(
      useWorkspaceMessageStore.getState().messagesLoadingByConversationId[conversationId],
    ).toBe(false);
  });

  it("discards a late server reaction sync after a newer window is applied", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const serverRows = createDeferred<WorkspaceMessengerMessageReactionDto[]>();
    const staleSyncFinished = createDeferred<void>();
    const replaceOwnMessageReactionsForOwner = vi.fn(() => Promise.resolve());
    const getMessageReactions = vi.fn(() => serverRows.promise);
    const messageB = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_B,
        created_at: DATE_LATER,
        updated_at: DATE_LATER,
      }),
    );
    const ownReactionSync = {
      hydrateFromCache: () =>
        Promise.resolve({
          status: "applied" as const,
          ownerKey,
          messageUuids: [MESSAGE_A, MESSAGE_B],
          reactions: 0,
        }),
      syncOwner: (options: Parameters<typeof syncMessengerOwnerOwnMessageReactions>[0]) => {
        if (options.messageUuids.length === 1) {
          return Promise.resolve({
            status: "applied" as const,
            ownerKey,
            messageUuids: [MESSAGE_B],
            reactions: 0,
          });
        }
        return syncMessengerOwnerOwnMessageReactions({
          ...options,
          client: { getMessageReactions },
          cache: { replaceOwnMessageReactionsForOwner },
        }).finally(() => staleSyncFinished.resolve());
      },
    };
    const windowA = {
      ...createFetchedWindow(runtimeContext),
      messages: [createFetchedWindow(runtimeContext).messages[0]!, messageB],
    };

    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window: windowA,
        isRequestCurrent: () => true,
        ownReactionSync,
      }),
    ).resolves.toMatchObject({ status: "applied" });
    await vi.waitFor(() => expect(getMessageReactions).toHaveBeenCalledTimes(1));

    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window: createFetchedWindow(runtimeContext, messageB),
        isRequestCurrent: () => true,
        ownReactionSync,
      }),
    ).resolves.toMatchObject({ status: "applied" });
    useWorkspaceMessageStore.getState().setOwnMessageReaction(MESSAGE_B, "eyes", REACTION_B);

    serverRows.resolve([createReactionDto({ message_uuid: MESSAGE_B, emoji_name: "thumbs_up" })]);
    await staleSyncFinished.promise;

    expect(replaceOwnMessageReactionsForOwner).not.toHaveBeenCalled();
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.ownReactionUuidsByEmojiName,
    ).toEqual({ eyes: REACTION_B });
  });

  it("keeps the current apply guard until a late server reaction sync completes", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const serverRows = createDeferred<WorkspaceMessengerMessageReactionDto[]>();
    const syncFinished = createDeferred<void>();
    const replaceOwnMessageReactionsForOwner = vi.fn(() => Promise.resolve());
    const getMessageReactions = vi.fn(() => serverRows.promise);

    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window: createFetchedWindow(runtimeContext),
        isRequestCurrent: () => true,
        ownReactionSync: {
          hydrateFromCache: () =>
            Promise.resolve({
              status: "applied" as const,
              ownerKey,
              messageUuids: [MESSAGE_A],
              reactions: 0,
            }),
          syncOwner: (options) =>
            syncMessengerOwnerOwnMessageReactions({
              ...options,
              client: { getMessageReactions },
              cache: { replaceOwnMessageReactionsForOwner },
            }).finally(() => syncFinished.resolve()),
        },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    await vi.waitFor(() => expect(getMessageReactions).toHaveBeenCalledTimes(1));

    serverRows.resolve([createReactionDto()]);
    await syncFinished.promise;

    expect(replaceOwnMessageReactionsForOwner).toHaveBeenCalledTimes(1);
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({ thumbs_up: REACTION_A });
  });

  it("applies a fetched window only once", async () => {
    const runtimeContext = createRuntimeContext();
    const window = createFetchedWindow(runtimeContext);
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const hydrateFromCache = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 0,
      }),
    );
    const syncOwner = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 0,
      }),
    );

    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window,
        isRequestCurrent: () => true,
        ownReactionSync: { hydrateFromCache, syncOwner },
      }),
    ).resolves.toMatchObject({ status: "applied" });
    await expect(
      applyMessengerMessageWindow({
        runtimeContext,
        window,
        isRequestCurrent: () => true,
        ownReactionSync: { hydrateFromCache, syncOwner },
      }),
    ).resolves.toMatchObject({ status: "skipped" });
    expect(hydrateFromCache).toHaveBeenCalledTimes(1);
  });

  it("does not let an old apply boundary completion clear newer loading state or markers", async () => {
    const runtimeContext = createRuntimeContext();
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const boundaries = createDeferred<never[]>();
    let current = true;
    const oldApply = applyMessengerMessageWindow({
      runtimeContext,
      window: createFetchedWindow(runtimeContext),
      isRequestCurrent: () => current,
      boundaryCache: { readReadBoundaries: () => boundaries.promise },
    });
    current = false;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "new-before",
      afterPageMarker: "new-after",
    });
    boundaries.reject(new Error("old cache failed"));

    await expect(oldApply).resolves.toMatchObject({ status: "skipped" });
    const state = useWorkspaceMessageStore.getState();
    expect(state.conversationWindowsById[conversationId]).toMatchObject({
      beforePageMarker: "new-before",
      afterPageMarker: "new-after",
    });
  });

  it("applies a restored boundary to stale cached and server read flags", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const cached = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_A,
        read: false,
        is_own: false,
        created_at: DATE,
      }),
    );
    const result = await loadMessengerConversationMessages({
      runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      cache: {
        readReadBoundaries: () =>
          Promise.resolve([
            {
              ownerKey,
              streamUuid: STREAM_A,
              topicUuid: TOPIC_A,
              createdAt: DATE_LATER,
              messageUuid: MESSAGE_B,
            },
          ]),
        readConversationMessageWindow: () =>
          Promise.resolve({
            messages: [cached],
            nextPageMarker: null,
            hasMore: false,
          }),
        writeConversationMessagePage: vi.fn(),
      },
      client: {
        getMessagesPage: () =>
          Promise.resolve(
            createMessagesPage([
              createMessageDto({
                uuid: MESSAGE_B,
                read: false,
                is_own: false,
                created_at: DATE_LATER,
              }),
              createMessageDto({
                uuid: MESSAGE_C,
                read: false,
                is_own: false,
                created_at: DATE_LATEST,
              }),
            ]),
          ),
      },
    });

    expect(result.status).toBe("applied");
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.read).toBe(true);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_C]?.read).toBe(false);
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[`topic:${STREAM_A}:${TOPIC_A}`],
    ).toMatchObject({ mode: "tail" });
  });

  it("loads older message window pages with reverse chronological API sorting", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve({
        items: [
          createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
          createMessageDto({ uuid: MESSAGE_A, created_at: DATE, updated_at: DATE }),
        ],
        nextPageMarker: "older-next",
        pageLimit: 2,
      } satisfies MessengerCollectionPage<WorkspaceMessengerMessageDto>),
    );
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "older-cursor",
    });

    await expect(
      loadMessengerMessageWindowPage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId,
        boundary: captureBoundary(conversationId, "before"),
        pageLimit: 2,
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      conversationId,
      direction: "before",
      nextPageMarker: "older-next",
      pageLimit: 2,
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token-a" }),
      {
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        pageLimit: 2,
        pageMarker: "older-cursor",
        sortKey: "created_at",
        sortDir: "desc",
      },
    );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B]);
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.beforePageMarker,
    ).toBe("older-next");
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.afterPageMarker,
    ).toBeNull();
  });

  it("loads newer message window pages with ascending API sorting", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "older-still",
      afterPageMarker: "newer-cursor",
    });
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve({
        items: [
          createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
          createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST, updated_at: DATE_LATEST }),
        ],
        nextPageMarker: "newer-next",
        pageLimit: 2,
      } satisfies MessengerCollectionPage<WorkspaceMessengerMessageDto>),
    );

    await loadMessengerMessageWindowPage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId,
      boundary: captureBoundary(conversationId, "after"),
      pageLimit: 2,
      client: { getMessagesPage },
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token-a" }),
      {
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        pageLimit: 2,
        pageMarker: "newer-cursor",
        sortKey: "created_at",
        sortDir: "asc",
      },
    );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_B, MESSAGE_C]);
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.beforePageMarker,
    ).toBe("older-still");
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.afterPageMarker,
    ).toBe("newer-next");
  });

  it.each(["before", "after"] as const)(
    "stops %s page side effects if publishing the window aborts it",
    async (direction) => {
      const runtimeContext = createRuntimeContext();
      const ownerKey = prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const pageMarker = "anchor-page";
      replaceConversationWindow({
        conversationId,
        messages: [],
        mode: "around-anchor",
        beforePageMarker: direction === "before" ? pageMarker : null,
        afterPageMarker: direction === "after" ? pageMarker : null,
      });
      const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
        ownerKey,
        conversationId,
        projectId: PROJECT_A,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        authorUuid: USER_A,
        markdown: "own page receipt",
        status: "sending",
        includeStreamConversation: false,
      });
      const controller = new AbortController();
      const stopListening = useWorkspaceMessageStore.subscribe((state) => {
        if (state.messagesById[outgoing.placementUuid] != null) controller.abort();
      });
      const hydrateFromCache = vi.fn();
      const syncOwner = vi.fn();
      try {
        await expect(
          loadMessengerMessageWindowPage({
            runtimeContext,
            conversationId,
            boundary: captureBoundary(conversationId, direction),
            signal: controller.signal,
            client: {
              getMessagesPage: () =>
                Promise.resolve(
                  createMessagesPage([createMessageDto({ uuid: outgoing.placementUuid })]),
                ),
            },
            ownReactionSync: { hydrateFromCache, syncOwner },
          }),
        ).resolves.toMatchObject({ status: "skipped", reason: "stale-owner" });
        expect(
          useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[
            outgoing.placementUuid
          ],
        ).toBeDefined();
        expect(hydrateFromCache).not.toHaveBeenCalled();
        expect(syncOwner).not.toHaveBeenCalled();
        expect(
          selectWorkspaceMessageStatusForConversation(
            useWorkspaceMessageStore.getState(),
            conversationId,
          ).loading,
        ).toBe(false);
      } finally {
        stopListening();
      }
    },
  );

  it("applies a delayed newer anchor page after realtime changes the older edge", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const anchor = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER }),
    );
    const { conversationId } = anchor;
    replaceConversationWindow({
      conversationId,
      messages: [anchor],
      afterPageMarker: "newer",
      mode: "around-anchor",
      anchorMessageUuid: anchor.uuid,
    });
    const boundary = captureBoundary(conversationId, "after");
    const page = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const getMessagesPage = vi.fn(() => page.promise);
    const loading = loadMessengerMessageWindowPage({
      runtimeContext,
      conversationId,
      boundary,
      client: { getMessagesPage },
    });
    await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledOnce());
    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pageMarker: "newer", sortDir: "asc" }),
    );
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(adaptMessengerMessage(createMessageDto()));
    expect(captureBoundary(conversationId, "after")).toEqual(boundary);
    page.resolve(
      createMessagesPage([createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST })]),
    );

    await expect(loading).resolves.toMatchObject({ status: "applied", direction: "after" });
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toMatchObject({
      generation: boundary.generation,
      revision: 3,
      messageUuids: [MESSAGE_A, MESSAGE_B, MESSAGE_C],
      beforePageMarker: null,
      afterPageMarker: "next-page",
    });
  });

  it("includes realtime received while the final newer page is pending", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [adaptMessengerMessage(createMessageDto())],
      afterPageMarker: "newer-cursor",
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_A,
    });
    const pageRequest = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const syncReactions = () =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_B],
        reactions: 0,
      });
    const loading = loadMessengerMessageWindowPage({
      runtimeContext,
      conversationId,
      boundary: captureBoundary(conversationId, "after"),
      client: { getMessagesPage: () => pageRequest.promise },
      boundaryCache: { readReadBoundaries: () => Promise.resolve([]) },
      ownReactionSync: { hydrateFromCache: syncReactions, syncOwner: syncReactions },
    });
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(
        adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_C, created_at: DATE_LATEST })),
      );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A]);

    pageRequest.resolve({
      items: [createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER })],
      nextPageMarker: null,
      pageLimit: 50,
    });

    await expect(loading).resolves.toMatchObject({ status: "applied", nextPageMarker: null });
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B, MESSAGE_C]);
  });

  it("returns a failed page result when post-fetch reaction sync throws", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "older-cursor",
    });

    await expect(
      loadMessengerMessageWindowPage({
        runtimeContext,
        conversationId,
        boundary: captureBoundary(conversationId, "before"),
        client: {
          getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])),
        },
        ownReactionSync: {
          hydrateFromCache: () =>
            Promise.resolve({
              status: "applied",
              ownerKey,
              messageUuids: [MESSAGE_A],
              reactions: 0,
            }),
          syncOwner: () => {
            throw new Error("reaction sync failed");
          },
        },
      }),
    ).resolves.toEqual({
      status: "failed",
      ownerKey,
      conversationId,
      direction: "before",
      error: "reaction sync failed",
    });
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ),
    ).toMatchObject({ loading: false, error: "reaction sync failed" });
  });

  it("does not let an old post-fetch failure clear a newer page request", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "older-cursor",
    });
    const oldHydration = createDeferred<{
      status: "applied";
      ownerKey: string;
      messageUuids: string[];
      reactions: number;
    }>();
    const oldSyncOwner = vi.fn(() => {
      throw new Error("old reaction sync failed");
    });
    const oldRequest = loadMessengerMessageWindowPage({
      runtimeContext,
      conversationId,
      boundary: captureBoundary(conversationId, "before"),
      client: {
        getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])),
      },
      ownReactionSync: {
        hydrateFromCache: () => oldHydration.promise,
        syncOwner: oldSyncOwner,
      },
    });
    await vi.waitFor(() =>
      expect(
        useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]
          ?.beforePageMarker,
      ).toBe("next-page"),
    );

    const newerPage = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const newerRequest = loadMessengerMessageWindowPage({
      runtimeContext,
      conversationId,
      boundary: captureBoundary(conversationId, "before"),
      client: { getMessagesPage: () => newerPage.promise },
    });

    oldHydration.resolve({
      status: "applied",
      ownerKey,
      messageUuids: [MESSAGE_A],
      reactions: 0,
    });
    await expect(oldRequest).resolves.toMatchObject({
      status: "skipped",
      reason: "stale-owner",
    });
    expect(oldSyncOwner).not.toHaveBeenCalled();
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ),
    ).toMatchObject({ loading: true, error: null });

    newerPage.resolve(
      createMessagesPage([
        createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
      ]),
    );
    await expect(newerRequest).resolves.toMatchObject({ status: "applied" });
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ),
    ).toMatchObject({ loading: false, error: null });
  });

  it("keeps background page reaction sync current without holding its loading state", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "older-cursor",
    });
    const controller = new AbortController();
    const background =
      createDeferred<Awaited<ReturnType<typeof syncMessengerOwnerOwnMessageReactions>>>();
    const syncOwner = vi.fn<typeof syncMessengerOwnerOwnMessageReactions>(() => background.promise);
    const reactionResult = {
      status: "applied" as const,
      ownerKey,
      messageUuids: [MESSAGE_A],
      reactions: 0,
    };

    await expect(
      loadMessengerMessageWindowPage({
        runtimeContext,
        conversationId,
        boundary: captureBoundary(conversationId, "before"),
        signal: controller.signal,
        client: {
          getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])),
        },
        ownReactionSync: {
          hydrateFromCache: () => Promise.resolve(reactionResult),
          syncOwner,
        },
      }),
    ).resolves.toMatchObject({ status: "applied" });

    expect(
      useWorkspaceMessageStore.getState().messagesLoadingByConversationId[conversationId],
    ).toBe(false);
    const isRequestCurrent = syncOwner.mock.calls[0]?.[0].isRequestCurrent;
    expect(isRequestCurrent?.()).toBe(true);
    controller.abort();
    expect(isRequestCurrent?.()).toBe(false);
    background.resolve(reactionResult);
    await background.promise;
  });

  it("does not apply a late page after a newer anchor window owns the conversation", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "stale-page",
    });
    const page = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const controller = new AbortController();
    const pageRequest = loadMessengerMessageWindowPage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId,
      boundary: captureBoundary(conversationId, "before"),
      client: { getMessagesPage: () => page.promise },
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(true),
    );

    const messageB = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
    );
    replaceConversationWindow({
      conversationId,
      messages: [messageB],
      beforePageMarker: "before-page",
      afterPageMarker: "after-page",
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_B,
    });
    page.resolve(createMessagesPage([createMessageDto({ uuid: MESSAGE_A })]));

    await expect(pageRequest).resolves.toMatchObject({
      status: "skipped",
      reason: "stale-window",
    });
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_B]);
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.beforePageMarker,
    ).toBe("before-page");
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.afterPageMarker,
    ).toBe("after-page");
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toMatchObject({
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_B,
    });
  });

  it("releases history loading ownership when the conversation cache read fails", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const getMessagesPage = vi.fn(() => Promise.resolve(createMessagesPage([])));

    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId,
        cache: {
          readConversationMessageWindow: () => Promise.reject(new Error("cache unavailable")),
          writeConversationMessagePage: () => undefined,
        },
        client: { getMessagesPage },
      }),
    ).rejects.toThrow("cache unavailable");

    expect(getMessagesPage).not.toHaveBeenCalled();
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).loading,
    ).toBe(false);
  });

  it("loads stream messages with an explicit default page limit", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createMessagesPage([createMessageDto()])),
    );

    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `stream:${STREAM_A}`,
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      conversationId: `stream:${STREAM_A}`,
      nextPageMarker: "next-page",
      hasMore: true,
      pageLimit: 50,
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      {
        streamUuid: STREAM_A,
        pageLimit: 50,
        pageMarker: undefined,
        sortKey: "created_at",
        sortDir: "desc",
      },
    );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `stream:${STREAM_A}`,
      ),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_A })]);
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        `stream:${STREAM_A}`,
      ),
    ).toEqual({
      loading: false,
      error: null,
      nextPageMarker: "next-page",
      hasMore: true,
    });
  });

  it("replaces a cached tail with the current server tail", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const cachedMessage = adaptMessengerMessage(
      createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
    );
    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({
              messages: [cachedMessage],
              nextPageMarker: "cached-before",
              hasMore: true,
            }),
          writeConversationMessagePage: () => undefined,
        },
        client: {
          getMessagesPage: () =>
            Promise.resolve({
              items: [createMessageDto({ uuid: MESSAGE_A })],
              nextPageMarker: "server-before",
              pageLimit: 50,
            }),
        },
      }),
    ).resolves.toMatchObject({ status: "applied" });

    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[`topic:${STREAM_A}:${TOPIC_A}`],
    ).toMatchObject({
      mode: "tail",
      anchorMessageUuid: null,
      messageUuids: [MESSAGE_A],
      beforePageMarker: "server-before",
      afterPageMarker: null,
    });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]).toEqual(
      expect.objectContaining({ uuid: MESSAGE_B }),
    );
  });

  it("loads topic messages with stream and topic filters", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "cursor-a",
    });
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createMessagesPage([createMessageDto()])),
    );

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId,
      pageLimit: 25,
      boundary: captureBoundary(conversationId, "before"),
      client: { getMessagesPage },
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token-a" }),
      {
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        pageLimit: 25,
        pageMarker: "cursor-a",
        sortKey: "created_at",
        sortDir: "desc",
      },
    );
    expect(
      selectWorkspaceMessagesForConversation(useWorkspaceMessageStore.getState(), conversationId),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_A })]);
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ),
    ).toEqual({
      loading: false,
      error: null,
      nextPageMarker: "next-page",
      hasMore: true,
    });
  });

  it("hydrates own reaction projection from cached visible messages and schedules owner sync", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const cachedMessage = adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_A }));
    const hydrateFromCache = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 1,
      }),
    );
    const syncOwner = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 1,
      }),
    );

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      cache: {
        readConversationMessageWindow: () =>
          Promise.resolve({
            messages: [cachedMessage],
            nextPageMarker: "cached-next",
            hasMore: true,
          }),
        writeConversationMessagePage: () => undefined,
      },
      client: { getMessagesPage: () => Promise.resolve(createMessagesPage([])) },
      ownReactionSync: {
        hydrateFromCache,
        syncOwner,
      },
    });

    expect(hydrateFromCache).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
        messageUuids: [MESSAGE_A],
      }),
    );
    expect(syncOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
        messageUuids: [MESSAGE_A],
      }),
    );
  });

  it("keeps the conversation that is already on screen while it reloads", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const first = createMessageDto({ uuid: MESSAGE_A });
    const second = createMessageDto({ uuid: MESSAGE_B, created_at: "2026-07-28T11:00:00Z" });

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId,
      cache: {
        readConversationMessageWindow: () =>
          Promise.resolve({ messages: [], nextPageMarker: null, hasMore: false }),
        writeConversationMessagePage: () => undefined,
      },
      client: { getMessagesPage: () => Promise.resolve(createMessagesPage([first, second])) },
    });
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B]);

    // The cache holds less than what the reader is looking at, and the server page
    // is still in flight: the list must not collapse to the cached remnant.
    const pendingPage = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const reload = loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId,
      cache: {
        readConversationMessageWindow: () =>
          Promise.resolve({
            messages: [adaptMessengerMessage(second)],
            nextPageMarker: null,
            hasMore: false,
          }),
        writeConversationMessagePage: () => undefined,
      },
      client: { getMessagesPage: () => pendingPage.promise },
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B]);

    pendingPage.resolve(createMessagesPage([first, second]));
    await reload;
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B]);
  });

  it("schedules cached visible owner sync before a failed server page", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const cachedMessage = adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_A }));
    const hydrateFromCache = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 1,
      }),
    );
    const syncOwner = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 1,
      }),
    );

    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({
              messages: [cachedMessage],
              nextPageMarker: "cached-next",
              hasMore: true,
            }),
          writeConversationMessagePage: () => undefined,
        },
        client: { getMessagesPage: () => Promise.reject(new Error("server failed")) },
        ownReactionSync: {
          hydrateFromCache,
          syncOwner,
        },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      ownerKey,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      error: "server failed",
    });

    const state = useWorkspaceMessageStore.getState();
    expect(selectWorkspaceMessagesForConversation(state, cachedMessage.conversationId)).toEqual([
      cachedMessage,
    ]);
    expect(
      selectWorkspaceMessageStatusForConversation(state, cachedMessage.conversationId),
    ).toEqual({
      loading: false,
      error: "server failed",
      hasMore: true,
      nextPageMarker: "cached-next",
    });
    expect(hydrateFromCache).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
        messageUuids: [MESSAGE_A],
      }),
    );
    expect(syncOwner).toHaveBeenCalledTimes(1);
    expect(syncOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
        messageUuids: [MESSAGE_A],
      }),
    );
  });

  it("does not schedule a second owner sync when cached and server visible messages match", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const cachedMessage = adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_A }));
    const hydrateFromCache = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 1,
      }),
    );
    const syncOwner = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 1,
      }),
    );

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      cache: {
        readConversationMessageWindow: () =>
          Promise.resolve({
            messages: [cachedMessage],
            nextPageMarker: "cached-next",
            hasMore: true,
          }),
        writeConversationMessagePage: () => undefined,
      },
      client: {
        getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])),
      },
      ownReactionSync: {
        hydrateFromCache,
        syncOwner,
      },
    });

    expect(hydrateFromCache).toHaveBeenCalledTimes(1);
    expect(syncOwner).toHaveBeenCalledTimes(1);
    expect(syncOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuids: [MESSAGE_A],
      }),
    );
  });

  it("hydrates and syncs own reactions for the server-visible page", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const hydrateFromCache = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A, MESSAGE_B],
        reactions: 0,
      }),
    );
    const syncOwner = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A, MESSAGE_B],
        reactions: 0,
      }),
    );

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      cache: {
        readConversationMessageWindow: () =>
          Promise.resolve({ messages: [], nextPageMarker: null, hasMore: false }),
        writeConversationMessagePage: () => undefined,
      },
      client: {
        getMessagesPage: () =>
          Promise.resolve(
            createMessagesPage([
              createMessageDto({ uuid: MESSAGE_A }),
              createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER }),
            ]),
          ),
      },
      ownReactionSync: {
        hydrateFromCache,
        syncOwner,
      },
    });

    expect(hydrateFromCache).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuids: [MESSAGE_A, MESSAGE_B],
      }),
    );
    expect(syncOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuids: [MESSAGE_A, MESSAGE_B],
      }),
    );
  });

  it.each(["update", "delete"] as const)(
    "does not persist the stale HTTP body after a realtime %s during reaction sync",
    async (mutation) => {
      const runtimeContext = createRuntimeContext();
      prepareStoreOwner(runtimeContext);
      const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
      const reactionHydration = createDeferred<{
        status: "applied";
        ownerKey: string;
        messageUuids: string[];
        reactions: number;
      }>();
      const writeConversationMessagePage = vi.fn();
      const loading = loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({ messages: [], nextPageMarker: null, hasMore: false }),
          writeConversationMessagePage,
        },
        client: {
          getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])),
        },
        ownReactionSync: {
          hydrateFromCache: () => reactionHydration.promise,
          syncOwner: () =>
            Promise.resolve({
              status: "applied",
              ownerKey,
              messageUuids: [MESSAGE_A],
              reactions: 0,
            }),
        },
      });
      await vi.waitFor(() =>
        expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]).toBeDefined(),
      );

      if (mutation === "update") {
        useWorkspaceMessageStore
          .getState()
          .applyLiveKnownBodyMutation(
            adaptMessengerMessage(
              createMessageDto({ payload: { kind: "markdown", content: "Realtime body" } }),
            ),
          );
      } else {
        useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);
      }
      reactionHydration.resolve({
        status: "applied",
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 0,
      });
      await loading;

      if (mutation === "delete") {
        expect(writeConversationMessagePage).not.toHaveBeenCalled();
      } else {
        expect(writeConversationMessagePage).toHaveBeenCalledWith(
          ownerKey,
          `topic:${STREAM_A}:${TOPIC_A}`,
          expect.objectContaining({
            messages: [
              expect.objectContaining({
                uuid: MESSAGE_A,
                payload: { kind: "markdown", content: "Realtime body" },
              }),
            ],
          }),
          expect.any(Function),
        );
      }
    },
  );

  it("merges later message pages into the same conversation bucket", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const getMessagesPage = vi
      .fn()
      .mockResolvedValueOnce(createMessagesPage([createMessageDto({ uuid: MESSAGE_A })]))
      .mockResolvedValueOnce({
        items: [
          createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
        ],
        nextPageMarker: null,
        pageLimit: 50,
      } satisfies MessengerCollectionPage<WorkspaceMessengerMessageDto>);
    const cachedMessage = adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_A }));
    const cache = {
      readConversationMessageWindow: vi
        .fn()
        .mockResolvedValueOnce({ messages: [], nextPageMarker: null, hasMore: false })
        .mockResolvedValueOnce({
          messages: [cachedMessage],
          nextPageMarker: "next-page",
          hasMore: true,
        }),
      writeConversationMessagePage: () => undefined,
    };

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      client: { getMessagesPage },
      cache,
    });
    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      boundary: captureBoundary(`topic:${STREAM_A}:${TOPIC_A}`, "before"),
      client: { getMessagesPage },
      cache,
    });

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B]);
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual({
      loading: false,
      error: null,
      nextPageMarker: null,
      hasMore: false,
    });
  });

  it("merges overlapping history pages without duplicates in created order", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const getMessagesPage = vi
      .fn()
      .mockResolvedValueOnce(
        createMessagesPage([
          createMessageDto({
            uuid: MESSAGE_B,
            payload: { kind: "markdown", content: "Later first page" },
            created_at: DATE_LATER,
            updated_at: DATE_LATER,
          }),
        ]),
      )
      .mockResolvedValueOnce({
        items: [
          createMessageDto({ uuid: MESSAGE_A }),
          createMessageDto({
            uuid: MESSAGE_B,
            payload: { kind: "markdown", content: "Edited overlap" },
            created_at: DATE_LATER,
            updated_at: DATE_LATER,
          }),
        ],
        nextPageMarker: null,
        pageLimit: 50,
      } satisfies MessengerCollectionPage<WorkspaceMessengerMessageDto>);
    const cachedMessage = adaptMessengerMessage(
      createMessageDto({
        uuid: MESSAGE_B,
        payload: { kind: "markdown", content: "Later first page" },
        created_at: DATE_LATER,
        updated_at: DATE_LATER,
      }),
    );
    const cache = {
      readConversationMessageWindow: vi
        .fn()
        .mockResolvedValueOnce({ messages: [], nextPageMarker: null, hasMore: false })
        .mockResolvedValueOnce({
          messages: [cachedMessage],
          nextPageMarker: "next-page",
          hasMore: true,
        }),
      writeConversationMessagePage: () => undefined,
    };

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      client: { getMessagesPage },
      cache,
    });
    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      boundary: captureBoundary(`topic:${STREAM_A}:${TOPIC_A}`, "before"),
      client: { getMessagesPage },
      cache,
    });

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ).map((message) => [message.uuid, readMarkdownPayload(message.payload)]),
    ).toEqual([
      [MESSAGE_A, "Hello, workspace"],
      [MESSAGE_B, "Edited overlap"],
    ]);
  });

  it("preserves live messages when the initial history page resolves later", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const messagesRequest = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const loading = loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      client: { getMessagesPage: () => messagesRequest.promise },
    });

    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(
        adaptMessengerMessage(
          createMessageDto({ uuid: MESSAGE_B, created_at: DATE_LATER, updated_at: DATE_LATER }),
        ),
      );
    messagesRequest.resolve(createMessagesPage([createMessageDto({ uuid: MESSAGE_A })]));

    await expect(loading).resolves.toMatchObject({
      status: "applied",
      ownerKey,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
    });
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A]);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]).toEqual(
      expect.objectContaining({ uuid: MESSAGE_B }),
    );
  });

  it("keeps stream-wide and topic message buckets separate while sharing message objects", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `stream:${STREAM_A}`,
      client: { getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])) },
    });
    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      client: { getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])) },
    });

    const state = useWorkspaceMessageStore.getState();
    expect(selectWorkspaceMessagesForConversation(state, `stream:${STREAM_A}`)).toEqual([
      state.messagesById[MESSAGE_A],
    ]);
    expect(selectWorkspaceMessagesForConversation(state, `topic:${STREAM_A}:${TOPIC_A}`)).toEqual([
      state.messagesById[MESSAGE_A],
    ]);
  });

  it("does not clear messages for other conversations", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      client: { getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])) },
    });
    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_B}:${TOPIC_B}`,
      client: {
        getMessagesPage: () =>
          Promise.resolve(
            createMessagesPage([
              createMessageDto({
                uuid: MESSAGE_B,
                stream_uuid: STREAM_B,
                topic_uuid: TOPIC_B,
              }),
            ]),
          ),
      },
    });

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_A })]);
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_B}:${TOPIC_B}`,
      ),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_B })]);
  });

  it("skips store writes when owner becomes stale after awaiting messages", async () => {
    let currentContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(currentContext);
    const messagesRequest = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();

    const loading = loadMessengerConversationMessages({
      runtimeContext: currentContext,
      getRuntimeContext: () => currentContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      client: { getMessagesPage: () => messagesRequest.promise },
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
    messagesRequest.resolve(createMessagesPage([createMessageDto()]));

    await expect(loading).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([]);
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ).loading,
    ).toBe(false);
  });

  it("skips aborted requests without writing messages", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const abortController = new AbortController();
    abortController.abort();
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createMessagesPage([createMessageDto()])),
    );

    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        signal: abortController.signal,
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });

    expect(getMessagesPage).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById).toEqual({});
  });

  it("skips invalid conversation ids without writing messages", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createMessagesPage([createMessageDto()])),
    );

    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: "dm:alice",
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "invalid-conversation",
    });

    expect(getMessagesPage).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById).toEqual({});
  });

  it("returns a failed result when message parsing fails", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);

    await expect(
      loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        client: {
          getMessagesPage: () =>
            Promise.reject(
              new TypeError("Expected valid messenger messages response item at index 1"),
            ),
        },
      }),
    ).resolves.toEqual({
      status: "failed",
      ownerKey,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      error: "Expected valid messenger messages response item at index 1",
    });
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual({
      loading: false,
      error: "Expected valid messenger messages response item at index 1",
      nextPageMarker: null,
      hasMore: false,
    });
  });
});

function readMarkdownPayload(payload: MessengerMessagePayload | undefined): string | undefined {
  return payload?.kind === "markdown" ? payload.content : undefined;
}
