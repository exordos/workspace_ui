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
  const removeMessage = vi.fn((messageUuid: string) => {
    delete messagesById[messageUuid];
  });
  return {
    messagesById,
    upsertMessage,
    removeMessage,
    store: {
      getState: () => ({ messagesById, upsertMessage, removeMessage }),
    },
  };
}

describe("loadMessengerQuoteMessage", () => {
  it("restores cache before refreshing the same UUID from the server", async () => {
    const context = runtimeContext();
    const cached = adaptMessengerMessage(messageDto());
    const order: string[] = [];
    const store = createStore();
    store.upsertMessage.mockImplementation((message) => {
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
    expect(store.upsertMessage).not.toHaveBeenCalled();
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
    expect(store.upsertMessage).toHaveBeenCalledWith(stale);
    expect(store.removeMessage).toHaveBeenCalledWith(MESSAGE_UUID);
    expect(store.messagesById[MESSAGE_UUID]).toBeUndefined();
    expect(deleteMessage).toHaveBeenCalledWith(workspaceRuntimeOwnerKey(context), MESSAGE_UUID, []);
  });

  it("removes a topic message body and every real store/cache bucket after server miss", async () => {
    const context = runtimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(context);
    const stale = adaptMessengerMessage(messageDto());
    const other = adaptMessengerMessage(
      messageDto({
        uuid: OTHER_MESSAGE_UUID,
        payload: { kind: "markdown", content: "Other message" },
      }),
    );
    const streamConversationId = conversationIdForStream(stale.streamUuid);
    useWorkspaceMessageStore.getState().clear();
    useWorkspaceMessageStore.getState().upsertMessage(stale);
    useWorkspaceMessageStore.getState().upsertMessage(other);
    await deleteMessengerCachedMessage(ownerKey, MESSAGE_UUID, []);
    await deleteMessengerCachedMessage(ownerKey, OTHER_MESSAGE_UUID, []);
    await writeMessengerMessageBodyCache(ownerKey, [stale, other]);

    expect(
      useWorkspaceMessageStore.getState().messageIdsByConversationId[stale.conversationId],
    ).toContain(MESSAGE_UUID);
    expect(
      useWorkspaceMessageStore.getState().messageIdsByConversationId[streamConversationId],
    ).toContain(MESSAGE_UUID);
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
    expect(state.messageIdsByConversationId[stale.conversationId]).not.toContain(MESSAGE_UUID);
    expect(state.messageIdsByConversationId[streamConversationId]).not.toContain(MESSAGE_UUID);
    expect(await readMessengerMessageBodyCache(ownerKey, [MESSAGE_UUID])).toEqual([]);
    expect(state.messagesById[OTHER_MESSAGE_UUID]).toEqual(other);
    expect(state.messageIdsByConversationId[other.conversationId]).toContain(OTHER_MESSAGE_UUID);
    expect(state.messageIdsByConversationId[streamConversationId]).toContain(OTHER_MESSAGE_UUID);
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
