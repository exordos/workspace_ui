import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { adaptMessengerStream } from "~/applications/messenger/model/chats/messenger-catalog-adapters.lib";
import { getMessengerStoreForOwner } from "~/applications/messenger/model/chats/messenger.model";
import { loadMessengerConversationMessages } from "~/applications/messenger/model/messages/history/messenger-messages-loader.lib";
import { getWorkspaceMessageStoreForOwner } from "~/applications/messenger/model/messages/message.model";
import { createMessages } from "~/applications/messenger/model/messages/messages";
import { adaptMessengerMessage } from "~/applications/messenger/model/messages/messenger-message-adapter.lib";
import { prepareMessengerSessionSnapshot } from "~/applications/messenger/runtime/sync/messenger-session-snapshot.lib";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { createWorkspaceRealtimeBrowserCursorStorage } from "~/platform/realtime/workspace-realtime-cursor.lib";
import { createWorkspaceRealtimeTransportCore } from "~/platform/realtime/workspace-realtime-runtime.lib";
import { MessengerApiError } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerRealtimeEventDto,
} from "~/shared/api/messenger.types";
import {
  createWorkspaceSessionRuntimeManager,
  toWorkspaceSessionContext,
} from "./workspace-session.lib";

vi.mock("~/platform/realtime/workspace-realtime-runtime.lib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/platform/realtime/workspace-realtime-runtime.lib")>()),
  createWorkspaceRealtimeTransportCore: vi.fn(() => ({
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
  })),
}));

function createSession(accountId: string): WorkspaceAuthSession {
  const suffix = accountId.endsWith("a") ? "a" : "b";
  const userUuid = `11111111-1111-4111-8111-11111111111${suffix}`;
  return {
    accountId,
    instanceId: `${accountId}-instance`,
    organizationId: `${accountId}-org`,
    organizationOrigin: `https://${accountId}.example.invalid`,
    projectId: `22222222-2222-4222-8222-22222222222${suffix}`,
    userUuid,
    login: "tester",
    accessToken: "test-token",
    runtimeGeneration: 1,
    profile: {
      uuid: userUuid,
      username: "tester",
      firstName: null,
      lastName: null,
      email: null,
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
});

const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const DATE = "2026-07-07T10:00:00Z";
const CONVERSATION = `topic:${STREAM_UUID}:${TOPIC_UUID}` as const;

function messageDto(session: WorkspaceAuthSession, content: string): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_UUID,
    project_id: session.projectId,
    user_uuid: session.userUuid,
    stream_uuid: STREAM_UUID,
    topic_uuid: TOPIC_UUID,
    author_uuid: session.userUuid,
    payload: { kind: "markdown", content },
    read: true,
    starred: false,
    pinned: false,
    is_own: true,
    reactions: {},
    reaction_users: {},
    created_at: DATE,
    updated_at: DATE,
  };
}

function seedWarmModels(session: WorkspaceAuthSession) {
  const { ownerKey } = toWorkspaceSessionContext(session);
  const catalog = getMessengerStoreForOwner(ownerKey);
  const messages = getWorkspaceMessageStoreForOwner(ownerKey);
  if (catalog == null || messages == null) throw new Error("Missing authorized models");
  catalog.getState().replaceBootstrapState(ownerKey, {
    streams: [
      adaptMessengerStream({
        uuid: STREAM_UUID,
        project_id: session.projectId,
        user_uuid: session.userUuid,
        owner: session.userUuid,
        role: "owner",
        name: session.accountId,
        description: "",
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
      }),
    ],
    topics: [],
    streamBindings: [],
    folders: [],
    conversations: [],
  });
  messages.getState().replaceConversationWindow({
    conversationId: CONVERSATION,
    expectedRevision: null,
    capturedMutationRevision: 0,
    mode: "tail",
    anchorMessageUuid: null,
    markers: { beforePageMarker: null, afterPageMarker: null },
    messages: [adaptMessengerMessage(messageDto(session, session.accountId))],
  });
  return { catalog, messages };
}

function getScreenMessages() {
  const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null) throw new Error("Missing screen context");
  return createMessages({ runtimeContext, getRuntimeContext });
}

it("keeps both transports and their same-UUID windows warm through A → B → A", async () => {
  const a = createSession("account-a");
  const b = createSession("account-b");
  const aContext = toWorkspaceSessionContext(a);
  const bContext = toWorkspaceSessionContext(b);
  useWorkspaceAuthStore.setState({ sessions: [a, b], currentAccountId: a.accountId });
  const aModels = seedWarmModels(a);
  const bModels = seedWarmModels(b);
  const manager = createWorkspaceSessionRuntimeManager(
    createWorkspaceRealtimeBrowserCursorStorage(),
  );
  const applierInputs = vi.mocked(createWorkspaceRealtimeTransportCore).mock.calls;
  const runtimes = vi.mocked(createWorkspaceRealtimeTransportCore).mock.results;
  const oldA = getScreenMessages();
  try {
    await manager.update([aContext, bContext], aContext.ownerKey);
    await applierInputs[1]?.[0].applier.applyEvent(
      {
        type: "message",
        kind: "message.updated",
        epoch_version: 11,
        message: {
          ...messageDto(b, "B updated in background"),
          updated_at: "2026-07-07T10:01:00Z",
        },
      },
      { ...bContext, surface: "background", source: "catch_up" },
    );
    expect(oldA.getWindow(CONVERSATION).messages[0]?.payload).toMatchObject({
      content: a.accountId,
    });
    expect(bModels.messages.getState().messagesById[MESSAGE_UUID]?.payload).toMatchObject({
      content: "B updated in background",
    });

    useWorkspaceAuthStore.getState().setCurrentAccountId(b.accountId);
    await manager.update([aContext, bContext], bContext.ownerKey);
    expect(getScreenMessages().getWindow(CONVERSATION).messages[0]?.payload).toMatchObject({
      content: "B updated in background",
    });
    await applierInputs[0]?.[0].applier.applyEvent(
      {
        type: "message",
        kind: "message.updated",
        epoch_version: 12,
        message: {
          ...messageDto(a, "A updated in background"),
          updated_at: "2026-07-07T10:01:00Z",
        },
      },
      { ...aContext, surface: "active", source: "catch_up" },
    );
    expect(aModels.messages.getState().messagesById[MESSAGE_UUID]?.payload).toMatchObject({
      content: "A updated in background",
    });
    expect(bModels.catalog.getState().lastEpochVersion).toBe(11);

    useWorkspaceAuthStore.getState().setCurrentAccountId(a.accountId);
    await manager.update([aContext, bContext], aContext.ownerKey);
    expect(oldA.getWindow(CONVERSATION).messages).toEqual([]);
    expect(getScreenMessages().getWindow(CONVERSATION).messages[0]?.payload).toMatchObject({
      content: "A updated in background",
    });
    expect(runtimes[0]?.value.start).toHaveBeenCalledOnce();
    expect(runtimes[1]?.value.start).toHaveBeenCalledOnce();

    useWorkspaceAuthStore.getState().removeSession(b.accountId);
    await manager.update([aContext], aContext.ownerKey);
    expect(runtimes[0]?.value.stop).not.toHaveBeenCalled();
    expect(runtimes[1]?.value.stop).toHaveBeenCalledWith("manager_remove");
    expect(getWorkspaceMessageStoreForOwner(bContext.ownerKey)).toBeNull();
    expect(getMessengerStoreForOwner(aContext.ownerKey)).toBe(aModels.catalog);
  } finally {
    await manager.stopAll();
  }
});

it("rejects a late screen history response after A → B → A, with identical conversation UUIDs", async () => {
  const a = createSession("account-a");
  const b = createSession("account-b");
  useWorkspaceAuthStore.setState({ sessions: [a, b], currentAccountId: a.accountId });
  const aModels = seedWarmModels(a);
  const bModels = seedWarmModels(b);
  const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  const runtimeContext = getRuntimeContext();
  if (runtimeContext == null) throw new Error("Missing old screen");
  let release: (() => void) | undefined;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  const loadPage = vi.fn(async () => {
    await response;
    return { items: [messageDto(a, "stale A history")], nextPageMarker: null, pageLimit: 50 };
  });
  const loading = loadMessengerConversationMessages({
    runtimeContext,
    getRuntimeContext,
    conversationId: CONVERSATION,
    store: aModels.messages,
    client: { getMessagesPage: loadPage },
    cache: {
      readConversationMessageWindow: () =>
        Promise.resolve({ messages: [], window: null, nextPageMarker: null, hasMore: false }),
    },
  });
  await vi.waitFor(() => expect(loadPage).toHaveBeenCalledOnce());
  useWorkspaceAuthStore.getState().setCurrentAccountId(b.accountId);
  useWorkspaceAuthStore.getState().setCurrentAccountId(a.accountId);
  release?.();
  await expect(loading).resolves.toMatchObject({ status: "skipped", reason: "stale-owner" });
  expect(aModels.messages.getState().messagesById[MESSAGE_UUID]?.payload).toMatchObject({
    content: a.accountId,
  });
  expect(bModels.messages.getState().messagesById[MESSAGE_UUID]?.payload).toMatchObject({
    content: b.accountId,
  });
});

it("keeps applying A events while B recovers a pruned cursor into its own model", async () => {
  const a = createSession("account-a");
  const b = createSession("account-b");
  const aContext = toWorkspaceSessionContext(a);
  const bContext = toWorkspaceSessionContext(b);
  useWorkspaceAuthStore.setState({ sessions: [a, b], currentAccountId: a.accountId });
  const aModels = seedWarmModels(a);
  const bModels = seedWarmModels(b);
  const actual = await vi.importActual<
    typeof import("~/platform/realtime/workspace-realtime-runtime.lib")
  >("~/platform/realtime/workspace-realtime-runtime.lib");
  const cursors = createWorkspaceRealtimeBrowserCursorStorage();
  const cursor = (epochVersion: number) => ({ epochGeneration: "generation", epochVersion });
  cursors.write(a, cursor(120));
  cursors.write(b, cursor(200));
  let releaseSnapshot: (() => void) | undefined;
  const pendingSnapshot = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  const bStreams = vi.fn(async () => {
    await pendingSnapshot;
    return [];
  });
  let replayA = false;
  const event = (
    session: WorkspaceAuthSession,
    epochVersion: number,
    content: string,
  ): WorkspaceMessengerRealtimeEventDto => ({
    schema_version: 1,
    uuid: MESSAGE_UUID,
    project_id: session.projectId,
    user_uuid: session.userUuid,
    epoch_version: epochVersion,
    created_at: DATE,
    updated_at: DATE,
    object_type: "message",
    action: epochVersion === 301 ? "created" : "updated",
    payload: {
      kind: epochVersion === 301 ? "message.created" : "message.updated",
      ...messageDto(session, content),
      updated_at: "2026-07-07T10:01:00Z",
    },
  });

  const mockedCore = vi.mocked(createWorkspaceRealtimeTransportCore);
  const previousFactory = mockedCore.getMockImplementation();
  mockedCore.mockImplementation((options) => {
    const isA = options.clientOptions.projectId === a.projectId;
    return actual.createWorkspaceRealtimeTransportCore({
      ...options,
      reconnectDelayMs: () => 1,
      webSocketFactory: () => ({
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send() {},
        close() {},
      }),
      async prepareSnapshots(context, { savedCursor, resetRequired }) {
        if (!resetRequired && savedCursor != null) return savedCursor;
        const result = await prepareMessengerSessionSnapshot({
          runtimeContext: b,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getRuntimeContextForOwner(b),
          signal: context.signal,
          surface: "background",
          reset: true,
          client: {
            getStreams: bStreams,
            getTopics: () => Promise.resolve([]),
            getFolders: () => Promise.resolve([]),
          },
        });
        if (result.status !== "applied") throw new Error("B recovery did not apply");
        return cursor(300);
      },
      getEventsPage(_client, query) {
        const after = query.afterEpochVersion ?? 0;
        if (!isA && after === 200) {
          return Promise.reject(
            new MessengerApiError("cursor expired", 410, {
              type: "EventsCursorExpiredError",
              code: 410,
              error: "epoch_pruned",
              message: "fixture cursor expired",
              reason: "epoch_pruned",
              epoch_generation: "generation",
              current_epoch_version: 300,
              minimum_epoch_version: 250,
            }),
          );
        }
        const items =
          isA && replayA && after === 120
            ? [event(a, 121, "A advanced during recovery")]
            : !isA && after === 300
              ? [event(b, 301, "B catch-up on new boundary")]
              : [];
        return Promise.resolve({ items, nextPageMarker: null, pageLimit: 50 });
      },
    });
  });
  const manager = createWorkspaceSessionRuntimeManager(cursors);
  const starting = manager.update([aContext, bContext], aContext.ownerKey);
  try {
    await vi.waitFor(() => expect(bStreams).toHaveBeenCalledOnce());
    expect(cursors.isSnapshotResetRequired(b)).toBe(true);
    expect(cursors.read(a)).toEqual(cursor(120));
    replayA = true;
    const active = mockedCore.mock.results[0]?.value;
    await active?.reconnect("test_owner_a");
    expect(cursors.read(a)).toEqual(cursor(121));
    expect(aModels.messages.getState().messagesById[MESSAGE_UUID]?.payload).toMatchObject({
      content: "A advanced during recovery",
    });
    expect(cursors.isSnapshotResetRequired(b)).toBe(true);

    releaseSnapshot?.();
    await starting;
    await vi.waitFor(() => expect(cursors.read(b)).toEqual(cursor(301)));
    expect(bModels.catalog.getState().lastEpochVersion).toBe(301);
    expect(bModels.messages.getState().messagesById[MESSAGE_UUID]?.payload).toMatchObject({
      content: "B catch-up on new boundary",
    });
    expect(aModels.catalog.getState().lastEpochVersion).toBe(121);
    expect(aModels.messages.getState().conversationWindowsById[CONVERSATION]?.messageUuids).toEqual(
      [MESSAGE_UUID],
    );
    expect(bModels.messages.getState().conversationWindowsById[CONVERSATION]).toBeUndefined();
  } finally {
    releaseSnapshot?.();
    await manager.stopAll();
    if (previousFactory != null) mockedCore.mockImplementation(previousFactory);
  }
});

it("fences an old background transport when auth publishes tokens before reconciliation", async () => {
  const active = createSession("account-a");
  const background = createSession("account-b");
  const activeContext = toWorkspaceSessionContext(active);
  const backgroundContext = toWorkspaceSessionContext(background);
  useWorkspaceAuthStore.setState({
    sessions: [active, background],
    currentAccountId: active.accountId,
  });
  const manager = createWorkspaceSessionRuntimeManager(
    createWorkspaceRealtimeBrowserCursorStorage(),
  );
  try {
    await manager.update([activeContext, backgroundContext], activeContext.ownerKey);
    const calls = vi.mocked(createWorkspaceRealtimeTransportCore).mock.calls;
    const first = calls[0]?.[0];
    const second = calls[1]?.[0];
    expect(first?.isOwnerCurrent?.(activeContext.owner)).toBe(true);
    expect(second?.isOwnerCurrent?.(backgroundContext.owner)).toBe(true);

    // Credential rotation invalidates only B. The selected owner A stays valid.
    useWorkspaceAuthStore
      .getState()
      .updateTokens(background.accountId, { accessToken: "rotated-token" });
    const rotated = useWorkspaceAuthStore.getState().sessions[1];
    expect(rotated?.runtimeGeneration).not.toBe(background.runtimeGeneration);
    expect(second?.isOwnerCurrent?.(backgroundContext.owner)).toBe(false);
    expect(first?.isOwnerCurrent?.(activeContext.owner)).toBe(true);
    if (rotated == null) throw new Error("Missing rotated background session");

    await manager.update(
      [activeContext, toWorkspaceSessionContext(rotated)],
      activeContext.ownerKey,
    );
    expect(calls[2]?.[0].isOwnerCurrent?.(toWorkspaceSessionContext(rotated).owner)).toBe(true);
    expect(second?.isOwnerCurrent?.(backgroundContext.owner)).toBe(false);
  } finally {
    await manager.stopAll();
  }
});
