import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetWorkspaceComposerDraftStoreForTests,
  selectWorkspaceComposerDraft,
  useWorkspaceComposerDraftStore,
} from "~/entities/composer-draft/composer-draft.model";
import { useDownloadStore } from "~/entities/download/download.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerOutboxStore } from "~/entities/messenger/messenger-outbox.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerBootstrapPayload,
  MessengerMessage,
} from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { createJitsiCallKey, useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { useWorkspaceForwardMessageStore } from "~/features/workspace-forward-message/workspace-forward-message.model";
import { t } from "~/i18n/i18n";
import { OpenSearchContext } from "~/shared/contexts/open-search";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import type { RightDrawerContextValue } from "~/shared/contexts/right-drawer.types";
import {
  deleteWorkspaceMessengerCacheDatabase,
  openWorkspaceMessengerCacheDb,
  resetWorkspaceMessengerCacheDbSingletonForTests,
} from "~/shared/lib/workspace-messenger-cache-db";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import type {
  ChatChannelHeaderProps,
  ChatDirectHeaderProps,
} from "~/widgets/chat-view/chat-header.types";
import { ChatPage, FavoritesPage } from "./chat-page.ui";
import type { ChatPageComposerSectionProps } from "./chat-page-composer-section.types";
import type { ChatPageWorkspaceMessageListSectionProps } from "./chat-page-workspace-message-list-section.types";

function seedWorkspaceMessageBody(message: MessengerMessage): void {
  const state = useWorkspaceMessageStore.getState();
  state.upsertMessageBodyFromSnapshot(message, state.messageMutationRevision);
}

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const DIRECT_STREAM_UUID = "88888888-8888-4888-8888-888888888888";
const DIRECT_TOPIC_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_UUID = "33333333-3333-4333-8333-333333333333";
const USER_B_UUID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_UUID = "55555555-5555-4555-8555-555555555555";
const SECOND_MESSAGE_UUID = "99999999-9999-4999-8999-999999999991";
const THIRD_MESSAGE_UUID = "99999999-9999-4999-8999-999999999992";
const STREAM_BINDING_A_UUID = "66666666-6666-4666-8666-666666666666";
const STREAM_BINDING_B_UUID = "77777777-7777-4777-8777-777777777777";

const captured = vi.hoisted(() => ({
  composerProps: null as ChatPageComposerSectionProps | null,
  channelHeaderProps: null as ChatChannelHeaderProps | null,
  directHeaderProps: null as ChatDirectHeaderProps | null,
  messageListProps: null as ChatPageWorkspaceMessageListSectionProps | null,
  renderRealMessageList: false,
  holdRealListFocusedMessageApplied: false,
  omitFetchedAnchorFromWindow: false,
  realListFocusedMessageApplied: vi.fn(),
  realListFocusedMessageMissing: vi.fn(),
  fetchTargetConversationIds: [] as string[],
  loadWorkspaceMessages: vi.fn().mockResolvedValue({ status: "applied" }),
  loadWorkspaceMessageWindowAroundMessage: vi.fn().mockResolvedValue({
    status: "applied",
    ownerKey: "owner-key",
    conversationId:
      "topic:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    anchorUuid: "55555555-5555-4555-8555-555555555555",
    beforePageMarker: null,
    afterPageMarker: null,
  }),
  loadWorkspaceMessageWindowPage: vi.fn().mockResolvedValue({
    status: "applied",
    ownerKey: "owner-key",
    conversationId:
      "topic:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    direction: "before",
    nextPageMarker: null,
    pageLimit: 50,
  }),
  loadMessengerQuoteMessage: vi.fn().mockResolvedValue({ status: "unavailable" }),
  loadWorkspaceFile: vi.fn(),
  downloadWorkspaceFile: vi.fn(),
  uploadWorkspaceFileWithProgress: vi.fn(),
  deleteWorkspaceFile: vi.fn(),
  sendMessengerMessage: vi.fn(),
  editMessengerMessage: vi.fn(),
  markMessengerMessagesReadUpTo: vi.fn(),
  streamBindingsForRoute: vi.fn(),
  syncWorkspaceComposerDraft: vi.fn().mockResolvedValue(undefined),
  deleteWorkspaceComposerDraftFromServer: vi.fn().mockReturnValue(true),
}));

function createTestWorkspaceFileResourceCache() {
  const entries = new Map<
    string,
    { abortController: AbortController; promise: Promise<{ blob: Blob; headers: Headers }> }
  >();

  return {
    load(options: {
      ownerKey: string;
      runtimeGeneration: number;
      fileUuid: string;
      requestOptions: unknown;
      signal?: AbortSignal;
    }): Promise<{ blob: Blob; headers: Headers }> {
      if (options.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }

      const key = JSON.stringify([options.ownerKey, options.runtimeGeneration, options.fileUuid]);
      let entry = entries.get(key);
      if (entry == null) {
        const abortController = new AbortController();
        const promise = captured.loadWorkspaceFile({
          ...options,
          signal: abortController.signal,
        });
        entry = { abortController, promise };
        entries.set(key, entry);
        void promise.catch(() => {
          if (entries.get(key)?.promise === promise) {
            entries.delete(key);
          }
        });
      }

      if (options.signal == null) {
        return entry.promise;
      }

      return new Promise((resolve, reject) => {
        const onAbort = () => {
          options.signal?.removeEventListener("abort", onAbort);
          reject(new DOMException("Aborted", "AbortError"));
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });
        void entry?.promise.then(
          (value) => {
            options.signal?.removeEventListener("abort", onAbort);
            if (options.signal?.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            resolve(value);
          },
          (error: unknown) => {
            options.signal?.removeEventListener("abort", onAbort);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      });
    },
    clear() {
      for (const entry of entries.values()) {
        entry.abortController.abort();
      }
      entries.clear();
    },
  };
}

vi.mock("~/entities/messenger/messenger-messages-loader.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/entities/messenger/messenger-messages-loader.lib")>();
  const resolvedWindows = new Map<
    string,
    {
      conversationId: string;
      anchorUuid: string;
      ownerKey: string;
      beforePageMarker: string | null;
      afterPageMarker: string | null;
      hasKnownBody: boolean;
    }
  >();
  return {
    ...actual,
    loadMessengerConversationMessages: captured.loadWorkspaceMessages,
    loadMessengerMessageWindowPage: captured.loadWorkspaceMessageWindowPage,
    resolveMessengerMessageAnchor: async (options: {
      runtimeContext: {
        accountId: string;
        instanceId: string;
        organizationId: string;
        projectId: string;
        userUuid: string;
        runtimeGeneration: number;
      };
      messageUuid: string;
      signal?: AbortSignal;
    }) => {
      const knownMessage = useWorkspaceMessageStore.getState().messagesById[options.messageUuid];
      const result = await captured.loadWorkspaceMessageWindowAroundMessage({
        ...options,
        conversationId: knownMessage?.conversationId,
      });
      if (result.status !== "applied") return result;
      const ownerKey = workspaceRuntimeOwnerKey(options.runtimeContext);
      const conversationId = result.conversationId;
      const parts = conversationId.split(":");
      const message =
        knownMessage ??
        ({
          uuid: options.messageUuid,
          conversationId,
          projectId: options.runtimeContext.projectId,
          streamUuid: parts[1] ?? STREAM_UUID,
          topicUuid: parts[0] === "topic" ? parts[2] : undefined,
          authorUuid: options.runtimeContext.userUuid,
          userUuid: options.runtimeContext.userUuid,
          payload: { kind: "markdown", content: "anchor" },
          read: true,
          pinned: false,
          starred: false,
          isOwn: true,
          reactions: {},
          reactionUserUuidsByEmojiName: {},
          ownReactionUuidsByEmojiName: {},
          createdAt: "2026-08-10T10:00:00Z",
          updatedAt: "2026-08-10T10:00:00Z",
        } satisfies MessengerMessage);
      const messageState = useWorkspaceMessageStore.getState();
      messageState.upsertMessageBodyFromSnapshot(message, messageState.messageMutationRevision);
      resolvedWindows.set(`${options.messageUuid}:${options.signal == null ? "none" : "signal"}`, {
        conversationId,
        anchorUuid: result.anchorUuid,
        ownerKey,
        beforePageMarker: result.beforePageMarker,
        afterPageMarker: result.afterPageMarker,
        hasKnownBody: knownMessage != null,
      });
      return { status: "resolved", ownerKey, conversationId, message };
    },
    fetchMessengerMessageWindow: (options: {
      anchor: {
        ownerKey: string;
        conversationId: string;
        message: MessengerMessage;
      };
      targetConversationId: string;
      signal?: AbortSignal;
    }) => {
      captured.fetchTargetConversationIds.push(options.targetConversationId);
      const cached = resolvedWindows.get(
        `${options.anchor.message.uuid}:${options.signal == null ? "none" : "signal"}`,
      );
      return Promise.resolve({
        status: "fetched",
        window: {
          ownerKey: options.anchor.ownerKey,
          conversationId: options.targetConversationId,
          anchorUuid: cached?.anchorUuid ?? options.anchor.message.uuid,
          messages:
            captured.omitFetchedAnchorFromWindow || cached?.hasKnownBody === false
              ? []
              : [options.anchor.message],
          beforePageMarker: cached?.beforePageMarker ?? null,
          afterPageMarker: cached?.afterPageMarker ?? null,
          expectedWindowRevision:
            useWorkspaceMessageStore.getState().conversationWindowsById[
              options.targetConversationId
            ]?.revision ?? null,
          capturedMutationRevision: useWorkspaceMessageStore.getState().messageMutationRevision,
        },
      });
    },
    applyMessengerMessageWindow: (options: {
      window: {
        ownerKey: string;
        conversationId: string;
        anchorUuid: string;
        messages: MessengerMessage[];
        beforePageMarker: string | null;
        afterPageMarker: string | null;
        expectedWindowRevision: number | null;
        capturedMutationRevision: number;
      };
      isRequestCurrent: () => boolean;
    }) => {
      if (!options.isRequestCurrent()) {
        return Promise.resolve({ status: "skipped", reason: "stale-owner" });
      }
      useWorkspaceMessageStore.getState().replaceConversationWindow({
        conversationId: options.window.conversationId,
        expectedRevision: options.window.expectedWindowRevision,
        capturedMutationRevision: options.window.capturedMutationRevision,
        mode: "around-anchor",
        anchorMessageUuid: options.window.anchorUuid,
        messages: options.window.messages,
        markers: {
          beforePageMarker: options.window.beforePageMarker,
          afterPageMarker: options.window.afterPageMarker,
        },
      });
      return Promise.resolve({
        status: "applied",
        ownerKey: options.window.ownerKey,
        conversationId: options.window.conversationId,
        anchorUuid: options.window.anchorUuid,
      });
    },
  };
});

vi.mock("~/entities/messenger/messenger-quote-loader.lib", () => ({
  loadMessengerQuoteMessage: captured.loadMessengerQuoteMessage,
}));

vi.mock("~/shared/api/messenger-files.api", () => ({
  downloadWorkspaceFile: captured.downloadWorkspaceFile,
  uploadWorkspaceFileWithProgress: captured.uploadWorkspaceFileWithProgress,
  deleteWorkspaceFile: captured.deleteWorkspaceFile,
}));

vi.mock("~/shared/lib/workspace-file-loader.lib", () => ({
  loadWorkspaceFile: captured.loadWorkspaceFile,
  createWorkspaceFileResourceCache: createTestWorkspaceFileResourceCache,
}));

vi.mock("~/entities/messenger/messenger-message-actions.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/entities/messenger/messenger-message-actions.lib")>();
  return {
    ...actual,
    sendMessengerMessage: captured.sendMessengerMessage,
    editMessengerMessage: captured.editMessengerMessage,
    markMessengerMessagesReadUpTo: captured.markMessengerMessagesReadUpTo,
  };
});

vi.mock("~/entities/messenger/messenger-stream-bindings-loader.lib", () => ({
  useMessengerStreamBindingsForRoute: captured.streamBindingsForRoute,
}));

vi.mock("~/entities/composer-draft/composer-draft-sync.lib", () => ({
  syncWorkspaceComposerDraft: captured.syncWorkspaceComposerDraft,
  deleteWorkspaceComposerDraftFromServer: captured.deleteWorkspaceComposerDraftFromServer,
}));

vi.mock("~/widgets/chat-view/chat-header-channel.ui", () => ({
  ChatChannelHeader: (props: ChatChannelHeaderProps) => {
    captured.channelHeaderProps = props;
    return (
      <header data-testid="chat-header">
        <span>{props.channelName}</span>
        {props.topic != null ? <span>{props.topic}</span> : null}
      </header>
    );
  },
}));

vi.mock("~/widgets/chat-view/chat-header-direct.ui", () => ({
  ChatDirectHeader: (props: ChatDirectHeaderProps) => {
    captured.directHeaderProps = props;
    return (
      <header data-testid="chat-header">
        <span>{props.partner.name}</span>
      </header>
    );
  },
}));

vi.mock("./chat-page-workspace-message-list-section.ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./chat-page-workspace-message-list-section.ui")>();

  return {
    ChatPageWorkspaceMessageListSection: (props: ChatPageWorkspaceMessageListSectionProps) => {
      captured.messageListProps = props;
      if (captured.renderRealMessageList) {
        return (
          <actual.ChatPageWorkspaceMessageListSection
            {...props}
            onFocusedMessageApplied={(messageUuid) => {
              captured.realListFocusedMessageApplied(messageUuid);
              if (!captured.holdRealListFocusedMessageApplied) {
                props.onFocusedMessageApplied?.(messageUuid);
              }
            }}
            onFocusedMessageMissing={(messageUuid) => {
              captured.realListFocusedMessageMissing(messageUuid);
              props.onFocusedMessageMissing?.(messageUuid);
            }}
          />
        );
      }
      return (
        <div data-testid="workspace-message-list-section">
          {props.messages.map((message) => (
            <article key={message.uuid} data-message-uuid={message.uuid}>
              {message.payload.content}
            </article>
          ))}
          {props.outgoingMessages?.map((message) => (
            <article key={message.localId} data-outgoing-message-id={message.localId}>
              {message.markdown}:{message.status}
            </article>
          ))}
        </div>
      );
    },
  };
});

vi.mock("./chat-page-composer-section.ui", () => ({
  ChatPageComposerSection: (props: ChatPageComposerSectionProps) => {
    captured.composerProps = props;
    return <div data-testid="old-composer-section" />;
  },
}));

function createSession(): WorkspaceAuthSession {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: "project-a",
    userUuid: USER_UUID,
    login: "user@example.com",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    runtimeGeneration: 1,
    profile: {
      uuid: USER_UUID,
      username: "alice",
      firstName: "Alice",
      lastName: "Stone",
      email: "alice@example.com",
    },
  };
}

function createBootstrapPayload(): MessengerBootstrapPayload {
  return {
    streams: [
      {
        uuid: STREAM_UUID,
        projectId: "project-a",
        ownerUuid: USER_UUID,
        userUuid: USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        name: "general",
        description: "",
        unreadCount: 1,
        sourceName: "native",
        source: { kind: "native" },
        audience: "channel",
        isPrivate: false,
        inviteOnly: false,
        announce: false,
        isArchived: false,
        directUserUuid: null,
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    streamBindings: [
      {
        uuid: STREAM_BINDING_A_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_UUID,
        whoUuid: USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
      {
        uuid: STREAM_BINDING_B_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_B_UUID,
        whoUuid: USER_B_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    topics: [
      {
        uuid: TOPIC_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_UUID,
        name: "Roadmap",
        unreadCount: 1,
        isDefault: false,
        isDone: false,
        notificationMode: "default",
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    conversations: [],
    folders: [],
  };
}

function createDirectPrivateBootstrapPayload(): MessengerBootstrapPayload {
  const payload = createBootstrapPayload();
  const stream = payload.streams[0]!;

  return {
    ...payload,
    streams: [
      {
        ...stream,
        uuid: DIRECT_STREAM_UUID,
        name: "Bob",
        audience: "private",
        isPrivate: true,
        directUserUuid: USER_B_UUID,
      },
    ],
    streamBindings: [],
    topics: [
      {
        ...payload.topics[0]!,
        uuid: DIRECT_TOPIC_UUID,
        streamUuid: DIRECT_STREAM_UUID,
        name: "private",
        unreadCount: 0,
        isDefault: true,
      },
    ],
  };
}

function createSelfChatBootstrapPayload(): MessengerBootstrapPayload {
  const payload = createDirectPrivateBootstrapPayload();
  return {
    ...payload,
    streams: payload.streams.map((stream) => ({
      ...stream,
      name: "Personal notes",
      ownerUuid: USER_UUID,
      userUuid: USER_UUID,
      directUserUuid: USER_UUID,
    })),
  };
}

function createMessage(): MessengerMessage {
  return {
    uuid: MESSAGE_UUID,
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: USER_B_UUID,
    userUuid: USER_B_UUID,
    payload: { kind: "markdown", content: "workspace message" },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T10:00:00.000Z",
  };
}

function createSecondMessage(): MessengerMessage {
  return {
    ...createMessage(),
    uuid: SECOND_MESSAGE_UUID,
    payload: { kind: "markdown", content: "second workspace message" },
    createdAt: "2026-06-30T10:01:00.000Z",
    updatedAt: "2026-06-30T10:01:00.000Z",
  };
}

function createThirdMessage(): MessengerMessage {
  return {
    ...createSecondMessage(),
    uuid: THIRD_MESSAGE_UUID,
    payload: { kind: "markdown", content: "third workspace message" },
    createdAt: "2026-06-30T10:02:00.000Z",
    updatedAt: "2026-06-30T10:02:00.000Z",
  };
}

function createDirectMessage(): MessengerMessage {
  return {
    ...createSecondMessage(),
    conversationId: `topic:${DIRECT_STREAM_UUID}:${DIRECT_TOPIC_UUID}`,
    streamUuid: DIRECT_STREAM_UUID,
    topicUuid: DIRECT_TOPIC_UUID,
  };
}

function appliedWindowResult(anchorUuid: string) {
  return {
    status: "applied" as const,
    ownerKey: "owner-key",
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}` as const,
    anchorUuid,
    beforePageMarker: null,
    afterPageMarker: null,
  };
}

function replaceTestConversationWindow(
  conversationId: string,
  messages: readonly MessengerMessage[],
  options: {
    mode?: "tail" | "around-anchor";
    anchorMessageUuid?: string | null;
    beforePageMarker?: string | null;
    afterPageMarker?: string | null;
  } = {},
): void {
  const store = useWorkspaceMessageStore.getState();
  store.replaceConversationWindow({
    conversationId,
    expectedRevision: store.conversationWindowsById[conversationId]?.revision ?? null,
    capturedMutationRevision: store.messageMutationRevision,
    mode: options.mode ?? "tail",
    anchorMessageUuid: options.anchorMessageUuid ?? null,
    messages,
    markers: {
      beforePageMarker: options.beforePageMarker ?? null,
      afterPageMarker: options.afterPageMarker ?? null,
    },
  });
}

function updateTestConversationWindow(
  conversationId: string,
  options: {
    mode?: "tail" | "around-anchor";
    anchorMessageUuid?: string | null;
    beforePageMarker?: string | null;
    afterPageMarker?: string | null;
  } = {},
): void {
  const store = useWorkspaceMessageStore.getState();
  const window = store.conversationWindowsById[conversationId];
  const messages =
    window?.messageUuids
      .map((messageUuid) => store.messagesById[messageUuid])
      .filter((message): message is MessengerMessage => message != null) ?? [];
  replaceTestConversationWindow(conversationId, messages, {
    mode: options.mode ?? window?.mode ?? "tail",
    anchorMessageUuid: options.anchorMessageUuid ?? window?.anchorMessageUuid ?? null,
    beforePageMarker: options.beforePageMarker ?? window?.beforePageMarker ?? null,
    afterPageMarker: options.afterPageMarker ?? window?.afterPageMarker ?? null,
  });
}

function seedSecondMessage() {
  replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
    createMessage(),
    createSecondMessage(),
  ]);
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

let navigateTo: ReturnType<typeof useNavigate> | null = null;

function WorkspaceNavigationProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateTo = navigate;
    return () => {
      navigateTo = null;
    };
  }, [navigate]);
  return null;
}

function renderWorkspaceChatPageWithShellContexts(
  route: string,
  rightDrawerOverrides: Partial<RightDrawerContextValue> = {},
  page: "chat" | "favorites" = "chat",
  history?: { entries: string[]; index: number },
) {
  return render(
    <MemoryRouter initialEntries={history?.entries ?? [route]} initialIndex={history?.index}>
      <WorkspaceNavigationProbe />
      <WorkspaceLocationProbe />
      <OpenSearchContext.Provider value={vi.fn()}>
        <RightDrawerContext.Provider
          value={{
            open: false,
            setOpen: vi.fn(),
            openInfo: vi.fn(),
            openUserProfile: vi.fn(),
            openWorkspaceUserProfile: vi.fn(),
            ...rightDrawerOverrides,
          }}
        >
          {page === "favorites" ? <FavoritesPage /> : <ChatPage />}
        </RightDrawerContext.Provider>
      </OpenSearchContext.Provider>
    </MemoryRouter>,
  );
}

function WorkspaceLocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="workspace-location" data-location-key={location.key}>
      {`${location.pathname}${location.hash}`}
    </span>
  );
}

describe("ChatPage Workspace route", () => {
  beforeEach(async () => {
    delete (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
    resetWorkspaceComposerDraftStoreForTests();
    const session = createSession();
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, createBootstrapPayload());
    useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
    useWorkspaceJitsiSettingsStore.getState().clear();
    useUsersStore.getState().replaceUsers([
      createUser({
        uuid: USER_UUID,
        full_name: "Alice Stone",
        email: "alice@example.com",
        status: "active",
      }),
      createUser({
        uuid: USER_B_UUID,
        full_name: "Bob Reed",
        email: "bob@example.com",
        status: "idle",
      }),
    ]);
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [createMessage()]);
    useMessengerOutboxStore.getState().clear();
    await useWorkspaceComposerDraftStore.getState().clear();
    useJitsiCallStore.getState().clear();
    captured.composerProps = null;
    captured.channelHeaderProps = null;
    captured.directHeaderProps = null;
    captured.messageListProps = null;
    captured.renderRealMessageList = false;
    captured.holdRealListFocusedMessageApplied = false;
    captured.omitFetchedAnchorFromWindow = false;
    captured.realListFocusedMessageApplied.mockReset();
    captured.realListFocusedMessageMissing.mockReset();
    captured.fetchTargetConversationIds.length = 0;
    captured.loadWorkspaceMessages.mockClear();
    captured.loadWorkspaceMessageWindowAroundMessage.mockReset();
    captured.loadWorkspaceMessageWindowAroundMessage.mockResolvedValue({
      status: "applied",
      ownerKey: "owner-key",
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      anchorUuid: MESSAGE_UUID,
      beforePageMarker: null,
      afterPageMarker: null,
    });
    captured.loadWorkspaceMessageWindowPage.mockReset();
    captured.loadWorkspaceMessageWindowPage.mockResolvedValue({
      status: "applied",
      ownerKey: "owner-key",
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      direction: "before",
      nextPageMarker: null,
      pageLimit: 50,
    });
    captured.loadMessengerQuoteMessage.mockReset();
    captured.loadMessengerQuoteMessage.mockResolvedValue({ status: "unavailable" });
    captured.downloadWorkspaceFile.mockReset();
    captured.downloadWorkspaceFile.mockResolvedValue({
      blob: new Blob(["workspace file"], { type: "text/plain" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="workspace-report.txt"',
        "content-length": "14",
      }),
    });
    captured.loadWorkspaceFile.mockReset();
    captured.loadWorkspaceFile.mockResolvedValue({
      blob: new Blob(["workspace preview"], { type: "image/png" }),
      headers: new Headers(),
    });
    captured.uploadWorkspaceFileWithProgress.mockReset();
    captured.uploadWorkspaceFileWithProgress.mockResolvedValue({
      uuid: "99999999-9999-4999-8999-999999999999",
      name: "workspace-report.txt",
      content_type: "text/plain",
      size_bytes: 14,
    });
    captured.deleteWorkspaceFile.mockReset();
    captured.deleteWorkspaceFile.mockResolvedValue(undefined);
    captured.sendMessengerMessage.mockReset();
    captured.sendMessengerMessage.mockResolvedValue({
      status: "applied",
      ownerKey: "owner-key",
      message: createMessage(),
    });
    captured.editMessengerMessage.mockReset();
    captured.editMessengerMessage.mockResolvedValue({
      status: "applied",
      ownerKey: "owner-key",
      message: createMessage(),
    });
    captured.markMessengerMessagesReadUpTo.mockReset();
    captured.markMessengerMessagesReadUpTo.mockResolvedValue({
      status: "applied",
      ownerKey: "owner-key",
      message: createMessage(),
    });
    captured.syncWorkspaceComposerDraft.mockReset();
    captured.syncWorkspaceComposerDraft.mockResolvedValue(undefined);
    captured.deleteWorkspaceComposerDraftFromServer.mockReset();
    captured.deleteWorkspaceComposerDraftFromServer.mockImplementation(
      (params: { draft: { ownerKey: string; draftUuid: string } }) => {
        useWorkspaceComposerDraftStore
          .getState()
          .removeDraftByUuid(params.draft.ownerKey, params.draft.draftUuid);
        return true;
      },
    );
    useWorkspaceForwardMessageStore.getState().reset();
    captured.streamBindingsForRoute.mockClear();
    useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
  });

  afterEach(async () => {
    cleanup();
    navigateTo = null;
    useWorkspaceForwardMessageStore.getState().reset();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    useMessengerStore.getState().clear();
    useWorkspaceJitsiSettingsStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useMessengerOutboxStore.getState().clear();
    resetWorkspaceComposerDraftStoreForTests();
    await useWorkspaceComposerDraftStore.getState().clear();
    useJitsiCallStore.getState().clear();
    useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
    useMediaViewerStore.getState().close();
    try {
      const db = await openWorkspaceMessengerCacheDb();
      db.close();
    } catch {
      // No open database.
    }
    resetWorkspaceMessengerCacheDbSingletonForTests();
    await deleteWorkspaceMessengerCacheDatabase();
  });

  it("renders Workspace topic data through the Workspace-native message section", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(screen.getByTestId("chat-page")).toHaveClass(
      "min-w-chat-page",
      "flex-1",
      "overflow-hidden",
    );
    expect(screen.getByTestId("old-composer-section")).toBeInTheDocument();
    expect(screen.getByText("workspace message")).toBeInTheDocument();
    expect(screen.getByText("#general")).toBeInTheDocument();
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
    expect(captured.channelHeaderProps).toMatchObject({
      channelName: "#general",
      topic: "Roadmap",
      hideTopic: false,
      participantsCount: 2,
      onlineCount: 1,
      rightPanelOpen: false,
    });
    expect(captured.directHeaderProps).toBeNull();
    expect(captured.channelHeaderProps?.onOpenSearch).toEqual(expect.any(Function));
    expect(captured.channelHeaderProps?.onToggleRightPanel).toEqual(expect.any(Function));
    expect(captured.channelHeaderProps?.onOpenRightPanel).toEqual(expect.any(Function));
    expect(captured.channelHeaderProps?.onCallClick).toBeUndefined();
    expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    expect(captured.messageListProps?.presentation).toBeUndefined();
    expect(captured.messageListProps?.resolveTopicLabel).toBeUndefined();
    expect(captured.messageListProps?.currentUserUuid).toBe(USER_UUID);
    expect(captured.messageListProps?.resolveAuthorLabel?.(USER_B_UUID)).toBe("Bob Reed");
    expect(captured.messageListProps?.resolveMention?.("Bob Reed")).toMatchObject({
      userUuid: USER_B_UUID,
      displayText: "Bob Reed",
    });
    expect(captured.messageListProps?.messages[0]).toMatchObject({
      uuid: "55555555-5555-4555-8555-555555555555",
      payload: { kind: "markdown", content: "workspace message" },
    });
    expect(captured.messageListProps?.messages[0]).not.toHaveProperty("id");
    expect(captured.messageListProps?.messages[0]).not.toHaveProperty("content");
    expect(captured.messageListProps?.firstUnreadUuid).toBe("55555555-5555-4555-8555-555555555555");
    expect(captured.messageListProps?.unreadCount).toBe(1);
    expect(captured.messageListProps?.lastMessageUuid).toBeNull();
    expect(captured.messageListProps?.onReplyMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onAddReplyMessage).toBeUndefined();
    expect(captured.messageListProps?.onEditMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onRequestDeleteMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onCopyMessageText).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenMessageInChat).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenMentionUser).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onToggleMessageReaction).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onDownloadFile).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenUnsupportedFilePreview).toEqual(expect.any(Function));
    expect(captured.composerProps?.readOnlyReason).toBeUndefined();
    expect(captured.composerProps?.optimisticClearOnSend).toBe(true);
    expect(captured.composerProps?.composerCapabilities?.upload?.mode).toBe("enabled");
    expect(captured.composerProps?.composerCapabilities?.preview?.mode).toBe("enabled");
    expect(captured.composerProps?.resolveMention?.("Bob Reed")).toMatchObject({
      userUuid: USER_B_UUID,
      displayText: "Bob Reed",
    });
    expect(captured.composerProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function));
    expect(captured.composerProps?.onSend).toEqual(expect.any(Function));
    expect(captured.composerProps?.onCreateCallLink).toBeUndefined();
    expect(captured.composerProps?.onSubmitEdit).toEqual(expect.any(Function));
    expect(captured.streamBindingsForRoute).toHaveBeenCalledWith({
      route: {
        kind: "topic",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      },
    });
    await waitFor(() => expect(captured.loadWorkspaceMessages).toHaveBeenCalledTimes(1));
  });

  it("reloads the same conversation route after its authoritative window is reset", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() => expect(captured.loadWorkspaceMessages).toHaveBeenCalledTimes(1));

    act(() => {
      useWorkspaceMessageStore.getState().clear();
    });

    await waitFor(() => expect(captured.loadWorkspaceMessages).toHaveBeenCalledTimes(2));
  });

  it("loads one latest window from the active topic last-message pointer", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    expect(captured.messageListProps?.lastMessageUuid).toBe(SECOND_MESSAGE_UUID);
    expect(captured.messageListProps?.onLoadLatestWindow).toEqual(expect.any(Function));

    let tailPromise: Promise<void> | undefined;
    act(() => {
      tailPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalled(),
    );
    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuid: SECOND_MESSAGE_UUID,
        runtimeContext: expect.objectContaining({ projectId: "project-a" }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(captured.loadWorkspaceMessageWindowPage).not.toHaveBeenCalled();
    expect(captured.fetchTargetConversationIds).toContain(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    await tailPromise;
  });

  it("uses the stream last-message pointer and falls back to its conversation projection", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());

    renderWorkspaceChatPageWithShellContexts(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    await screen.findByTestId("workspace-message-list-section");
    expect(captured.messageListProps?.lastMessageUuid).toBe(SECOND_MESSAGE_UUID);

    act(() => {
      useMessengerStore.setState((state) => ({
        streamsById: {
          ...state.streamsById,
          [STREAM_UUID]: {
            ...state.streamsById[STREAM_UUID]!,
            lastMessageUuid: null,
          },
        },
        conversationsById: {
          ...state.conversationsById,
          [`stream:${STREAM_UUID}`]: {
            ...state.conversationsById[`stream:${STREAM_UUID}`]!,
            lastMessageUuid: SECOND_MESSAGE_UUID,
          },
        },
      }));
    });
    await waitFor(() =>
      expect(captured.messageListProps?.lastMessageUuid).toBe(SECOND_MESSAGE_UUID),
    );

    await act(async () => {
      await captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });
    expect(captured.fetchTargetConversationIds).toContain(`stream:${STREAM_UUID}`);
  });

  it("uses the stream pointer for a direct-message conversation", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useMessengerStore.getState().applyMessagePointer(ownerKey, createDirectMessage());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    expect(captured.messageListProps?.lastMessageUuid).toBe(SECOND_MESSAGE_UUID);
  });

  it("queues the latest-window intent while another message request is busy", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceMessageStore.getState().setMessagesLoading(conversationId, true);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    let tailPromise: Promise<void> | undefined;
    act(() => {
      tailPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();

    act(() => {
      useWorkspaceMessageStore.getState().setMessagesLoading(conversationId, false);
    });
    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    await tailPromise;
  });

  it("cancels a queued latest-window intent before the busy request finishes", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceMessageStore.getState().setMessagesLoading(conversationId, true);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    let tailPromise: Promise<void> | undefined;
    act(() => {
      tailPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
      captured.messageListProps?.onCancelLatestWindowLoad(SECOND_MESSAGE_UUID);
      useWorkspaceMessageStore.getState().setMessagesLoading(conversationId, false);
    });

    await tailPromise;
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
  });

  it("deduplicates repeated latest-window clicks for the same message", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    const windowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(windowRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    let firstPromise: Promise<void> | undefined;
    let secondPromise: Promise<void> | undefined;
    act(() => {
      firstPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
      secondPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });
    expect(secondPromise).toBe(firstPromise);
    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      windowRequest.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
      await firstPromise;
    });
  });

  it("does not classify an unfinished tail request as boundary pagination", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const windowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(windowRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    let tailPromise: Promise<void> | undefined;
    act(() => {
      tailPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
      useWorkspaceMessageStore.getState().setMessagesLoading(conversationId, true);
    });

    await waitFor(() => expect(captured.messageListProps?.messagesLoading).toBe(true));
    expect(captured.messageListProps?.isLoadingOlder).toBe(false);
    expect(captured.messageListProps?.isLoadingNewer).toBe(false);

    await act(async () => {
      windowRequest.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
      await tailPromise;
      useWorkspaceMessageStore.getState().setMessagesLoading(conversationId, false);
    });
  });

  it("aborts an in-flight latest-window request when scrolling cancels the intent", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    const windowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(windowRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    let tailPromise: Promise<void> | undefined;
    act(() => {
      tailPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });
    const signal = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0].signal;
    act(() => {
      captured.messageListProps?.onCancelLatestWindowLoad(SECOND_MESSAGE_UUID);
    });

    expect(signal?.aborted).toBe(true);
    await tailPromise;
    windowRequest.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
  });

  it("replaces an in-flight tail request when the last-message pointer advances", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    const oldWindowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    const latestWindowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    captured.loadWorkspaceMessageWindowAroundMessage
      .mockReturnValueOnce(oldWindowRequest.promise)
      .mockReturnValueOnce(latestWindowRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    let tailPromise: Promise<void> | undefined;
    act(() => {
      tailPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });
    const oldSignal = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0].signal;

    act(() => {
      useMessengerStore.getState().applyMessagePointer(ownerKey, createThirdMessage());
    });
    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(2),
    );
    expect(oldSignal?.aborted).toBe(true);
    expect(captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[1]?.[0].messageUuid).toBe(
      THIRD_MESSAGE_UUID,
    );

    await act(async () => {
      oldWindowRequest.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
      await Promise.resolve();
    });
    act(() => {
      void captured.messageListProps?.onLoadLatestWindow(THIRD_MESSAGE_UUID);
    });
    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(2);

    await act(async () => {
      latestWindowRequest.resolve(appliedWindowResult(THIRD_MESSAGE_UUID));
      await tailPromise;
    });
  });

  it("settles a failed tail request so the same click can retry", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    captured.loadWorkspaceMessageWindowAroundMessage
      .mockResolvedValueOnce({
        status: "failed",
        ownerKey: "owner-key",
        conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
        error: "tail unavailable",
      })
      .mockResolvedValueOnce(appliedWindowResult(SECOND_MESSAGE_UUID));

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    await act(async () => {
      await captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(t("chat.messagesLoadError"));
    expect(screen.getByTestId("workspace-location").textContent).toBe(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await act(async () => {
      await captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });

    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(2);
  });

  it("does not let cleanup from the previous conversation abort a new tail request", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    const topicWindowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    const streamWindowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    captured.loadWorkspaceMessageWindowAroundMessage
      .mockReturnValueOnce(topicWindowRequest.promise)
      .mockReturnValueOnce(streamWindowRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");
    const oldCancel = captured.messageListProps?.onCancelLatestWindowLoad;
    let topicPromise: Promise<void> | undefined;
    act(() => {
      topicPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    });
    await waitFor(() =>
      expect(captured.messageListProps?.conversationId).toBe(`stream:${STREAM_UUID}`),
    );
    let streamPromise: Promise<void> | undefined;
    act(() => {
      streamPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });
    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(2),
    );
    const streamSignal = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[1]?.[0].signal;

    act(() => {
      oldCancel?.(SECOND_MESSAGE_UUID);
    });
    expect(streamSignal?.aborted).toBe(false);

    await act(async () => {
      streamWindowRequest.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
      await streamPromise;
      topicWindowRequest.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
      await topicPromise;
    });
  });

  it("renders Favorites as the self chat with a title-only header", async () => {
    const session = createSession();
    useMessengerStore
      .getState()
      .replaceBootstrapState(workspaceRuntimeOwnerKey(session), createSelfChatBootstrapPayload());

    renderWorkspaceChatPageWithShellContexts(
      "/org/org-a/project/project-a/activity/favorites",
      {},
      "favorites",
    );

    expect(
      await screen.findByRole("heading", { name: t("activity.favorites") }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(screen.getByTestId("old-composer-section")).toBeInTheDocument();
    expect(captured.channelHeaderProps).toBeNull();
    expect(captured.directHeaderProps).toBeNull();
    expect(captured.messageListProps?.conversationId).toBe(
      `topic:${DIRECT_STREAM_UUID}:${DIRECT_TOPIC_UUID}`,
    );
  });

  it("uses the Favorites presentation for a direct self-chat route", async () => {
    const session = createSession();
    const setRightDrawerOpen = vi.fn();
    useMessengerStore
      .getState()
      .replaceBootstrapState(workspaceRuntimeOwnerKey(session), createSelfChatBootstrapPayload());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}/topic/${DIRECT_TOPIC_UUID}`,
      { open: true, setOpen: setRightDrawerOpen },
    );

    expect(
      await screen.findByRole("heading", { name: t("activity.favorites") }),
    ).toBeInTheDocument();
    expect(captured.directHeaderProps).toBeNull();
    expect(setRightDrawerOpen).toHaveBeenCalledWith(false);
  });

  it("drops a pending auto-read when the Workspace window loses focus", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      );
      expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();

      act(() => {
        captured.messageListProps?.onUnreadMessagesVisible?.([MESSAGE_UUID]);
      });
      hasFocus.mockReturnValue(false);
      await act(async () => {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 300);
        });
      });

      expect(captured.markMessengerMessagesReadUpTo).not.toHaveBeenCalled();

      hasFocus.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });
      await act(async () => {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 300);
        });
      });

      expect(captured.markMessengerMessagesReadUpTo).not.toHaveBeenCalled();
    } finally {
      hasFocus.mockRestore();
    }
  });

  it("does not queue auto-read for messages first reported while unfocused", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      );
      expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();

      act(() => {
        captured.messageListProps?.onUnreadMessagesVisible?.([MESSAGE_UUID]);
      });
      hasFocus.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });
      await act(async () => {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 300);
        });
      });

      expect(captured.markMessengerMessagesReadUpTo).not.toHaveBeenCalled();
    } finally {
      hasFocus.mockRestore();
    }
  });

  it("enables topic presentation settings and opens a topic from the stream prompt", async () => {
    renderWorkspaceChatPageWithShellContexts(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);

    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(captured.messageListProps?.conversationId).toBe(`stream:${STREAM_UUID}`);
    expect(captured.messageListProps?.presentation).toEqual({
      topicDividers: true,
      topicLabels: true,
    });
    expect(captured.messageListProps?.resolveTopicLabel?.(TOPIC_UUID)).toBe("Roadmap");
    expect(captured.messageListProps?.resolveTopicLabel?.("missing-topic")).toBeNull();
    expect(screen.queryByTestId("old-composer-section")).not.toBeInTheDocument();
    expect(screen.getByTestId("stream-topic-prompt")).toHaveTextContent("Select topic:");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /#\s*Roadmap/ }));
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location")).toHaveTextContent(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      ),
    );
  });

  it("focuses a Workspace message route from the active store without loading a window", async () => {
    updateTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(screen.getAllByText("workspace message").length).toBeGreaterThan(0);
    expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("retries the active anchor route after its authoritative window is reset", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    updateTestConversationWindow(conversationId);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    const target = captured.messageListProps?.focusedMessageTarget;
    if (target == null) throw new Error("Expected focused anchor target");
    act(() => {
      captured.messageListProps?.onFocusedMessageApplied?.(target);
      useWorkspaceMessageStore.getState().clear();
    });

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
  });

  it("focuses an already loaded message from the canonical chat anchor", async () => {
    updateTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );

    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("keeps the current same-conversation intent active while its route catches up", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );

    act(() => {
      captured.messageListProps?.onOpenMessageInChat?.(SECOND_MESSAGE_UUID);
    });

    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(
        SECOND_MESSAGE_UUID,
      ),
    );
    const currentTarget = captured.messageListProps?.focusedMessageTarget;
    if (currentTarget == null) throw new Error("Expected current same-conversation target");
    const currentLocationKey = screen
      .getByTestId("workspace-location")
      .getAttribute("data-location-key");
    if (currentLocationKey == null) throw new Error("Expected current location key");

    expect(captured.messageListProps?.conversationId).toBe(conversationId);
    expect(captured.messageListProps?.scrollToBottomKey).toBe(
      `${conversationId}:${currentTarget.intentId}:${SECOND_MESSAGE_UUID}:${currentTarget.focusAttempt}`,
    );
    expect(captured.messageListProps?.scrollToBottomKey).not.toContain(currentLocationKey);
    expect(captured.messageListProps?.anchorNavigationActive).toBe(true);
    expect(document.querySelector("[data-message-anchor-transition='true']")).toBeNull();
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
  });

  it("hides the previous canonical list as soon as an outside-window intent starts", async () => {
    const windowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    seedWorkspaceMessageBody(createSecondMessage());
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(windowRequest.promise);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );

    act(() => {
      captured.messageListProps?.onOpenMessageInChat?.(SECOND_MESSAGE_UUID);
    });

    expect(document.querySelector("[data-message-anchor-transition='true']")).not.toBeNull();
    expect(screen.queryByTestId("workspace-message-list-section")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      windowRequest.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
      await windowRequest.promise;
    });
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(
        SECOND_MESSAGE_UUID,
      ),
    );
  });

  it("uses the already mounted canonical anchor without showing the transition layer", async () => {
    const scrollIntoView = vi.fn();
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    updateTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    captured.renderRealMessageList = true;
    captured.holdRealListFocusedMessageApplied = true;

    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
      );

      await waitFor(() => expect(captured.realListFocusedMessageApplied).toHaveBeenCalledOnce());
      const canonicalNode = document.getElementById(`message-${MESSAGE_UUID}`);
      expect(canonicalNode).not.toBeNull();
      expect(canonicalNode).toHaveAttribute("data-workspace-message-anchor-highlight", "true");
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
      expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
      expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
      expect(document.querySelector("[data-message-anchor-transition='true']")).toBeNull();
      expect(document.querySelector("[data-message-anchor-preview-layer='true']")).toBeNull();
      expect(captured.messageListProps?.anchorHandoffPending).toBe(false);
      expect(document.querySelector("[data-message-anchor-list-hidden='true']")).toBeNull();
    } finally {
      if (previousScrollIntoView == null) {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScrollIntoView);
      }
    }
  });

  it("pushes the base conversation route for an explicit tail jump and restores the anchor on Back", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    updateTestConversationWindow(conversationId);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    const firstIntentId = captured.messageListProps?.focusedMessageTarget?.intentId;
    const firstLocationKey = screen
      .getByTestId("workspace-location")
      .getAttribute("data-location-key");
    if (firstLocationKey == null) throw new Error("Expected initial location key");
    expect(captured.messageListProps?.scrollToBottomKey).toBe(
      `${conversationId}:${firstIntentId}:${MESSAGE_UUID}:0`,
    );
    expect(captured.messageListProps?.scrollToBottomKey).not.toContain(firstLocationKey);
    expect(captured.messageListProps?.anchorNavigationActive).toBe(true);
    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Expected focused anchor target");
      captured.messageListProps?.onFocusedMessageApplied?.(target);
      captured.messageListProps?.onTailNavigationRequested();
    });

    const baseRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(baseRoute),
    );
    expect(captured.messageListProps?.focusedMessageTarget).toBeNull();
    expect(captured.messageListProps?.anchorNavigationActive).toBe(false);
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();

    act(() => {
      void navigateTo?.(-1);
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location")).toHaveTextContent(
        `${baseRoute}#message-${MESSAGE_UUID}`,
      ),
    );
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.intentId).not.toBe(firstIntentId),
    );
    const restoredTarget = captured.messageListProps?.focusedMessageTarget;
    if (restoredTarget == null) throw new Error("Expected restored anchor target");
    const restoredLocationKey = screen
      .getByTestId("workspace-location")
      .getAttribute("data-location-key");
    if (restoredLocationKey == null) throw new Error("Expected restored location key");
    expect(captured.messageListProps?.scrollToBottomKey).toBe(
      `${conversationId}:${restoredTarget.intentId}:${MESSAGE_UUID}:${restoredTarget.focusAttempt}`,
    );
    expect(captured.messageListProps?.scrollToBottomKey).not.toContain(restoredLocationKey);

    act(() => {
      void navigateTo?.(1);
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(baseRoute),
    );
  });

  it("deduplicates two explicit tail requests before the base route renders", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    updateTestConversationWindow(conversationId);
    const anchorRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`;
    renderWorkspaceChatPageWithShellContexts(anchorRoute);
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );

    act(() => {
      const requestTail = captured.messageListProps?.onTailNavigationRequested;
      requestTail?.();
      requestTail?.();
    });
    const baseRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(baseRoute),
    );

    act(() => {
      void navigateTo?.(-1);
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(anchorRoute),
    );
  });

  it("does not reuse a pending tail marker after a newer same-conversation anchor", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    updateTestConversationWindow(conversationId);
    seedWorkspaceMessageBody(createSecondMessage());
    const firstAnchorRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`;
    const secondAnchorRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${SECOND_MESSAGE_UUID}`;
    const baseRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    renderWorkspaceChatPageWithShellContexts(firstAnchorRoute, {}, "chat", {
      entries: [secondAnchorRoute, firstAnchorRoute],
      index: 1,
    });
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    const firstLocationKey = screen
      .getByTestId("workspace-location")
      .getAttribute("data-location-key");

    act(() => {
      captured.messageListProps?.onTailNavigationRequested();
      void navigateTo?.(-2);
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(secondAnchorRoute),
    );
    act(() => {
      void navigateTo?.(secondAnchorRoute, { replace: true });
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(secondAnchorRoute),
    );
    expect(screen.getByTestId("workspace-location")).not.toHaveAttribute(
      "data-location-key",
      firstLocationKey,
    );
    act(() => {
      captured.messageListProps?.onTailNavigationRequested();
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(baseRoute),
    );

    act(() => {
      void navigateTo?.(-1);
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(secondAnchorRoute),
    );
  });

  it("cancels a pending direct-message anchor before pushing its resolved conversation tail", async () => {
    const request = createDeferred<ReturnType<typeof appliedWindowResult>>();
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(request.promise);
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [createSecondMessage()]);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    const baseRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    const signal = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0].signal;
    act(() => {
      void navigateTo?.(baseRoute);
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(baseRoute),
    );
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      request.resolve(appliedWindowResult(MESSAGE_UUID));
      await request.promise;
    });
    expect(screen.getByTestId("workspace-location")).toHaveTextContent(baseRoute);
    expect(document.querySelector("[data-message-anchor-transition='true']")).toBeNull();
  });

  it("does not use an old owner complete window as the new owner anchor fast path", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}` as const;
    updateTestConversationWindow(conversationId);
    const sessionB: WorkspaceAuthSession = {
      ...createSession(),
      accountId: "org-b:project-b:user-b",
      organizationId: "org-b",
      projectId: "project-b",
      userUuid: USER_B_UUID,
      runtimeGeneration: 2,
    };
    useWorkspaceAuthStore.setState({
      sessions: [sessionB],
      currentAccountId: sessionB.accountId,
      runtimeGeneration: sessionB.runtimeGeneration,
    });
    const ownerB = workspaceRuntimeOwnerKey(sessionB);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerB);
    useMessengerStore.getState().replaceBootstrapState(ownerB, createBootstrapPayload());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-b/project/project-b/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
  });

  it("reloads a focused anchor missing from the DOM only once", async () => {
    const windowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    updateTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(windowRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    const onFocusedMessageMissing = captured.messageListProps?.onFocusedMessageMissing;
    if (onFocusedMessageMissing == null) {
      throw new Error("Focused message recovery callback is missing");
    }

    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Focused message target is missing");
      onFocusedMessageMissing(target);
      onFocusedMessageMissing(target);
    });
    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuid: MESSAGE_UUID,
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => {
      windowRequest.resolve(appliedWindowResult(MESSAGE_UUID));
      await windowRequest.promise;
    });
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );

    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Focused message target is missing");
      onFocusedMessageMissing(target);
    });
    await Promise.resolve();
    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1);
  });

  it("shows a deterministic DOM error after one recovery window still misses the target", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}` as const;
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const recoveryRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    useWorkspaceMessageStore.getState().clear();
    seedWorkspaceMessageBody(createMessage());
    updateTestConversationWindow(conversationId);
    useMessengerStore
      .getState()
      .setRealtimeInitialSyncReady(ownerKey, session.runtimeGeneration, true);
    captured.renderRealMessageList = true;
    captured.omitFetchedAnchorFromWindow = true;
    captured.loadWorkspaceMessageWindowAroundMessage
      .mockResolvedValueOnce(appliedWindowResult(MESSAGE_UUID))
      .mockReturnValueOnce(recoveryRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(captured.realListFocusedMessageMissing).toHaveBeenCalledWith(
        expect.objectContaining({ intentId: expect.any(Number), messageUuid: MESSAGE_UUID }),
      ),
    );
    const firstTarget = captured.realListFocusedMessageMissing.mock.calls[0]?.[0];
    const onMissing = captured.messageListProps?.onFocusedMessageMissing;
    if (firstTarget == null || onMissing == null) {
      throw new Error("Expected first missing target");
    }
    act(() => {
      onMissing(firstTarget);
      onMissing(firstTarget);
    });
    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(2);

    await act(async () => {
      recoveryRequest.resolve(appliedWindowResult(MESSAGE_UUID));
      await recoveryRequest.promise;
    });

    await waitFor(() => expect(captured.realListFocusedMessageMissing).toHaveBeenCalledTimes(2));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-message-anchor-error-overlay", "true");
    expect(screen.getByRole("button", { name: t("chat.retryMessageNavigation") })).toBeVisible();
    expect(document.querySelector("[data-message-anchor-transition='true']")).not.toBeNull();
    expect(document.querySelector("[data-message-preview-uuid]")).not.toBeNull();
    expect(document.querySelector("[data-message-anchor-list-layer='true']")).toBeNull();
    expect(document.querySelector("[data-empty-state='true']")).toBeNull();
    expect(screen.getByRole("button", { name: t("a11y.scrollToBottom") })).toBeVisible();
  });

  it("loads the current chat window around a missing canonical anchor", async () => {
    useWorkspaceMessageStore.getState().clear();

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuid: MESSAGE_UUID,
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("loads a Workspace message window when the anchor is indexed but absent from the conversation list", async () => {
    const windowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    const scrollIntoView = vi.fn();
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    useWorkspaceMessageStore.getState().clear();
    const knownMessage = createMessage();
    seedWorkspaceMessageBody(knownMessage);
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(windowRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    const request = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        messageUuid: MESSAGE_UUID,
        runtimeContext: expect.objectContaining({
          projectId: "project-a",
          userUuid: USER_UUID,
        }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(request?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    expect(screen.getByText("workspace message")).toBeInTheDocument();
    expect(document.querySelector("[data-message-anchor-transition='true']")).not.toBeNull();
    expect(screen.queryByTestId("workspace-message-list-section")).not.toBeInTheDocument();
    expect(captured.messageListProps).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(captured.realListFocusedMessageApplied).not.toHaveBeenCalled();
    expect(captured.realListFocusedMessageMissing).not.toHaveBeenCalled();
    expect(captured.markMessengerMessagesReadUpTo).not.toHaveBeenCalled();
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]?.read).toBe(false);
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[
        `topic:${STREAM_UUID}:${TOPIC_UUID}`
      ],
    ).toBeUndefined();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();

    await act(async () => {
      windowRequest.resolve(appliedWindowResult(MESSAGE_UUID));
      await windowRequest.promise;
    });
    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    if (previousScrollIntoView == null) {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    } else {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScrollIntoView);
    }
  });

  it("hands the preview to the same focused list node without hidden side effects", async () => {
    const windowRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    const scrollIntoView = vi.fn();
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const avatarFileUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const mediaFileUuid = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const knownMessage = {
      ...createMessage(),
      payload: {
        kind: "markdown" as const,
        content: [
          `[Bob](urn:quote:${SECOND_MESSAGE_UUID})`,
          "",
          `![image](urn:image:${mediaFileUuid}?name=image.png&content_type=image%2Fpng)`,
        ].join("\n"),
      },
    };
    useWorkspaceMessageStore.getState().clear();
    seedWorkspaceMessageBody(knownMessage);
    useUsersStore.getState().replaceUsers([
      createUser({ uuid: USER_UUID, full_name: "Alice Stone" }),
      createUser({
        uuid: USER_B_UUID,
        full_name: "Bob Reed",
        avatar_url: `urn:file:${avatarFileUuid}`,
      }),
    ]);
    captured.renderRealMessageList = true;
    captured.holdRealListFocusedMessageApplied = true;
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(windowRequest.promise);

    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
      );

      expect(await screen.findByText("Bob")).toBeInTheDocument();
      expect(document.querySelector("[data-message-anchor-transition='true']")).not.toBeNull();
      expect(document.querySelector("[data-message-anchor-list-layer='true']")).toBeNull();
      expect(captured.loadMessengerQuoteMessage).not.toHaveBeenCalled();
      expect(captured.loadWorkspaceFile).not.toHaveBeenCalled();

      await act(async () => {
        windowRequest.resolve(appliedWindowResult(MESSAGE_UUID));
        await windowRequest.promise;
      });
      await waitFor(() => expect(captured.realListFocusedMessageApplied).toHaveBeenCalledOnce());

      const hiddenLayer = document.querySelector<HTMLElement>(
        "[data-message-anchor-list-layer='true']",
      );
      expect(hiddenLayer).toHaveClass("invisible", "pointer-events-none");
      expect(hiddenLayer).toHaveAttribute("aria-hidden", "true");
      expect(hiddenLayer).toHaveAttribute("inert");
      expect(captured.messageListProps?.anchorHandoffPending).toBe(true);
      expect(captured.messageListProps?.onUnreadMessagesVisible).toBeUndefined();
      expect(captured.messageListProps?.onUnreadMessagesAtBottom).toBeUndefined();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
      expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
      expect(captured.loadWorkspaceMessageWindowPage).not.toHaveBeenCalled();
      expect(captured.markMessengerMessagesReadUpTo).not.toHaveBeenCalled();
      expect(captured.loadMessengerQuoteMessage).not.toHaveBeenCalled();
      expect(captured.loadWorkspaceFile).not.toHaveBeenCalled();

      const canonicalNode = document.getElementById(`message-${MESSAGE_UUID}`);
      expect(canonicalNode).not.toBeNull();
      expect(document.querySelectorAll(`#message-${MESSAGE_UUID}`)).toHaveLength(1);
      expect(document.querySelectorAll(`[data-message-uuid='${MESSAGE_UUID}']`)).toHaveLength(1);
      expect(screen.getAllByRole("article")).toHaveLength(1);
      expect(screen.getByRole("article")).toHaveAttribute(
        "data-message-preview-uuid",
        MESSAGE_UUID,
      );

      const exactTarget = captured.messageListProps?.focusedMessageTarget;
      if (exactTarget == null) throw new Error("Expected exact handoff target");
      act(() => {
        captured.messageListProps?.onFocusedMessageApplied?.(exactTarget);
      });

      await waitFor(() =>
        expect(document.querySelector("[data-message-anchor-transition='true']")).toBeNull(),
      );
      const visibleLayer = document.querySelector<HTMLElement>(
        "[data-message-anchor-list-layer='true']",
      );
      expect(visibleLayer).not.toHaveClass("invisible");
      expect(visibleLayer).not.toHaveAttribute("aria-hidden");
      expect(visibleLayer).not.toHaveAttribute("inert");
      expect(document.getElementById(`message-${MESSAGE_UUID}`)).toBe(canonicalNode);
      expect(document.querySelectorAll(`#message-${MESSAGE_UUID}`)).toHaveLength(1);
      await waitFor(() => expect(captured.loadMessengerQuoteMessage).toHaveBeenCalled());
      await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalled());
    } finally {
      if (previousScrollIntoView == null) {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScrollIntoView);
      }
    }
  });

  it("keeps M2 hidden when late M1 handoff callbacks arrive", async () => {
    const firstWindow = createDeferred<ReturnType<typeof appliedWindowResult>>();
    const secondWindow = createDeferred<ReturnType<typeof appliedWindowResult>>();
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    useWorkspaceMessageStore.getState().clear();
    seedWorkspaceMessageBody(createMessage());
    seedWorkspaceMessageBody(createSecondMessage());
    captured.renderRealMessageList = true;
    captured.holdRealListFocusedMessageApplied = true;
    captured.loadWorkspaceMessageWindowAroundMessage
      .mockReturnValueOnce(firstWindow.promise)
      .mockReturnValueOnce(secondWindow.promise);

    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
      );
      await act(async () => {
        firstWindow.resolve(appliedWindowResult(MESSAGE_UUID));
        await firstWindow.promise;
      });
      await waitFor(() => expect(captured.realListFocusedMessageApplied).toHaveBeenCalledOnce());
      const firstProps = captured.messageListProps;
      const firstTarget = firstProps?.focusedMessageTarget;
      if (firstTarget == null) throw new Error("Expected M1 focus target");
      expect(document.getElementById(`message-${MESSAGE_UUID}`)).not.toBeNull();

      act(() => {
        navigateTo?.(`/org/org-a/project/project-a/message/${SECOND_MESSAGE_UUID}`);
      });
      await waitFor(() =>
        expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(2),
      );
      await act(async () => {
        secondWindow.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
        await secondWindow.promise;
      });
      await waitFor(() => expect(captured.realListFocusedMessageApplied).toHaveBeenCalledTimes(2));
      const secondProps = captured.messageListProps;
      const secondTarget = secondProps?.focusedMessageTarget;
      if (secondTarget == null) throw new Error("Expected M2 focus target");
      const secondCanonical = document.getElementById(`message-${SECOND_MESSAGE_UUID}`);
      expect(secondCanonical).not.toBeNull();
      expect(document.getElementById(`message-${MESSAGE_UUID}`)).toBeNull();
      expect(document.querySelector("[data-message-anchor-list-layer='true']")).toHaveAttribute(
        "aria-hidden",
        "true",
      );

      act(() => {
        firstProps?.onFocusedMessageApplied?.(firstTarget);
        firstProps?.onFocusedMessageMissing?.(firstTarget);
      });

      expect(document.querySelector("[data-message-anchor-transition='true']")).not.toBeNull();
      expect(document.querySelector("[data-message-anchor-error-overlay='true']")).toBeNull();
      expect(document.getElementById(`message-${SECOND_MESSAGE_UUID}`)).toBe(secondCanonical);
      expect(document.querySelector("[data-message-anchor-list-layer='true']")).toHaveAttribute(
        "aria-hidden",
        "true",
      );

      act(() => {
        secondProps?.onFocusedMessageApplied?.(secondTarget);
      });
      await waitFor(() =>
        expect(document.querySelector("[data-message-anchor-transition='true']")).toBeNull(),
      );
      expect(document.getElementById(`message-${SECOND_MESSAGE_UUID}`)).toBe(secondCanonical);
      expect(document.querySelector("[data-message-anchor-list-layer='true']")).not.toHaveAttribute(
        "aria-hidden",
      );
    } finally {
      if (previousScrollIntoView == null) {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScrollIntoView);
      }
    }
  });

  it("removes owner A anchor before accepting late callbacks in owner B", async () => {
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    updateTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    captured.renderRealMessageList = true;
    captured.holdRealListFocusedMessageApplied = true;

    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
      );
      await waitFor(() => expect(captured.realListFocusedMessageApplied).toHaveBeenCalledOnce());
      const ownerAProps = captured.messageListProps;
      const ownerATarget = ownerAProps?.focusedMessageTarget;
      if (ownerATarget == null) throw new Error("Expected owner A focus target");
      expect(document.getElementById(`message-${MESSAGE_UUID}`)).not.toBeNull();
      expect(
        document.querySelector("[data-message-anchor-list-layer='true'][aria-hidden='true']"),
      ).toBeNull();

      const sessionB: WorkspaceAuthSession = {
        ...createSession(),
        accountId: "org-b:project-b:user-b",
        organizationId: "org-b",
        projectId: "project-b",
        userUuid: USER_B_UUID,
        runtimeGeneration: 2,
      };
      const ownerB = workspaceRuntimeOwnerKey(sessionB);
      useMessengerStore.getState().startBootstrap(ownerB);
      useMessengerStore.getState().replaceBootstrapState(ownerB, createBootstrapPayload());
      act(() => {
        useWorkspaceAuthStore.setState({
          sessions: [sessionB],
          currentAccountId: sessionB.accountId,
          runtimeGeneration: sessionB.runtimeGeneration,
        });
        navigateTo?.(`/org/org-b/project/project-b/stream/${STREAM_UUID}`);
      });

      await waitFor(() =>
        expect(document.querySelector("[data-message-anchor-transition='true']")).toBeNull(),
      );
      expect(document.getElementById(`message-${MESSAGE_UUID}`)).toBeNull();
      expect(
        document.querySelector("[data-message-anchor-list-layer='true'][aria-hidden='true']"),
      ).toBeNull();

      act(() => {
        ownerAProps?.onFocusedMessageApplied?.(ownerATarget);
        ownerAProps?.onFocusedMessageMissing?.(ownerATarget);
      });
      expect(document.querySelector("[data-message-anchor-transition='true']")).toBeNull();
      expect(document.querySelector("[data-message-anchor-error-overlay='true']")).toBeNull();
      expect(document.getElementById(`message-${MESSAGE_UUID}`)).toBeNull();
    } finally {
      if (previousScrollIntoView == null) {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScrollIntoView);
      }
    }
  });

  it("loads an anchor window when only the message body is known", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}` as const;
    useWorkspaceMessageStore.getState().clear();
    seedWorkspaceMessageBody(createMessage());

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]).toBeDefined();
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toBeUndefined();

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId,
          messageUuid: MESSAGE_UUID,
        }),
      ),
    );
  });

  it("loads a Workspace message window when the message route anchor is absent", async () => {
    useWorkspaceMessageStore.getState().clear();

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    const request = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        messageUuid: MESSAGE_UUID,
        runtimeContext: expect.objectContaining({
          projectId: "project-a",
          userUuid: USER_UUID,
        }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(request?.conversationId).toBeUndefined();

    await waitFor(() => {
      expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID);
    });
    expect(screen.getByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("shows an explicit failure instead of leaving an active skipped message route loading", async () => {
    useWorkspaceMessageStore.getState().clear();
    const windowRequest = createDeferred<{
      status: "skipped";
      ownerKey: string;
      reason: "stale-owner";
    }>();
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(windowRequest.promise);
    let unmount = (): void => undefined;

    await act(async () => {
      unmount = renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
      ).unmount;
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      windowRequest.resolve({
        status: "skipped",
        ownerKey: "owner-key",
        reason: "stale-owner",
      });
      await windowRequest.promise;
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByText(t("chat.messageNavigationError"))).toBeInTheDocument(),
    );
    const stillLoading = screen.queryByLabelText(t("chat.loadingMessages")) != null;
    const hasExplicitError = screen.queryByText(t("chat.messageNavigationError")) != null;
    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(stillLoading).toBe(false);
    expect(hasExplicitError).toBe(true);
  });

  it("shows an explicit navigation error for a route outside the active runtime scope", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-b/project/project-b/message/${MESSAGE_UUID}`,
    );

    expect(await screen.findByText(t("chat.messageNavigationError"))).toBeInTheDocument();
    expect(screen.queryByLabelText(t("chat.loadingMessages"))).not.toBeInTheDocument();
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
  });

  it("waits for both the message window and realtime catch-up before enabling initial position", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");
    expect(captured.messageListProps?.initialPositionReady).toBe(false);

    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    act(() => {
      updateTestConversationWindow(conversationId);
    });
    expect(captured.messageListProps?.initialPositionReady).toBe(false);

    const session = createSession();
    act(() => {
      useMessengerStore
        .getState()
        .setRealtimeInitialSyncReady(
          workspaceRuntimeOwnerKey(session),
          session.runtimeGeneration,
          true,
        );
    });

    await waitFor(() => expect(captured.messageListProps?.initialPositionReady).toBe(true));
  });

  it("loads older pages from the message window before marker", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Expected focused anchor target");
      captured.messageListProps?.onFocusedMessageApplied?.(target);
    });
    act(() => {
      updateTestConversationWindow(conversationId, {
        beforePageMarker: "older-window-cursor",
        afterPageMarker: null,
      });
    });

    await waitFor(() => expect(captured.messageListProps?.hasOlderMessages).toBe(true));
    expect(captured.messageListProps?.hasNewerMessages).toBe(false);

    act(() => {
      captured.messageListProps?.onLoadOlder();
    });

    await waitFor(() => expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledTimes(1));
    expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        direction: "before",
        pageMarker: "older-window-cursor",
        runtimeContext: expect.objectContaining({ projectId: "project-a" }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("loads newer pages from the message window after marker", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Expected focused anchor target");
      captured.messageListProps?.onFocusedMessageApplied?.(target);
    });
    act(() => {
      updateTestConversationWindow(conversationId, {
        beforePageMarker: null,
        afterPageMarker: "newer-window-cursor",
      });
    });

    await waitFor(() => expect(captured.messageListProps?.hasNewerMessages).toBe(true));
    expect(captured.messageListProps?.hasOlderMessages).toBe(false);

    act(() => {
      captured.messageListProps?.onLoadNewer();
    });

    await waitFor(() => expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledTimes(1));
    expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        direction: "after",
        pageMarker: "newer-window-cursor",
        runtimeContext: expect.objectContaining({ projectId: "project-a" }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("blocks anchor pagination until the exact DOM focus is confirmed", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    updateTestConversationWindow(conversationId);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    act(() => {
      updateTestConversationWindow(conversationId, {
        beforePageMarker: "blocked-before-focus",
        afterPageMarker: null,
      });
    });
    await waitFor(() => expect(captured.messageListProps?.hasOlderMessages).toBe(true));

    act(() => {
      captured.messageListProps?.onLoadOlder();
    });
    expect(captured.loadWorkspaceMessageWindowPage).not.toHaveBeenCalled();

    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Expected focused anchor target");
      captured.messageListProps?.onFocusedMessageApplied?.(target);
    });
    act(() => {
      captured.messageListProps?.onLoadOlder();
    });
    await waitFor(() => expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledOnce());
  });

  it("aborts a focused anchor page when a newer anchor starts", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const pageRequest = createDeferred<{
      status: "failed";
      ownerKey: string;
      conversationId: string;
      error: string;
    }>();
    captured.loadWorkspaceMessageWindowPage.mockReturnValueOnce(pageRequest.promise);
    updateTestConversationWindow(conversationId);
    seedWorkspaceMessageBody(createSecondMessage());
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Expected focused anchor target");
      captured.messageListProps?.onFocusedMessageApplied?.(target);
      updateTestConversationWindow(conversationId, {
        beforePageMarker: null,
        afterPageMarker: "stale-after-page",
      });
    });
    await waitFor(() => expect(captured.messageListProps?.hasNewerMessages).toBe(true));
    act(() => {
      captured.messageListProps?.onLoadNewer();
    });
    const pageSignal = captured.loadWorkspaceMessageWindowPage.mock.calls[0]?.[0].signal;

    act(() => {
      captured.messageListProps?.onOpenMessageInChat?.(SECOND_MESSAGE_UUID);
    });
    expect(pageSignal?.aborted).toBe(true);
    await act(async () => {
      pageRequest.resolve({
        status: "failed",
        ownerKey: "owner-key",
        conversationId,
        error: "stale page failure",
      });
      await pageRequest.promise;
    });
    expect(screen.queryByText("stale page failure")).toBeNull();
    expect(captured.messageListProps?.isLoadingNewer).toBe(false);
  });

  it("aborts a focused anchor page for an explicit tail jump", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const pageRequest = createDeferred<{
      status: "failed";
      ownerKey: string;
      conversationId: string;
      error: string;
    }>();
    captured.loadWorkspaceMessageWindowPage.mockReturnValueOnce(pageRequest.promise);
    updateTestConversationWindow(conversationId);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
    );
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Expected focused anchor target");
      captured.messageListProps?.onFocusedMessageApplied?.(target);
      updateTestConversationWindow(conversationId, {
        beforePageMarker: "tail-cancel-page",
        afterPageMarker: null,
      });
    });
    await waitFor(() => expect(captured.messageListProps?.hasOlderMessages).toBe(true));
    act(() => {
      captured.messageListProps?.onLoadOlder();
    });
    const pageSignal = captured.loadWorkspaceMessageWindowPage.mock.calls[0]?.[0].signal;

    act(() => {
      captured.messageListProps?.onTailNavigationRequested();
    });
    expect(pageSignal?.aborted).toBe(true);
    const baseRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(baseRoute),
    );
    await act(async () => {
      pageRequest.resolve({
        status: "failed",
        ownerKey: "owner-key",
        conversationId,
        error: "late tail page failure",
      });
      await pageRequest.promise;
    });
    expect(screen.queryByText("late tail page failure")).toBeNull();
    expect(captured.messageListProps?.isLoadingOlder).toBe(false);
  });

  it("aborts a focused page when browser history returns to the base conversation", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const baseRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    const anchorRoute = `${baseRoute}#message-${MESSAGE_UUID}`;
    const pageRequest = createDeferred<{
      status: "failed";
      ownerKey: string;
      conversationId: string;
      error: string;
    }>();
    captured.loadWorkspaceMessageWindowPage.mockReturnValueOnce(pageRequest.promise);
    updateTestConversationWindow(conversationId);
    renderWorkspaceChatPageWithShellContexts(baseRoute);
    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      void navigateTo?.(anchorRoute);
    });
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Expected focused anchor target");
      captured.messageListProps?.onFocusedMessageApplied?.(target);
      updateTestConversationWindow(conversationId, {
        beforePageMarker: "history-page",
        afterPageMarker: null,
      });
    });
    await waitFor(() => expect(captured.messageListProps?.hasOlderMessages).toBe(true));
    act(() => {
      captured.messageListProps?.onLoadOlder();
    });
    const pageSignal = captured.loadWorkspaceMessageWindowPage.mock.calls[0]?.[0].signal;

    act(() => {
      void navigateTo?.(-1);
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location").textContent).toBe(baseRoute),
    );
    expect(pageSignal?.aborted).toBe(true);
    await act(async () => {
      pageRequest.resolve({
        status: "failed",
        ownerKey: "owner-key",
        conversationId,
        error: "late history page failure",
      });
      await pageRequest.promise;
    });
    expect(screen.queryByText("late history page failure")).toBeNull();
    expect(captured.messageListProps?.isLoadingOlder).toBe(false);
  });

  it("exposes a retry for the current focused page failure and keeps its anchor", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const anchorRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`;
    captured.loadWorkspaceMessageWindowPage
      .mockResolvedValueOnce({
        status: "failed",
        ownerKey: "owner-key",
        conversationId,
        error: "page unavailable",
      })
      .mockResolvedValueOnce({
        status: "applied",
        ownerKey: "owner-key",
        conversationId,
        direction: "before",
        nextPageMarker: null,
        pageLimit: 50,
      });
    updateTestConversationWindow(conversationId);
    renderWorkspaceChatPageWithShellContexts(anchorRoute);
    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
    act(() => {
      const target = captured.messageListProps?.focusedMessageTarget;
      if (target == null) throw new Error("Expected focused anchor target");
      captured.messageListProps?.onFocusedMessageApplied?.(target);
      updateTestConversationWindow(conversationId, {
        beforePageMarker: "retry-page",
        afterPageMarker: null,
      });
    });
    await waitFor(() => expect(captured.messageListProps?.hasOlderMessages).toBe(true));
    await act(async () => {
      captured.messageListProps?.onLoadOlder();
      await Promise.resolve();
    });

    await waitFor(() => expect(captured.messageListProps?.boundaryLoadFailed).toBe(true));
    expect(screen.getByTestId("workspace-location").textContent).toBe(anchorRoute);
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId]?.beforePageMarker,
    ).toBe("retry-page");
    act(() => {
      captured.messageListProps?.onRetryBoundaryLoad();
    });
    await waitFor(() => expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(captured.messageListProps?.boundaryLoadFailed).toBe(false));
    expect(screen.getByTestId("workspace-location").textContent).toBe(anchorRoute);
  });

  it("keeps normal topic routes on conversation history loading only", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.loadWorkspaceMessages).toHaveBeenCalledTimes(1));
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
    expect(captured.loadWorkspaceMessageWindowPage).not.toHaveBeenCalled();
  });

  it("opens Workspace mention profile through the right drawer UUID path", async () => {
    const openWorkspaceUserProfile = vi.fn();
    const openUserProfile = vi.fn();

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      {
        openWorkspaceUserProfile,
        openUserProfile,
      },
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenMentionUser).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenMentionUser?.(USER_B_UUID);
    });

    expect(openWorkspaceUserProfile).toHaveBeenCalledWith(USER_B_UUID);
    expect(openUserProfile).not.toHaveBeenCalled();
  });

  it("opens a canonical topic reference through the topic store", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceReference).toEqual(expect.any(Function)),
    );

    act(() => {
      captured.messageListProps?.onOpenWorkspaceReference?.({
        kind: "topic",
        topicUuid: TOPIC_UUID,
      });
    });

    expect(screen.getByTestId("workspace-location")).toHaveTextContent(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
  });

  it("does not navigate when a canonical topic is absent from the topic store", async () => {
    const unknownTopicUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const initialRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    renderWorkspaceChatPageWithShellContexts(initialRoute);

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceReference).toEqual(expect.any(Function)),
    );

    act(() => {
      captured.messageListProps?.onOpenWorkspaceReference?.({
        kind: "topic",
        topicUuid: unknownTopicUuid,
      });
    });

    expect(screen.getByTestId("workspace-location")).toHaveTextContent(initialRoute);
  });

  it("does not navigate when a topic reference contains a mismatched stream", async () => {
    const initialRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    const mismatchedStreamUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    renderWorkspaceChatPageWithShellContexts(initialRoute);

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceReference).toEqual(expect.any(Function)),
    );

    act(() => {
      captured.messageListProps?.onOpenWorkspaceReference?.({
        kind: "topic",
        topicUuid: TOPIC_UUID,
        streamUuid: mismatchedStreamUuid,
      });
    });

    expect(screen.getByTestId("workspace-location")).toHaveTextContent(initialRoute);
  });

  it("sends and opens a Workspace Jitsi call from the direct private header", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(ownerKey, "https://meet.workspace.example.com/jitsi/");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123);

    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
      );

      await waitFor(() =>
        expect(captured.directHeaderProps?.onCallClick).toEqual(expect.any(Function)),
      );
      expect(captured.composerProps?.onCreateCallLink).toBeUndefined();
      expect(screen.queryByTestId("old-composer-section")).not.toBeInTheDocument();
      expect(screen.getByTestId("stream-topic-prompt")).toBeInTheDocument();
      expect(captured.messageListProps?.presentation).toEqual({
        topicDividers: true,
        topicLabels: true,
      });
      expect(captured.messageListProps?.resolveTopicLabel?.(DIRECT_TOPIC_UUID)).toBe("private");

      act(() => {
        captured.directHeaderProps?.onCallClick?.();
      });

      const expectedUrl = `https://meet.workspace.example.com/workspace-org-a-project-a-${DIRECT_STREAM_UUID}-${DIRECT_TOPIC_UUID}-123`;
      await waitFor(() =>
        expect(captured.sendMessengerMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            streamUuid: DIRECT_STREAM_UUID,
            topicUuid: DIRECT_TOPIC_UUID,
            markdown: expectedUrl,
            includeStreamConversation: true,
          }),
        ),
      );
      await waitFor(() =>
        expect(useJitsiCallStore.getState().activeCall).toMatchObject({
          callKey: createJitsiCallKey({ meetingUrl: expectedUrl, ownerKey }),
          meetingUrl: expectedUrl,
          locationName: "Bob Reed",
          ownerKey,
          meetUrl: "https://meet.workspace.example.com",
          displayName: "Alice Stone",
          startedAtMs: 123,
        }),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("does not send a Workspace Jitsi call link when another call is active", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(ownerKey, "https://meet.workspace.example.com/jitsi/");
    const existingResult = useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/existing-room",
      locationName: "Existing call",
      ownerKey,
      meetUrl: "https://meet.workspace.example.com",
      displayName: "Alice Stone",
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
    );

    await waitFor(() =>
      expect(captured.directHeaderProps?.onCallClick).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.directHeaderProps?.onCallClick?.();
    });

    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
    expect(useJitsiCallStore.getState().activeCall).toBe(existingResult.activeCall);
  });

  it("does not send duplicate Workspace Jitsi call links while the first send is pending", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(ownerKey, "https://meet.workspace.example.com/jitsi/");
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage | null;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(456);

    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
      );

      await waitFor(() =>
        expect(captured.directHeaderProps?.onCallClick).toEqual(expect.any(Function)),
      );
      act(() => {
        captured.directHeaderProps?.onCallClick?.();
        captured.directHeaderProps?.onCallClick?.();
      });

      expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1);

      await act(async () => {
        sendRequest.resolve({
          status: "applied",
          ownerKey,
          message: createMessage(),
        });
        await sendRequest.promise;
        await Promise.resolve();
      });

      const expectedUrl = `https://meet.workspace.example.com/workspace-org-a-project-a-${DIRECT_STREAM_UUID}-${DIRECT_TOPIC_UUID}-456`;
      expect(useJitsiCallStore.getState().activeCall).toMatchObject({
        callKey: createJitsiCallKey({ meetingUrl: expectedUrl, ownerKey }),
        meetingUrl: expectedUrl,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("does not open a Workspace Jitsi call when the send resolves after abort", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(ownerKey, "https://meet.workspace.example.com/jitsi/");
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage | null;
    }>();
    let sendSignal: AbortSignal | undefined;
    captured.sendMessengerMessage.mockImplementationOnce((request: { signal: AbortSignal }) => {
      sendSignal = request.signal;
      return sendRequest.promise;
    });

    const rendered = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
    );

    await waitFor(() =>
      expect(captured.directHeaderProps?.onCallClick).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.directHeaderProps?.onCallClick?.();
    });
    await waitFor(() => {
      expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1);
      expect(sendSignal).toBeInstanceOf(AbortSignal);
    });

    act(() => {
      rendered.unmount();
    });
    expect(sendSignal?.aborted).toBe(true);

    await act(async () => {
      sendRequest.resolve({
        status: "applied",
        ownerKey,
        message: createMessage(),
      });
      await sendRequest.promise;
      await Promise.resolve();
    });

    expect(useJitsiCallStore.getState().activeCall).toBeNull();
  });

  it("removes the local outgoing row after Workspace send resolves", async () => {
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    let onBeforeMessageIndexed: ((message: MessengerMessage) => void) | undefined;
    const serverMessage = {
      ...createMessage(),
      uuid: "server-message-uuid",
      authorUuid: USER_UUID,
      userUuid: USER_UUID,
      isOwn: true,
    };
    captured.sendMessengerMessage.mockImplementationOnce(
      (request: { onBeforeMessageIndexed?: (message: MessengerMessage) => void }) => {
        onBeforeMessageIndexed = request.onBeforeMessageIndexed;
        return sendRequest.promise;
      },
    );

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.onSend).toEqual(expect.any(Function)));
    act(() => {
      void captured.composerProps?.onSend("fast local text", "");
    });

    await waitFor(() => {
      expect(captured.messageListProps?.outgoingMessages?.[0]).toEqual(
        expect.objectContaining({
          markdown: "fast local text",
          status: "sending",
        }),
      );
    });
    const localId = captured.messageListProps?.outgoingMessages?.[0]?.localId;
    expect(localId).toMatch(/^outgoing:/);

    act(() => {
      onBeforeMessageIndexed?.(serverMessage);
      useWorkspaceMessageStore.getState().applyLiveCreatedMessage(serverMessage);
      sendRequest.resolve({
        status: "applied",
        ownerKey: "owner-key",
        message: serverMessage,
      });
    });

    await waitFor(() => expect(captured.messageListProps?.outgoingMessages).toEqual([]));
    expect(captured.messageListProps?.resolveServerMessageRenderKey?.(serverMessage.uuid)).toBe(
      localId,
    );
  });

  it("uploads composer files immediately and appends logical markdown refs on send", async () => {
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const pdfFile = new File(["pdf"], 'report<>:"q1?.pdf', { type: "application/pdf" });
    const imageFile = new File([pngBytes], "screen.png", { type: "image/png" });
    captured.uploadWorkspaceFileWithProgress
      .mockResolvedValueOnce({
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "report.pdf",
        content_type: "application/pdf",
        size_bytes: 3,
      })
      .mockResolvedValueOnce({
        uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "screen.png",
        content_type: "image/png",
        size_bytes: 8,
      });
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.composerProps?.onAddAttachments).toEqual(expect.any(Function)),
    );
    act(() => captured.composerProps?.onAddAttachments?.([pdfFile, imageFile]));
    await waitFor(() => expect(captured.composerProps?.attachmentsBlockSend).toBe(false));
    let sendPromise: Promise<unknown> | undefined;
    act(() => {
      sendPromise = Promise.resolve(captured.composerProps?.onSend("  hello  ", ""));
    });

    await waitFor(() => expect(captured.uploadWorkspaceFileWithProgress).toHaveBeenCalledTimes(2));
    expect(captured.uploadWorkspaceFileWithProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        accessToken: "access-token",
        devTargetOrigin: "https://org-a.example.com",
        projectId: "project-a",
        signal: expect.any(AbortSignal),
      }),
      expect.objectContaining({
        file: pdfFile,
        streamUuid: STREAM_UUID,
        name: pdfFile.name,
        onProgress: expect.any(Function),
      }),
    );
    expect(captured.uploadWorkspaceFileWithProgress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
      expect.objectContaining({
        file: imageFile,
        streamUuid: STREAM_UUID,
        name: imageFile.name,
        onProgress: expect.any(Function),
      }),
    );
    await waitFor(() =>
      expect(captured.sendMessengerMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          streamUuid: STREAM_UUID,
          topicUuid: TOPIC_UUID,
          markdown:
            "hello\n[report____q1_.pdf](urn:file:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?name=report____q1_.pdf&content_type=application%2Fpdf&size=3)\n![screen.png](urn:image:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?name=screen.png&content_type=image%2Fpng&size=8)",
        }),
      ),
    );
    expect(captured.sendMessengerMessage.mock.calls[0]?.[0].markdown).not.toContain("/files/");
    expect(captured.sendMessengerMessage.mock.calls[0]?.[0].markdown).not.toContain(
      "/user_uploads",
    );
    await waitFor(() => {
      const outgoing = captured.messageListProps?.outgoingMessages?.[0];
      expect(outgoing).toEqual(
        expect.objectContaining({
          markdown:
            "hello\n[report____q1_.pdf](urn:file:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?name=report____q1_.pdf&content_type=application%2Fpdf&size=3)\n![screen.png](urn:image:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?name=screen.png&content_type=image%2Fpng&size=8)",
          status: "sending",
        }),
      );
      expect(outgoing == null ? false : "files" in outgoing).toBe(false);
      expect(captured.composerProps?.attachments).toEqual([]);
    });

    await act(async () => {
      sendRequest.resolve({
        status: "applied",
        ownerKey: "owner-key",
        message: createMessage(),
      });
      await sendPromise;
    });
    await waitFor(() => expect(captured.composerProps?.uploadProgress).toBeNull());
  });

  it("keeps the controlled image thumbnail ready until send and revokes it after transfer", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-draft")
      .mockReturnValue("blob:workspace-dimensions");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const imageFile = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "screen.png",
      { type: "image/png" },
    );
    captured.uploadWorkspaceFileWithProgress.mockResolvedValueOnce({
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "screen.png",
      content_type: "image/png",
      size_bytes: 8,
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.onAddAttachments).toEqual(expect.any(Function)),
    );

    act(() => captured.composerProps?.onAddAttachments?.([imageFile]));
    await waitFor(() => expect(captured.composerProps?.attachments?.[0]?.status).toBe("ready"));
    expect(captured.composerProps?.attachments?.[0]).toEqual(
      expect.objectContaining({ previewUrl: "blob:workspace-draft" }),
    );
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:workspace-dimensions");
    expect(revokeObjectUrl).not.toHaveBeenCalledWith("blob:workspace-draft");

    await act(async () => {
      await captured.composerProps?.onSend("with image", "");
    });

    expect(captured.composerProps?.attachments).toEqual([]);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:workspace-draft");

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it("does not send Workspace message when composer file upload fails", async () => {
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    captured.uploadWorkspaceFileWithProgress.mockRejectedValueOnce(new Error("upload failed"));

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.composerProps?.onAddAttachments).toEqual(expect.any(Function)),
    );
    act(() => captured.composerProps?.onAddAttachments?.([file]));
    await waitFor(() => expect(captured.composerProps?.attachments?.[0]?.status).toBe("error"));
    expect(captured.composerProps?.attachments?.[0]).toEqual(
      expect.objectContaining({ error: "Upload failed", retryable: true }),
    );
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    expect(() => onSend("hello", "")).toThrow("Wait for all attachments to finish uploading.");

    expect(captured.messageListProps?.outgoingMessages ?? []).toEqual([]);
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("localizes validation errors and does not offer upload retry", async () => {
    const oversized = new File(["x"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.composerProps?.onAddAttachments).toEqual(expect.any(Function)),
    );
    act(() => captured.composerProps?.onAddAttachments?.([oversized]));

    await waitFor(() =>
      expect(captured.composerProps?.attachments?.[0]).toEqual(
        expect.objectContaining({
          status: "error",
          error: "The file is too large (maximum 25 MB)",
          retryable: false,
        }),
      ),
    );
    expect(captured.uploadWorkspaceFileWithProgress).not.toHaveBeenCalled();
  });

  it("accepts 20,001 astral emoji because the backend counts Unicode code points", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.onSend).toEqual(expect.any(Function)));
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    const content = "😀".repeat(20_001);

    await act(async () => {
      await onSend(content, "");
    });

    expect(captured.sendMessengerMessage).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: content }),
    );
  });

  it("blocks more than 40,000 Unicode code points", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.onSend).toEqual(expect.any(Function)));
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");

    expect(() => onSend("😀".repeat(40_001), "")).toThrow(
      "The message is too long (maximum 40,000 characters).",
    );
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("keeps ready attachments when their final markdown with the URN exceeds the limit", async () => {
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    captured.uploadWorkspaceFileWithProgress.mockResolvedValueOnce({
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "report.pdf",
      content_type: "application/pdf",
      size_bytes: 3,
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.composerProps?.onAddAttachments).toEqual(expect.any(Function)),
    );
    act(() => captured.composerProps?.onAddAttachments?.([file]));
    await waitFor(() => expect(captured.composerProps?.attachmentsBlockSend).toBe(false));

    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    expect(() => onSend("a".repeat(40_000), "")).toThrow(
      "The message is too long (maximum 40,000 characters).",
    );

    expect(captured.composerProps?.attachments).toEqual([
      expect.objectContaining({ fileName: "report.pdf", status: "ready" }),
    ]);
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("retries a failed message POST without uploading the attachment again", async () => {
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    captured.uploadWorkspaceFileWithProgress.mockResolvedValueOnce({
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "report.pdf",
      content_type: "application/pdf",
      size_bytes: 3,
    });
    captured.sendMessengerMessage
      .mockRejectedValueOnce(new Error("send failed"))
      .mockResolvedValueOnce({
        status: "applied",
        ownerKey: "owner-key",
        message: createMessage(),
      });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.composerProps?.onAddAttachments).toEqual(expect.any(Function)),
    );
    act(() => captured.composerProps?.onAddAttachments?.([file]));
    await waitFor(() => expect(captured.composerProps?.attachmentsBlockSend).toBe(false));

    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    await act(async () => {
      await expect(onSend("message", "")).rejects.toThrow();
    });
    const failedOutgoing = captured.messageListProps?.outgoingMessages?.[0];
    expect(failedOutgoing).toEqual(expect.objectContaining({ status: "failed" }));
    if (failedOutgoing == null) throw new Error("Expected failed outgoing message");

    act(() => captured.messageListProps?.onRetryOutgoingMessage?.(failedOutgoing.localId));

    await waitFor(() => expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(captured.messageListProps?.outgoingMessages).toEqual([]));
    expect(captured.uploadWorkspaceFileWithProgress).toHaveBeenCalledTimes(1);
    expect(captured.sendMessengerMessage.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        markdown:
          "message\n[report.pdf](urn:file:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?name=report.pdf&content_type=application%2Fpdf&size=3)",
      }),
    );
    expect(captured.deleteWorkspaceFile).not.toHaveBeenCalled();
  });

  it("removes a failed outgoing row without deleting its markdown files", async () => {
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    captured.uploadWorkspaceFileWithProgress.mockResolvedValueOnce({
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "report.pdf",
      content_type: "application/pdf",
      size_bytes: 3,
    });
    captured.sendMessengerMessage.mockRejectedValueOnce(new Error("send failed"));

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.onAddAttachments).toEqual(expect.any(Function)),
    );
    act(() => captured.composerProps?.onAddAttachments?.([file]));
    await waitFor(() => expect(captured.composerProps?.attachmentsBlockSend).toBe(false));
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    await act(async () => {
      await expect(onSend("message", "")).rejects.toThrow();
    });
    const failedOutgoing = captured.messageListProps?.outgoingMessages?.[0];
    if (failedOutgoing == null) throw new Error("Expected failed outgoing message");

    act(() => captured.messageListProps?.onRemoveOutgoingMessage?.(failedOutgoing.localId));

    await waitFor(() => expect(captured.messageListProps?.outgoingMessages).toEqual([]));
    expect(captured.deleteWorkspaceFile).not.toHaveBeenCalled();
  });

  it("aborts an in-flight Workspace upload when the runtime context changes", async () => {
    const file = new File(["workspace file"], "report.txt", { type: "text/plain" });
    let uploadSignal: AbortSignal | undefined;
    captured.uploadWorkspaceFileWithProgress.mockImplementation(
      (requestOptions: { signal?: AbortSignal }) => {
        uploadSignal = requestOptions.signal;
        return new Promise((_, reject) => {
          requestOptions.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.composerProps?.onAddAttachments).toEqual(expect.any(Function)),
    );
    act(() => captured.composerProps?.onAddAttachments?.([file]));

    await waitFor(() => {
      expect(captured.uploadWorkspaceFileWithProgress).toHaveBeenCalledTimes(1);
      expect(uploadSignal).toBeInstanceOf(AbortSignal);
      expect(uploadSignal?.aborted).toBe(false);
    });

    act(() => {
      const nextSession = {
        ...createSession(),
        accessToken: "next-access-token",
        runtimeGeneration: 2,
      };
      useWorkspaceAuthStore.setState({
        sessions: [nextSession],
        currentAccountId: nextSession.accountId,
        runtimeGeneration: 2,
      });
    });

    await waitFor(() => {
      expect(uploadSignal?.aborted).toBe(true);
    });
    expect(captured.messageListProps?.outgoingMessages ?? []).toEqual([]);
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("opens a quoted Workspace message in its chat through a URL anchor", async () => {
    seedSecondMessage();
    updateTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onOpenMessageInChat?.(SECOND_MESSAGE_UUID);
    });

    await waitFor(() => {
      expect(screen.getByTestId("workspace-location")).toHaveTextContent(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${SECOND_MESSAGE_UUID}`,
      );
    });
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
  });

  it("loads a message window after opening a quote known only by its body", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}` as const;
    useWorkspaceMessageStore.getState().clear();
    replaceTestConversationWindow(conversationId, [createMessage()]);
    seedWorkspaceMessageBody(createSecondMessage());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onOpenMessageInChat?.(SECOND_MESSAGE_UUID);
    });

    await waitFor(() =>
      expect(screen.getByTestId("workspace-location")).toHaveTextContent(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${SECOND_MESSAGE_UUID}`,
      ),
    );
    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId,
          messageUuid: SECOND_MESSAGE_UUID,
          getRuntimeContext: expect.any(Function),
          signal: expect.any(AbortSignal),
        }),
      ),
    );
  });

  it("keeps a quote anchor when an earlier tail request resolves", async () => {
    const ownerKey = useMessengerStore.getState().ownerKey;
    if (ownerKey == null) throw new Error("Expected messenger owner");
    useMessengerStore.getState().applyMessagePointer(ownerKey, createSecondMessage());
    const tailRequest = createDeferred<ReturnType<typeof appliedWindowResult>>();
    captured.loadWorkspaceMessageWindowAroundMessage.mockReturnValueOnce(tailRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    let tailPromise: Promise<void> | undefined;
    act(() => {
      tailPromise = captured.messageListProps?.onLoadLatestWindow(SECOND_MESSAGE_UUID);
    });
    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    const tailSignal = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0].signal;

    act(() => {
      captured.messageListProps?.onOpenMessageInChat?.(MESSAGE_UUID);
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location")).toHaveTextContent(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${MESSAGE_UUID}`,
      ),
    );
    expect(tailSignal?.aborted).toBe(true);

    await tailPromise;
    await act(async () => {
      tailRequest.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
      await tailRequest.promise;
    });

    await waitFor(() =>
      expect(captured.messageListProps?.focusedMessageTarget?.messageUuid).toBe(MESSAGE_UUID),
    );
  });

  it("resolves an unknown quoted message before opening its chat anchor", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}` as const;
    useWorkspaceMessageStore.getState().clear();
    replaceTestConversationWindow(conversationId, [createMessage()]);
    captured.loadWorkspaceMessageWindowAroundMessage.mockImplementationOnce(() => {
      replaceTestConversationWindow(conversationId, [createMessage(), createSecondMessage()]);
      return {
        status: "applied" as const,
        ownerKey: "owner-key",
        conversationId,
        anchorUuid: SECOND_MESSAGE_UUID,
        beforePageMarker: null,
        afterPageMarker: null,
      };
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onOpenMessageInChat?.(SECOND_MESSAGE_UUID);
    });

    await waitFor(() =>
      expect(screen.getByTestId("workspace-location")).toHaveTextContent(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${SECOND_MESSAGE_UUID}`,
      ),
    );
    expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuid: SECOND_MESSAGE_UUID,
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0].conversationId).toBe(
      undefined,
    );
  });

  it("keeps the later unknown quote target when the first window resolves last", async () => {
    useWorkspaceMessageStore.getState().clear();
    const firstWindow = createDeferred<ReturnType<typeof appliedWindowResult>>();
    const secondWindow = createDeferred<ReturnType<typeof appliedWindowResult>>();
    captured.loadWorkspaceMessageWindowAroundMessage
      .mockReturnValueOnce(firstWindow.promise)
      .mockReturnValueOnce(secondWindow.promise);
    let unmount = (): void => undefined;

    await act(async () => {
      unmount = renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      ).unmount;
      await Promise.resolve();
    });
    await screen.findByTestId("workspace-message-list-section");

    await act(async () => {
      captured.messageListProps?.onOpenMessageInChat?.(SECOND_MESSAGE_UUID);
      captured.messageListProps?.onOpenMessageInChat?.(THIRD_MESSAGE_UUID);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      secondWindow.resolve(appliedWindowResult(THIRD_MESSAGE_UUID));
      await secondWindow.promise;
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location")).toHaveTextContent(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${THIRD_MESSAGE_UUID}`,
      ),
    );

    await act(async () => {
      firstWindow.resolve(appliedWindowResult(SECOND_MESSAGE_UUID));
      await firstWindow.promise;
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const finalRoute = screen.getByTestId("workspace-location").textContent;
    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(finalRoute).toBe(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}#message-${THIRD_MESSAGE_UUID}`,
    );
  });

  it("moves existing composer text into the first Workspace reply tab", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.composerProps?.onComposerValueChange("draft before reply");
      captured.messageListProps?.onReplyMessage?.(
        "55555555-5555-4555-8555-555555555555",
        "  selected excerpt  ",
      );
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toMatchObject({
        activeTabId: expect.any(String),
        tabs: [
          {
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            selectedText: "  selected excerpt  ",
            answer: "draft before reply",
          },
        ],
      });
    });
    expect(captured.messageListProps?.onReplyMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onAddReplyMessage).toEqual(expect.any(Function));
    expect(captured.composerProps?.replyQuote).toMatchObject({
      id: captured.composerProps?.workspaceReplySession?.activeTabId,
      content: "  selected excerpt  ",
      sender_full_name: "Bob Reed",
      sender_uuid: USER_B_UUID,
      quoteFormat: "workspace",
    });
    expect(captured.composerProps?.draftInitialValue).toBe("draft before reply");
    expect(captured.composerProps?.focusKey).toBe(
      captured.composerProps?.workspaceReplySession?.activeTabId,
    );
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        workspaceRuntimeOwnerKey(createSession()),
        `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      )?.content.text,
    ).toBe("");

    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.tabs).toHaveLength(2);
      expect(captured.composerProps?.draftInitialValue).toBe("");
    });

    act(() => {
      captured.composerProps?.onClearReply();
    });

    await waitFor(() => {
      expect(captured.composerProps?.replyQuote).toBeNull();
      expect(captured.composerProps?.draftInitialValue).toBe("draft before reply");
    });
  });

  it("preserves ordinary text from a saved draft when clearing its reply session", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "existing ordinary draft",
      replySession: {
        activeTabId: "reply-tab-a",
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "",
          },
        ],
      },
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    act(() => {
      captured.composerProps?.onClearReply();
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toEqual({
        tabs: [],
        activeTabId: null,
      });
      expect(captured.composerProps?.draftInitialValue).toBe("existing ordinary draft");
    });
  });

  it("does not restore submitted reply text when reply cleanup arrives first", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("sent reply");
    });
    act(() => {
      captured.composerProps?.onClearReply("submit");
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toEqual({
        tabs: [],
        activeTabId: null,
      });
      expect(captured.composerProps?.draftInitialValue).toBe("");
    });

    act(() => {
      captured.composerProps?.onComposerValueChange("");
    });
    expect(captured.composerProps?.draftInitialValue).toBe("");
  });

  it("treats a whitespace-only reply selection as a whole-message quote", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID, "   ");
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.tabs[0]?.selectedText).toBeUndefined();
      expect(captured.composerProps?.replyQuote?.content).toBe("workspace message");
    });
  });

  it("keeps one draft per Workspace conversation when switching chats", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const topicConversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const streamConversationId = `stream:${STREAM_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, topicConversationId, {
      text: "topic draft",
      replySession: { tabs: [], activeTabId: null },
    });
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, streamConversationId, {
      text: "stream draft",
      replySession: { tabs: [], activeTabId: null },
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.draftInitialValue).toBe("topic draft"));

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    });
    expect(await screen.findByTestId("stream-topic-prompt")).toBeInTheDocument();
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        streamConversationId,
      )?.content.text,
    ).toBe("stream draft");

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`);
    });
    await waitFor(() => expect(captured.composerProps?.draftInitialValue).toBe("topic draft"));
  });

  it("does not expose Workspace reply controls in a stream", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const topicConversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const streamConversationId = `stream:${STREAM_UUID}`;
    const createDraft = (activeTabId: string) => ({
      text: "",
      replySession: {
        activeTabId,
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "quote A",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "answer A",
          },
          {
            id: "reply-tab-b",
            messageUuid: SECOND_MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "quote B",
            createdAt: "2026-07-15T12:01:00.000Z",
            answer: "answer B",
          },
        ],
      },
    });
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, topicConversationId, createDraft("reply-tab-a"));
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, streamConversationId, createDraft("reply-tab-b"));

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    });
    expect(await screen.findByTestId("stream-topic-prompt")).toBeInTheDocument();
    expect(screen.queryByTestId("old-composer-section")).not.toBeInTheDocument();
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        topicConversationId,
      )?.content.replySession.activeTabId,
    ).toBe("reply-tab-a");
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        streamConversationId,
      )?.content.replySession.activeTabId,
    ).toBe("reply-tab-b");
  });

  it("restores the Workspace reply session from the current conversation draft", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, `topic:${STREAM_UUID}:${TOPIC_UUID}`, {
        text: "",
        replySession: {
          activeTabId: "reply-tab-a",
          tabs: [
            {
              id: "reply-tab-a",
              messageUuid: MESSAGE_UUID,
              senderUuid: USER_B_UUID,
              senderName: "Bob Reed",
              quotedContent: "workspace message",
              createdAt: "2026-07-15T12:00:00.000Z",
              answer: "restored answer",
            },
          ],
        },
      });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toMatchObject({
        activeTabId: "reply-tab-a",
        tabs: [{ answer: "restored answer", messageUuid: MESSAGE_UUID }],
      });
      expect(captured.composerProps?.draftInitialValue).toBe("restored answer");
    });
  });

  it("starts a new composer session after IndexedDB hydration restores a text draft", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction("composerDrafts", "readwrite");
    transaction.objectStore("composerDrafts").put({
      id: `${ownerKey}:${conversationId}`,
      ownerKey,
      conversationId,
      snapshotId: "persisted-text-draft",
      updatedAt: Date.now(),
      content: {
        text: "restored after reload",
        replySession: { tabs: [], activeTabId: null },
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () =>
        reject(new Error(transaction.error?.message ?? "Cannot seed legacy composer draft")),
      );
      transaction.addEventListener("abort", () =>
        reject(new Error(transaction.error?.message ?? "Cannot seed legacy composer draft")),
      );
    });
    useWorkspaceComposerDraftStore.getState().clear();

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => {
      expect(captured.composerProps?.draftInitialValue).toBe("restored after reload");
      expect(captured.composerProps?.draftSessionKey).toContain(":hydrated:text");
    });
  });

  it("does not overwrite local input when draft hydration resolves late", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().clear();
    const originalHydrateDraft = useWorkspaceComposerDraftStore.getState().hydrateDraft;
    const hydration = createDeferred<null>();
    useWorkspaceComposerDraftStore.setState({
      hydrateDraft: vi.fn().mockReturnValue(hydration.promise),
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() => expect(captured.composerProps?.draftSessionKey).not.toBeNull());
    await act(async () => {
      captured.composerProps?.onComposerValueChange("typed before hydration");
      await Promise.resolve();
    });
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content.text,
    ).toBe("typed before hydration");
    expect(captured.composerProps?.draftInitialValue).toBe("typed before hydration");
    await act(async () => {
      hydration.resolve(null);
      await hydration.promise;
    });

    expect(captured.composerProps?.draftInitialValue).toBe("typed before hydration");
    expect(captured.composerProps?.draftSessionKey).toContain(":hydrated:text");
    useWorkspaceComposerDraftStore.setState({ hydrateDraft: originalHydrateDraft });
  });

  it("enqueues draft synchronization from composer input without a chat sync effect", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.composerProps?.onComposerValueChange("queued locally");
    });

    await waitFor(() => {
      expect(captured.syncWorkspaceComposerDraft).toHaveBeenCalledTimes(1);
      expect(captured.syncWorkspaceComposerDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({
            ownerKey,
            conversationId,
            content: expect.objectContaining({ text: "queued locally" }),
          }),
        }),
      );
    });
  });

  it("queues deletion of the sent draft without waiting for the composer visit to end", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "send this draft",
      replySession: { tabs: [], activeTabId: null },
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");

    await act(async () => {
      await expect(onSend("send this draft", "")).resolves.toBeUndefined();
    });

    expect(captured.deleteWorkspaceComposerDraftFromServer).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          ownerKey,
          conversationId,
          content: expect.objectContaining({ text: "send this draft" }),
        }),
      }),
    );
    await waitFor(() => expect(captured.composerProps?.draftInitialValue).toBe(""));
  });

  it("queues deletion for a second draft created without leaving the conversation", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");

    act(() => {
      captured.composerProps?.onComposerValueChange("first draft");
    });
    await act(async () => {
      await expect(onSend("first draft", "")).resolves.toBeUndefined();
    });

    act(() => {
      captured.composerProps?.onComposerValueChange("second draft");
    });
    await act(async () => {
      await expect(onSend("second draft", "")).resolves.toBeUndefined();
    });

    expect(captured.deleteWorkspaceComposerDraftFromServer).toHaveBeenCalledTimes(2);
    expect(captured.deleteWorkspaceComposerDraftFromServer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          content: expect.objectContaining({ text: "second draft" }),
        }),
      }),
    );
  });

  it("keeps a newer draft when an earlier send succeeds", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "first draft",
      replySession: { tabs: [], activeTabId: null },
    });
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    let sendPromise: Promise<unknown> = Promise.resolve();
    await act(async () => {
      sendPromise = Promise.resolve(onSend("first draft", ""));
      await Promise.resolve();
    });
    await waitFor(() => expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1));

    act(() => {
      captured.composerProps?.onComposerValueChange("newer draft");
    });
    await act(async () => {
      sendRequest.resolve({ status: "applied", ownerKey, message: createMessage() });
      await sendPromise;
    });
    await expect(sendPromise).resolves.toEqual({ shouldClearComposer: false });

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content.text,
    ).toBe("newer draft");
  });

  it("removes a sent reply draft after the composer clears its value and reply", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "",
      replySession: {
        activeTabId: "reply-tab-a",
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "sent reply",
          },
        ],
      },
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    const onSend = captured.composerProps?.onSend;
    const onComposerValueChange = captured.composerProps?.onComposerValueChange;
    const onClearReply = captured.composerProps?.onClearReply;
    if (onSend == null || onComposerValueChange == null || onClearReply == null) {
      throw new Error("Workspace composer handlers are missing");
    }

    await act(async () => {
      await expect(onSend("sent reply", "")).resolves.toBeUndefined();
    });
    act(() => {
      onComposerValueChange("");
      onClearReply();
    });

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      ),
    ).toBeNull();
  });

  it("keeps a newer reply draft when an earlier send finishes", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "",
      replySession: {
        activeTabId: "reply-tab-a",
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "first reply",
          },
        ],
      },
    });
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    const onSend = captured.composerProps?.onSend;
    const onComposerValueChange = captured.composerProps?.onComposerValueChange;
    if (onSend == null || onComposerValueChange == null) {
      throw new Error("Workspace composer handlers are missing");
    }

    let sendPromise: Promise<unknown> = Promise.resolve();
    await act(async () => {
      sendPromise = Promise.resolve(onSend("first reply", ""));
      await Promise.resolve();
    });
    await waitFor(() => expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1));

    await act(async () => {
      onComposerValueChange("newer reply");
      sendRequest.resolve({ status: "applied", ownerKey, message: createMessage() });
      await sendPromise;
    });
    await expect(sendPromise).resolves.toEqual({ shouldClearComposer: false });

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content.replySession,
    ).toMatchObject({
      activeTabId: "reply-tab-a",
      tabs: [{ id: "reply-tab-a", answer: "newer reply" }],
    });
  });

  it("keeps a newly added reply tab when an earlier send finishes", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    seedSecondMessage();
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "",
      replySession: {
        activeTabId: "reply-tab-a",
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "first reply",
          },
        ],
      },
    });
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    let sendPromise: Promise<unknown> = Promise.resolve();
    await act(async () => {
      sendPromise = Promise.resolve(onSend("first reply", ""));
      await Promise.resolve();
    });
    await waitFor(() => expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1));

    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.tabs).toHaveLength(2),
    );

    await act(async () => {
      sendRequest.resolve({ status: "applied", ownerKey, message: createMessage() });
      await sendPromise;
    });
    await expect(sendPromise).resolves.toEqual({ shouldClearComposer: false });

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content.replySession,
    ).toMatchObject({
      activeTabId: expect.any(String),
      tabs: [
        { id: "reply-tab-a", answer: "first reply" },
        { messageUuid: SECOND_MESSAGE_UUID, answer: "" },
      ],
    });
  });

  it("keeps reply drafts unchanged when opening a stream", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const topicConversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const streamConversationId = `stream:${STREAM_UUID}`;
    const createReplyDraft = (tabId: string) => ({
      text: "",
      replySession: {
        activeTabId: tabId,
        tabs: [
          {
            id: tabId,
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: `${tabId} answer`,
          },
        ],
      },
    });
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, topicConversationId, createReplyDraft("topic-reply"));
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, streamConversationId, createReplyDraft("stream-reply"));
    replaceTestConversationWindow(streamConversationId, [{ ...createMessage(), isOwn: true }]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("topic-reply"),
    );

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    });
    expect(await screen.findByTestId("stream-topic-prompt")).toBeInTheDocument();

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        topicConversationId,
      )?.content.replySession.activeTabId,
    ).toBe("topic-reply");
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        streamConversationId,
      )?.content.replySession.activeTabId,
    ).toBe("stream-reply");
  });

  it("restores reply tabs when editing an older own Workspace message", async () => {
    const restoredMarkdown = [
      `> [Alice](urn:user:${USER_UUID}) [wrote](urn:message:${MESSAGE_UUID}):`,
      "> quoted A",
      "",
      "answer A",
      "",
      `> [Bob](urn:user:${USER_B_UUID}) [said](urn:message:${SECOND_MESSAGE_UUID}):`,
      "> quoted B",
      "",
      "answer B",
    ].join("\n");
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      {
        ...createMessage(),
        isOwn: true,
        payload: { kind: "markdown", content: restoredMarkdown },
      },
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
    });

    await waitFor(() => {
      expect(captured.composerProps?.editSession).toMatchObject({
        preserveWorkspaceReplyContext: true,
        initialMarkdown: "answer A",
      });
      expect(captured.composerProps?.workspaceReplySession?.tabs).toEqual([
        expect.objectContaining({
          messageUuid: MESSAGE_UUID,
          quotedContent: "quoted A",
          answer: "answer A",
        }),
        expect.objectContaining({
          messageUuid: SECOND_MESSAGE_UUID,
          quotedContent: "quoted B",
          answer: "answer B",
        }),
      ]);
    });

    act(() => {
      captured.composerProps?.onComposerValueChange("changed answer A");
    });
    await waitFor(() => {
      expect(captured.composerProps?.outgoingBodyOverride).toContain("changed answer A");
    });

    const secondTabId = captured.composerProps?.workspaceReplySession?.tabs[1]?.id;
    if (secondTabId == null) throw new Error("Second restored reply tab is missing");
    act(() => {
      captured.composerProps?.onSelectWorkspaceReplyTab?.(secondTabId);
    });
    await waitFor(() => {
      expect(captured.composerProps?.editSession).toMatchObject({
        preserveWorkspaceReplyContext: true,
        initialMarkdown: "answer B",
        sessionKey: `reply:${secondTabId}`,
      });
    });
  });

  it("adds a reply tab without leaving restored Workspace reply editing", async () => {
    const restoredMarkdown = [
      `> [Alice](urn:user:${USER_UUID}) [wrote](urn:message:${MESSAGE_UUID}):`,
      "> quoted A",
      "",
      "answer A",
      "",
      `> [Bob](urn:user:${USER_B_UUID}) [wrote](urn:message:${SECOND_MESSAGE_UUID}):`,
      "> quoted B",
      "",
      "answer B",
    ].join("\n");
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      {
        ...createMessage(),
        isOwn: true,
        payload: { kind: "markdown", content: restoredMarkdown },
      },
      createSecondMessage(),
      createThirdMessage(),
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
    });
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.tabs).toHaveLength(2);
    });

    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(THIRD_MESSAGE_UUID);
    });

    await waitFor(() => {
      expect(captured.composerProps?.editSession?.preserveWorkspaceReplyContext).toBe(true);
      expect(captured.composerProps?.workspaceReplySession?.tabs).toEqual([
        expect.objectContaining({ messageUuid: MESSAGE_UUID, answer: "answer A" }),
        expect.objectContaining({ messageUuid: SECOND_MESSAGE_UUID, answer: "answer B" }),
        expect.objectContaining({ messageUuid: THIRD_MESSAGE_UUID, answer: "" }),
      ]);
      expect(captured.composerProps?.outgoingBodyOverride).toContain(
        `urn:quote:${THIRD_MESSAGE_UUID}`,
      );
    });
  });

  it("restores a new quote reference from the source message and author stores", async () => {
    const restoredMarkdown = [
      `[Stale author](urn:quote:${SECOND_MESSAGE_UUID}?text=%20%20selected%20fragment%20%20)`,
      "",
      "reference answer",
    ].join("\n");
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      {
        ...createMessage(),
        isOwn: true,
        payload: { kind: "markdown", content: restoredMarkdown },
      },
      createSecondMessage(),
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
    });

    await waitFor(() => {
      expect(captured.composerProps?.editSession).toMatchObject({
        preserveWorkspaceReplyContext: true,
        initialMarkdown: "reference answer",
      });
      expect(captured.composerProps?.workspaceReplySession?.tabs).toEqual([
        expect.objectContaining({
          messageUuid: SECOND_MESSAGE_UUID,
          senderUuid: USER_B_UUID,
          senderName: "Bob Reed",
          quotedContent: "second workspace message",
          selectedText: "  selected fragment  ",
          answer: "reference answer",
        }),
      ]);
    });
  });

  it.each(["cache", "server"] as const)(
    "restores a new quote reference when its source is resolved from %s",
    async (source) => {
      const restoredMarkdown = [
        `[Bob](urn:quote:${SECOND_MESSAGE_UUID})`,
        "",
        "loaded reference answer",
      ].join("\n");
      replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
        {
          ...createMessage(),
          isOwn: true,
          payload: { kind: "markdown", content: restoredMarkdown },
        },
      ]);
      captured.loadMessengerQuoteMessage.mockResolvedValue({
        status: "resolved",
        message: createSecondMessage(),
        source,
      });

      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      );
      await screen.findByTestId("workspace-message-list-section");

      act(() => {
        captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
      });

      await waitFor(() => {
        expect(captured.loadMessengerQuoteMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            messageUuid: SECOND_MESSAGE_UUID,
            signal: expect.any(AbortSignal),
          }),
        );
        expect(captured.composerProps?.workspaceReplySession?.tabs).toEqual([
          expect.objectContaining({
            messageUuid: SECOND_MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "second workspace message",
            answer: "loaded reference answer",
          }),
        ]);
      });
    },
  );

  it("treats whitespace-only selected quote text as absent during edit restore", async () => {
    const restoredMarkdown = [
      `[Bob](urn:quote:${SECOND_MESSAGE_UUID}?text=%20%20%20)`,
      "",
      "reference answer",
    ].join("\n");
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      {
        ...createMessage(),
        isOwn: true,
        payload: { kind: "markdown", content: restoredMarkdown },
      },
      createSecondMessage(),
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
    });

    await waitFor(() => {
      const restoredTab = captured.composerProps?.workspaceReplySession?.tabs[0];
      expect(restoredTab).toMatchObject({
        messageUuid: SECOND_MESSAGE_UUID,
        quotedContent: "second workspace message",
      });
      expect(restoredTab?.selectedText).toBeUndefined();
    });
  });

  it("keeps raw quote reference Markdown when the source message is missing", async () => {
    const restoredMarkdown = [
      `[Bob](urn:quote:${SECOND_MESSAGE_UUID})`,
      "",
      "reference answer",
    ].join("\n");
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      {
        ...createMessage(),
        isOwn: true,
        payload: { kind: "markdown", content: restoredMarkdown },
      },
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
    });

    await waitFor(() => {
      expect(captured.composerProps?.editSession).toMatchObject({
        initialMarkdown: restoredMarkdown,
      });
      expect(captured.composerProps?.editSession?.preserveWorkspaceReplyContext).toBeUndefined();
      expect(captured.composerProps?.workspaceReplySession).toEqual({
        tabs: [],
        activeTabId: null,
      });
    });
  });

  it("restores message files outside the edit textbox and rebuilds Markdown on save", async () => {
    const imageUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
    const fileUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
    const imageMarkdown = `![screen.png](urn:image:${imageUuid}?name=screen.png&content_type=image%2Fpng&size=8)`;
    const fileMarkdown = `[report.pdf](urn:file:${fileUuid}?name=report.pdf&content_type=application%2Fpdf&size=12)`;
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      {
        ...createMessage(),
        isOwn: true,
        payload: { kind: "markdown", content: `Message text\n${imageMarkdown}\n${fileMarkdown}` },
      },
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => captured.messageListProps?.onEditMessage?.(MESSAGE_UUID));
    await waitFor(() => {
      expect(captured.composerProps?.editSession?.initialMarkdown).toBe("Message text");
      expect(captured.composerProps?.attachments).toEqual([
        expect.objectContaining({
          localId: expect.stringContaining(`existing:${imageUuid}`),
          fileName: "screen.png",
          workspaceFile: expect.objectContaining({ fileUuid: imageUuid, mediaKind: "image" }),
        }),
        expect.objectContaining({
          localId: expect.stringContaining(`existing:${fileUuid}`),
          fileName: "report.pdf",
          workspaceFile: expect.objectContaining({ fileUuid, kind: "attachment" }),
        }),
      ]);
    });

    const restoredImageId = captured.composerProps?.attachments?.[0]?.localId;
    if (restoredImageId == null) throw new Error("Restored image attachment is missing");
    act(() => captured.composerProps?.onRemoveAttachment?.(restoredImageId));
    await waitFor(() => {
      expect(captured.composerProps?.attachments).toEqual([
        expect.objectContaining({ fileName: "report.pdf" }),
      ]);
    });

    await act(async () => {
      await captured.composerProps?.onSubmitEdit(1, "Edited text");
    });
    expect(captured.editMessengerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuid: MESSAGE_UUID,
        markdown: `Edited text\n${fileMarkdown}`,
      }),
    );
  });

  it("adds a newly uploaded file while editing and submits it with the remaining message files", async () => {
    const existingUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac";
    const uploadedUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd";
    const existingMarkdown = `[old.pdf](urn:file:${existingUuid}?name=old.pdf&size=12)`;
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      {
        ...createMessage(),
        isOwn: true,
        payload: { kind: "markdown", content: `Text\n${existingMarkdown}` },
      },
    ]);
    captured.uploadWorkspaceFileWithProgress.mockResolvedValueOnce({
      uuid: uploadedUuid,
      name: "new.pdf",
      content_type: "application/pdf",
      size_bytes: 3,
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");
    act(() => captured.messageListProps?.onEditMessage?.(MESSAGE_UUID));
    await waitFor(() => expect(captured.composerProps?.editSession).not.toBeNull());

    const newFile = new File(["new"], "new.pdf", { type: "application/pdf" });
    act(() => captured.composerProps?.onAddAttachments?.([newFile]));
    await waitFor(() => {
      expect(captured.composerProps?.attachments).toEqual([
        expect.objectContaining({ fileName: "old.pdf" }),
        expect.objectContaining({ fileName: "new.pdf", status: "ready" }),
      ]);
    });

    await act(async () => {
      await captured.composerProps?.onSubmitEdit(1, "Edited");
    });
    expect(captured.editMessengerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: [
          "Edited",
          existingMarkdown,
          `[new.pdf](urn:file:${uploadedUuid}?name=new.pdf&content_type=application%2Fpdf&size=3)`,
        ].join("\n"),
      }),
    );
    expect(captured.composerProps?.attachments).toEqual([]);
  });

  it("clears an active edit session when navigating to another conversation", async () => {
    const fileUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad";
    const fileMarkdown = `[old.pdf](urn:file:${fileUuid}?name=old.pdf&size=12)`;
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      {
        ...createMessage(),
        isOwn: true,
        payload: { kind: "markdown", content: `Text\n${fileMarkdown}` },
      },
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");
    act(() => captured.messageListProps?.onEditMessage?.(MESSAGE_UUID));
    await waitFor(() => {
      expect(captured.composerProps?.editSession).not.toBeNull();
      expect(captured.composerProps?.attachments).toEqual([
        expect.objectContaining({ fileName: "old.pdf" }),
      ]);
    });

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    });

    await waitFor(() => {
      expect(captured.messageListProps?.conversationId).toBe(`stream:${STREAM_UUID}`);
    });
    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`);
    });
    await waitFor(() => {
      expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
      expect(captured.composerProps?.editSession).toBeNull();
      expect(captured.composerProps?.attachments).toEqual([]);
    });
  });

  it("restores the existing composer draft after cancelling restored reply editing", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const existingDraft = {
      text: "",
      replySession: {
        activeTabId: "draft-tab",
        tabs: [
          {
            id: "draft-tab",
            messageUuid: SECOND_MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob",
            quotedContent: "saved quote",
            createdAt: "2026-07-16T10:00:00.000Z",
            answer: "saved answer",
          },
        ],
      },
    };
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, existingDraft);
    replaceTestConversationWindow(conversationId, [
      {
        ...createMessage(),
        isOwn: true,
        payload: {
          kind: "markdown",
          content: [
            `> [Alice](urn:user:${USER_UUID}) [wrote](urn:message:${MESSAGE_UUID}):`,
            "> old quote",
            "",
            "old answer",
          ].join("\n"),
        },
      },
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("draft-tab");
    });

    act(() => {
      captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
    });
    await waitFor(() => {
      expect(captured.composerProps?.editSession?.preserveWorkspaceReplyContext).toBe(true);
    });

    act(() => {
      captured.composerProps?.onCancelEdit();
    });
    await waitFor(() => {
      expect(captured.composerProps?.editSession).toBeNull();
      expect(captured.composerProps?.workspaceReplySession).toMatchObject(
        existingDraft.replySession,
      );
      expect(captured.composerProps?.draftInitialValue).toBe("saved answer");
    });
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content,
    ).toEqual(existingDraft);
  });

  it("replaces the active Workspace reply quote while preserving its answer", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID, "excerpt A");
    });
    const firstTabId = captured.composerProps?.workspaceReplySession?.activeTabId;
    act(() => {
      captured.composerProps?.onComposerValueChange("answer A");
    });
    act(() => {
      captured.messageListProps?.onReplyMessage?.(SECOND_MESSAGE_UUID, "excerpt B");
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toMatchObject({
        activeTabId: firstTabId,
        tabs: [
          {
            id: firstTabId,
            messageUuid: SECOND_MESSAGE_UUID,
            selectedText: "excerpt B",
            answer: "answer A",
          },
        ],
      });
    });
  });

  it("adds a Workspace reply tab with an empty answer", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID, "excerpt A");
      captured.composerProps?.onComposerValueChange?.("answer A");
    });
    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID, "excerpt B");
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.tabs).toHaveLength(2);
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe(
        captured.composerProps?.workspaceReplySession?.tabs[1]?.id,
      );
      expect(captured.composerProps?.workspaceReplySession?.tabs[0]?.answer).toBe("answer A");
      expect(captured.composerProps?.workspaceReplySession?.tabs[1]).toMatchObject({
        messageUuid: SECOND_MESSAGE_UUID,
        answer: "",
      });
    });
  });

  it("switches Workspace reply tabs and shows the selected answer", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("answer A");
    });
    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("answer B");
    });
    const firstTabId = captured.composerProps?.workspaceReplySession?.tabs[0]?.id;
    const secondTabId = captured.composerProps?.workspaceReplySession?.tabs[1]?.id;

    act(() => {
      if (firstTabId != null) captured.composerProps?.onSelectWorkspaceReplyTab?.(firstTabId);
    });
    await waitFor(() => {
      expect(captured.composerProps?.draftInitialValue).toBe("answer A");
      expect(captured.composerProps?.focusKey).toBe(firstTabId);
    });

    act(() => {
      if (secondTabId != null) captured.composerProps?.onSelectWorkspaceReplyTab?.(secondTabId);
    });
    await waitFor(() => {
      expect(captured.composerProps?.draftInitialValue).toBe("answer B");
      expect(captured.composerProps?.focusKey).toBe(secondTabId);
    });
  });

  it("suppresses composer focus during keyboard tab navigation and restores it for pointer and reply actions", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    await waitFor(() =>
      expect(captured.messageListProps?.onAddReplyMessage).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });

    const firstTabId = captured.composerProps?.workspaceReplySession?.tabs[0]?.id;
    const secondTabId = captured.composerProps?.workspaceReplySession?.tabs[1]?.id;
    if (firstTabId == null || secondTabId == null) {
      throw new Error("Workspace reply tabs were not created");
    }
    const selectWorkspaceReplyTab = captured.composerProps?.onSelectWorkspaceReplyTab;
    if (selectWorkspaceReplyTab == null) {
      throw new Error("Workspace reply tab select handler is missing");
    }

    expect(captured.composerProps?.focusKey).toBe(secondTabId);

    act(() => {
      selectWorkspaceReplyTab(firstTabId, "keyboard");
    });
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe(firstTabId);
      expect(captured.composerProps?.focusKey).toBeNull();
    });

    act(() => {
      selectWorkspaceReplyTab(secondTabId, "keyboard");
    });
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe(secondTabId);
      expect(captured.composerProps?.focusKey).toBeNull();
    });

    act(() => {
      captured.messageListProps?.onReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe(secondTabId);
      expect(captured.composerProps?.focusKey).toBe(secondTabId);
    });

    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(MESSAGE_UUID);
    });
    await waitFor(() => {
      const activeTabId = captured.composerProps?.workspaceReplySession?.activeTabId;
      expect(activeTabId).not.toBeNull();
      expect(captured.composerProps?.focusKey).toBe(activeTabId);
    });

    act(() => {
      selectWorkspaceReplyTab(firstTabId);
    });
    await waitFor(() => expect(captured.composerProps?.focusKey).toBe(firstTabId));
  });

  it("removes the last Workspace reply tab and closes the session", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.composerProps?.onComposerValueChange("draft before removing reply");
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    const tabId = captured.composerProps?.workspaceReplySession?.activeTabId;
    act(() => {
      if (tabId != null) captured.composerProps?.onRemoveWorkspaceReplyTab?.(tabId);
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toEqual({
        tabs: [],
        activeTabId: null,
      });
      expect(captured.composerProps?.outgoingBodyOverride).toBeUndefined();
      expect(captured.composerProps?.draftInitialValue).toBe("draft before removing reply");
    });
  });

  it("sends Workspace reply pairs in their current tab order", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("answer A");
    });
    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("answer B");
    });
    const outgoingBody = captured.composerProps?.outgoingBodyOverride;
    expect(outgoingBody).toContain("answer A");
    expect(outgoingBody).toContain("answer B");
    expect(outgoingBody?.indexOf("answer A")).toBeLessThan(outgoingBody?.indexOf("answer B") ?? -1);
    await act(async () => {
      await captured.composerProps?.onSend?.(outgoingBody ?? "", "");
    });

    expect(captured.sendMessengerMessage).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: outgoingBody }),
    );
  });

  it("clears Workspace reply tabs after a successful send", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
      captured.composerProps?.onComposerValueChange?.("answer");
    });
    await act(async () => {
      await captured.composerProps?.onSend?.(
        captured.composerProps?.outgoingBodyOverride ?? "",
        "",
      );
      captured.composerProps?.onComposerValueChange?.("");
      captured.composerProps?.onClearReply?.();
    });

    expect(captured.composerProps?.workspaceReplySession).toEqual({
      tabs: [],
      activeTabId: null,
    });
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        workspaceRuntimeOwnerKey(createSession()),
        `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      ),
    ).toBeNull();
  });

  it("keeps Workspace reply tabs when sending fails", async () => {
    captured.sendMessengerMessage.mockRejectedValueOnce(new Error("send failed"));
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
      captured.composerProps?.onComposerValueChange?.("answer");
    });
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    await act(async () => {
      await expect(
        onSend(captured.composerProps?.outgoingBodyOverride ?? "", ""),
      ).rejects.toThrow();
    });

    expect(captured.composerProps?.workspaceReplySession?.tabs).toHaveLength(1);
    expect(captured.composerProps?.workspaceReplySession?.tabs[0]?.answer).toBe("answer");
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        workspaceRuntimeOwnerKey(createSession()),
        `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      )?.content.replySession.tabs[0]?.answer,
    ).toBe("answer");
  });

  it("treats a false Workspace send as failed and keeps the active reply answer", async () => {
    captured.sendMessengerMessage.mockResolvedValueOnce({
      status: "skipped",
      ownerKey: "owner-key",
      reason: "stale-owner",
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
      captured.composerProps?.onComposerValueChange?.("answer");
    });
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    await act(async () => {
      await expect(
        onSend(captured.composerProps?.outgoingBodyOverride ?? "", ""),
      ).rejects.toThrow();
    });

    expect(captured.messageListProps?.outgoingMessages?.[0]).toEqual(
      expect.objectContaining({ status: "failed" }),
    );
    expect(captured.composerProps?.workspaceReplySession?.tabs[0]?.answer).toBe("answer");
  });

  it("opens Workspace forward store for one message with selected text", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onForwardMessage).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onForwardMessage?.(MESSAGE_UUID, "selected excerpt");
    });

    await waitFor(() => {
      expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
        isOpen: true,
        messageUuids: [MESSAGE_UUID],
        selectedText: "selected excerpt",
        onSuccess: undefined,
      });
    });
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("opens Workspace forward store for selected message UUIDs", async () => {
    replaceTestConversationWindow(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      createMessage(),
      createSecondMessage(),
    ]);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onToggleMessageSelection).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onToggleMessageSelection?.(SECOND_MESSAGE_UUID);
      captured.messageListProps?.onToggleMessageSelection?.(MESSAGE_UUID);
    });

    const selectionToolbar = await screen.findByRole("toolbar", { name: "Selected: 2" });
    expect(selectionToolbar).toHaveClass("rounded-t-xl", "border-b", "bg-composer-outer");
    await waitFor(() => expect(captured.composerProps?.joinedTop).toBe(true));

    fireEvent.click(await screen.findByRole("button", { name: "Forward" }));

    await waitFor(() => {
      expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
        isOpen: true,
        messageUuids: [SECOND_MESSAGE_UUID, MESSAGE_UUID],
        selectedText: undefined,
      });
    });
    expect(useWorkspaceForwardMessageStore.getState().onSuccess).toEqual(expect.any(Function));
    expect(captured.messageListProps?.selectedMessageUuids?.size).toBe(2);

    act(() => {
      useWorkspaceForwardMessageStore.getState().onSuccess?.();
    });

    await waitFor(() => {
      expect(captured.messageListProps?.selectedMessageUuids?.size).toBe(0);
    });
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("downloads Workspace file attachments through the shared file resource cache", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-file");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onDownloadFile).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onDownloadFile?.({
        kind: "attachment",
        href: "urn:file:33333333-3333-4333-8333-333333333333?name=hint.txt",
        fileUuid: "33333333-3333-4333-8333-333333333333",
        name: "hint.txt",
      });
    });

    await waitFor(() => {
      expect(captured.loadWorkspaceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerKey: workspaceRuntimeOwnerKey(createSession()),
          runtimeGeneration: 1,
          fileUuid: "33333333-3333-4333-8333-333333333333",
          requestOptions: expect.objectContaining({
            accessToken: "access-token",
            devTargetOrigin: "https://org-a.example.com",
            projectId: "project-a",
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(useDownloadStore.getState().entries[0]).toMatchObject({
        fileUuid: "33333333-3333-4333-8333-333333333333",
        fileName: "hint.txt",
        status: "downloaded",
        receivedBytes: 17,
        totalBytes: 17,
      });
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-file");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("downloads Workspace media placeholders through the same shared resource cache", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-file");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onDownloadFile).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onDownloadFile?.({
        kind: "media",
        href: "urn:image:44444444-4444-4444-8444-444444444444?name=screen.png&content_type=image%2Fpng",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => {
      expect(captured.loadWorkspaceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerKey: workspaceRuntimeOwnerKey(createSession()),
          runtimeGeneration: 1,
          fileUuid: "44444444-4444-4444-8444-444444444444",
          requestOptions: expect.objectContaining({
            accessToken: "access-token",
            devTargetOrigin: "https://org-a.example.com",
            projectId: "project-a",
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(useDownloadStore.getState().entries[0]).toMatchObject({
        fileUuid: "44444444-4444-4444-8444-444444444444",
        fileName: "screen.png",
        status: "downloaded",
        receivedBytes: 17,
        totalBytes: 17,
      });
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-file");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("loads Workspace image preview blobs through the current runtime context", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    const controller = new AbortController();
    const blob = await captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      {
        kind: "media",
        href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png&content_type=image%2Fpng",
        fileUuid: "55555555-5555-4555-8555-555555555555",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      },
      controller.signal,
    );

    expect(captured.loadWorkspaceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: workspaceRuntimeOwnerKey(createSession()),
        runtimeGeneration: 1,
        fileUuid: "55555555-5555-4555-8555-555555555555",
        requestOptions: expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(captured.loadWorkspaceFile.mock.calls[0]?.[0].signal).not.toBe(controller.signal);
    expect(captured.downloadWorkspaceFile).not.toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });

  it("reuses one Workspace image preview blob request for the same file within the runtime", async () => {
    const imageBlob = new Blob(["cached-image"], { type: "image/png" });
    captured.loadWorkspaceFile.mockResolvedValueOnce({
      blob: imageBlob,
      headers: new Headers({
        "content-disposition": 'attachment; filename="screen.png"',
        "content-length": "12",
      }),
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    const firstController = new AbortController();
    const secondController = new AbortController();
    const file = {
      kind: "media" as const,
      href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png&content_type=image%2Fpng",
      fileUuid: "55555555-5555-4555-8555-555555555555",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };

    await expect(
      Promise.all([
        captured.messageListProps?.onLoadWorkspaceFilePreview?.(file, firstController.signal),
        captured.messageListProps?.onLoadWorkspaceFilePreview?.(file, secondController.signal),
      ]),
    ).resolves.toEqual([imageBlob, imageBlob]);

    expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
  });

  it("downloads a Workspace file from the blob cached by its preview", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cached-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    let clickedDownloadName = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedDownloadName = this.download;
    });
    const file = {
      kind: "media" as const,
      href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png",
      fileUuid: "55555555-5555-4555-8555-555555555555",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    captured.loadWorkspaceFile.mockResolvedValueOnce({
      blob: new Blob(["cached-image"], { type: "image/png" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="server-screen.png"',
      }),
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    await act(async () => {
      await captured.messageListProps?.onLoadWorkspaceFilePreview?.(
        file,
        new AbortController().signal,
      );
    });
    act(() => {
      captured.messageListProps?.onDownloadFile?.(file);
    });

    await waitFor(() =>
      expect(useDownloadStore.getState().entries[0]).toMatchObject({
        fileName: "server-screen.png",
        status: "downloaded",
      }),
    );
    expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(captured.downloadWorkspaceFile).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(clickedDownloadName).toBe("server-screen.png");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cached-preview");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("keeps the page loader consumer alive when one DOM preview is canceled", async () => {
    const request = createDeferred<{ blob: Blob; headers: Headers }>();
    let loaderSignal: AbortSignal | undefined;
    captured.loadWorkspaceFile.mockImplementation((options: { signal?: AbortSignal }) => {
      loaderSignal = options.signal;
      return request.promise;
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    const firstController = new AbortController();
    const secondController = new AbortController();
    const file = {
      kind: "media" as const,
      href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png",
      fileUuid: "55555555-5555-4555-8555-555555555555",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    const firstPreview = captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      file,
      firstController.signal,
    );
    const secondPreview = captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      file,
      secondController.signal,
    );

    await waitFor(() => expect(loaderSignal).toBeInstanceOf(AbortSignal));
    firstController.abort();
    request.resolve({
      blob: new Blob(["cached-image"], { type: "image/png" }),
      headers: new Headers(),
    });

    await expect(firstPreview).rejects.toMatchObject({ name: "AbortError" });
    await expect(secondPreview).resolves.toBeInstanceOf(Blob);
    expect(loaderSignal?.aborted).toBe(false);
    expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
  });

  it("handles a late shared preview failure after an already canceled consumer", async () => {
    const request = createDeferred<{ blob: Blob; headers: Headers }>();
    captured.loadWorkspaceFile.mockImplementation(() => request.promise);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    const canceledController = new AbortController();
    canceledController.abort();
    const file = {
      kind: "media" as const,
      href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png",
      fileUuid: "55555555-5555-4555-8555-555555555555",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };

    const canceledPreview = captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      file,
      canceledController.signal,
    );
    await expect(canceledPreview).rejects.toMatchObject({ name: "AbortError" });

    request.reject(new Error("late preview failure"));
    await expect(request.promise).rejects.toThrow("late preview failure");
    await Promise.resolve();
  });

  it("aborts the page preview loader when the runtime changes", async () => {
    const request = createDeferred<{ blob: Blob; headers: Headers }>();
    let loaderSignal: AbortSignal | undefined;
    captured.loadWorkspaceFile.mockImplementation((options: { signal?: AbortSignal }) => {
      loaderSignal = options.signal;
      return request.promise;
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    void captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      {
        kind: "media",
        href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png",
        fileUuid: "55555555-5555-4555-8555-555555555555",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      },
      new AbortController().signal,
    );

    await waitFor(() => expect(loaderSignal).toBeInstanceOf(AbortSignal));
    act(() => {
      const nextSession = {
        ...createSession(),
        accessToken: "next-access-token",
        runtimeGeneration: 2,
      };
      useWorkspaceAuthStore.setState({
        sessions: [nextSession],
        currentAccountId: nextSession.accountId,
        runtimeGeneration: 2,
      });
    });

    await waitFor(() => expect(loaderSignal?.aborted).toBe(true));
    request.resolve({
      blob: new Blob(["stale-image"], { type: "image/png" }),
      headers: new Headers(),
    });
  });

  it("opens Workspace image media in the old media viewer with a blob display URL", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-viewer-image");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.loadWorkspaceFile.mockResolvedValueOnce({
      blob: new Blob(["image-bytes"], { type: "image/png" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="server-screen.png"',
        "content-length": "11",
      }),
    });

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.({
        kind: "media",
        href: "urn:image:44444444-4444-4444-8444-444444444444?name=hint-screen.png&content_type=image%2Fpng",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "hint-screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => {
      expect(captured.loadWorkspaceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileUuid: "44444444-4444-4444-8444-444444444444",
          signal: expect.any(AbortSignal),
          requestOptions: expect.objectContaining({
            accessToken: "access-token",
            devTargetOrigin: "https://org-a.example.com",
            projectId: "project-a",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(useMediaViewerStore.getState().isOpen).toBe(true);
    });

    const viewerItem = useMediaViewerStore.getState().items[0];
    expect(viewerItem).toMatchObject({
      url: "blob:workspace-viewer-image",
      type: "image",
      previewUrl: "blob:workspace-viewer-image",
      alt: "hint-screen.png",
      downloadFileName: "server-screen.png",
      workspaceFile: {
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "server-screen.png",
        contentType: "image/png",
        objectUrl: "blob:workspace-viewer-image",
      },
    });
    expect(viewerItem?.url).not.toContain("/api/workspace/v1/messenger/files");
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    unmount();

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-viewer-image");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("keeps the file hint when the Workspace response has no filename", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-viewer-fallback");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.loadWorkspaceFile.mockResolvedValueOnce({
      blob: new Blob(["image-bytes"], { type: "image/png" }),
      headers: new Headers(),
    });

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.({
        kind: "media",
        href: "urn:image:44444444-4444-4444-8444-444444444444?name=hint-screen.png",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "hint-screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => expect(useMediaViewerStore.getState().isOpen).toBe(true));
    expect(useMediaViewerStore.getState().items[0]).toMatchObject({
      downloadFileName: "hint-screen.png",
      workspaceFile: { name: "hint-screen.png" },
    });

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-viewer-fallback");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("opens a Workspace video from the shared resource cache without a second download", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-video-first")
      .mockReturnValueOnce("blob:workspace-video-second");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const videoFile = {
      kind: "media" as const,
      href: "urn:video:55555555-5555-4555-8555-555555555555?name=clip.mp4",
      fileUuid: "55555555-5555-4555-8555-555555555555",
      name: "clip.mp4",
      contentType: "video/mp4",
      mediaKind: "video" as const,
    };
    captured.loadWorkspaceFile.mockResolvedValue({
      blob: new Blob(["video-bytes"], { type: "video/mp4" }),
      headers: new Headers(),
    });

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );

    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(videoFile);
    });
    await waitFor(() => expect(useMediaViewerStore.getState().isOpen).toBe(true));
    expect(useMediaViewerStore.getState().items[0]).toMatchObject({
      type: "video",
      url: "blob:workspace-video-first",
      resourceState: "ready",
      workspaceFile: { fileUuid: videoFile.fileUuid, contentType: "video/mp4" },
    });

    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(videoFile);
    });
    await waitFor(() =>
      expect(useMediaViewerStore.getState().items[0]?.url).toBe("blob:workspace-video-second"),
    );
    expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-video-first");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-video-second");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("loads an unselected gallery video only after navigation to it", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-gallery-image")
      .mockReturnValueOnce("blob:workspace-gallery-video");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const imageFile = {
      kind: "media" as const,
      href: "urn:image:66666666-6666-4666-8666-666666666666?name=image.png",
      fileUuid: "66666666-6666-4666-8666-666666666666",
      name: "image.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    const videoFile = {
      kind: "media" as const,
      href: "urn:video:77777777-7777-4777-8777-777777777777?name=video.mp4",
      fileUuid: "77777777-7777-4777-8777-777777777777",
      name: "video.mp4",
      contentType: "video/mp4",
      mediaKind: "video" as const,
    };
    captured.loadWorkspaceFile.mockImplementation((options: { fileUuid: string }) =>
      Promise.resolve({
        blob: new Blob([options.fileUuid], {
          type: options.fileUuid === videoFile.fileUuid ? "video/mp4" : "image/png",
        }),
        headers: new Headers(),
      }),
    );

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(imageFile, {
        startIndex: 0,
        items: [
          { messageUuid: "gallery-image-message", file: imageFile },
          { messageUuid: "gallery-video-message", file: videoFile },
        ],
      });
    });

    await waitFor(() => expect(useMediaViewerStore.getState().isOpen).toBe(true));
    expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(useMediaViewerStore.getState().items[1]).toMatchObject({
      type: "video",
      resourceState: "loading",
      url: "",
    });

    act(() => {
      useMediaViewerStore.getState().goTo(1);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(useMediaViewerStore.getState().items[1]).toMatchObject({
        type: "video",
        resourceState: "ready",
        url: "blob:workspace-gallery-video",
      }),
    );

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-image");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-video");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("opens a Workspace image gallery in the old media viewer with the clicked index", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-gallery-second")
      .mockReturnValueOnce("blob:workspace-gallery-first");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.loadWorkspaceFile
      .mockResolvedValueOnce({
        blob: new Blob(["first-image"], { type: "image/png" }),
        headers: new Headers({
          "content-disposition": 'attachment; filename="first.png"',
          "content-length": "11",
        }),
      })
      .mockResolvedValueOnce({
        blob: new Blob(["second-image"], { type: "image/png" }),
        headers: new Headers({
          "content-disposition": 'attachment; filename="second.png"',
          "content-length": "12",
        }),
      });

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(
        {
          kind: "media",
          href: "urn:image:22222222-2222-4222-8222-222222222222?name=second.png&content_type=image%2Fpng",
          fileUuid: "22222222-2222-4222-8222-222222222222",
          name: "second.png",
          contentType: "image/png",
          mediaKind: "image",
        },
        {
          startIndex: 1,
          items: [
            {
              messageUuid: "workspace-gallery-first-message",
              file: {
                kind: "media",
                href: "urn:image:11111111-1111-4111-8111-111111111111?name=first.png&content_type=image%2Fpng",
                fileUuid: "11111111-1111-4111-8111-111111111111",
                name: "first.png",
                contentType: "image/png",
                mediaKind: "image",
              },
            },
            {
              messageUuid: "workspace-gallery-second-message",
              file: {
                kind: "media",
                href: "urn:image:22222222-2222-4222-8222-222222222222?name=second.png&content_type=image%2Fpng",
                fileUuid: "22222222-2222-4222-8222-222222222222",
                name: "second.png",
                contentType: "image/png",
                mediaKind: "image",
              },
            },
          ],
        },
      );
    });

    await waitFor(() => {
      expect(useMediaViewerStore.getState().isOpen).toBe(true);
    });

    expect(captured.loadWorkspaceFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileUuid: "11111111-1111-4111-8111-111111111111",
        signal: expect.any(AbortSignal),
        requestOptions: expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
        }),
      }),
    );
    expect(captured.loadWorkspaceFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileUuid: "22222222-2222-4222-8222-222222222222",
        signal: expect.any(AbortSignal),
        requestOptions: expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
        }),
      }),
    );
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
    expect(useMediaViewerStore.getState().items).toMatchObject([
      {
        url: "blob:workspace-gallery-first",
        previewUrl: "blob:workspace-gallery-first",
        downloadFileName: "first.png",
        workspaceFile: {
          fileUuid: "11111111-1111-4111-8111-111111111111",
          objectUrl: "blob:workspace-gallery-first",
        },
      },
      {
        url: "blob:workspace-gallery-second",
        previewUrl: "blob:workspace-gallery-second",
        downloadFileName: "second.png",
        workspaceFile: {
          fileUuid: "22222222-2222-4222-8222-222222222222",
          objectUrl: "blob:workspace-gallery-second",
        },
      },
    ]);
    expect(useMediaViewerStore.getState().items[0]?.url).not.toContain(
      "/api/workspace/v1/messenger/files",
    );
    expect(useMediaViewerStore.getState().items[1]?.url).not.toContain(
      "/api/workspace/v1/messenger/files",
    );

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-first");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-second");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("opens the gallery after the selected image and fills other slots later", async () => {
    const firstImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const selectedImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-gallery-selected")
      .mockReturnValueOnce("blob:workspace-gallery-first");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.loadWorkspaceFile.mockImplementation((options: { fileUuid: string }) => {
      return options.fileUuid.startsWith("11111111") ? firstImage.promise : selectedImage.promise;
    });

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(
        {
          kind: "media",
          href: "urn:image:22222222-2222-4222-8222-222222222222?name=second.png",
          fileUuid: "22222222-2222-4222-8222-222222222222",
          name: "second.png",
          contentType: "image/png",
          mediaKind: "image",
        },
        {
          startIndex: 1,
          items: [
            {
              messageUuid: "workspace-gallery-first-message",
              file: {
                kind: "media",
                href: "urn:image:11111111-1111-4111-8111-111111111111?name=first.png",
                fileUuid: "11111111-1111-4111-8111-111111111111",
                name: "first.png",
                contentType: "image/png",
                mediaKind: "image",
              },
            },
            {
              messageUuid: "workspace-gallery-second-message",
              file: {
                kind: "media",
                href: "urn:image:22222222-2222-4222-8222-222222222222?name=second.png",
                fileUuid: "22222222-2222-4222-8222-222222222222",
                name: "second.png",
                contentType: "image/png",
                mediaKind: "image",
              },
            },
          ],
        },
      );
    });

    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(2));
    selectedImage.resolve({
      blob: new Blob(["selected-image"], { type: "image/png" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="server-second.png"',
      }),
    });

    await waitFor(() => {
      expect(useMediaViewerStore.getState().isOpen).toBe(true);
      expect(useMediaViewerStore.getState().items[1]?.url).toBe("blob:workspace-gallery-selected");
      expect(useMediaViewerStore.getState().items[1]?.downloadFileName).toBe("server-second.png");
      expect(useMediaViewerStore.getState().items[1]?.workspaceFile?.name).toBe(
        "server-second.png",
      );
    });
    expect(useMediaViewerStore.getState().items[0]?.url).toBe("");
    expect(useMediaViewerStore.getState().items[0]?.downloadFileName).toBe("first.png");
    expect(useMediaViewerStore.getState().items[0]?.workspaceFile?.name).toBe("first.png");

    firstImage.resolve({
      blob: new Blob(["first-image"], { type: "image/png" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="server-first.png"',
      }),
    });
    await waitFor(() => {
      expect(useMediaViewerStore.getState().items[0]?.url).toBe("blob:workspace-gallery-first");
      expect(useMediaViewerStore.getState().items[0]?.downloadFileName).toBe("server-first.png");
      expect(useMediaViewerStore.getState().items[0]?.workspaceFile?.name).toBe("server-first.png");
    });

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-selected");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-first");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("drops a stale Workspace gallery result after the conversation changes", async () => {
    const staleImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const staleFile = {
      kind: "media" as const,
      href: "urn:image:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?name=stale.png",
      fileUuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "stale.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    captured.loadWorkspaceFile.mockReturnValue(staleImage.promise);

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(staleFile);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1));

    act(() => {
      navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${DIRECT_TOPIC_UUID}`);
    });
    await act(async () => {
      staleImage.resolve({
        blob: new Blob(["stale-image"], { type: "image/png" }),
        headers: new Headers(),
      });
      await staleImage.promise;
    });

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();

    unmount();
    createObjectURL.mockRestore();
  });

  it("drops a stale Workspace gallery result after the runtime changes", async () => {
    const staleImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const staleFile = {
      kind: "media" as const,
      href: "urn:image:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?name=stale.png",
      fileUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "stale.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    captured.loadWorkspaceFile.mockReturnValue(staleImage.promise);

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(staleFile);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1));

    act(() => {
      const nextSession = {
        ...createSession(),
        accessToken: "next-access-token",
        runtimeGeneration: 2,
      };
      useWorkspaceAuthStore.setState({
        sessions: [nextSession],
        currentAccountId: nextSession.accountId,
        runtimeGeneration: 2,
      });
    });
    await act(async () => {
      staleImage.resolve({
        blob: new Blob(["stale-image"], { type: "image/png" }),
        headers: new Headers(),
      });
      await staleImage.promise;
    });

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();

    unmount();
    createObjectURL.mockRestore();
  });

  it("ignores an old gallery result after a new gallery opens", async () => {
    const oldImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const newImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-gallery-new");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const oldFile = {
      kind: "media" as const,
      href: "urn:image:cccccccc-cccc-4ccc-8ccc-cccccccccccc?name=old.png",
      fileUuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "old.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    const newFile = {
      kind: "media" as const,
      href: "urn:image:dddddddd-dddd-4ddd-8ddd-dddddddddddd?name=new.png",
      fileUuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "new.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    captured.loadWorkspaceFile.mockImplementation((options: { fileUuid: string }) =>
      options.fileUuid === oldFile.fileUuid ? oldImage.promise : newImage.promise,
    );

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(oldFile);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1));

    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(newFile);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(2));

    await act(async () => {
      oldImage.resolve({
        blob: new Blob(["old-image"], { type: "image/png" }),
        headers: new Headers(),
      });
      await oldImage.promise;
    });
    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();

    await act(async () => {
      newImage.resolve({
        blob: new Blob(["new-image"], { type: "image/png" }),
        headers: new Headers(),
      });
      await newImage.promise;
    });
    await waitFor(() => {
      expect(useMediaViewerStore.getState().isOpen).toBe(true);
      expect(useMediaViewerStore.getState().items[0]?.workspaceFile?.fileUuid).toBe(
        newFile.fileUuid,
      );
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-new");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("aborts an in-flight Workspace viewer fetch when the runtime context changes", async () => {
    let viewerSignal: AbortSignal | undefined;
    captured.loadWorkspaceFile.mockImplementation((requestOptions: { signal?: AbortSignal }) => {
      viewerSignal = requestOptions.signal;
      return new Promise((_, reject) => {
        requestOptions.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.({
        kind: "media",
        href: "urn:image:44444444-4444-4444-8444-444444444444?name=screen.png&content_type=image%2Fpng",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => {
      expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
      expect(viewerSignal).toBeInstanceOf(AbortSignal);
      expect(viewerSignal?.aborted).toBe(false);
    });

    act(() => {
      const nextSession = {
        ...createSession(),
        accessToken: "next-access-token",
        runtimeGeneration: 2,
      };
      useWorkspaceAuthStore.setState({
        sessions: [nextSession],
        currentAccountId: nextSession.accountId,
        runtimeGeneration: 2,
      });
    });

    await waitFor(() => {
      expect(viewerSignal?.aborted).toBe(true);
    });
    expect(useMediaViewerStore.getState().isOpen).toBe(false);
  });

  it("reports unsupported Workspace media preview through the explicit fallback callback", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenUnsupportedFilePreview).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenUnsupportedFilePreview?.({
        kind: "media",
        href: "urn:image:44444444-4444-4444-8444-444444444444?name=screen.png",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    expect(
      await screen.findByText(
        "Workspace media preview is not connected yet. Download the file instead.",
      ),
    ).toBeInTheDocument();
    expect(captured.downloadWorkspaceFile).not.toHaveBeenCalled();
  });

  it("maps Workspace direct private header view to the direct header props", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
    );

    expect(await screen.findByTestId("chat-header")).toBeInTheDocument();
    expect(captured.channelHeaderProps).toBeNull();
    expect(captured.directHeaderProps?.partner).toEqual({
      name: "Bob Reed",
      avatarUrl: null,
      presenceState: "idle",
    });
    expect(captured.directHeaderProps?.rightPanelLabel).toBe(t("info.partnerInfo"));
    expect(captured.directHeaderProps?.onOpenPartnerProfile).toEqual(expect.any(Function));
    expect(captured.directHeaderProps).not.toHaveProperty("participantsCount");
    expect(captured.directHeaderProps).not.toHaveProperty("onlineCount");
  });

  it("shows the direct header for a private two-member stream without a direct user", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const payload = createBootstrapPayload();
    const stream = payload.streams[0]!;
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      ...payload,
      streams: [{ ...stream, audience: "private", isPrivate: true, directUserUuid: null }],
    });

    renderWorkspaceChatPageWithShellContexts(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);

    expect(await screen.findByTestId("chat-header")).toBeInTheDocument();
    expect(captured.channelHeaderProps).toBeNull();
    expect(captured.directHeaderProps?.partner).toMatchObject({ name: "Bob Reed" });
  });

  it("opens the partner profile in the right panel from the direct header", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const openWorkspaceUserProfile = vi.fn();
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
      { openWorkspaceUserProfile },
    );

    expect(await screen.findByTestId("chat-header")).toBeInTheDocument();

    act(() => {
      captured.directHeaderProps?.onOpenPartnerProfile?.();
    });

    expect(openWorkspaceUserProfile).toHaveBeenCalledWith(USER_B_UUID);
  });

  it("keeps old chat routes in a controlled Workspace state", () => {
    renderWithProviders(<ChatPage />, {
      route: "/stream/general/topic/roadmap",
    });

    expect(screen.getByText("This chat link is invalid")).toBeInTheDocument();
    expect(captured.composerProps?.readOnlyReason).toBe(
      "Sending is not available from this chat link yet.",
    );
    expect(captured.messageListProps).toBeNull();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });
});
