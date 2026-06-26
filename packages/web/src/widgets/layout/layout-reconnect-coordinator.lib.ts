/**
 * Coalesces reconnect refreshes (debounce + single in-flight) and splits full vs light paths.
 */
import { ensureMentionsUnreadSynced } from "~/entities/chat-list/chat-list-mentions-sync.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  isActiveOrgRequestInvalidated,
  useInstancesStore,
  type ActiveOrgRequestContext,
} from "~/entities/instance/instance.model";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { createLogger } from "~/shared/lib/logger";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import { refreshActiveChatMessagesFromApi } from "./layout-active-chat-refresh.lib";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";
import { getCachedRegisterUnreadSnapshot } from "./layout-instance-register-unread.lib";
import { refreshRealmPresenceFromApi } from "./layout-realm-presence-refresh.lib";
import { refreshLayoutReconnectLight } from "./layout-reconnect-light.lib";
import { stageReconnectStreamPreviews } from "./layout-reconnect-stream-preview.lib";
import { reconcileSidebarUnreadAfterBootstrap } from "./layout-sidebar-unread-reconcile.lib";

const log = createLogger("layout-reconnect");

const DEBOUNCE_MS = 400;

export type LayoutReconnectRefreshMode = "full" | "light";

export interface LayoutReconnectRefreshParams {
  instanceId: string | null;
  latestMessageIdRef?: { current: number | null };
  focusedMessageId?: number | null;
  isCancelled?: () => boolean;
  orgContext?: ActiveOrgRequestContext;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMode: LayoutReconnectRefreshMode = "light";
let pendingParams: LayoutReconnectRefreshParams | null = null;
let inFlight = false;
let activeFlightId = 0;
let rerunAfterFlight: LayoutReconnectRefreshParams | null = null;
let rerunMode: LayoutReconnectRefreshMode = "light";

export function scheduleLayoutReconnectRefresh(
  params: LayoutReconnectRefreshParams,
  mode: LayoutReconnectRefreshMode,
): void {
  if (params.isCancelled?.()) return;

  pendingParams = mergePendingParams(pendingParams, params);
  if (mode === "full") {
    pendingMode = "full";
  }

  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const runParams = pendingParams;
    const runMode = pendingMode;
    pendingParams = null;
    pendingMode = "light";
    if (runParams == null) return;
    void executeLayoutReconnectRefresh(runParams, runMode);
  }, DEBOUNCE_MS);
}

/** Test helper: resets module scheduling state. */
export function resetLayoutReconnectCoordinatorForTests(): void {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingParams = null;
  pendingMode = "light";
  inFlight = false;
  rerunAfterFlight = null;
  rerunMode = "light";
}

function mergePendingParams(
  prev: LayoutReconnectRefreshParams | null,
  next: LayoutReconnectRefreshParams,
): LayoutReconnectRefreshParams {
  if (prev == null) return next;
  return {
    instanceId: next.instanceId ?? prev.instanceId,
    latestMessageIdRef: next.latestMessageIdRef ?? prev.latestMessageIdRef,
    focusedMessageId: next.focusedMessageId ?? prev.focusedMessageId,
    isCancelled: next.isCancelled ?? prev.isCancelled,
    orgContext: next.orgContext ?? prev.orgContext,
  };
}

async function executeLayoutReconnectRefresh(
  params: LayoutReconnectRefreshParams,
  mode: LayoutReconnectRefreshMode,
): Promise<void> {
  if (
    params.isCancelled?.() ||
    (params.orgContext != null && isActiveOrgRequestInvalidated(params.orgContext))
  ) {
    return;
  }

  const currentInstanceId = useInstancesStore.getState().currentInstanceId;
  if (params.instanceId !== currentInstanceId) {
    return;
  }

  if (inFlight) {
    rerunAfterFlight = mergePendingParams(rerunAfterFlight, params);
    if (mode === "full") {
      rerunMode = "full";
    }
    return;
  }

  const flightId = ++activeFlightId;
  inFlight = true;
  try {
    if (mode === "full") {
      await refreshLayoutReconnectFull(params);
    } else {
      refreshLayoutReconnectLightPass(params);
    }
  } finally {
    if (flightId === activeFlightId) {
      inFlight = false;
    }
    const rerunParams = rerunAfterFlight;
    const rerun = rerunMode;
    rerunAfterFlight = null;
    rerunMode = "light";
    if (rerunParams != null) {
      void executeLayoutReconnectRefresh(rerunParams, rerun);
    }
  }
}

function refreshLayoutReconnectLightPass(params: LayoutReconnectRefreshParams): void {
  refreshSharedLayers(params, "light");
  void refreshLayoutReconnectLight({
    instanceId: params.instanceId,
    latestMessageIdRef: params.latestMessageIdRef,
    isCancelled: params.isCancelled,
    orgContext: params.orgContext,
  });
}

async function refreshLayoutReconnectFull(params: LayoutReconnectRefreshParams): Promise<void> {
  refreshSharedLayers(params, "full");
  refreshFolderSyncOnReconnect(params);
  await refreshChatListReconnectBootstrap(params);
}

/** Full reconnect: refresh Workspace folder rail + all folder items (multi-device drift). */
function refreshFolderSyncOnReconnect(params: LayoutReconnectRefreshParams): void {
  const { instanceId, isCancelled } = params;
  if (
    instanceId == null ||
    isCancelled?.() ||
    (params.orgContext != null && isActiveOrgRequestInvalidated(params.orgContext))
  ) {
    return;
  }
  const folderSync = useFolderSyncStore.getState();
  if (folderSync.instanceId !== instanceId) {
    return;
  }
  void folderSync.refresh("reconnect");
}

function refreshSharedLayers(
  params: LayoutReconnectRefreshParams,
  mode: LayoutReconnectRefreshMode,
): void {
  if (
    params.isCancelled?.() ||
    (params.orgContext != null && isActiveOrgRequestInvalidated(params.orgContext))
  ) {
    return;
  }

  refreshRealmPresenceFromApi({ isCancelled: params.isCancelled });
  refreshActiveChatMessagesFromApi({
    focusedMessageId: params.focusedMessageId ?? null,
    isCancelled: params.isCancelled,
    orgContext: params.orgContext,
  });

  // Full reconnect re-registers the queue — unread comes from fresh onQueueRegistered, not stale cache.
  if (mode === "full") {
    return;
  }

  const uid = useChatListStore.getState().currentUserId ?? null;
  const registerSnapshot =
    params.instanceId != null ? getCachedRegisterUnreadSnapshot(params.instanceId) : undefined;
  reconcileSidebarUnreadAfterBootstrap({
    cancelled: () => params.isCancelled?.() ?? false,
    instanceId: params.instanceId ?? null,
    currentUserId: uid,
    registerSnapshot,
    logScope: "reconnect: refreshSharedLayers",
    snapshotSource: "cached-register",
    syncSource: "reconnect",
  });
  syncMentionsUnreadAfterReconnect(params.instanceId, params.isCancelled);
}

function syncMentionsUnreadAfterReconnect(
  instanceId: string | null | undefined,
  isCancelled?: () => boolean,
): void {
  if (instanceId == null || isCancelled?.()) return;
  const currentUserId = useChatListStore.getState().currentUserId ?? null;
  void ensureMentionsUnreadSynced({
    currentInstanceId: instanceId,
    currentUserId,
    forceRefresh: true,
  });
}

async function refreshChatListReconnectBootstrap(
  params: LayoutReconnectRefreshParams,
): Promise<void> {
  const { instanceId, latestMessageIdRef, isCancelled } = params;
  if (
    instanceId == null ||
    (params.orgContext != null && isActiveOrgRequestInvalidated(params.orgContext))
  ) {
    logChatListFlow("reconnectBootstrap: skip (no instanceId)", {});
    return;
  }

  logChatListFlow("reconnectBootstrap: runChatListBootstrap (reconnect kind)", { instanceId });

  try {
    const result = await runChatListBootstrap(instanceId, {
      isStale: () =>
        isCancelled?.() === true ||
        (params.orgContext != null && isActiveOrgRequestInvalidated(params.orgContext)),
      kind: "reconnect",
    });
    if (
      isCancelled?.() ||
      (params.orgContext != null && isActiveOrgRequestInvalidated(params.orgContext))
    ) {
      logChatListFlow("reconnectBootstrap: superseded after bootstrap", { instanceId });
      return;
    }

    if (result.mode === "streamPreviews") {
      stageReconnectStreamPreviews(result, {
        currentInstanceId: instanceId,
        setFromMessages: useChatListStore.getState().setFromMessages,
        latestMessageIdRef,
        skipDmIndexHydrate: true,
        orgContext: params.orgContext,
      });
    }
    syncMentionsUnreadAfterReconnect(instanceId, isCancelled);
  } catch (error: unknown) {
    if (isCancelled?.()) return;
    log.warn("reconnectBootstrap: chat list bootstrap failed", {
      instanceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function refreshLayoutReconnectDataForCurrentInstance(
  params: Omit<LayoutReconnectRefreshParams, "instanceId"> & {
    instanceId?: string | null;
    mode: LayoutReconnectRefreshMode;
  },
): void {
  const instanceId = params.instanceId ?? useInstancesStore.getState().currentInstanceId ?? null;
  scheduleLayoutReconnectRefresh(
    {
      instanceId,
      latestMessageIdRef: params.latestMessageIdRef,
      focusedMessageId: params.focusedMessageId,
      isCancelled: params.isCancelled,
    },
    params.mode,
  );
}
