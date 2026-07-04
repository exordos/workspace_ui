import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectWorkspaceMessagesForConversation,
  selectWorkspaceMessageStatusForConversation,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  MessengerCollectionPage,
  MessengerClientOptions,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { loadMessengerConversationMessages } from "./messenger-messages-loader.lib";
import { useMessengerStore } from "./messenger.model";

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
const DATE = "2026-06-22T10:10:00Z";
const DATE_LATER = "2026-06-22T10:20:00Z";

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

function createMessagesPage(
  items: WorkspaceMessengerMessageDto[],
): MessengerCollectionPage<WorkspaceMessengerMessageDto> {
  return {
    items,
    nextPageMarker: "next-page",
    pageLimit: 50,
  };
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

function prepareStoreOwner(runtimeContext: WorkspaceRuntimeContext): string {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  useMessengerStore.getState().startBootstrap(ownerKey);
  return ownerKey;
}

describe("messenger conversation messages loader", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
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

  it("loads topic messages with stream and topic filters", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const getMessagesPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createMessagesPage([createMessageDto()])),
    );

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      pageLimit: 25,
      pageMarker: "cursor-a",
      client: { getMessagesPage },
    });

    expect(getMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token-a" }),
      {
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        pageLimit: 25,
        pageMarker: "cursor-a",
      },
    );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual([expect.objectContaining({ uuid: MESSAGE_A })]);
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ),
    ).toEqual({
      loading: false,
      error: null,
      nextPageMarker: "next-page",
      hasMore: true,
    });
  });

  it("hydrates own reaction projection from cached visible messages and schedules revalidate", async () => {
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
    const revalidate = vi.fn(() =>
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
        revalidate,
      },
    });

    expect(hydrateFromCache).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
        messageUuids: [MESSAGE_A],
      }),
    );
    expect(revalidate).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
        messageUuids: [MESSAGE_A],
      }),
    );
  });

  it("hydrates and revalidates own reactions for the server-visible page", async () => {
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
    const revalidate = vi.fn(() =>
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
        revalidate,
      },
    });

    expect(hydrateFromCache).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuids: [MESSAGE_A, MESSAGE_B],
      }),
    );
    expect(revalidate).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuids: [MESSAGE_A, MESSAGE_B],
      }),
    );
  });

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

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      client: { getMessagesPage },
    });
    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      pageMarker: "next-page",
      client: { getMessagesPage },
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

    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      client: { getMessagesPage },
    });
    await loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      pageMarker: "next-page",
      client: { getMessagesPage },
    });

    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        `topic:${STREAM_A}:${TOPIC_A}`,
      ).map((message) => [message.uuid, message.markdown]),
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
      .upsertMessage(
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
    ).toEqual([MESSAGE_A, MESSAGE_B]);
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
