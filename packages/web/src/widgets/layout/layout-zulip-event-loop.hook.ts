// Bootstrap + long-poll event loop orchestration for the active instance.
import { useEffect, useRef } from "react";
import { useActivityStore } from "~/entities/activity/activity.model";
import {
  summarizeRecentPrivateConversationsForTrace,
  traceDmPreviewHydrate,
} from "~/entities/chat-list/chat-list-dm-preview-hydrate-trace.lib";
import { hydrateDmSidebarPreviewsFromRecentConversations } from "~/entities/chat-list/chat-list-dm-preview-hydrate.lib";
import { clearStreamSidebarHydrateState } from "~/entities/chat-list/chat-list-hydrate-stream-sidebar.lib";
import { hydrateStreamSidebarPreviewsFromUnreadSnapshot } from "~/entities/chat-list/chat-list-unread-preview-hydrate.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { ChatListDmMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
  useInstancesStore,
} from "~/entities/instance/instance.model";
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
import { deleteQueue, DEFAULT_REGISTER_FETCH_EVENT_TYPES } from "~/shared/api/zulip-queue";
import { fetchSubscriptions } from "~/shared/api/zulip-streams";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { fetchUsers, getCurrentUser } from "~/shared/api/zulip-users";
import type {
  RegisterQueueResult,
  ZulipRawMessage,
  ZulipRecentPrivateConversation,
  ZulipUserMember,
} from "~/shared/api/zulip.types";
import { METADATA_DM_BACKFILL_ENABLED } from "~/shared/config/metadata-chat-bootstrap.constants";
import {
  cancelScheduledReconnect,
  registerManualReconnectListener,
  reportFailure,
  reportSuccess,
  scheduleReconnect,
  setConnectionPhase,
} from "~/shared/lib/connection-health";
import { upsertDmIndexEntries, type DmIndexEntry } from "~/shared/lib/dm-index";
import { startZulipEventLoop } from "~/shared/lib/event-loop";
import { createLogger } from "~/shared/lib/logger";
import { logChatListFlow, logMessageFlow } from "~/shared/lib/message-flow-debug.lib";
import { loadMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { loadUsersDirectoryRow } from "~/shared/lib/users-directory-snapshot-db";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";
import {
  applyChatListBootstrapResult,
  hydrateChatListDmIndexForInstance,
  type ApplyChatListBootstrapResultOptions,
} from "./layout-chat-list-bootstrap-apply.lib";
import { runMetadataDmBackfillLoop } from "./layout-metadata-dm-backfill.lib";
import { createMetadataStreamPreviewCoordinator } from "./layout-metadata-stream-preview-coordinator.lib";
import { resetReconnectStreamPreviewStaging } from "./layout-reconnect-stream-preview.lib";
import { reconcileSidebarUnreadAfterBootstrap } from "./layout-sidebar-unread-reconcile.lib";
import {
  createCurrentUserReconnectRunner,
  createDmPreviewHydrateRejectedHandler,
  createDmPreviewHydrateSettledHandler,
  createManualReconnectBootstrapHandler,
  createStreamPreviewBootstrapRejectedHandler,
  createStreamPreviewBootstrapSettledHandler,
  findZulipMemberByUserId,
} from "./layout-zulip-event-loop-bootstrap.lib";
import { applyLayoutRegisterMuteSnapshot } from "./layout-zulip-event-loop-mute-register.lib";
import { createLayoutZulipEventLoopOnEventHandler } from "./layout-zulip-event-loop-on-event.lib";
import {
  createLayoutBootstrapQueueRegisteredHandler,
  toDmMetadataRowsFromRecentConversations,
  toStreamMetadataRows,
} from "./layout-zulip-event-loop-register.lib";
import { runLayoutReconnectRefresh } from "./layout-zulip-refresh-stale.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";
import type { LayoutMuteBootstrapData, LayoutMuteSnapshot } from "./layout-instance-bootstrap.hook";
import type { StreamPreviewsBootstrapResult } from "./layout-metadata-stream-preview-coordinator.lib";
import type { LayoutUserConnectionStatus } from "./layout-user-connection-status.types";

// Increments on effect cleanup so superseded `runChatListBootstrap` runs skip hydrate/API (React Strict Mode).
let chatListBootstrapEffectEpoch = 0;

// DM backfill page size — caps background batch count to avoid network overload.
const METADATA_DM_BACKFILL_PAGE_SIZE = 5000;
const METADATA_DM_BACKFILL_MAX_BATCHES = 3;
// Stop backfill when consecutive batches add no new DMs.
const METADATA_DM_BACKFILL_STAGNATION_LIMIT = 2;
const LAYOUT_REGISTER_FETCH_EVENT_TYPES = [
  ...DEFAULT_REGISTER_FETCH_EVENT_TYPES,
  "starred_messages",
];
const log = createLogger("layout-zulip-event-loop");

interface LatestMessageIdRef {
  current: number | null;
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

// Persist merged DM index so the next cold start has a fuller sidebar snapshot.
function persistDmIndexFromStore(instanceId: string): void {
  const rows: DmIndexEntry[] = [];
  for (const [dmKey, entry] of useChatListStore.getState().dmsMap.entries()) {
    const userIds =
      entry.userIds?.filter((userId) => Number.isInteger(userId) && userId > 0) ??
      dmKey
        .split(",")
        .map((part) => Number(part))
        .filter((userId) => Number.isInteger(userId) && userId > 0);
    if (userIds.length === 0) continue;
    rows.push({
      dmKey,
      userIds,
      lastActivityTs: entry.ts ?? 0,
      lastMessageId: entry.lastMessageId ?? null,
      unreadCount: entry.unreadCount,
    });
  }
  if (rows.length > 0) {
    upsertDmIndexEntries(instanceId, rows);
  }
}

function startSidebarUnreadReconcile(options: {
  cancelled: () => boolean;
  instanceId: string | null;
  currentUserId: number | null;
  registerSnapshot?: ZulipUnreadMessagesSnapshot | null;
}): void {
  reconcileSidebarUnreadAfterBootstrap({
    ...options,
    logScope: "eventLoop: startSidebarUnreadReconcile",
  });
  void hydrateStreamSidebarPreviewsFromUnreadSnapshot(options.registerSnapshot, options.cancelled);
}

function reconcileSidebarUnreadFromRegister(
  instanceId: string | null,
  registration: RegisterQueueResult | undefined,
  currentUserId: number | null,
): void {
  reconcileSidebarUnreadAfterBootstrap({
    cancelled: () => false,
    instanceId,
    currentUserId,
    registerSnapshot: registration?.unread_snapshot,
    logScope: "eventLoop: reconcileSidebarUnreadFromRegister",
    syncSource: "event-loop-register",
  });
  void hydrateStreamSidebarPreviewsFromUnreadSnapshot(registration?.unread_snapshot, () => false);
}

// Normalize IDB row shape to the mute-store contract (storage vs application layer).
function toLayoutMuteSnapshotFromRow(row: {
  mutedStreamIds: number[];
  mutedTopics: { streamId: number; topic: string }[];
  unmutedTopics: { streamId: number; topic: string }[];
  followedTopics?: { streamId: number; topic: string }[];
  streamDesktopNotifyEnabledIds?: number[];
  streamDesktopNotifyDisabledIds?: number[];
  streamAudibleNotifyEnabledIds?: number[];
  streamAudibleNotifyDisabledIds?: number[];
}): {
  mutedStreamIds: number[];
  mutedTopics: { streamId: number; topic: string }[];
  unmutedTopics: { streamId: number; topic: string }[];
  followedTopics: { streamId: number; topic: string }[];
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
  members: readonly ZulipUserMember[],
  loginEmail: string | undefined,
): number | null {
  const normalized = loginEmail?.trim().toLowerCase();
  if (normalized == null || normalized.length === 0) {
    return null;
  }
  for (const member of members) {
    const memberEmail = member.email?.trim().toLowerCase();
    if (memberEmail === normalized && Number.isInteger(member.user_id) && member.user_id > 0) {
      return member.user_id;
    }
  }
  return null;
}

export function useLayoutZulipEventLoop(options: {
  currentInstanceId: string | null;
  /** Shared with reconnect refresh so sidebar delta anchor stays in sync. */
  latestMessageIdRef?: LatestMessageIdRef;
  focusedMessageId?: number | null;
  onRefreshStaleRef?: RefreshStaleCallbackRef;
  loadBootstrapMessages: (
    signal: AbortSignal,
    isStale: () => boolean,
  ) => Promise<ChatListBootstrapResult>;
  loadMuteSnapshot: (bootstrap?: LayoutMuteBootstrapData) => Promise<LayoutMuteSnapshot>;
  setFromMessages: (messages: ZulipRawMessage[], currentUserId: number | null) => void;
  setCurrentUserId: (id: number) => void;
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
  const instanceAtLoopStartRef = useRef<{ realm: string; email: string; apiKey: string } | null>(
    null,
  );
  const internalLatestMessageIdRef = useRef<number | null>(null);
  const registerUnreadSnapshotRef = useRef<ZulipUnreadMessagesSnapshot | null>(null);
  const recentPrivateConversationsRef = useRef<
    Record<string, ZulipRecentPrivateConversation> | undefined
  >(undefined);

  const clearMessengerShellState = (
    reason: "instance switched" | "active instance cleared",
  ): void => {
    registerUnreadSnapshotRef.current = null;
    recentPrivateConversationsRef.current = undefined;
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
    const registerApplyContext = captureActiveOrgRequestContext();
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

      const metadataDmBackfillEnabled = METADATA_DM_BACKFILL_ENABLED;
      const metadataDmPreviewHydrationEnabled = !METADATA_DM_BACKFILL_ENABLED;
      traceDmPreviewHydrate("bootstrap:dmFlags", {
        instanceId: currentInstanceId,
        METADATA_DM_BACKFILL_ENABLED: metadataDmBackfillEnabled,
        metadataDmPreviewHydrationEnabled,
      });
      let bootstrapUserId: number | null = null;

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
          latestRef.current =
            newest != null && (prev == null || newest > prev) ? newest : (prev ?? newest);
        }
        streamPreviewCoordinator.stageStreamPreviews(streamResult);
        tryFlushMetadataStreamPreviews();
      };

      const scheduleDmPreviewHydration = (
        conversations?: Record<string, ZulipRecentPrivateConversation>,
        currentUserIdOverride?: number | null,
        metadataRows?: ChatListDmMetadataRow[],
        source = "unknown",
      ): void => {
        traceDmPreviewHydrate("schedule:called", {
          source,
          cancelled,
          metadataDmBackfillEnabled,
          metadataDmPreviewHydrationEnabled,
          hasConversationsArg: conversations != null,
          conversations: summarizeRecentPrivateConversationsForTrace(conversations),
          currentUserIdOverride: currentUserIdOverride ?? null,
          storeCurrentUserId: useChatListStore.getState().currentUserId,
          bootstrapUserId,
          metadataRowsArgCount: metadataRows?.length ?? null,
        });

        if (!metadataDmPreviewHydrationEnabled) {
          logChatListFlow("eventLoop: skip DM preview hydrate (feature disabled)", {
            metadataDmBackfillEnabled,
          });
          traceDmPreviewHydrate("schedule:skip", { reason: "feature_disabled", source });
          return;
        }
        if (conversations != null) {
          recentPrivateConversationsRef.current = conversations;
        }
        const snapshot = conversations ?? recentPrivateConversationsRef.current;
        if (snapshot == null) {
          logChatListFlow("eventLoop: skip DM preview hydrate (no recent_private_conversations)");
          traceDmPreviewHydrate("schedule:skip", { reason: "no_conversations_snapshot", source });
          return;
        }
        const currentUserId =
          currentUserIdOverride ?? useChatListStore.getState().currentUserId ?? bootstrapUserId;
        const rows = metadataRows ?? toDmMetadataRowsFromRecentConversations(snapshot);

        traceDmPreviewHydrate("schedule:dispatchHydrate", {
          source,
          currentUserId,
          metadataRowCount: rows.length,
          conversations: summarizeRecentPrivateConversationsForTrace(snapshot),
        });

        const dmHydrateSettledHandler = createDmPreviewHydrateSettledHandler({
          getCancelled: () => cancelled,
          instanceId: currentInstanceId,
          source,
          persistDmIndexFromStore,
        });
        const dmHydrateRejectedHandler = createDmPreviewHydrateRejectedHandler({ source, log });
        void hydrateDmSidebarPreviewsFromRecentConversations({
          conversations: snapshot,
          metadataRows: rows,
          currentUserId,
          instanceId: currentInstanceId ?? undefined,
          cancelled: () => cancelled,
        })
          .then(dmHydrateSettledHandler)
          .catch(dmHydrateRejectedHandler);
      };
      const attemptResolveCurrentUser = async (): Promise<number | null> => {
        try {
          const user = await getCurrentUser();
          if (cancelled || isBootstrapStale()) return null;
          if (user?.user_id != null) {
            bootstrapUserId = user.user_id;
            useUsersStore.getState().mergeUser(user);
            if (currentInstanceId != null) {
              useInstancesStore.getState().setInstanceUserId(currentInstanceId, user.user_id);
            }
            setCurrentUserIdRef.current(user.user_id);
            scheduleDmPreviewHydration(undefined, user.user_id, undefined, "getCurrentUser");
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
        members: readonly ZulipUserMember[],
        fromGetCurrentUser: number | null,
      ): void => {
        if (cancelled || isBootstrapStale()) return;

        let uid = fromGetCurrentUser ?? useChatListStore.getState().currentUserId;
        if (uid == null) {
          const inst = useInstancesStore.getState().getCurrentInstance();
          uid = resolveSelfUserIdFromMembers(members, inst?.email);
          if (uid != null) {
            bootstrapUserId = uid;
            if (currentInstanceId != null) {
              useInstancesStore.getState().setInstanceUserId(currentInstanceId, uid);
            }
            setCurrentUserIdRef.current(uid);
            scheduleDmPreviewHydration(undefined, uid, undefined, "finalizeBootstrapAuth");
            const member = findZulipMemberByUserId(members, uid);
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
      const pSubscriptions = fetchSubscriptions();
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
          pSubscriptions,
          pCurrentUserId,
        ]);
        if (cancelled) return;
        const members = bootstrapCore[2];
        const subscriptions = bootstrapCore[3];
        const resolvedCurrentUserId = bootstrapCore[4];
        const apiMembers: ZulipUserMember[] = members ?? [];
        useUsersStore.getState().mergeUsers(apiMembers);

        if (resolvedCurrentUserId == null) {
          finalizeBootstrapAuth(apiMembers, null);
        }

        const streamRowsFromSubscriptions = toStreamMetadataRows(subscriptions ?? []);
        if (streamRowsFromSubscriptions.length > 0) {
          useChatListStore.getState().upsertStreamMetadataRows(streamRowsFromSubscriptions);
        }
        useChatListStore.getState().setStreamMetadataHydrated(true);

        const uid = resolvedCurrentUserId ?? useChatListStore.getState().currentUserId ?? null;
        if (uid != null) {
          bootstrapUserId = uid;
        }

        logChatListFlow("eventLoop: bootstrap core settled (progressive)", {
          instanceId: currentInstanceId,
          metadataDmBackfillEnabled,
          usersMerged: apiMembers.length,
          streamsMapSize: useChatListStore.getState().streamsMap.size,
          currentUserId: uid,
        });

        hydrateChatListDmIndexForInstance(currentInstanceId);

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
          startSidebarUnreadReconcile,
          currentUserId: uid,
          registerSnapshot: registerUnreadSnapshotRef.current,
          log,
        });
        const streamPreviewRejectedHandler = createStreamPreviewBootstrapRejectedHandler({
          getCancelled: () => cancelled,
          isBootstrapStale,
          instanceId: currentInstanceId,
          log,
        });
        void pStreamPreviews.then(streamPreviewSettledHandler).catch(streamPreviewRejectedHandler);

        if (metadataDmBackfillEnabled && currentInstanceId != null && uid != null) {
          logChatListFlow("eventLoop: starting metadata DM backfill loop", {
            maxBatches: METADATA_DM_BACKFILL_MAX_BATCHES,
            pageSize: METADATA_DM_BACKFILL_PAGE_SIZE,
          });
          void runMetadataDmBackfillLoop({
            instanceId: currentInstanceId,
            initialUserId: uid,
            maxBatches: METADATA_DM_BACKFILL_MAX_BATCHES,
            pageSize: METADATA_DM_BACKFILL_PAGE_SIZE,
            stagnationLimit: METADATA_DM_BACKFILL_STAGNATION_LIMIT,
            isCancelled: () => cancelled,
          }).catch((err) =>
            reportUnexpectedError("layout:metadataDmBackfill", err, {
              instanceId: currentInstanceId,
            }),
          );
        }

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
          ? { realm: inst.realm, email: inst.email, apiKey: inst.apiKey }
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

        const onEventHandler = createLayoutZulipEventLoopOnEventHandler({
          currentInstanceId,
          latestMessageIdRef: resolveLatestMessageIdRef(
            latestMessageIdRefProp,
            internalLatestMessageIdRef,
          ),
        });
        const onQueueRegisteredHandler = createLayoutBootstrapQueueRegisteredHandler({
          getRegisterApplyGuard: () => {
            if (cancelled) {
              return { ok: false, reason: "aborted" as const };
            }
            if (isBootstrapStale()) {
              return { ok: false, reason: "stale_callback" as const };
            }
            if (
              !isActiveOrgRequestContextCurrent(registerApplyContext) ||
              registerApplyContext.instanceId !== currentInstanceId
            ) {
              return { ok: false, reason: "stale_epoch" as const };
            }
            return { ok: true };
          },
          isCancelled: () => cancelled,
          currentInstanceId,
          bootstrapUserId,
          metadataDmPreviewHydrationEnabled,
          queueIdRef,
          registerUnreadSnapshotRef,
          persistDmIndexFromStore,
          reconcileSidebarUnreadFromRegister,
          streamPreviewCoordinator,
          tryFlushMetadataStreamPreviews,
          applyChatListBootstrapResult: applyBootstrapFromEventLoop,
          scheduleDmPreviewHydration,
          startSidebarUnreadReconcile,
          loadMuteSnapshot: loadMuteSnapshotRef.current,
          applyLayoutRegisterMuteSnapshot,
          registerMuteSnapshotAppliedRef,
        });

        startEventLoopFn = () => {
          if (eventLoopStartedRef.current) return;
          const loopAbort = eventLoopAbortRef.current;
          if (loopAbort == null) return;
          eventLoopStartedRef.current = true;

          startZulipEventLoop({
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
