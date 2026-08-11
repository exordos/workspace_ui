import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  deleteMessengerCachedMessage,
  readMessengerMessageBodyCache,
  writeMessengerMessageBodyCache,
} from "./messenger-cache.lib";
import { conversationIdForStream } from "./messenger-ids.lib";
import { loadMessengerQuoteMessage } from "./messenger-quote-loader.lib";
import {
  advanceMessengerReadBoundary,
  clearMessengerReadBoundariesForOwner,
} from "./messenger-read-boundary.lib";

const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const OTHER_MESSAGE_UUID = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";

function runtimeContext(): WorkspaceRuntimeContext {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "organization-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: "22222222-2222-4222-8222-222222222222",
    userUuid: "11111111-1111-4111-8111-111111111111",
    accessToken: "token",
    runtimeGeneration: 1,
  };
}

function messageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_UUID,
    project_id: "22222222-2222-4222-8222-222222222222",
    stream_uuid: "75309057-419c-4b12-a7c1-3932429ec4a6",
    topic_uuid: "4ec0b996-b778-45f8-8ef4-ef863be0c047",
    author_uuid: "11111111-1111-4111-8111-111111111111",
    user_uuid: "11111111-1111-4111-8111-111111111111",
    payload: { kind: "markdown", content: "Cached body" },
    read: true,
    pinned: false,
    starred: false,
    is_own: false,
    reactions: {},
    reaction_users: {},
    created_at: "2026-07-28T10:00:00Z",
    updated_at: "2026-07-28T10:00:00Z",
    ...overrides,
  };
}

function createStore(initialMessages: ReturnType<typeof adaptMessengerMessage>[] = []) {
  const messagesById = Object.fromEntries(
    initialMessages.map((message) => [message.uuid, message]),
  );
  const upsertMessage = vi.fn((message: ReturnType<typeof adaptMessengerMessage>) => {
    messagesById[message.uuid] = message;
  });
  const upsertMessageBody = vi.fn((message: ReturnType<typeof adaptMessengerMessage>) => {
    messagesById[message.uuid] = message;
  });
  const upsertMessageBodyFromSnapshot = vi.fn(
    (message: ReturnType<typeof adaptMessengerMessage>) => {
      upsertMessageBody(message);
      return true;
    },
  );
  const removeMessage = vi.fn((messageUuid: string) => {
    delete messagesById[messageUuid];
  });
  const removeMessageFromSnapshot = vi.fn((messageUuid: string) => {
    removeMessage(messageUuid);
    return true;
  });
  return {
    messagesById,
    upsertMessage,
    upsertMessageBody,
    removeMessage,
    store: {
      getState: () => ({
        messagesById,
        messageMutationRevision: 0,
        upsertMessageBodyFromSnapshot,
        removeMessageFromSnapshot,
      }),
    },
  };
}

describe("loadMessengerQuoteMessage", () => {
  it("restores cache before refreshing the same UUID from the server", async () => {
    const context = runtimeContext();
    const cached = adaptMessengerMessage(messageDto());
    const order: string[] = [];
    const store = createStore();
    store.upsertMessageBody.mockImplementation((message) => {
      order.push("store");
      store.messagesById[message.uuid] = message;
    });
    const getMessagesByUuids = vi.fn(() => {
      order.push("server");
      return Promise.resolve([messageDto()]);
    });

    const result = await loadMessengerQuoteMessage({
      runtimeContext: context,
      getRuntimeContext: () => context,
      messageUuid: MESSAGE_UUID,
      cache: {
        readMessageBodies: () => {
          order.push("cache");
          return Promise.resolve([cached]);
        },
        writeMessageBodies: vi.fn(),
        deleteMessage: vi.fn(),
      },
      client: { getMessagesByUuids },
      store: store.store,
    });

    expect(order).toEqual(["cache", "store", "server", "store"]);
    expect(result).toEqual({ status: "resolved", message: cached, source: "server" });
    expect(getMessagesByUuids).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: context.projectId }),
      [MESSAGE_UUID],
    );
  });

  it("stores a loaded quote body without adding it to a visible conversation bucket", async () => {
    const context = runtimeContext();
    const message = adaptMessengerMessage(messageDto());
    useWorkspaceMessageStore.getState().clear();

    try {
      await expect(
        loadMessengerQuoteMessage({
          runtimeContext: context,
          getRuntimeContext: () => context,
          messageUuid: MESSAGE_UUID,
          client: { getMessagesByUuids: () => Promise.resolve([messageDto()]) },
        }),
      ).resolves.toEqual({ status: "resolved", message, source: "server" });

      const state = useWorkspaceMessageStore.getState();
      expect(state.messagesById[MESSAGE_UUID]).toEqual(message);
      expect(
        state.conversationWindowsById[message.conversationId]?.messageUuids ?? [],
      ).not.toContain(MESSAGE_UUID);
      expect(
        state.conversationWindowsById[conversationIdForStream(message.streamUuid)]?.messageUuids ??
          [],
      ).not.toContain(MESSAGE_UUID);
    } finally {
      useWorkspaceMessageStore.getState().clear();
    }
  });

  it("applies the read boundary to cached and refreshed quote messages", async () => {
    const context = runtimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(context);
    const unreadMessage = adaptMessengerMessage(messageDto({ read: false }));
    const store = createStore();
    advanceMessengerReadBoundary({
      ownerKey,
      streamUuid: unreadMessage.streamUuid,
      topicUuid: unreadMessage.topicUuid,
      createdAt: "2026-07-28T11:00:00Z",
      messageUuid: OTHER_MESSAGE_UUID,
    });

    try {
      const result = await loadMessengerQuoteMessage({
        runtimeContext: context,
        getRuntimeContext: () => context,
        messageUuid: MESSAGE_UUID,
        cache: {
          readMessageBodies: () => Promise.resolve([unreadMessage]),
          writeMessageBodies: vi.fn(),
          deleteMessage: vi.fn(),
        },
        client: { getMessagesByUuids: () => Promise.resolve([messageDto({ read: false })]) },
        store: store.store,
      });

      expect(store.upsertMessageBody).toHaveBeenCalledTimes(2);
      expect(store.upsertMessageBody).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ read: true }),
      );
      expect(store.upsertMessageBody).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ read: true }),
      );
      expect(result).toEqual({
        status: "resolved",
        message: expect.objectContaining({ read: true }),
        source: "server",
      });
    } finally {
      clearMessengerReadBoundariesForOwner(ownerKey);
    }
  });

  it("does not write cache results after the runtime owner changes", async () => {
    const context = runtimeContext();
    let currentContext: WorkspaceRuntimeContext | null = context;
    let releaseCache: ((value: ReturnType<typeof adaptMessengerMessage>[]) => void) | undefined;
    const cacheRead = new Promise<ReturnType<typeof adaptMessengerMessage>[]>((resolve) => {
      releaseCache = resolve;
    });
    const store = createStore();
    const getMessagesByUuids = vi.fn();
    const loading = loadMessengerQuoteMessage({
      runtimeContext: context,
      getRuntimeContext: () => currentContext,
      messageUuid: MESSAGE_UUID,
      cache: {
        readMessageBodies: () => cacheRead,
        writeMessageBodies: vi.fn(),
        deleteMessage: vi.fn(),
      },
      client: { getMessagesByUuids },
      store: store.store,
    });

    currentContext = { ...context, runtimeGeneration: 2 };
    releaseCache?.([adaptMessengerMessage(messageDto())]);

    await expect(loading).resolves.toEqual({ status: "stale" });
    expect(store.upsertMessageBody).not.toHaveBeenCalled();
    expect(getMessagesByUuids).not.toHaveBeenCalled();
  });

  it("returns unavailable when neither cache nor server has the message", async () => {
    const context = runtimeContext();
    const store = createStore();
    await expect(
      loadMessengerQuoteMessage({
        runtimeContext: context,
        getRuntimeContext: () => context,
        messageUuid: "78105b9e-f1ac-41f1-baf5-2975486cc7dc",
        cache: {
          readMessageBodies: () => Promise.resolve([]),
          writeMessageBodies: vi.fn(),
          deleteMessage: vi.fn(),
        },
        client: { getMessagesByUuids: () => Promise.resolve([]) },
        store: store.store,
      }),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("does not remove a realtime-created body when an older quote request misses", async () => {
    const context = runtimeContext();
    const serverResponse = new Promise<WorkspaceMessengerMessageDto[]>((resolve) => {
      queueMicrotask(() => {
        useWorkspaceMessageStore
          .getState()
          .applyLiveCreatedMessage(
            adaptMessengerMessage(
              messageDto({ payload: { kind: "markdown", content: "Realtime" } }),
            ),
          );
        resolve([]);
      });
    });
    useWorkspaceMessageStore.getState().clear();

    await loadMessengerQuoteMessage({
      runtimeContext: context,
      getRuntimeContext: () => context,
      messageUuid: MESSAGE_UUID,
      cache: {
        readMessageBodies: () => Promise.resolve([]),
        writeMessageBodies: vi.fn(),
        deleteMessage: vi.fn(),
      },
      client: { getMessagesByUuids: () => serverResponse },
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]?.payload.content).toBe(
      "Realtime",
    );
  });

  it("refreshes an active-store hit without restoring an older cache value", async () => {
    const context = runtimeContext();
    const active = adaptMessengerMessage(messageDto());
    const freshDto = messageDto({
      payload: { kind: "markdown", content: "Fresh server body" },
      updated_at: "2026-07-28T11:00:00Z",
    });
    const store = createStore([active]);
    const readMessageBodies = vi.fn(() => Promise.resolve([]));
    const getMessagesByUuids = vi.fn(() => Promise.resolve([freshDto]));

    const result = await loadMessengerQuoteMessage({
      runtimeContext: context,
      getRuntimeContext: () => context,
      messageUuid: MESSAGE_UUID,
      cache: {
        readMessageBodies,
        writeMessageBodies: vi.fn(),
        deleteMessage: vi.fn(),
      },
      client: { getMessagesByUuids },
      store: store.store,
    });

    expect(readMessageBodies).not.toHaveBeenCalled();
    expect(getMessagesByUuids).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: "resolved",
      message: expect.objectContaining({ payload: freshDto.payload }),
      source: "server",
    });
    expect(store.messagesById[MESSAGE_UUID]?.payload.content).toBe("Fresh server body");
  });

  it("removes stale store and cache data after a successful authoritative miss", async () => {
    const context = runtimeContext();
    const stale = adaptMessengerMessage(messageDto());
    const store = createStore();
    const deleteMessage = vi.fn(() => Promise.resolve());
    const readMessageBodies = vi.fn(() => Promise.resolve([stale]));

    const result = await loadMessengerQuoteMessage({
      runtimeContext: context,
      getRuntimeContext: () => context,
      messageUuid: MESSAGE_UUID,
      cache: {
        readMessageBodies,
        writeMessageBodies: vi.fn(),
        deleteMessage,
      },
      client: { getMessagesByUuids: () => Promise.resolve([]) },
      store: store.store,
    });

    expect(result).toEqual({ status: "unavailable" });
    expect(readMessageBodies).toHaveBeenCalledOnce();
    expect(store.upsertMessageBody).toHaveBeenCalledWith(stale);
    expect(store.removeMessage).toHaveBeenCalledWith(MESSAGE_UUID);
    expect(store.messagesById[MESSAGE_UUID]).toBeUndefined();
    expect(deleteMessage).toHaveBeenCalledWith(workspaceRuntimeOwnerKey(context), MESSAGE_UUID, []);
  });

  it("removes a topic message body without creating visible membership after a server miss", async () => {
    const context = runtimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(context);
    const stale = adaptMessengerMessage(messageDto());
    const other = adaptMessengerMessage(
      messageDto({
        uuid: OTHER_MESSAGE_UUID,
        payload: { kind: "markdown", content: "Other message" },
      }),
    );
    useWorkspaceMessageStore.getState().clear();
    const messageState = useWorkspaceMessageStore.getState();
    messageState.upsertMessageBodyFromSnapshot(stale, messageState.messageMutationRevision);
    messageState.upsertMessageBodyFromSnapshot(other, messageState.messageMutationRevision);
    await deleteMessengerCachedMessage(ownerKey, MESSAGE_UUID, []);
    await deleteMessengerCachedMessage(ownerKey, OTHER_MESSAGE_UUID, []);
    await writeMessengerMessageBodyCache(ownerKey, [stale, other]);

    expect(await readMessengerMessageBodyCache(ownerKey, [MESSAGE_UUID])).toHaveLength(1);

    const result = await loadMessengerQuoteMessage({
      runtimeContext: context,
      getRuntimeContext: () => context,
      messageUuid: MESSAGE_UUID,
      client: { getMessagesByUuids: () => Promise.resolve([]) },
    });

    const state = useWorkspaceMessageStore.getState();
    expect(result).toEqual({ status: "unavailable" });
    expect(state.messagesById[MESSAGE_UUID]).toBeUndefined();
    expect(await readMessengerMessageBodyCache(ownerKey, [MESSAGE_UUID])).toEqual([]);
    expect(state.messagesById[OTHER_MESSAGE_UUID]).toEqual(other);
    expect(state.conversationWindowsById).toEqual({});
    expect(await readMessengerMessageBodyCache(ownerKey, [OTHER_MESSAGE_UUID])).toEqual([other]);
  });

  it("keeps a cached message when the server refresh fails", async () => {
    const context = runtimeContext();
    const cached = adaptMessengerMessage(messageDto());
    const store = createStore();
    const deleteMessage = vi.fn();

    const result = await loadMessengerQuoteMessage({
      runtimeContext: context,
      getRuntimeContext: () => context,
      messageUuid: MESSAGE_UUID,
      cache: {
        readMessageBodies: () => Promise.resolve([cached]),
        writeMessageBodies: vi.fn(),
        deleteMessage,
      },
      client: {
        getMessagesByUuids: () => Promise.reject(new Error("network unavailable")),
      },
      store: store.store,
    });

    expect(result).toEqual({ status: "resolved", message: cached, source: "cache" });
    expect(store.messagesById[MESSAGE_UUID]).toEqual(cached);
    expect(store.removeMessage).not.toHaveBeenCalled();
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it.each(["update", "delete"] as const)(
    "re-reads the current store after a quote refresh fails following realtime %s",
    async (mutation) => {
      const context = runtimeContext();
      const initial = adaptMessengerMessage(messageDto());
      useWorkspaceMessageStore.getState().clear();
      const initialState = useWorkspaceMessageStore.getState();
      initialState.upsertMessageBodyFromSnapshot(initial, initialState.messageMutationRevision);
      let rejectServer: (reason: unknown) => void = () => undefined;
      const serverResponse = new Promise<WorkspaceMessengerMessageDto[]>((_, reject) => {
        rejectServer = reject;
      });
      const loading = loadMessengerQuoteMessage({
        runtimeContext: context,
        getRuntimeContext: () => context,
        messageUuid: MESSAGE_UUID,
        client: { getMessagesByUuids: () => serverResponse },
      });

      if (mutation === "update") {
        useWorkspaceMessageStore
          .getState()
          .applyLiveKnownBodyMutation(
            adaptMessengerMessage(
              messageDto({ payload: { kind: "markdown", content: "Realtime body" } }),
            ),
          );
      } else {
        useWorkspaceMessageStore.getState().removeMessage(MESSAGE_UUID);
      }
      rejectServer(new Error("refresh failed"));
      const result = await loading;

      if (mutation === "update") {
        expect(result).toMatchObject({
          status: "resolved",
          message: { payload: { content: "Realtime body" } },
        });
      } else {
        expect(result.status).not.toBe("resolved");
        expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]).toBeUndefined();
      }
    },
  );

  it("does not let one caller abort a shared request used by another caller", async () => {
    const context = runtimeContext();
    const store = createStore();
    const controller = new AbortController();
    let resolveServer: ((messages: WorkspaceMessengerMessageDto[]) => void) | undefined;
    const serverResponse = new Promise<WorkspaceMessengerMessageDto[]>((resolve) => {
      resolveServer = resolve;
    });
    const options = {
      runtimeContext: context,
      getRuntimeContext: () => context,
      messageUuid: MESSAGE_UUID,
      cache: {
        readMessageBodies: () => Promise.resolve([]),
        writeMessageBodies: vi.fn(() => Promise.resolve()),
        deleteMessage: vi.fn(() => Promise.resolve()),
      },
      client: { getMessagesByUuids: () => serverResponse },
      store: store.store,
    };

    const callerA = loadMessengerQuoteMessage({ ...options, signal: controller.signal });
    const callerB = loadMessengerQuoteMessage(options);
    controller.abort();
    resolveServer?.([messageDto()]);

    await expect(callerA).resolves.toEqual({ status: "stale" });
    await expect(callerB).resolves.toEqual({
      status: "resolved",
      message: expect.objectContaining({ uuid: MESSAGE_UUID }),
      source: "server",
    });
    expect(store.messagesById[MESSAGE_UUID]).toBeDefined();
  });
});
