// Bootstrap + long-poll event loop orchestration for the active instance.
import { useEffect, useRef } from "react";
import { useActivityStore } from "~/entities/activity/activity.model";
import { clearStreamSidebarHydrateState } from "~/entities/chat-list/chat-list-hydrate-stream-sidebar.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { persistUsersDirectoryToIndexedDb } from "~/entities/user/user-directory-snapshot-persist.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMessageReadersStore } from "~/features/message-readers/message-readers.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useUserProfileStore } from "~/features/user-profile/user-profile.model";
import { t } from "~/i18n/i18n";
import { deleteQueue, DEFAULT_REGISTER_FETCH_EVENT_TYPES } from "~/shared/api/messenger-queue";
import { fetchMyStreams, fetchStreamTopics } from "~/shared/api/messenger-streams";
import { fetchUsers, getCurrentUser } from "~/shared/api/messenger-users";
import type {
  RegisterQueueResult,
  WorkspaceRawMessage,
  MessengerUserMember,
} from "~/shared/api/messenger.types";
import {
  cancelScheduledReconnect,
  registerManualReconnectListener,
  reportFailure,
  reportSuccess,
  scheduleReconnect,
  setConnectionPhase,
} from "~/shared/lib/connection-health";
import { startMessengerEventLoop } from "~/shared/lib/event-loop";
import { createLogger } from "~/shared/lib/logger";
import { logChatListFlow, logMessageFlow } from "~/shared/lib/message-flow-debug.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { loadMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { loadUsersDirectoryRow } from "~/shared/lib/users-directory-snapshot-db";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";
import {
  applyChatListBootstrapResult,
  type ApplyChatListBootstrapResultOptions,
} from "./layout-chat-list-bootstrap-apply.lib";
import {
  createCurrentUserReconnectRunner,
  createManualReconnectBootstrapHandler,
  createStreamPreviewBootstrapRejectedHandler,
  createStreamPreviewBootstrapSettledHandler,
  findWorkspaceMemberByUserId,
} from "./layout-messenger-event-loop-bootstrap.lib";
import { applyLayoutRegisterMuteSnapshot } from "./layout-messenger-event-loop-mute-register.lib";
import { createLayoutMessengerEventLoopOnEventHandler } from "./layout-messenger-event-loop-on-event.lib";
import {
  createLayoutBootstrapQueueRegisteredHandler,
  toStreamMetadataRowsFromMeStreams,
  toStreamTopicMetadataRows,
} from "./layout-messenger-event-loop-register.lib";
import { runLayoutReconnectRefresh } from "./layout-messenger-refresh-stale.lib";
import { createMetadataStreamPreviewCoordinator } from "./layout-metadata-stream-preview-coordinator.lib";
import { resetReconnectStreamPreviewStaging } from "./layout-reconnect-stream-preview.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";
import type { LayoutMuteBootstrapData, LayoutMuteSnapshot } from "./layout-instance-bootstrap.hook";
import type { StreamPreviewsBootstrapResult } from "./layout-metadata-stream-preview-coordinator.lib";
import type { LayoutUserConnectionStatus } from "./layout-user-connection-status.types";

// Increments on effect cleanup so superseded `runChatListBootstrap` runs skip hydrate/API (React Strict Mode).
let chatListBootstrapEffectEpoch = 0;

const LAYOUT_REGISTER_FETCH_EVENT_TYPES = [
  ...DEFAULT_REGISTER_FETCH_EVENT_TYPES,
  "starred_messages",
];
const log = createLogger("layout-messenger-event-loop");

interface LatestMessageIdRef {
  current: MessageId | null;
}

interface RefreshStaleCallbackRef {
  current: (() => void) | null;
}

function resolveLatestMessageIdRef(
  external: LatestMessageIdRef | undefined,
  internal: LatestMessageIdRef,
): LatestMessageIdRef {
  return external ?? internal;
}

function resetLatestMessageIdRef(ref: LatestMessageIdRef): void {
  ref.current = null;
}

function assignRefreshStaleCallback(
  ref: RefreshStaleCallbackRef | undefined,
  callback: () => void,
): void {
  if (ref) {
    ref.current = callback;
  }
}

function clearRefreshStaleCallback(ref: RefreshStaleCallbackRef | undefined): void {
  if (ref) {
    ref.current = null;
  }
}

// Normalize IDB row shape to the mute-store contract (storage vs application layer).
function toLayoutMuteSnapshotFromRow(row: {
  mutedStreamIds: number[];
  mutedTopics: { streamId: string; topic: string }[];
  unmutedTopics: { streamId: string; topic: string }[];
  followedTopics?: { streamId: string; topic: string }[];
  streamDesktopNotifyEnabledIds?: number[];
  streamDesktopNotifyDisabledIds?: number[];
  streamAudibleNotifyEnabledIds?: number[];
  streamAudibleNotifyDisabledIds?: number[];
}): {
  mutedStreamIds: number[];
  mutedTopics: { streamId: string; topic: string }[];
  unmutedTopics: { streamId: string; topic: string }[];
  followedTopics: { streamId: string; topic: string }[];
  streamDesktopNotifyEnabledIds: number[];
  streamDesktopNotifyDisabledIds: number[];
  streamAudibleNotifyEnabledIds: number[];
  streamAudibleNotifyDisabledIds: number[];
} {
  return {
    mutedStreamIds: row.mutedStreamIds,
    mutedTopics: row.mutedTopics,
    unmutedTopics: row.unmutedTopics,
    followedTopics: row.followedTopics ?? [],
    streamDesktopNotifyEnabledIds: row.streamDesktopNotifyEnabledIds ?? [],
    streamDesktopNotifyDisabledIds: row.streamDesktopNotifyDisabledIds ?? [],
    streamAudibleNotifyEnabledIds: row.streamAudibleNotifyEnabledIds ?? [],
    streamAudibleNotifyDisabledIds: row.streamAudibleNotifyDisabledIds ?? [],
  };
}

function chatListHasCachedRowsInStore(): boolean {
  const state = useChatListStore.getState();
  return state.streamsMap.size > 0 || state.dmsMap.size > 0;
}

function resolveSelfUserIdFromMembers(
  members: readonly MessengerUserMember[],
  loginEmail: string | undefined,
): UserId | null {
  const normalized = loginEmail?.trim().toLowerCase();
  if (normalized == null || normalized.length === 0) {
    return null;
  }
  for (const member of members) {
    const memberEmail = member.email?.trim().toLowerCase();
    if (memberEmail !== normalized || member.user_id == null) {
      continue;
    }
    if (typeof member.user_id === "string") {
      return member.user_id;
    }
    if (Number.isInteger(member.user_id) && member.user_id > 0) {
      return member.user_id;
    }
  }
  return null;
}

export function useLayoutMessengerEventLoop(options: {
  currentInstanceId: string | null;
  /** Shared with reconnect refresh so sidebar delta anchor stays in sync. */
  latestMessageIdRef?: LatestMessageIdRef;
  focusedMessageId?: MessageId | null;
  onRefreshStaleRef?: RefreshStaleCallbackRef;
  loadBootstrapMessages: (
    signal: AbortSignal,
    isStale: () => boolean,
  ) => Promise<ChatListBootstrapResult>;
  loadMuteSnapshot: (bootstrap?: LayoutMuteBootstrapData) => Promise<LayoutMuteSnapshot>;
  setFromMessages: (messages: WorkspaceRawMessage[], currentUserId: UserId | null) => void;
  setCurrentUserId: (id: UserId | null) => void;
  setCurrentUserStatus: (status: LayoutUserConnectionStatus) => void;
}): void {
  const {
    currentInstanceId,
    latestMessageIdRef: latestMessageIdRefProp,
    focusedMessageId,
    onRefreshStaleRef,
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  } = options;

  const loadBootstrapMessagesRef = useRef(loadBootstrapMessages);
  const loadMuteSnapshotRef = useRef(loadMuteSnapshot);
  const setFromMessagesRef = useRef(setFromMessages);
  const setCurrentUserIdRef = useRef(setCurrentUserId);
  const setCurrentUserStatusRef = useRef(setCurrentUserStatus);

  useEffect(() => {
    loadBootstrapMessagesRef.current = loadBootstrapMessages;
    loadMuteSnapshotRef.current = loadMuteSnapshot;
    setFromMessagesRef.current = setFromMessages;
    setCurrentUserIdRef.current = setCurrentUserId;
    setCurrentUserStatusRef.current = setCurrentUserStatus;
  }, [
    loadBootstrapMessages,
    loadMuteSnapshot,
    setFromMessages,
    setCurrentUserId,
    setCurrentUserStatus,
  ]);

  /** Only reset stores when switching org — not when this effect re-runs (callback deps / Strict Mode remount). */
  const prevInstanceForBootstrapRef = useRef<string | null>(null);

  const eventLoopAbortRef = useRef<AbortController | null>(null);
  const queueIdRef = useRef<string | null>(null);
  const instanceAtLoopStartRef = useRef<{ realm: string; login: string; apiKey: string } | null>(
    null,
  );
  const internalLatestMessageIdRef = useRef<MessageId | null>(null);
  const clearMessengerShellState = (
    reason: "instance switched" | "active instance cleared",
  ): void => {
    logMessageFlow(`eventLoop:clear stores (${reason})`, {
      instanceId: currentInstanceId,
    });
    useUsersStore.getState().clear();
    useUserGroupsStore.getState().clear();
    useActivityStore.getState().clear();
    useInboxStore.getState().clear();
    useChatListStore.getState().clear();
    clearStreamSidebarHydrateState();
    resetReconnectStreamPreviewStaging();
    useCurrentChatMessagesStore.getState().setContext(null);
    useCurrentChatMessagesStore.getState().setMessages([]);
    useJitsiCallStore.getState().clear();
    useMessageReadersStore.getState().clear();
    useMuteStore.getState().clear();
    useNotificationSettingsStore.getState().clear();
    useUserProfileStore.getState().clear();
    resetLatestMessageIdRef(
      resolveLatestMessageIdRef(latestMessageIdRefProp, internalLatestMessageIdRef),
    );
  };

  useEffect(() => {
    if (!currentInstanceId) {
      prevInstanceForBootstrapRef.current = null;
      clearMessengerShellState("active instance cleared");
      cancelScheduledReconnect();
      return;
    }
    useUsersStore.getState().setCurrentUserChannelCapabilities({});
    useUsersStore.getState().setCurrentUserMessageEditPolicy({});
    setConnectionPhase("connecting");
    let cancelled = false;
    let unsubManualReconnect: (() => void) | null = null;
    const eventLoopStartedRef = { current: false };
    let startEventLoopFn: (() => void) | null = null;
    const bootstrapAbort = new AbortController();
    const bootstrapEpoch = ++chatListBootstrapEffectEpoch;
    const isBootstrapStale = () => bootstrapEpoch !== chatListBootstrapEffectEpoch;
    const setBootstrapStatus = (status: LayoutUserConnectionStatus): void => {
      if (cancelled || isBootstrapStale()) {
        return;
      }
      setCurrentUserStatusRef.current(status);
    };

    const prevInstanceId = prevInstanceForBootstrapRef.current;
    const instanceSwitched = prevInstanceId != null && prevInstanceId !== currentInstanceId;
    prevInstanceForBootstrapRef.current = currentInstanceId;
    // Register response is authoritative; cache must not overwrite state after it applies.
    const registerMuteSnapshotAppliedRef = { registerMuteSnapshotApplied: false };
    // Hydrate mute cache on cold start / instance switch so unread titles respect mutes immediately.
    const shouldHydrateMuteFromCache = prevInstanceId == null || instanceSwitched;
    const cachedMuteSnapshotPromise = shouldHydrateMuteFromCache
      ? loadMuteSnapshotRow(currentInstanceId)
          .then((row) => (row ? toLayoutMuteSnapshotFromRow(row) : null))
          .catch(() => null)
      : null;
    const streamPreviewCoordinator = createMetadataStreamPreviewCoordinator();

    if (instanceSwitched) {
      clearMessengerShellState("instance switched");
    }

    void (async () => {
      if (cancelled) return;

      void Promise.resolve().then(() => {
        setBootstrapStatus("loading");
      });

      // Cache-first mute + users directory run in parallel with chat-list IDB bootstrap and API,
      // so hydrateFromIndexedDbSnapshot is not blocked by unrelated IDB reads.
      const pMuteHydrate =
        cachedMuteSnapshotPromise != null
          ? cachedMuteSnapshotPromise.then((cachedMuteSnapshot) => {
              if (cancelled) return;
              if (
                cachedMuteSnapshot &&
                !registerMuteSnapshotAppliedRef.registerMuteSnapshotApplied
              ) {
                useMuteStore.getState().setFromServer(cachedMuteSnapshot);
              }
            })
          : Promise.resolve();

      const pUsersDir = shouldHydrateMuteFromCache
        ? loadUsersDirectoryRow(currentInstanceId)
            .then((row) => {
              if (cancelled) return;
              if (row?.members?.length) {
                useUsersStore.getState().mergeUsers(row.members);
              }
            })
            .catch(() => {
              // best-effort cache; fetchUsers still hydrates the directory.
            })
        : Promise.resolve();

      const bootstrapApplyOptions = {
        currentInstanceId,
        setFromMessages: setFromMessagesRef.current,
        latestMessageIdRef: resolveLatestMessageIdRef(
          latestMessageIdRefProp,
          internalLatestMessageIdRef,
        ),
      };

      const applyStreamPreviewsBootstrap = (streamResult: StreamPreviewsBootstrapResult): void => {
        applyChatListBootstrapResult(streamResult, bootstrapApplyOptions);
      };

      const tryFlushMetadataStreamPreviews = (): void => {
        streamPreviewCoordinator.flushStreamPreviews(applyStreamPreviewsBootstrap);
      };

      const stageMetadataStreamPreviewsBootstrap = (
        streamResult: StreamPreviewsBootstrapResult,
      ): void => {
        for (const message of streamResult.messages) {
          useUsersStore.getState().mergeFromMessage(message);
        }
        const newest = getNewestMessageId(streamResult.messages);
        const prev = streamResult.latestMessageIdHint;
        const latestRef = bootstrapApplyOptions.latestMessageIdRef;
        if (latestRef != null) {
          latestRef.current = newest ?? prev ?? latestRef.current;
        }
        streamPreviewCoordinator.stageStreamPreviews(streamResult);
        tryFlushMetadataStreamPreviews();
      };

      const attemptResolveCurrentUser = async (): Promise<UserId | null> => {
        try {
          const user = await getCurrentUser();
          if (cancelled || isBootstrapStale()) return null;
          if (user?.user_id != null) {
            useUsersStore.getState().mergeUser(user);
            setCurrentUserIdRef.current(user.user_id);
            setBootstrapStatus("ready");
            reportSuccess();
            return user.user_id;
          }
          return null;
        } catch {
          if (cancelled || isBootstrapStale()) return null;
          return null;
        }
      };

      const finalizeBootstrapAuth = (
        members: readonly MessengerUserMember[],
        fromGetCurrentUser: UserId | null,
      ): void => {
        if (cancelled || isBootstrapStale()) return;

        let uid = fromGetCurrentUser ?? useChatListStore.getState().currentUserId;
        if (uid == null) {
          const inst = useInstancesStore.getState().getCurrentInstance();
          uid = resolveSelfUserIdFromMembers(members, inst?.login);
          if (uid != null) {
            setCurrentUserIdRef.current(uid);
            const member = findWorkspaceMemberByUserId(members, uid);
            if (member != null) {
              useUsersStore.getState().mergeUser(member);
            }
          }
        }

        if (uid != null) {
          useChatListStore.getState().clearBootstrapError();
          setBootstrapStatus("ready");
          reportSuccess();
          startEventLoopFn?.();
          return;
        }

        const hasCache = chatListHasCachedRowsInStore();
        useChatListStore.getState().setBootstrapError(t("app.networkError"));
        setBootstrapStatus(hasCache ? "degraded" : "blocked");
        reportFailure({ reason: "server", phase: hasCache ? "degraded" : "blocked" });
        scheduleCurrentUserRetry();
        if (hasCache) {
          startEventLoopFn?.();
        }
      };

      const scheduleCurrentUserRetry = (): void => {
        scheduleReconnect(createCurrentUserReconnectRunner(attemptResolveCurrentUser), {
          signal: bootstrapAbort.signal,
        });
      };

      unsubManualReconnect = registerManualReconnectListener(
        createManualReconnectBootstrapHandler({
          getCancelled: () => cancelled,
          attemptResolveCurrentUser,
        }),
      );

      const pUsers = fetchUsers();
      const pMyStreams = fetchMyStreams();
      const pStreamTopics = fetchStreamTopics();
      const pStreamPreviews = loadBootstrapMessagesRef.current(
        bootstrapAbort.signal,
        isBootstrapStale,
      );
      const pCurrentUserId = attemptResolveCurrentUser();

      try {
        const bootstrapCore = await Promise.all([
          pMuteHydrate,
          pUsersDir,
          pUsers,
          pMyStreams,
          pStreamTopics,
          pCurrentUserId,
        ]);
        if (cancelled) return;
        const members = bootstrapCore[2];
        const myStreams = bootstrapCore[3];
        const streamTopics = bootstrapCore[4];
        const resolvedCurrentUserId = bootstrapCore[5];
        const apiMembers: MessengerUserMember[] = members ?? [];
        useUsersStore.getState().mergeUsers(apiMembers);

        if (resolvedCurrentUserId == null) {
          finalizeBootstrapAuth(apiMembers, null);
        }

        const streamRowsFromGateway = toStreamMetadataRowsFromMeStreams(myStreams ?? []);
        if (streamRowsFromGateway.length > 0) {
          useChatListStore.getState().upsertStreamMetadataRows(streamRowsFromGateway);
        }
        const topicRowsByStream = new Map<string, ReturnType<typeof toStreamTopicMetadataRows>>();
        for (const topicRow of toStreamTopicMetadataRows(streamTopics ?? [])) {
          const rows = topicRowsByStream.get(topicRow.streamUuid) ?? [];
          rows.push(topicRow);
          topicRowsByStream.set(topicRow.streamUuid, rows);
        }
        for (const [streamUuid, topicRows] of topicRowsByStream) {
          useChatListStore.getState().upsertStreamTopicShells(streamUuid, topicRows);
        }
        useChatListStore.getState().setStreamMetadataHydrated(true);

        const uid = resolvedCurrentUserId ?? useChatListStore.getState().currentUserId ?? null;

        logChatListFlow("eventLoop: bootstrap core settled (progressive)", {
          instanceId: currentInstanceId,
          usersMerged: apiMembers.length,
          streamsMapSize: useChatListStore.getState().streamsMap.size,
          currentUserId: uid,
        });

        const applyBootstrapFromEventLoop = (
          result: ChatListBootstrapResult,
          applyOptions: unknown,
        ): void => {
          applyChatListBootstrapResult(result, applyOptions as ApplyChatListBootstrapResultOptions);
        };

        const streamPreviewSettledHandler = createStreamPreviewBootstrapSettledHandler({
          getCancelled: () => cancelled,
          isBootstrapStale,
          instanceId: currentInstanceId,
          stageMetadataStreamPreviewsBootstrap: (result) => {
            if (result.mode === "streamPreviews") {
              stageMetadataStreamPreviewsBootstrap(result);
            }
          },
          applyChatListBootstrapResult: applyBootstrapFromEventLoop,
          bootstrapApplyOptions: {
            ...bootstrapApplyOptions,
            skipDmIndexHydrate: true,
          },
          log,
        });
        const streamPreviewRejectedHandler = createStreamPreviewBootstrapRejectedHandler({
          getCancelled: () => cancelled,
          isBootstrapStale,
          instanceId: currentInstanceId,
          log,
        });
        void pStreamPreviews.then(streamPreviewSettledHandler).catch(streamPreviewRejectedHandler);

        const instanceIdPersist = useInstancesStore.getState().currentInstanceId;
        if (instanceIdPersist != null) {
          void persistUsersDirectoryToIndexedDb(instanceIdPersist, apiMembers);
        }

        if (cancelled || isBootstrapStale()) return;

        eventLoopAbortRef.current?.abort();
        eventLoopAbortRef.current = new AbortController();
        queueIdRef.current = null;
        const inst = useInstancesStore.getState().getCurrentInstance();
        instanceAtLoopStartRef.current = inst
          ? { realm: inst.realm, login: inst.login, apiKey: inst.apiKey }
          : null;

        const refreshStaleData = () => {
          runLayoutReconnectRefresh({
            cancelled,
            instanceId: currentInstanceId,
            latestMessageIdRef: resolveLatestMessageIdRef(
              latestMessageIdRefProp,
              internalLatestMessageIdRef,
            ),
            focusedMessageId: focusedMessageId ?? null,
          });
        };

        assignRefreshStaleCallback(onRefreshStaleRef, refreshStaleData);

        const onEventHandler = createLayoutMessengerEventLoopOnEventHandler({
          currentInstanceId,
          latestMessageIdRef: resolveLatestMessageIdRef(
            latestMessageIdRefProp,
            internalLatestMessageIdRef,
          ),
        });
        const onQueueRegisteredHandler = createLayoutBootstrapQueueRegisteredHandler({
          isCancelled: () => cancelled,
          currentInstanceId,
          queueIdRef,
          streamPreviewCoordinator,
          tryFlushMetadataStreamPreviews,
          applyChatListBootstrapResult: applyBootstrapFromEventLoop,
          loadMuteSnapshot: loadMuteSnapshotRef.current,
          applyLayoutRegisterMuteSnapshot,
          registerMuteSnapshotAppliedRef,
        });

        startEventLoopFn = () => {
          if (eventLoopStartedRef.current) return;
          const loopAbort = eventLoopAbortRef.current;
          if (loopAbort == null) return;
          eventLoopStartedRef.current = true;

          startMessengerEventLoop({
            signal: loopAbort.signal,
            instanceId: currentInstanceId ?? undefined,
            onTabStaleResume: refreshStaleData,
            onBadQueue: refreshStaleData,
            fetchEventTypes: [...LAYOUT_REGISTER_FETCH_EVENT_TYPES],
            onQueueRegistered: onQueueRegisteredHandler,
            onEvent: onEventHandler,
          });
        };

        if (cancelled || isBootstrapStale()) return;
        startEventLoopFn();
      } catch (error) {
        log.error("Bootstrap/users initialization failed before starting event loop", {
          instanceId: currentInstanceId,
          error: error instanceof Error ? error.message : String(error),
        });
        logChatListFlow("eventLoop: bootstrap/users initialization failed", {
          instanceId: currentInstanceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })().catch((error) => {
      if (cancelled || isBootstrapStale()) return;
      const hasCache = chatListHasCachedRowsInStore();
      useChatListStore
        .getState()
        .setBootstrapError(error instanceof Error ? error.message : String(error));
      setBootstrapStatus(hasCache ? "degraded" : "blocked");
      reportFailure({ reason: "unknown", phase: hasCache ? "degraded" : "blocked" });
      log.error("Unhandled bootstrap orchestration failure", {
        instanceId: currentInstanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return () => {
      cancelled = true;
      streamPreviewCoordinator.reset();
      clearRefreshStaleCallback(onRefreshStaleRef);
      unsubManualReconnect?.();
      unsubManualReconnect = null;
      cancelScheduledReconnect();
      chatListBootstrapEffectEpoch += 1;
      bootstrapAbort.abort();
      const qid = queueIdRef.current;
      const creds = instanceAtLoopStartRef.current;
      if (qid && creds) {
        deleteQueue(qid, creds).catch((err) =>
          reportUnexpectedError("layout:eventLoop", err, {
            phase: "deleteQueueOnCleanup",
            queueId: qid,
          }),
        );
      }
      eventLoopAbortRef.current?.abort();
      eventLoopAbortRef.current = null;
      queueIdRef.current = null;
      instanceAtLoopStartRef.current = null;
      resetLatestMessageIdRef(
        resolveLatestMessageIdRef(latestMessageIdRefProp, internalLatestMessageIdRef),
      );
    };
  }, [currentInstanceId, latestMessageIdRefProp, onRefreshStaleRef]);
}
