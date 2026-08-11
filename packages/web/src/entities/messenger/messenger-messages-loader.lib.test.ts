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
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerMessageReactionDto,
} from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { syncMessengerOwnerOwnMessageReactions } from "./messenger-message-reactions-actions.lib";
import {
  applyMessengerMessageWindow,
  fetchMessengerMessageWindow,
  loadMessengerConversationMessages,
  loadMessengerMessageWindowPage,
  resolveMessengerMessageAnchor,
  type MessengerFetchedMessageWindow,
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

describe("messenger conversation messages loader", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().setOwner(null, false);
    useWorkspaceMessageStore.getState().clear();
    clearMessengerReadBoundariesForOwner(workspaceRuntimeOwnerKey(createRuntimeContext()));
  });

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
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
      "fresh",
    );
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
      expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.payload.content).toBe(
        "newer realtime body",
      );
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
    const expectedRevision =
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]!.revision;

    await expect(
      loadMessengerMessageWindowPage({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        conversationId,
        direction: "before",
        pageMarker: "older-cursor",
        expectedRevision,
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
    const expectedRevision =
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]!.revision;
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
      expectedRevision,
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

  it("returns a failed page result when post-fetch reaction sync throws", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "older-cursor",
    });
    const expectedRevision =
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]!.revision;

    await expect(
      loadMessengerMessageWindowPage({
        runtimeContext,
        conversationId,
        direction: "before",
        pageMarker: "older-cursor",
        expectedRevision,
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
    const firstRevision =
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]!.revision;
    const oldHydration = createDeferred<{
      status: "applied";
      ownerKey: string;
      messageUuids: string[];
      reactions: number;
    }>();
    const oldRequest = loadMessengerMessageWindowPage({
      runtimeContext,
      conversationId,
      direction: "before",
      pageMarker: "older-cursor",
      expectedRevision: firstRevision,
      client: {
        getMessagesPage: () => Promise.resolve(createMessagesPage([createMessageDto()])),
      },
      ownReactionSync: {
        hydrateFromCache: () => oldHydration.promise,
        syncOwner: () => {
          throw new Error("old reaction sync failed");
        },
      },
    });
    await vi.waitFor(() =>
      expect(
        useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]
          ?.beforePageMarker,
      ).toBe("next-page"),
    );

    const currentWindow =
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]!;
    const newerPage = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const newerRequest = loadMessengerMessageWindowPage({
      runtimeContext,
      conversationId,
      direction: "before",
      pageMarker: "next-page",
      expectedRevision: currentWindow.revision,
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

  it("does not apply a late page after a newer anchor window owns the conversation", async () => {
    const runtimeContext = createRuntimeContext();
    prepareStoreOwner(runtimeContext);
    const conversationId = `topic:${STREAM_A}:${TOPIC_A}` as const;
    replaceConversationWindow({
      conversationId,
      messages: [],
      beforePageMarker: "stale-page",
    });
    const expectedRevision =
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]!.revision;
    const page = createDeferred<MessengerCollectionPage<WorkspaceMessengerMessageDto>>();
    const controller = new AbortController();
    const pageRequest = loadMessengerMessageWindowPage({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      conversationId,
      direction: "before",
      pageMarker: "stale-page",
      expectedRevision,
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
      pageMarker: "next-page",
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
      pageMarker: "next-page",
      client: { getMessagesPage },
      cache,
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
