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
import type { MessengerMessageWindow } from "~/shared/api/messenger-messages.api";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  loadMessengerConversationMessages,
  loadMessengerMessageWindowAroundMessage,
  loadMessengerMessageWindowPage,
} from "./messenger-messages-loader.lib";
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
const MESSAGE_C = "24e84035-ae0a-46ce-a20d-88dcc2612059";
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

function createMessageWindow({
  anchor,
  before,
  after,
  beforePageMarker = "before-page",
  afterPageMarker = "after-page",
}: {
  anchor: WorkspaceMessengerMessageDto;
  before: WorkspaceMessengerMessageDto[];
  after: WorkspaceMessengerMessageDto[];
  beforePageMarker?: string | null;
  afterPageMarker?: string | null;
}): MessengerMessageWindow {
  return {
    anchor,
    before,
    after,
    items: [...before, anchor, ...after],
    beforePageMarker,
    afterPageMarker,
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

  it("loads a topic message window with stream and topic filters through the strict replace path", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const before = createMessageDto({ uuid: MESSAGE_A, created_at: DATE, updated_at: DATE });
    const anchor = createMessageDto({
      uuid: MESSAGE_B,
      created_at: DATE_LATER,
      updated_at: DATE_LATER,
    });
    const after = createMessageDto({
      uuid: MESSAGE_C,
      created_at: DATE_LATEST,
      updated_at: DATE_LATEST,
    });
    const getMessageWindowAroundMessage = vi.fn(
      (_options: MessengerClientOptions, _query: unknown) =>
        Promise.resolve(
          createMessageWindow({
            anchor,
            before: [before],
            after: [after],
          }),
        ),
    );
    const replaceOrMergeConversationMessagesPage = vi.fn();
    const replaceConversationMessagesWindow = vi.fn();
    const mergeConversationMessagesPage = vi.fn();
    const setMessagesLoading = vi.fn();
    const setMessagesError = vi.fn();
    const setConversationPagination = vi.fn();
    const setConversationWindowMarkers = vi.fn();
    const beforePageMarkerByConversationId = {};
    const afterPageMarkerByConversationId = {};

    await expect(
      loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        messageUuid: MESSAGE_B,
        beforeLimit: 10,
        afterLimit: 12,
        client: { getMessageWindowAroundMessage },
        store: {
          getState: () => ({
            replaceOrMergeConversationMessagesPage,
            replaceConversationMessagesWindow,
            mergeConversationMessagesPage,
            setMessagesLoading,
            setMessagesError,
            setConversationPagination,
            setConversationWindowMarkers,
            beforePageMarkerByConversationId,
            afterPageMarkerByConversationId,
          }),
        },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      anchorUuid: MESSAGE_B,
      beforePageMarker: "before-page",
      afterPageMarker: "after-page",
      beforeLimit: 10,
      afterLimit: 12,
    });

    expect(getMessageWindowAroundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      {
        messageUuid: MESSAGE_B,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        beforeLimit: 10,
        afterLimit: 12,
      },
    );
    expect(replaceConversationMessagesWindow).toHaveBeenCalledWith(`topic:${STREAM_A}:${TOPIC_A}`, [
      expect.objectContaining({ uuid: MESSAGE_A }),
      expect.objectContaining({ uuid: MESSAGE_B }),
      expect.objectContaining({ uuid: MESSAGE_C }),
    ]);
    expect(replaceOrMergeConversationMessagesPage).not.toHaveBeenCalled();
    expect(mergeConversationMessagesPage).not.toHaveBeenCalled();
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

    await expect(
      loadMessengerMessageWindowPage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        direction: "before",
        pageMarker: "older-cursor",
        pageLimit: 2,
        client: { getMessagesPage },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
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
        `topic:${STREAM_A}:${TOPIC_A}`,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B]);
    expect(
      useWorkspaceMessageStore.getState().beforePageMarkerByConversationId[
        `topic:${STREAM_A}:${TOPIC_A}`
      ],
    ).toBe("older-next");
  });

  it("loads newer message window pages with ascending API sorting", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}`;
    useWorkspaceMessageStore.getState().setConversationWindowMarkers(conversationId, {
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
      direction: "after",
      pageMarker: "newer-cursor",
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
      useWorkspaceMessageStore.getState().beforePageMarkerByConversationId[conversationId],
    ).toBe("older-still");
    expect(
      useWorkspaceMessageStore.getState().afterPageMarkerByConversationId[conversationId],
    ).toBe("newer-next");
  });

  it("loads a stream message window without a topic filter", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const getMessageWindowAroundMessage = vi.fn(
      (_options: MessengerClientOptions, _query: unknown) =>
        Promise.resolve(
          createMessageWindow({
            anchor: createMessageDto({ uuid: MESSAGE_A, topic_uuid: TOPIC_A }),
            before: [],
            after: [],
          }),
        ),
    );

    await loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `stream:${STREAM_A}`,
      messageUuid: MESSAGE_A,
      beforeLimit: 7,
      afterLimit: 9,
      client: { getMessageWindowAroundMessage },
    });

    expect(getMessageWindowAroundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token-a" }),
      {
        messageUuid: MESSAGE_A,
        streamUuid: STREAM_A,
        beforeLimit: 7,
        afterLimit: 9,
      },
    );
  });

  it("derives a topic conversation id from the message window anchor when no conversation id is provided", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const before = createMessageDto({ uuid: MESSAGE_A, created_at: DATE, updated_at: DATE });
    const anchor = createMessageDto({
      uuid: MESSAGE_B,
      stream_uuid: STREAM_B,
      topic_uuid: TOPIC_B,
      created_at: DATE_LATER,
      updated_at: DATE_LATER,
    });
    const after = createMessageDto({
      uuid: MESSAGE_C,
      stream_uuid: STREAM_B,
      topic_uuid: TOPIC_B,
      created_at: DATE_LATEST,
      updated_at: DATE_LATEST,
    });
    const getMessageWindowAroundMessage = vi.fn(
      (_options: MessengerClientOptions, _query: unknown) =>
        Promise.resolve(
          createMessageWindow({
            anchor,
            before: [before],
            after: [after],
            beforePageMarker: "derived-before",
            afterPageMarker: "derived-after",
          }),
        ),
    );
    const derivedConversationId = `topic:${STREAM_B}:${TOPIC_B}`;

    await expect(
      loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_B,
        beforeLimit: 3,
        afterLimit: 4,
        client: { getMessageWindowAroundMessage },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      conversationId: derivedConversationId,
      anchorUuid: MESSAGE_B,
      beforePageMarker: "derived-before",
      afterPageMarker: "derived-after",
      beforeLimit: 3,
      afterLimit: 4,
    });

    expect(getMessageWindowAroundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      {
        messageUuid: MESSAGE_B,
        beforeLimit: 3,
        afterLimit: 4,
      },
    );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        derivedConversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B, MESSAGE_C]);
    expect(useWorkspaceMessageStore.getState().beforePageMarkerByConversationId).toMatchObject({
      [derivedConversationId]: "derived-before",
    });
    expect(useWorkspaceMessageStore.getState().afterPageMarkerByConversationId).toMatchObject({
      [derivedConversationId]: "derived-after",
    });
  });

  it("skips invalid provided message window conversation ids without calling the API", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getMessageWindowAroundMessage = vi.fn(
      (_options: MessengerClientOptions, _query: unknown) =>
        Promise.resolve(
          createMessageWindow({
            anchor: createMessageDto(),
            before: [],
            after: [],
          }),
        ),
    );

    await expect(
      loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: "dm:alice",
        messageUuid: MESSAGE_A,
        client: { getMessageWindowAroundMessage },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "invalid-conversation",
    });

    expect(getMessageWindowAroundMessage).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById).toEqual({});
  });

  it("stores before and after window markers for the loaded conversation", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);

    await loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      messageUuid: MESSAGE_A,
      client: {
        getMessageWindowAroundMessage: () =>
          Promise.resolve(
            createMessageWindow({
              anchor: createMessageDto(),
              before: [],
              after: [],
              beforePageMarker: "older-window",
              afterPageMarker: "newer-window",
            }),
          ),
      },
    });

    const state = useWorkspaceMessageStore.getState();
    expect(state.beforePageMarkerByConversationId[`topic:${STREAM_A}:${TOPIC_A}`]).toBe(
      "older-window",
    );
    expect(state.afterPageMarkerByConversationId[`topic:${STREAM_A}:${TOPIC_A}`]).toBe(
      "newer-window",
    );
  });

  it("returns the loaded window anchor uuid", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);

    await expect(
      loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
        messageUuid: MESSAGE_B,
        client: {
          getMessageWindowAroundMessage: () =>
            Promise.resolve(
              createMessageWindow({
                anchor: createMessageDto({ uuid: MESSAGE_B }),
                before: [],
                after: [],
              }),
            ),
        },
      }),
    ).resolves.toMatchObject({
      status: "applied",
      ownerKey,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      anchorUuid: MESSAGE_B,
    });
  });

  it("skips applying a message window when owner becomes stale after awaiting messages", async () => {
    let currentContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(currentContext);
    const windowRequest = createDeferred<MessengerMessageWindow>();

    const loading = loadMessengerMessageWindowAroundMessage({
      runtimeContext: currentContext,
      getRuntimeContext: () => currentContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      messageUuid: MESSAGE_A,
      client: { getMessageWindowAroundMessage: () => windowRequest.promise },
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
    windowRequest.resolve(
      createMessageWindow({
        anchor: createMessageDto(),
        before: [],
        after: [],
      }),
    );

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

  it("hydrates and syncs own reactions for visible message window items", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const hydrateFromCache = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A, MESSAGE_B, MESSAGE_C],
        reactions: 0,
      }),
    );
    const syncOwner = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A, MESSAGE_B, MESSAGE_C],
        reactions: 0,
      }),
    );

    await loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
      messageUuid: MESSAGE_B,
      client: {
        getMessageWindowAroundMessage: () =>
          Promise.resolve(
            createMessageWindow({
              anchor: createMessageDto({
                uuid: MESSAGE_B,
                created_at: DATE_LATER,
                updated_at: DATE_LATER,
              }),
              before: [createMessageDto({ uuid: MESSAGE_A })],
              after: [
                createMessageDto({
                  uuid: MESSAGE_C,
                  created_at: DATE_LATEST,
                  updated_at: DATE_LATEST,
                }),
              ],
            }),
          ),
      },
      ownReactionSync: {
        hydrateFromCache,
        syncOwner,
      },
    });

    expect(hydrateFromCache).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
        messageUuids: [MESSAGE_A, MESSAGE_B, MESSAGE_C],
      }),
    );
    expect(syncOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
        messageUuids: [MESSAGE_A, MESSAGE_B, MESSAGE_C],
      }),
    );
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
        sortKey: "created_at",
        sortDir: "desc",
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
      ).map((message) => [message.uuid, message.payload.content]),
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
