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
  type MessengerMessagesOwnReactionSyncDeps,
} from "./messenger-messages-loader.lib";
import { clearMessengerReadBoundariesForOwner } from "./messenger-read-boundary.lib";
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
    reaction_users: {},
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
  return ownerKey;
}

describe("messenger conversation messages loader", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    clearMessengerReadBoundariesForOwner(workspaceRuntimeOwnerKey(createRuntimeContext()));
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
      useWorkspaceMessageStore.getState().messageWindowStateByConversationId[
        `topic:${STREAM_A}:${TOPIC_A}`
      ],
    ).toBe("complete");
  });

  it("hydrates a boundary before a cold direct message window", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const before = createMessageDto({
      uuid: MESSAGE_A,
      read: false,
      is_own: false,
      created_at: DATE,
    });
    const anchor = createMessageDto({
      uuid: MESSAGE_B,
      read: false,
      is_own: false,
      created_at: DATE_LATER,
    });
    const after = createMessageDto({
      uuid: MESSAGE_C,
      read: false,
      is_own: false,
      created_at: DATE_LATEST,
    });

    await loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      messageUuid: MESSAGE_B,
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
      client: {
        getMessageWindowAroundMessage: () =>
          Promise.resolve(createMessageWindow({ anchor, before: [before], after: [after] })),
      },
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_B]?.read).toBe(true);
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_C]?.read).toBe(false);
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
    const upsertMessage = vi.fn();
    const setMessagesLoading = vi.fn();
    const setMessagesError = vi.fn();
    const setConversationPagination = vi.fn();
    const setConversationWindowMarkers = vi.fn();
    const setConversationMessageWindowState = vi.fn();
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
            upsertMessage,
            setMessagesLoading,
            setMessagesError,
            setConversationPagination,
            setConversationWindowMarkers,
            setConversationMessageWindowState,
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
      { onAnchor: expect.any(Function) },
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
      { onAnchor: expect.any(Function) },
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
      { onAnchor: expect.any(Function) },
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

  it("applies a direct-route anchor before the surrounding message window resolves", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const anchor = createMessageDto({
      uuid: MESSAGE_B,
      stream_uuid: STREAM_B,
      topic_uuid: TOPIC_B,
      created_at: DATE_LATER,
      updated_at: DATE_LATER,
    });
    const before = createMessageDto({
      uuid: MESSAGE_A,
      stream_uuid: STREAM_B,
      topic_uuid: TOPIC_B,
    });
    const after = createMessageDto({
      uuid: MESSAGE_C,
      stream_uuid: STREAM_B,
      topic_uuid: TOPIC_B,
      created_at: DATE_LATEST,
      updated_at: DATE_LATEST,
    });
    const windowRequest = createDeferred<MessengerMessageWindow>();
    const getMessageWindowAroundMessage = vi.fn(
      (
        _options: MessengerClientOptions,
        _query: unknown,
        hooks?: { onAnchor?: (message: WorkspaceMessengerMessageDto) => void },
      ) => {
        hooks?.onAnchor?.(anchor);
        return windowRequest.promise;
      },
    );
    const onAnchorApplied = vi.fn();
    const derivedConversationId = `topic:${STREAM_B}:${TOPIC_B}`;
    useWorkspaceMessageStore.getState().upsertMessage(adaptMessengerMessage(before));

    const loading = loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_B,
      onAnchorApplied,
      client: { getMessageWindowAroundMessage },
    });

    expect(onAnchorApplied).toHaveBeenCalledWith({
      conversationId: derivedConversationId,
      anchorUuid: MESSAGE_B,
    });
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        derivedConversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B]);
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        derivedConversationId,
      ).loading,
    ).toBe(true);
    expect(
      useWorkspaceMessageStore.getState().messageWindowStateByConversationId[derivedConversationId],
    ).toBe("staged");

    windowRequest.resolve(
      createMessageWindow({
        anchor,
        before: [before],
        after: [after],
      }),
    );

    await expect(loading).resolves.toMatchObject({
      status: "applied",
      ownerKey,
      conversationId: derivedConversationId,
      anchorUuid: MESSAGE_B,
    });
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        derivedConversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_A, MESSAGE_B, MESSAGE_C]);
    expect(
      useWorkspaceMessageStore.getState().messageWindowStateByConversationId[derivedConversationId],
    ).toBe("complete");
  });

  it.each(["resolve", "reject"] as const)(
    "does not let an aborted older window %s clear a newer same-topic loading state",
    async (olderOutcome) => {
      const runtimeContext = createRuntimeContext();
      prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const firstAnchor = createMessageDto({ uuid: MESSAGE_A });
      const secondAnchor = createMessageDto({
        uuid: MESSAGE_B,
        created_at: DATE_LATER,
        updated_at: DATE_LATER,
      });
      const firstRequest = createDeferred<MessengerMessageWindow>();
      const secondRequest = createDeferred<MessengerMessageWindow>();
      const firstController = new AbortController();
      const firstLoading = loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_A,
        onAnchorApplied: vi.fn(),
        signal: firstController.signal,
        client: {
          getMessageWindowAroundMessage: (_options, _query, hooks) => {
            hooks?.onAnchor?.(firstAnchor);
            return firstRequest.promise;
          },
        },
      });
      const secondLoading = loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_B,
        onAnchorApplied: vi.fn(),
        client: {
          getMessageWindowAroundMessage: (_options, _query, hooks) => {
            hooks?.onAnchor?.(secondAnchor);
            return secondRequest.promise;
          },
        },
      });

      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(true);

      firstController.abort();
      if (olderOutcome === "resolve") {
        firstRequest.resolve(createMessageWindow({ anchor: firstAnchor, before: [], after: [] }));
      } else {
        firstRequest.reject(new DOMException("Aborted", "AbortError"));
      }

      await expect(firstLoading).resolves.toMatchObject({
        status: "skipped",
        reason: "stale-owner",
      });
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(true);

      secondRequest.resolve(createMessageWindow({ anchor: secondAnchor, before: [], after: [] }));
      await expect(secondLoading).resolves.toMatchObject({
        status: "applied",
        conversationId,
        anchorUuid: MESSAGE_B,
      });
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(false);
    },
  );

  it.each(["resolve", "reject"] as const)(
    "keeps a newer conversation-history load in control when the old staged permalink %s",
    async (olderOutcome) => {
      const runtimeContext = createRuntimeContext();
      prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const anchor = createMessageDto({ uuid: MESSAGE_A });
      const windowRequest = createDeferred<MessengerMessageWindow>();
      const historyRequest =
        createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
      const windowController = new AbortController();
      const windowLoading = loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_A,
        onAnchorApplied: vi.fn(),
        signal: windowController.signal,
        client: {
          getMessageWindowAroundMessage: (_options, _query, hooks) => {
            hooks?.onAnchor?.(anchor);
            return windowRequest.promise;
          },
        },
      });
      const getMessagesPage = vi.fn(() => historyRequest.promise);
      const historyLoading = loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({ messages: [], nextPageMarker: null, hasMore: false }),
          writeConversationMessagePage: () => undefined,
        },
        client: { getMessagesPage },
      });

      await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledOnce());
      expect(
        useWorkspaceMessageStore.getState().messageWindowStateByConversationId[conversationId],
      ).toBe("staged");
      windowController.abort();
      if (olderOutcome === "resolve") {
        windowRequest.resolve(createMessageWindow({ anchor, before: [], after: [] }));
      } else {
        windowRequest.reject(new DOMException("Aborted", "AbortError"));
      }

      await expect(windowLoading).resolves.toMatchObject({
        status: "skipped",
        reason: "stale-owner",
      });
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(true);

      historyRequest.resolve(createMessagesPage([anchor]));
      await expect(historyLoading).resolves.toMatchObject({
        status: "applied",
        conversationId,
      });
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(false);
      expect(
        useWorkspaceMessageStore.getState().messageWindowStateByConversationId[conversationId],
      ).toBe("complete");
    },
  );

  it.each(["resolve", "reject"] as const)(
    "does not let an aborted conversation-history request %s clear a newer permalink loading state",
    async (olderOutcome) => {
      const runtimeContext = createRuntimeContext();
      prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const anchor = createMessageDto({ uuid: MESSAGE_A });
      const historyRequest =
        createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
      const windowRequest = createDeferred<MessengerMessageWindow>();
      const historyController = new AbortController();
      const getMessagesPage = vi.fn(() => historyRequest.promise);
      const historyLoading = loadMessengerConversationMessages({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId,
        cache: {
          readConversationMessageWindow: () =>
            Promise.resolve({ messages: [], nextPageMarker: null, hasMore: false }),
          writeConversationMessagePage: () => undefined,
        },
        signal: historyController.signal,
        client: { getMessagesPage },
      });

      await vi.waitFor(() => expect(getMessagesPage).toHaveBeenCalledOnce());
      const windowLoading = loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_A,
        onAnchorApplied: vi.fn(),
        client: {
          getMessageWindowAroundMessage: (_options, _query, hooks) => {
            hooks?.onAnchor?.(anchor);
            return windowRequest.promise;
          },
        },
      });

      historyController.abort();
      if (olderOutcome === "resolve") {
        historyRequest.resolve(createMessagesPage([anchor]));
      } else {
        historyRequest.reject(new DOMException("Aborted", "AbortError"));
      }

      await expect(historyLoading).resolves.toMatchObject({
        status: "skipped",
        reason: "stale-owner",
      });
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(true);

      windowRequest.resolve(createMessageWindow({ anchor, before: [], after: [] }));
      await expect(windowLoading).resolves.toMatchObject({
        status: "applied",
        conversationId,
      });
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(false);
    },
  );

  it("does not apply a stale history cache after a newer permalink claims the conversation", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const cachedMessage = adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_A }));
    const anchor = createMessageDto({
      uuid: MESSAGE_B,
      created_at: DATE_LATER,
      updated_at: DATE_LATER,
    });
    const cacheRequest = createDeferred<{
      messages: ReturnType<typeof adaptMessengerMessage>[];
      nextPageMarker: string | null;
      hasMore: boolean;
    }>();
    const getMessagesPage = vi.fn(() =>
      Promise.resolve(createMessagesPage([createMessageDto({ uuid: MESSAGE_A })])),
    );
    const historyController = new AbortController();
    const historyLoading = loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId,
      cache: {
        readConversationMessageWindow: () => cacheRequest.promise,
        writeConversationMessagePage: () => undefined,
      },
      client: { getMessagesPage },
      signal: historyController.signal,
    });
    const windowRequest = createDeferred<MessengerMessageWindow>();
    const windowLoading = loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_B,
      onAnchorApplied: vi.fn(),
      client: {
        getMessageWindowAroundMessage: (_options, _query, hooks) => {
          hooks?.onAnchor?.(anchor);
          return windowRequest.promise;
        },
      },
    });

    historyController.abort();
    cacheRequest.resolve({
      messages: [cachedMessage],
      nextPageMarker: "cached-next",
      hasMore: true,
    });

    await expect(historyLoading).resolves.toMatchObject({
      status: "skipped",
      reason: "stale-owner",
    });
    expect(getMessagesPage).not.toHaveBeenCalled();
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).map((message) => message.uuid),
    ).toEqual([MESSAGE_B]);
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).loading,
    ).toBe(true);

    windowRequest.resolve(createMessageWindow({ anchor, before: [], after: [] }));
    await expect(windowLoading).resolves.toMatchObject({
      status: "applied",
      conversationId,
      anchorUuid: MESSAGE_B,
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

  it("does not let stale history reclaim ownership after cached reaction hydration", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const cachedMessage = adaptMessengerMessage(createMessageDto({ uuid: MESSAGE_A }));
    const anchor = createMessageDto({
      uuid: MESSAGE_B,
      created_at: DATE_LATER,
      updated_at: DATE_LATER,
    });
    const hydrationRequest =
      createDeferred<
        Awaited<ReturnType<NonNullable<MessengerMessagesOwnReactionSyncDeps["hydrateFromCache"]>>>
      >();
    const hydrateFromCache = vi.fn(() => hydrationRequest.promise);
    const syncOwner = vi.fn(() =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey,
        messageUuids: [MESSAGE_A],
        reactions: 1,
      }),
    );
    const getMessagesPage = vi.fn(() =>
      Promise.resolve(createMessagesPage([createMessageDto({ uuid: MESSAGE_A })])),
    );
    const historyController = new AbortController();
    const historyLoading = loadMessengerConversationMessages({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId,
      cache: {
        readConversationMessageWindow: () =>
          Promise.resolve({
            messages: [cachedMessage],
            nextPageMarker: "cached-next",
            hasMore: true,
          }),
        writeConversationMessagePage: () => undefined,
      },
      client: { getMessagesPage },
      ownReactionSync: { hydrateFromCache, syncOwner },
      signal: historyController.signal,
    });

    await vi.waitFor(() => expect(hydrateFromCache).toHaveBeenCalledOnce());
    const windowRequest = createDeferred<MessengerMessageWindow>();
    const windowLoading = loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_B,
      onAnchorApplied: vi.fn(),
      client: {
        getMessageWindowAroundMessage: (_options, _query, hooks) => {
          hooks?.onAnchor?.(anchor);
          return windowRequest.promise;
        },
      },
    });

    historyController.abort();
    hydrationRequest.resolve({
      status: "applied",
      ownerKey,
      messageUuids: [MESSAGE_A],
      reactions: 1,
    });

    await expect(historyLoading).resolves.toMatchObject({
      status: "skipped",
      reason: "stale-owner",
    });
    expect(getMessagesPage).not.toHaveBeenCalled();
    expect(syncOwner).not.toHaveBeenCalled();
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        conversationId,
      ).loading,
    ).toBe(true);

    windowRequest.resolve(createMessageWindow({ anchor, before: [], after: [] }));
    await expect(windowLoading).resolves.toMatchObject({
      status: "applied",
      conversationId,
      anchorUuid: MESSAGE_B,
    });
  });

  it.each(["resolve", "reject"] as const)(
    "does not let an aborted boundary-page request %s clear a newer permalink loading state",
    async (olderOutcome) => {
      const runtimeContext = createRuntimeContext();
      prepareStoreOwner(runtimeContext);
      const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
      const anchor = createMessageDto({ uuid: MESSAGE_A });
      const pageRequest = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
      const windowRequest = createDeferred<MessengerMessageWindow>();
      const pageController = new AbortController();
      const pageLoading = loadMessengerMessageWindowPage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId,
        direction: "before",
        pageMarker: "older-cursor",
        signal: pageController.signal,
        client: { getMessagesPage: () => pageRequest.promise },
      });
      const windowLoading = loadMessengerMessageWindowAroundMessage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        messageUuid: MESSAGE_A,
        onAnchorApplied: vi.fn(),
        client: {
          getMessageWindowAroundMessage: (_options, _query, hooks) => {
            hooks?.onAnchor?.(anchor);
            return windowRequest.promise;
          },
        },
      });

      pageController.abort();
      if (olderOutcome === "resolve") {
        pageRequest.resolve(createMessagesPage([anchor]));
      } else {
        pageRequest.reject(new DOMException("Aborted", "AbortError"));
      }

      await expect(pageLoading).resolves.toMatchObject({
        status: "skipped",
        reason: "stale-owner",
      });
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(true);

      windowRequest.resolve(createMessageWindow({ anchor, before: [], after: [] }));
      await expect(windowLoading).resolves.toMatchObject({
        status: "applied",
        conversationId,
      });
      expect(
        selectWorkspaceMessageStatusForConversation(
          useWorkspaceMessageStore.getState(),
          conversationId,
        ).loading,
      ).toBe(false);
    },
  );

  it("clears previous window markers when a new staged anchor context fails", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    const anchor = createMessageDto({
      uuid: MESSAGE_B,
      created_at: DATE_LATER,
      updated_at: DATE_LATER,
    });
    const windowRequest = createDeferred<MessengerMessageWindow>();
    useWorkspaceMessageStore.getState().setConversationWindowMarkers(conversationId, {
      beforePageMarker: "previous-before",
      afterPageMarker: "previous-after",
    });

    const loading = loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      messageUuid: MESSAGE_B,
      onAnchorApplied: vi.fn(),
      client: {
        getMessageWindowAroundMessage: (_options, _query, hooks) => {
          hooks?.onAnchor?.(anchor);
          return windowRequest.promise;
        },
      },
    });

    expect(
      useWorkspaceMessageStore.getState().beforePageMarkerByConversationId[conversationId],
    ).toBeNull();
    expect(
      useWorkspaceMessageStore.getState().afterPageMarkerByConversationId[conversationId],
    ).toBeNull();

    windowRequest.reject(new Error("Context request failed"));
    await expect(loading).resolves.toMatchObject({
      status: "failed",
      conversationId,
      error: "Context request failed",
    });
    const state = useWorkspaceMessageStore.getState();
    expect(state.messageWindowStateByConversationId[conversationId]).toBe("staged");
    expect(state.beforePageMarkerByConversationId[conversationId]).toBeNull();
    expect(state.afterPageMarkerByConversationId[conversationId]).toBeNull();
    expect(selectWorkspaceMessageStatusForConversation(state, conversationId).loading).toBe(false);
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
