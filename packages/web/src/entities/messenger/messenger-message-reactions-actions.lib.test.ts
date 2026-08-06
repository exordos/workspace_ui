import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { MessengerApiError, type MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerCreateMessageReactionRequestBody,
  WorkspaceMessengerMessageReactionDto,
} from "~/shared/api/messenger.types";
import {
  addMessengerMessageReaction,
  createMessengerReactionAggregateRevalidateHandler,
  hydrateMessengerOwnMessageReactionsFromCache,
  removeMessengerMessageReaction,
  revalidateMessengerOwnMessageReactions,
  syncMessengerOwnerOwnMessageReactions,
  toggleMessengerMessageReaction,
} from "./messenger-message-reactions-actions.lib";
import type { MessengerOwnMessageReactionCacheRow } from "./messenger-cache.lib";
import type { MessengerMessage } from "./messenger.types";

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
const REACTION_A = "11111111-0000-4000-8000-000000000001";
const REACTION_B = "11111111-0000-4000-8000-000000000002";
const DATE = "2026-07-03T10:00:00Z";

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

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown?: string;
  payload?: MessengerMessage["payload"];
};

function createMessage(overrides: MessageOverrides = {}): MessengerMessage {
  const { markdown, payload, ...rest } = overrides;
  return {
    uuid: MESSAGE_A,
    conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
    projectId: PROJECT_A,
    streamUuid: STREAM_A,
    topicUuid: TOPIC_A,
    authorUuid: USER_A,
    userUuid: USER_A,
    payload: payload ?? { kind: "markdown", content: markdown ?? "Hello" },
    read: false,
    pinned: false,
    starred: false,
    isOwn: true,
    reactions: { thumbs_up: 1 },
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: DATE,
    updatedAt: DATE,
    ...rest,
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

function createCacheRow(
  overrides: Partial<MessengerOwnMessageReactionCacheRow> = {},
): MessengerOwnMessageReactionCacheRow {
  const ownerKey = workspaceRuntimeOwnerKey(createRuntimeContext());
  const messageUuid = overrides.messageUuid ?? MESSAGE_A;
  const emojiName = overrides.emojiName ?? "thumbs_up";
  return {
    id: `${ownerKey}:${messageUuid}:${emojiName}`,
    ownerKey,
    messageUuid,
    userUuid: USER_A,
    reactionUuid: REACTION_A,
    emojiName,
    createdAt: DATE,
    updatedAt: DATE,
    cacheUpdatedAt: 1,
    ...overrides,
  };
}

function indexMessages(...messages: MessengerMessage[]): void {
  for (const message of messages) {
    useWorkspaceMessageStore.getState().indexMessageIntoConversationBuckets(message);
  }
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

describe("messenger message reaction actions", () => {
  beforeEach(() => {
    useWorkspaceMessageStore.getState().clear();
  });

  it("hydrates visible own reactions from cache into the message store", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(createMessage(), createMessage({ uuid: MESSAGE_B, reactions: { eyes: 1 } }));
    const readOwnMessageReactions = vi.fn(() =>
      Promise.resolve([
        createCacheRow(),
        createCacheRow({
          messageUuid: MESSAGE_B,
          emojiName: "eyes",
          reactionUuid: REACTION_B,
        }),
      ]),
    );

    await expect(
      hydrateMessengerOwnMessageReactionsFromCache({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuids: [MESSAGE_A, MESSAGE_A, MESSAGE_B],
        cache: { readOwnMessageReactions },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      messageUuids: [MESSAGE_A, MESSAGE_B],
      reactions: 2,
    });

    expect(readOwnMessageReactions).toHaveBeenCalledWith(ownerKey, [MESSAGE_A, MESSAGE_B]);
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({ thumbs_up: REACTION_A });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.ownReactionUuidsByEmojiName,
    ).toEqual({ eyes: REACTION_B });
  });

  it("revalidates own reactions through Workspace API, writes cache, and applies store projection", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(createMessage());
    const replaceOwnMessageReactionsForMessage = vi.fn(() => Promise.resolve());
    const getMessageReactions = vi.fn(
      (_options: MessengerClientOptions, _query: { messageUuid?: string; userUuid?: string }) =>
        Promise.resolve([createReactionDto()]),
    );

    await expect(
      revalidateMessengerOwnMessageReactions({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuids: [MESSAGE_A],
        client: { getMessageReactions },
        cache: { replaceOwnMessageReactionsForMessage },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      messageUuids: [MESSAGE_A],
      reactions: 1,
    });

    expect(getMessageReactions).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      { messageUuid: MESSAGE_A, userUuid: USER_A },
    );
    expect(replaceOwnMessageReactionsForMessage).toHaveBeenCalledWith(ownerKey, MESSAGE_A, [
      {
        messageUuid: MESSAGE_A,
        userUuid: USER_A,
        reactionUuid: REACTION_A,
        emojiName: "thumbs_up",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({ thumbs_up: REACTION_A });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
    });
  });

  it("syncs visible own reactions through one owner request and replaces owner cache", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(
      createMessage({
        ownReactionUuidsByEmojiName: { stale: "stale-reaction" },
      }),
      createMessage({ uuid: MESSAGE_B, reactions: { eyes: 1 } }),
    );
    const replaceOwnMessageReactionsForOwner = vi.fn(() => Promise.resolve());
    const getMessageReactions = vi.fn(
      (_options: MessengerClientOptions, _query: { messageUuid?: string; userUuid?: string }) =>
        Promise.resolve([
          createReactionDto(),
          createReactionDto({
            uuid: REACTION_B,
            message_uuid: MESSAGE_B,
            emoji_name: "eyes",
          }),
          createReactionDto({
            uuid: "11111111-0000-4000-8000-000000000003",
            message_uuid: "c93dca35-3061-4748-bda4-7f6f8c660ea5",
            emoji_name: "heart",
          }),
          createReactionDto({
            uuid: "11111111-0000-4000-8000-000000000004",
            message_uuid: MESSAGE_A,
            user_uuid: USER_B,
            emoji_name: "joy",
          }),
        ]),
    );

    await expect(
      syncMessengerOwnerOwnMessageReactions({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuids: [MESSAGE_A, MESSAGE_A, MESSAGE_B],
        client: { getMessageReactions },
        cache: { replaceOwnMessageReactionsForOwner },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      messageUuids: [MESSAGE_A, MESSAGE_B],
      reactions: 2,
    });

    expect(getMessageReactions).toHaveBeenCalledTimes(1);
    expect(getMessageReactions).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      { userUuid: USER_A },
    );
    expect(replaceOwnMessageReactionsForOwner).toHaveBeenCalledWith(ownerKey, [
      {
        messageUuid: MESSAGE_A,
        userUuid: USER_A,
        reactionUuid: REACTION_A,
        emojiName: "thumbs_up",
        createdAt: DATE,
        updatedAt: DATE,
      },
      {
        messageUuid: MESSAGE_B,
        userUuid: USER_A,
        reactionUuid: REACTION_B,
        emojiName: "eyes",
        createdAt: DATE,
        updatedAt: DATE,
      },
      {
        messageUuid: "c93dca35-3061-4748-bda4-7f6f8c660ea5",
        userUuid: USER_A,
        reactionUuid: "11111111-0000-4000-8000-000000000003",
        emojiName: "heart",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({ thumbs_up: REACTION_A });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.ownReactionUuidsByEmojiName,
    ).toEqual({ eyes: REACTION_B });
  });

  it("adds a reaction, stores the returned row, and applies own projection", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(
      createMessage({
        reactions: { "👍": 1 },
        reactionUserUuidsByEmojiName: { "👍": [USER_B] },
      }),
    );
    const request = createDeferred<WorkspaceMessengerMessageReactionDto>();
    const upsertOwnMessageReaction = vi.fn(() => Promise.resolve());
    const createMessageReaction = vi.fn(
      (
        _options: MessengerClientOptions,
        _body: WorkspaceMessengerCreateMessageReactionRequestBody,
      ) => request.promise,
    );

    const actionPromise = addMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "👍",
      client: { createMessageReaction },
      cache: { upsertOwnMessageReaction },
    });

    expect(createMessageReaction).toHaveBeenCalledWith(expect.any(Object), {
      message_uuid: MESSAGE_A,
      emoji_name: "👍",
    });
    expect(upsertOwnMessageReaction).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      "👍": 2,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({ "👍": [USER_B] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ "👍": [USER_B, USER_A] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName?.[
        "👍"
      ]?.operation,
    ).toBe("add");

    request.resolve(createReactionDto({ emoji_name: "👍" }));

    await expect(actionPromise).resolves.toEqual({
      status: "applied",
      ownerKey,
      messageUuid: MESSAGE_A,
      emojiName: "👍",
      operation: "added",
      reactionUuid: REACTION_A,
    });

    expect(upsertOwnMessageReaction).toHaveBeenCalledWith(ownerKey, {
      messageUuid: MESSAGE_A,
      userUuid: USER_A,
      reactionUuid: REACTION_A,
      emojiName: "👍",
      createdAt: DATE,
      updatedAt: DATE,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({ "👍": REACTION_A });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName,
    ).toBeUndefined();
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({ "👍": [USER_B] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ "👍": [USER_B, USER_A] });
  });

  it("shows the current user as the optimistic avatar for a new reaction", async () => {
    const runtimeContext = createRuntimeContext();
    indexMessages(createMessage());
    const request = createDeferred<WorkspaceMessengerMessageReactionDto>();

    const actionPromise = addMessengerMessageReaction({
      runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "sparkles",
      client: { createMessageReaction: vi.fn(() => request.promise) },
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
      sparkles: 1,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({});
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ sparkles: [USER_A] });

    request.resolve(createReactionDto({ emoji_name: "sparkles" }));
    await expect(actionPromise).resolves.toMatchObject({ operation: "added" });

    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({});
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ sparkles: [USER_A] });
  });

  it("keeps an existing count-only reaction in count mode during optimistic add", async () => {
    const runtimeContext = createRuntimeContext();
    indexMessages(
      createMessage({
        reactions: { thumbs_up: 5 },
        reactionUserUuidsByEmojiName: {},
      }),
    );
    const request = createDeferred<WorkspaceMessengerMessageReactionDto>();

    const actionPromise = addMessengerMessageReaction({
      runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      client: { createMessageReaction: vi.fn(() => request.promise) },
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 6,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({});
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ thumbs_up: null });

    request.resolve(createReactionDto());
    await expect(actionPromise).resolves.toMatchObject({ operation: "added" });
  });

  it("removes using store uuid before cache or API fallback", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(
      createMessage({
        reactions: { thumbs_up: 2 },
        reactionUserUuidsByEmojiName: { thumbs_up: [USER_B, USER_A] },
        ownReactionUuidsByEmojiName: { thumbs_up: REACTION_A },
      }),
    );
    const request = createDeferred<void>();
    const deleteMessageReaction = vi.fn(() => request.promise);
    const readOwnMessageReaction = vi.fn(() => Promise.resolve(createCacheRow()));
    const getMessageReactions = vi.fn(() => Promise.resolve([createReactionDto()]));
    const deleteOwnMessageReaction = vi.fn(() => Promise.resolve());

    const actionPromise = removeMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      client: { deleteMessageReaction, getMessageReactions },
      cache: { readOwnMessageReaction, deleteOwnMessageReaction },
    });

    await vi.waitFor(() => {
      expect(deleteMessageReaction).toHaveBeenCalledWith(expect.any(Object), REACTION_A);
    });
    expect(deleteOwnMessageReaction).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({});
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({ thumbs_up: [USER_B, USER_A] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ thumbs_up: [USER_B] });

    request.resolve(undefined);

    await expect(actionPromise).resolves.toEqual({
      status: "applied",
      ownerKey,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      operation: "removed",
      reactionUuid: REACTION_A,
    });

    expect(readOwnMessageReaction).not.toHaveBeenCalled();
    expect(getMessageReactions).not.toHaveBeenCalled();
    expect(deleteOwnMessageReaction).toHaveBeenCalledWith(ownerKey, MESSAGE_A, "thumbs_up");
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({});
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({ thumbs_up: [USER_B, USER_A] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ thumbs_up: [USER_B] });
  });

  it("rolls back optimistic add when the Workspace POST fails", async () => {
    const runtimeContext = createRuntimeContext();
    indexMessages(
      createMessage({
        reactions: { thumbs_up: 1, eyes: 1 },
        reactionUserUuidsByEmojiName: { eyes: [USER_B] },
      }),
    );
    const request = createDeferred<WorkspaceMessengerMessageReactionDto>();
    const upsertOwnMessageReaction = vi.fn(() => Promise.resolve());
    const actionPromise = addMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "eyes",
      client: { createMessageReaction: vi.fn(() => request.promise) },
      cache: { upsertOwnMessageReaction },
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
      eyes: 2,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({ eyes: [USER_B] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ eyes: [USER_B, USER_A] });

    request.reject(new Error("network"));

    await expect(actionPromise).rejects.toThrow("network");
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
      eyes: 1,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({ eyes: [USER_B] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toBeUndefined();
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({});
    expect(upsertOwnMessageReaction).not.toHaveBeenCalled();
  });

  it("keeps a newer server reaction snapshot when an optimistic request later fails", async () => {
    const runtimeContext = createRuntimeContext();
    indexMessages(
      createMessage({
        reactions: { thumbs_up: 1 },
        reactionUserUuidsByEmojiName: { thumbs_up: [USER_B] },
      }),
    );
    const request = createDeferred<WorkspaceMessengerMessageReactionDto>();
    const actionPromise = addMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      client: { createMessageReaction: vi.fn(() => request.promise) },
    });

    indexMessages(
      createMessage({
        reactions: { thumbs_up: 5 },
        reactionUserUuidsByEmojiName: {},
        updatedAt: "2026-07-03T10:01:00Z",
      }),
    );
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 5,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toBeUndefined();

    request.reject(new Error("network"));

    await expect(actionPromise).rejects.toThrow("network");
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 5,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({});
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName,
    ).toBeUndefined();
  });

  it("rolls back optimistic remove when the Workspace DELETE fails", async () => {
    const runtimeContext = createRuntimeContext();
    indexMessages(
      createMessage({
        reactions: { thumbs_up: 2 },
        reactionUserUuidsByEmojiName: { thumbs_up: [USER_B, USER_A] },
        ownReactionUuidsByEmojiName: { thumbs_up: REACTION_A },
      }),
    );
    const request = createDeferred<void>();
    const actionPromise = removeMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      client: { deleteMessageReaction: vi.fn(() => request.promise) },
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({});
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({ thumbs_up: [USER_B, USER_A] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toEqual({ thumbs_up: [USER_B] });

    request.reject(new Error("network"));

    await expect(actionPromise).rejects.toThrow("network");
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 2,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({ thumbs_up: REACTION_A });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactionUserUuidsByEmojiName,
    ).toEqual({ thumbs_up: [USER_B, USER_A] });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toBeUndefined();
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName,
    ).toBeUndefined();
  });

  it("clears optimistic remove state when the request is aborted", async () => {
    const runtimeContext = createRuntimeContext();
    indexMessages(
      createMessage({
        reactions: { thumbs_up: 2 },
        reactionUserUuidsByEmojiName: { thumbs_up: [USER_B, USER_A] },
        ownReactionUuidsByEmojiName: { thumbs_up: REACTION_A },
      }),
    );
    const controller = new AbortController();
    const request = createDeferred<void>();
    const actionPromise = removeMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      signal: controller.signal,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      client: { deleteMessageReaction: vi.fn(() => request.promise) },
    });

    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName,
    ).toBeDefined();
    controller.abort();
    request.reject(new DOMException("Aborted", "AbortError"));

    await expect(actionPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 2,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({ thumbs_up: REACTION_A });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName,
    ).toBeUndefined();
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toBeUndefined();
  });

  it("recovers duplicate add conflict by reloading own rows for the message", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(createMessage());
    const createMessageReaction = vi.fn(() =>
      Promise.reject(new MessengerApiError("conflict", 409, {})),
    );
    const getMessageReactions = vi.fn(() => Promise.resolve([createReactionDto()]));
    const replaceOwnMessageReactionsForMessage = vi.fn(() => Promise.resolve());

    await expect(
      addMessengerMessageReaction({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_A,
        emojiName: "thumbs_up",
        client: { createMessageReaction, getMessageReactions },
        cache: { replaceOwnMessageReactionsForMessage },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      operation: "already-added",
      reactionUuid: REACTION_A,
    });

    expect(getMessageReactions).toHaveBeenCalledWith(expect.any(Object), {
      messageUuid: MESSAGE_A,
      userUuid: USER_A,
    });
    expect(replaceOwnMessageReactionsForMessage).toHaveBeenCalledTimes(1);
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({ thumbs_up: REACTION_A });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
    });
  });

  it("clears optimistic add state when duplicate recovery is aborted", async () => {
    const runtimeContext = createRuntimeContext();
    indexMessages(createMessage());
    const controller = new AbortController();
    const recoveryRequest = createDeferred<WorkspaceMessengerMessageReactionDto[]>();
    const actionPromise = addMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      signal: controller.signal,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      client: {
        createMessageReaction: vi.fn(() =>
          Promise.reject(new MessengerApiError("conflict", 409, {})),
        ),
        getMessageReactions: vi.fn(() => recoveryRequest.promise),
      },
    });

    await vi.waitFor(() =>
      expect(
        useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName,
      ).toBeDefined(),
    );
    controller.abort();
    recoveryRequest.reject(new DOMException("Aborted", "AbortError"));

    await expect(actionPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName,
    ).toBeUndefined();
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toBeUndefined();
  });

  it("skips store and cache writes when the runtime becomes stale after await", async () => {
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
    const ownerKey = workspaceRuntimeOwnerKey(runtimeA);
    indexMessages(createMessage());
    const request = createDeferred<WorkspaceMessengerMessageReactionDto>();
    const createMessageReaction = vi.fn(() => request.promise);
    const upsertOwnMessageReaction = vi.fn(() => Promise.resolve());
    let currentRuntime = runtimeA;
    const actionPromise = addMessengerMessageReaction({
      runtimeContext: runtimeA,
      getRuntimeContext: () => currentRuntime,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      client: { createMessageReaction },
      cache: { upsertOwnMessageReaction },
    });

    currentRuntime = runtimeB;
    request.resolve(createReactionDto());

    await expect(actionPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(upsertOwnMessageReaction).not.toHaveBeenCalled();
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({});
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 1,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName,
    ).toBeUndefined();
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]
        ?.optimisticReactionUserUuidsByEmojiName,
    ).toBeUndefined();
  });

  it("toggles an unprojected reaction immediately without a preflight GET", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(createMessage());
    const request = createDeferred<WorkspaceMessengerMessageReactionDto>();
    const getMessageReactions = vi.fn(() => Promise.resolve([]));
    const createMessageReaction = vi.fn(() => request.promise);

    const actionPromise = toggleMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      client: { getMessageReactions, createMessageReaction },
    });

    expect(getMessageReactions).not.toHaveBeenCalled();
    expect(createMessageReaction).toHaveBeenCalledTimes(1);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({
      thumbs_up: 2,
    });
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.pendingOwnReactionsByEmojiName
        ?.thumbs_up?.operation,
    ).toBe("add");

    request.resolve(createReactionDto());

    await expect(actionPromise).resolves.toEqual({
      status: "applied",
      ownerKey,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      operation: "added",
      reactionUuid: REACTION_A,
    });
  });

  it("removes an existing reaction after an optimistic add conflict", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(createMessage());
    const createMessageReaction = vi.fn(() =>
      Promise.reject(new MessengerApiError("conflict", 409, {})),
    );
    const getMessageReactions = vi.fn(() => Promise.resolve([createReactionDto()]));
    const deleteMessageReaction = vi.fn(() => Promise.resolve());

    await expect(
      toggleMessengerMessageReaction({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_A,
        emojiName: "thumbs_up",
        client: { createMessageReaction, getMessageReactions, deleteMessageReaction },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      messageUuid: MESSAGE_A,
      emojiName: "thumbs_up",
      operation: "removed",
      reactionUuid: REACTION_A,
    });

    expect(createMessageReaction).toHaveBeenCalledTimes(1);
    expect(getMessageReactions).toHaveBeenCalledTimes(1);
    expect(deleteMessageReaction).toHaveBeenCalledWith(expect.any(Object), REACTION_A);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.reactions).toEqual({});
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({});
  });

  it("skips a repeated toggle while the same reaction request is pending", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(createMessage());
    const request = createDeferred<WorkspaceMessengerMessageReactionDto>();
    const createMessageReaction = vi.fn(() => request.promise);

    const firstAction = toggleMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_A,
      emojiName: "eyes",
      client: { createMessageReaction },
    });

    await expect(
      toggleMessengerMessageReaction({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_A,
        emojiName: "eyes",
        client: { createMessageReaction },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "pending-reaction",
    });
    expect(createMessageReaction).toHaveBeenCalledTimes(1);

    request.resolve(createReactionDto({ emoji_name: "eyes" }));
    await firstAction;
  });

  it("revalidates and clears own projection when realtime aggregate becomes empty", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    indexMessages(
      createMessage({
        reactions: {},
        ownReactionUuidsByEmojiName: { thumbs_up: REACTION_A },
      }),
    );
    const getMessageReactions = vi.fn(() => Promise.resolve([]));
    const replaceOwnMessageReactionsForMessage = vi.fn(() => Promise.resolve());
    const handler = createMessengerReactionAggregateRevalidateHandler({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      client: { getMessageReactions },
      cache: { replaceOwnMessageReactionsForMessage },
    });

    handler(ownerKey, createMessage({ reactions: {} }));
    await vi.waitFor(() => {
      expect(getMessageReactions).toHaveBeenCalledWith(expect.any(Object), {
        messageUuid: MESSAGE_A,
        userUuid: USER_A,
      });
    });

    expect(replaceOwnMessageReactionsForMessage).toHaveBeenCalledWith(ownerKey, MESSAGE_A, []);
    expect(
      useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.ownReactionUuidsByEmojiName,
    ).toEqual({});
  });
});
