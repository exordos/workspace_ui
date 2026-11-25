import { MessengerApiError } from "~/shared/api/messenger-client";
import {
  buildMessengerWebSocketProtocols,
  buildMessengerWebSocketUrl,
  normalizeWorkspaceWebSocketFrame,
  parseWorkspaceWebSocketFrame,
} from "~/shared/api/messenger-realtime.api";
import type {
  WorkspaceEventsCursorExpiredErrorDto,
  WorkspaceMessengerEpochVersion,
  WorkspaceMessengerWebSocketFrameDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import { isWorkspaceEventsCursorExpiredErrorDto } from "~/shared/api/messenger.types";
import {
  getEpoch as defaultGetEpoch,
  getEventsPage as defaultGetEventsPage,
} from "~/shared/api/workspace-client";
import type { WorkspaceClientOptions } from "~/shared/api/workspace-client";
import { WorkspaceRealtimeParticipantNotReadyError } from "./workspace-realtime-applier.lib";
import { catchUpWorkspaceRealtime } from "./workspace-realtime-catch-up.lib";
import type {
  WorkspaceRealtimeCatchUpApplier,
  WorkspaceRealtimeCatchUpOptions,
} from "./workspace-realtime-catch-up.lib";
import type {
  WorkspaceRealtimeCursorOwner,
  WorkspaceRealtimeCursor,
  WorkspaceRealtimeDurableCursorStorage,
} from "./workspace-realtime-cursor.lib";

export type WorkspaceRealtimeSurface = "active" | "background";

const MAX_PENDING_WEBSOCKET_FRAMES = 256;
const MAX_PENDING_WEBSOCKET_BYTES = 4 * 1024 * 1024;
const WEBSOCKET_FRAMES_PER_TASK = 32;

// Runtime mode is diagnostic state; UI can use it later to see where realtime is stuck.
export type WorkspaceRealtimeRuntimeMode =
  | "idle"
  | "starting"
  | "catching_up"
  | "connecting"
  | "connected"
  | "auth_refreshing"
  | "reconnecting"
  | "disconnecting"
  | "stopped"
  | "failed";

export type WorkspaceRealtimeEventSource = "catch_up" | "websocket";

// Skip reasons are shared by catch-up and WebSocket so both paths report the same diagnostics.
export type WorkspaceRealtimeSkipReason =
  | "duplicate_epoch"
  | "unsupported_event"
  | "stale_owner"
  | "invalid_frame"
  | "background_apply_deferred"
  | "transport_stopped";

export interface WorkspaceRealtimeRuntimeOwner extends WorkspaceRealtimeCursorOwner {
  // runtimeGeneration separates an old socket from a new one after refresh or re-login.
  runtimeGeneration: number;
}

export interface WorkspaceRealtimeRuntimeContext {
  owner: WorkspaceRealtimeRuntimeOwner;
  // ownerKey does not include runtimeGeneration; it defines durable cursor/store scope.
  // The in-memory generation is checked separately through owner.
  ownerKey: string;
  surface: WorkspaceRealtimeSurface;
  signal?: AbortSignal;
  // A completed bootstrap can supply its own boundary for this start only.
  startCursor?: WorkspaceRealtimeCursor;
}

export interface WorkspaceRealtimeEventContext extends WorkspaceRealtimeRuntimeContext {
  source: WorkspaceRealtimeEventSource;
  notificationsEnabled?: boolean;
}

export interface WorkspaceRealtimeTransportState {
  owner: WorkspaceRealtimeRuntimeOwner;
  ownerKey: string;
  surface: WorkspaceRealtimeSurface;
  mode: WorkspaceRealtimeRuntimeMode;
  lastEpochVersion: WorkspaceMessengerEpochVersion | null;
  reconnectAttempt: number;
  reason?: string;
  error?: unknown;
}

export interface WorkspaceRealtimeSkippedEvent {
  epoch_version: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceRealtimeEventApplier {
  // Transport does not know about Zustand or UI. Applier is the only domain write boundary.
  applyEvent(event: WorkspaceRealtimeEvent, context: WorkspaceRealtimeEventContext): unknown;
  applyEvents?(
    events: readonly WorkspaceRealtimeEvent[],
    context: WorkspaceRealtimeEventContext,
  ): unknown;
  skipEvent(
    event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
    reason: WorkspaceRealtimeSkipReason,
    context: WorkspaceRealtimeEventContext,
  ): unknown;
  onTransportStateChange(
    state: WorkspaceRealtimeTransportState,
    context: WorkspaceRealtimeRuntimeContext,
  ): unknown;
}

export interface WorkspaceRealtimeDiagnostic {
  owner: WorkspaceRealtimeRuntimeOwner;
  ownerKey: string;
  surface: WorkspaceRealtimeSurface;
  reason:
    | WorkspaceRealtimeSkipReason
    | "websocket_error"
    | "catch_up_failed"
    | "event_apply_failed"
    | "participant_not_ready"
    | "auth_failed"
    | "auth_refresh_failed"
    | "cursor_expired"
    | "snapshot_recovery_failed"
    | "epoch_check_failed"
    | "websocket_backpressure";
  error?: unknown;
}

export interface WorkspaceRealtimeWebSocketMessageEvent {
  data: unknown;
}

export interface WorkspaceRealtimeWebSocketLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: WorkspaceRealtimeWebSocketMessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WorkspaceRealtimeWebSocketFactory = (
  url: string,
  protocols: string[],
) => WorkspaceRealtimeWebSocketLike;

export interface WorkspaceRealtimeSessionRefreshOptions {
  force?: boolean;
  signal?: AbortSignal;
}

export type WorkspaceRealtimeSessionRefresh = (
  accountId: string,
  options: WorkspaceRealtimeSessionRefreshOptions,
) => Promise<unknown>;

export interface WorkspaceRealtimeRuntimeOptions {
  clientOptions: WorkspaceClientOptions;
  cursorStorage: WorkspaceRealtimeDurableCursorStorage;
  applier: WorkspaceRealtimeEventApplier;
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  pageLimit?: WorkspaceRealtimeCatchUpOptions["pageLimit"];
  getEpoch?: WorkspaceRealtimeCatchUpOptions["getEpoch"];
  getEventsPage?: WorkspaceRealtimeCatchUpOptions["getEventsPage"];
  normalizeRestEvent?: WorkspaceRealtimeCatchUpOptions["normalizeRestEvent"];
  webSocketBaseUrl?: string;
  webSocketFactory?: WorkspaceRealtimeWebSocketFactory;
  reconnectDelayMs?: (attempt: number) => number;
  refreshSession?: WorkspaceRealtimeSessionRefresh;
  // Return a usable cursor only after preparing the owner projections for this attempt.
  prepareSnapshots?: (
    context: WorkspaceRealtimeRuntimeContext,
    preparation: {
      savedCursor: WorkspaceRealtimeCursor | null;
      expiry: WorkspaceEventsCursorExpiredErrorDto | null;
      resetRequired: boolean; // Survives runtime replacement, even without the original expiry frame.
    },
  ) => Promise<WorkspaceRealtimeCursor>;
  prepareParticipant?: (
    context: WorkspaceRealtimeRuntimeContext,
    participant: string,
  ) => Promise<void>; // Repair a projection before replaying from the same confirmed cursor.
  onDiagnostic?: (diagnostic: WorkspaceRealtimeDiagnostic) => unknown;
}

export interface WorkspaceRealtimeTransportCore {
  start(context: WorkspaceRealtimeRuntimeContext): Promise<void>;
  stop(reason?: string, options?: { waitForApplications?: boolean }): Promise<void>;
  catchUp(context: WorkspaceRealtimeRuntimeContext): Promise<void>;
  connect(context: WorkspaceRealtimeRuntimeContext): Promise<void>;
  disconnect(reason?: string): Promise<void>;
  nudge(reason?: string): Promise<void>;
  reconnect(reason?: string): Promise<void>;
}

const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const WORKSPACE_WEBSOCKET_AUTH_CLOSE_CODE = 4401;
const WORKSPACE_WEBSOCKET_CURSOR_EXPIRED_CLOSE_CODE = 4410;
const INVALID_FRAME_SYNTHETIC_EPOCH: WorkspaceMessengerEpochVersion = 0;
// Check for visible events only after the socket has been quiet for this long.
const EPOCH_WATCHDOG_IDLE_TIMEOUT_MS = 60_000;
// Give queued WebSocket frames time to deliver an event found by the watchdog.
const EPOCH_WATCHDOG_GRACE_PERIOD_MS = 3_000;

function defaultReconnectDelayMs(attempt: number): number {
  return Math.min(
    DEFAULT_RECONNECT_MAX_DELAY_MS,
    DEFAULT_RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
}

function defaultWebSocketFactory(url: string, protocols: string[]): WorkspaceRealtimeWebSocketLike {
  const socket = new WebSocket(url, protocols);
  let openHandler: ((event: Event) => void) | null = null;
  let messageHandler: ((event: WorkspaceRealtimeWebSocketMessageEvent) => void) | null = null;
  let errorHandler: ((event: Event) => void) | null = null;
  let closeHandler: ((event: Event) => void) | null = null;
  return {
    get onopen() {
      return openHandler;
    },
    set onopen(handler: ((event: Event) => void) | null) {
      openHandler = handler;
      socket.onopen = handler == null ? null : (event) => handler(event);
    },
    get onmessage() {
      return messageHandler;
    },
    set onmessage(handler: ((event: WorkspaceRealtimeWebSocketMessageEvent) => void) | null) {
      messageHandler = handler;
      socket.onmessage = handler == null ? null : (event) => handler({ data: event.data });
    },
    get onerror() {
      return errorHandler;
    },
    set onerror(handler: ((event: Event) => void) | null) {
      errorHandler = handler;
      socket.onerror = handler == null ? null : (event) => handler(event);
    },
    get onclose() {
      return closeHandler;
    },
    set onclose(handler: ((event: Event) => void) | null) {
      closeHandler = handler;
      socket.onclose = handler == null ? null : (event) => handler(event);
    },
    send(data) {
      socket.send(data);
    },
    close(code, reason) {
      socket.close(code, reason);
    },
  };
}

function withAbortSignal(
  options: WorkspaceClientOptions,
  signal: AbortSignal | undefined,
): WorkspaceClientOptions {
  // Catch-up REST requests must be cancelled with the same runtime that owns the socket.
  return { ...options, signal };
}

function isOwnerCurrent(
  owner: WorkspaceRealtimeRuntimeOwner,
  options: WorkspaceRealtimeRuntimeOptions,
  signal: AbortSignal | undefined,
): boolean {
  if (signal?.aborted === true) return false;
  return options.isOwnerCurrent?.(owner) ?? true;
}

function isAuthFailureError(error: unknown): boolean {
  if (error instanceof MessengerApiError) {
    return error.status === 401 || error.status === 403;
  }
  if (typeof error !== "object" || error == null || !("status" in error)) {
    return false;
  }
  const status = error.status;
  return status === 401 || status === 403;
}

function cursorExpiredError(error: unknown): WorkspaceEventsCursorExpiredErrorDto | null {
  if (isWorkspaceEventsCursorExpiredErrorDto(error)) {
    return error;
  }
  if (error instanceof MessengerApiError && isWorkspaceEventsCursorExpiredErrorDto(error.data)) {
    return error.data;
  }
  if (typeof error === "object" && error != null && "data" in error) {
    return isWorkspaceEventsCursorExpiredErrorDto(error.data) ? error.data : null;
  }
  return null;
}

function getWebSocketCloseCode(event: Event): number | null {
  if (!("code" in event)) return null;
  const code = event.code;
  return typeof code === "number" ? code : null;
}

export function createWorkspaceRealtimeNoopApplier(): WorkspaceRealtimeEventApplier {
  return {
    applyEvent() {
      // Phase 2 keeps transport alive but does not write events into messengerStore yet.
      // The domain apply path is added as a separate layer.
    },
    skipEvent() {
      // Background and unsupported events only advance the transport cursor for now.
    },
    onTransportStateChange() {
      // Diagnostic state can be wired later without changing the transport API.
    },
  };
}

export function createWorkspaceRealtimeTransportCore(
  options: WorkspaceRealtimeRuntimeOptions,
): WorkspaceRealtimeTransportCore {
  let context: WorkspaceRealtimeRuntimeContext | null = null;
  let controller: AbortController | null = null;
  let socket: WorkspaceRealtimeWebSocketLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectPromise: Promise<void> | null = null;
  let reconnectAttempt = 0;
  let lastEpochVersion: WorkspaceMessengerEpochVersion | null = null;
  let lastCursor: WorkspaceRealtimeCursor | null = null;
  let notificationsEnabled = false;
  let stopped = true;
  let removeExternalAbortListener: (() => void) | null = null;
  let authRefreshPromise: Promise<void> | null = null;
  let lastAuthRefreshToken: string | null = null;
  let lastAuthFailure: { reason: string; error?: unknown } | null = null;
  let cursorRecoveryPromise: Promise<void> | null = null;
  let pendingPreparation: {
    expiry: WorkspaceEventsCursorExpiredErrorDto | null;
    resetRequired: boolean;
  } | null = null;
  const pendingParticipants = new Set<string>();
  const applicationsByOwner = new Map<string, Set<Promise<unknown>>>();
  let disposeFrameQueue: (() => void) | null = null;
  let transportMode: WorkspaceRealtimeRuntimeMode = "idle";
  let lastWebSocketFrameAt: number | null = null;
  let epochWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let epochLagTimer: ReturnType<typeof setTimeout> | null = null;
  let epochCheckPromise: Promise<void> | null = null;
  let startVersion = 0;

  const reconnectDelayMs = options.reconnectDelayMs ?? defaultReconnectDelayMs;
  const webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;

  function activeSignal(): AbortSignal | undefined {
    return controller?.signal;
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer == null) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearEpochWatchdogTimers(): void {
    if (epochWatchdogTimer != null) {
      clearTimeout(epochWatchdogTimer);
      epochWatchdogTimer = null;
    }
    if (epochLagTimer != null) {
      clearTimeout(epochLagTimer);
      epochLagTimer = null;
    }
    lastWebSocketFrameAt = null;
  }

  function cleanupExternalAbortListener(): void {
    removeExternalAbortListener?.();
    removeExternalAbortListener = null;
  }

  function isCurrentRuntime(): boolean {
    if (context == null || stopped) return false;
    return isOwnerCurrent(context.owner, options, activeSignal());
  }

  // Capture identity as well as owner: a newer attempt may use the same credentials.
  function isCurrentAttempt(
    attemptContext: WorkspaceRealtimeRuntimeContext,
    signal: AbortSignal | undefined,
  ): boolean {
    return context === attemptContext && activeSignal() === signal && isCurrentRuntime();
  }

  function isEpochWatchdogActive(activeSocket: WorkspaceRealtimeWebSocketLike): boolean {
    return (
      isCurrentRuntime() &&
      transportMode === "connected" &&
      notificationsEnabled &&
      socket === activeSocket
    );
  }

  async function emitState(
    mode: WorkspaceRealtimeRuntimeMode,
    reason?: string,
    error?: unknown,
  ): Promise<void> {
    if (context == null) return;
    transportMode = mode;
    const state: WorkspaceRealtimeTransportState = {
      owner: context.owner,
      ownerKey: context.ownerKey,
      surface: context.surface,
      mode,
      lastEpochVersion,
      reconnectAttempt,
      reason,
      error,
    };

    try {
      await options.applier.onTransportStateChange(state, context);
    } catch (stateError) {
      options.onDiagnostic?.({
        owner: context.owner,
        ownerKey: context.ownerKey,
        surface: context.surface,
        reason: "websocket_error",
        error: stateError,
      });
    }
  }

  function reportDiagnostic(reason: WorkspaceRealtimeDiagnostic["reason"], error?: unknown): void {
    if (context == null) return;
    options.onDiagnostic?.({
      owner: context.owner,
      ownerKey: context.ownerKey,
      surface: context.surface,
      reason,
      error,
    });
  }

  // Keep the failed participant's repair independent of the shared cursor.
  function recordApplicationFailure(
    error: unknown,
    fallback: "event_apply_failed" | "catch_up_failed",
  ): WorkspaceRealtimeDiagnostic["reason"] {
    if (error instanceof WorkspaceRealtimeParticipantNotReadyError) {
      pendingParticipants.add(error.participant);
      return "participant_not_ready";
    }
    return fallback;
  }

  function scheduleAuthRefreshRetry(reason: string, error?: unknown): void {
    if (context == null || stopped || reconnectTimer != null) return;
    const attemptContext = context;
    const signal = activeSignal();
    lastAuthFailure = { reason, error };
    reconnectAttempt += 1;
    void emitState("reconnecting", reason, error);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!isCurrentAttempt(attemptContext, signal)) return;
      lastAuthRefreshToken = null;
      const failure = lastAuthFailure;
      void refreshSessionAfterAuthFailure(failure?.reason ?? "auth_refresh_retry", failure?.error);
    }, reconnectDelayMs(reconnectAttempt));
  }

  function refreshSessionAfterAuthFailure(reason: string, error?: unknown): Promise<void> {
    const attemptContext = context;
    const signal = activeSignal();
    if (attemptContext == null || !isCurrentAttempt(attemptContext, signal)) {
      return Promise.resolve();
    }
    if (authRefreshPromise != null) return authRefreshPromise;
    const nextRefreshPromise = runSessionRefreshAfterAuthFailure(
      attemptContext,
      signal,
      reason,
      error,
    );
    authRefreshPromise = nextRefreshPromise;
    void nextRefreshPromise
      .finally(() => {
        if (authRefreshPromise === nextRefreshPromise) {
          authRefreshPromise = null;
        }
      })
      .catch(() => undefined);
    return nextRefreshPromise;
  }

  // Each transport attempt handles its own result, even when IAM shares the HTTP refresh.
  async function runSessionRefreshAfterAuthFailure(
    attemptContext: WorkspaceRealtimeRuntimeContext,
    refreshSignal: AbortSignal | undefined,
    reason: string,
    error?: unknown,
  ): Promise<void> {
    const isCurrent = () => isCurrentAttempt(attemptContext, refreshSignal);
    const accessToken = options.clientOptions.accessToken ?? "";
    if (lastAuthRefreshToken === accessToken) {
      await emitState("failed", reason, error);
      if (isCurrent()) scheduleAuthRefreshRetry("auth_refresh_backoff", error);
      return;
    }

    if (options.refreshSession == null) {
      const missingCallbackError = new Error("Workspace realtime auth refresh callback is missing");
      reportDiagnostic("auth_refresh_failed", missingCallbackError);
      await emitState("failed", reason, missingCallbackError);
      return;
    }

    lastAuthRefreshToken = accessToken;
    reportDiagnostic("auth_failed", error);
    await emitState("auth_refreshing", reason, error);
    if (!isCurrent()) return;

    try {
      await options.refreshSession(attemptContext.owner.accountId, {
        force: true,
        signal: refreshSignal,
      });
      if (!isCurrent()) return;
      await stop("auth_refreshed");
    } catch (refreshError) {
      if (!isCurrent()) return;
      reportDiagnostic("auth_refresh_failed", refreshError);
      await emitState("failed", reason, refreshError);
      if (isCurrent()) scheduleAuthRefreshRetry("auth_refresh_failed", refreshError);
    }
  }

  async function skipEvent(
    event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
    reason: WorkspaceRealtimeSkipReason,
    source: WorkspaceRealtimeEventSource,
  ): Promise<void> {
    if (context == null) return;
    await options.applier.skipEvent(event, reason, {
      ...context,
      source,
      notificationsEnabled,
    });
  }

  function advanceCursor(epochVersion: WorkspaceMessengerEpochVersion): boolean {
    if (context == null || lastCursor == null) return false;
    const previousEpochVersion = lastCursor.epochVersion;
    const nextEpochVersion = Math.max(previousEpochVersion, epochVersion);
    // Durable cursor moves in transport after a deliberate decision: apply or skip.
    lastCursor = {
      epochGeneration: lastCursor.epochGeneration,
      epochVersion: nextEpochVersion,
    };
    options.cursorStorage.write(context.owner, lastCursor);
    lastEpochVersion = lastCursor.epochVersion;
    return nextEpochVersion > previousEpochVersion;
  }

  // Count event writes only. A superseded page fetch cannot delay a new attempt.
  function applyTrackedEvent(
    event: WorkspaceRealtimeEvent,
    eventContext: WorkspaceRealtimeEventContext,
  ): Promise<unknown> {
    const application = Promise.resolve(options.applier.applyEvent(event, eventContext));
    const ownerKey = eventContext.ownerKey;
    const applications = applicationsByOwner.get(ownerKey) ?? new Set<Promise<unknown>>();
    applications.add(application);
    applicationsByOwner.set(ownerKey, applications);
    return application.finally(() => {
      applications.delete(application);
      if (applications.size === 0) applicationsByOwner.delete(ownerKey);
    });
  }

  // Prefer settling same-owner writes before replay, in both REST and WebSocket paths.
  async function settleOwnerApplications(ownerKey: string): Promise<void> {
    const applications = applicationsByOwner.get(ownerKey);
    if (applications != null) await Promise.allSettled(applications);
  }

  async function handleNormalizedEvent(
    event: WorkspaceRealtimeEvent,
    isFrameCurrent: () => boolean,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (context == null) return false;
    if (!isCurrentRuntime()) {
      // Do not apply stale socket events or move the cursor; the new runtime will catch up.
      reportDiagnostic("stale_owner", event);
      return false;
    }

    const currentCursor = lastCursor;
    if (currentCursor != null && event.epoch_version <= currentCursor.epochVersion) {
      await skipEvent(event, "duplicate_epoch", "websocket");
      if (!isFrameCurrent()) return false;
      advanceCursor(event.epoch_version);
      return false;
    }

    const eventContext: WorkspaceRealtimeEventContext = {
      ...context,
      signal,
      source: "websocket",
      notificationsEnabled,
    };
    await applyTrackedEvent(event, eventContext);
    if (!isFrameCurrent()) return false;
    return advanceCursor(event.epoch_version);
  }

  async function handleUnsupportedFrame(
    frame: WorkspaceMessengerWebSocketFrameDto,
    isFrameCurrent: () => boolean,
  ): Promise<boolean> {
    if (context == null) return false;
    if ("epoch_version" in frame && typeof frame.epoch_version === "number") {
      const skippedEvent = { epoch_version: frame.epoch_version };
      const currentCursor = lastCursor;
      const reason =
        currentCursor != null && frame.epoch_version <= currentCursor.epochVersion
          ? "duplicate_epoch"
          : "unsupported_event";
      // Service or unsupported frames with an epoch still participate in event ordering.
      await skipEvent(skippedEvent, reason, "websocket");
      if (!isFrameCurrent()) return false;
      return advanceCursor(frame.epoch_version);
    }

    reportDiagnostic("unsupported_event");
    return false;
  }

  async function handleInvalidFrame(error: unknown): Promise<void> {
    reportDiagnostic("invalid_frame", error);
    if (context == null) return;
    await skipEvent(
      { epoch_version: lastEpochVersion ?? INVALID_FRAME_SYNTHETIC_EPOCH },
      "invalid_frame",
      "websocket",
    );
  }

  // A fresh epoch is only durable after the session has installed its authoritative snapshots.
  async function preparePendingCursor(
    attemptContext: WorkspaceRealtimeRuntimeContext,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    const preparation = pendingPreparation;
    if (preparation == null) return true;
    const preparedContext = { ...attemptContext, signal };
    let cursor: WorkspaceRealtimeCursor;
    if (options.prepareSnapshots != null) {
      cursor = await options.prepareSnapshots(preparedContext, {
        savedCursor: lastCursor,
        expiry: preparation.expiry,
        resetRequired: preparation.resetRequired,
      });
    } else {
      const getEpoch = options.getEpoch ?? defaultGetEpoch;
      const epoch = await getEpoch(withAbortSignal(options.clientOptions, signal));
      cursor = { epochGeneration: epoch.epoch_generation, epochVersion: epoch.epoch_version };
    }
    if (!isCurrentAttempt(attemptContext, signal) || pendingPreparation !== preparation)
      return false;
    options.cursorStorage.writeSnapshotBoundary(attemptContext.owner, cursor);
    lastCursor = cursor;
    lastEpochVersion = cursor.epochVersion;
    pendingPreparation = null;
    pendingParticipants.clear();
    return true;
  }

  // Keep the runtime in snapshot recovery until a new boundary can be committed.
  async function recoverFromCursorExpiry(
    error: WorkspaceEventsCursorExpiredErrorDto,
  ): Promise<void> {
    if (cursorRecoveryPromise != null) {
      return cursorRecoveryPromise;
    }

    const recovery = (async (): Promise<void> => {
      const attemptContext = context;
      const signal = activeSignal();
      if (attemptContext == null || !isCurrentAttempt(attemptContext, signal)) return;

      reportDiagnostic("cursor_expired", error);
      notificationsEnabled = false;
      lastCursor = null;
      lastEpochVersion = null;
      pendingPreparation = { expiry: error, resetRequired: true };
      options.cursorStorage.requireSnapshotReset(attemptContext.owner);
      await disconnect("cursor_expired");
      if (!isCurrentAttempt(attemptContext, signal)) return;

      try {
        await preparePendingCursor(attemptContext, signal);
      } catch (snapshotError) {
        if (!isCurrentAttempt(attemptContext, signal)) return;
        reportDiagnostic("snapshot_recovery_failed", snapshotError);
        await emitState("failed", "snapshot_recovery_failed", snapshotError);
      }

      if (isCurrentAttempt(attemptContext, signal)) {
        // Recovery is retried through the normal backoff path. A broken snapshot reload
        // must not create a tight reconnect loop around the same pruned cursor.
        scheduleReconnect("cursor_expired");
      }
    })();
    cursorRecoveryPromise = recovery;
    try {
      await recovery;
    } finally {
      if (cursorRecoveryPromise === recovery) {
        cursorRecoveryPromise = null;
      }
    }
  }

  function scheduleEpochWatchdog(
    activeSocket: WorkspaceRealtimeWebSocketLike,
    idleSince = lastWebSocketFrameAt ?? Date.now(),
  ): void {
    if (
      !isEpochWatchdogActive(activeSocket) ||
      epochWatchdogTimer != null ||
      epochLagTimer != null ||
      epochCheckPromise != null
    ) {
      return;
    }

    const remainingDelay = Math.max(0, EPOCH_WATCHDOG_IDLE_TIMEOUT_MS - (Date.now() - idleSince));
    epochWatchdogTimer = setTimeout(() => {
      epochWatchdogTimer = null;
      void checkVisibleEventsAfterSocketIdle(activeSocket);
    }, remainingDelay);
  }

  async function confirmVisibleEventLag(
    activeSocket: WorkspaceRealtimeWebSocketLike,
    probedCursor: WorkspaceRealtimeCursor,
    pendingEpochVersion: WorkspaceMessengerEpochVersion,
  ): Promise<void> {
    if (!isEpochWatchdogActive(activeSocket) || context == null) return;

    // Durable storage is shared by browser tabs. Only this runtime's in-memory cursor
    // can prove that this socket received the visible event found by the probe.
    const currentCursor = lastCursor;
    if (currentCursor == null) return;
    if (currentCursor.epochGeneration !== probedCursor.epochGeneration) {
      scheduleEpochWatchdog(activeSocket);
      return;
    }
    if (currentCursor.epochVersion >= pendingEpochVersion) {
      scheduleEpochWatchdog(activeSocket);
      return;
    }

    await nudge("visible_event_lag_detected");
  }

  function scheduleVisibleEventLagConfirmation(
    activeSocket: WorkspaceRealtimeWebSocketLike,
    probedCursor: WorkspaceRealtimeCursor,
    pendingEpochVersion: WorkspaceMessengerEpochVersion,
  ): void {
    if (!isEpochWatchdogActive(activeSocket) || epochLagTimer != null) return;
    epochLagTimer = setTimeout(() => {
      epochLagTimer = null;
      void confirmVisibleEventLag(activeSocket, probedCursor, pendingEpochVersion);
    }, EPOCH_WATCHDOG_GRACE_PERIOD_MS);
  }

  function checkVisibleEventsAfterSocketIdle(activeSocket: WorkspaceRealtimeWebSocketLike): void {
    if (!isEpochWatchdogActive(activeSocket) || epochCheckPromise != null || context == null)
      return;

    const epochCheckContext = context;
    const epochCheckSignal = activeSignal();
    const probedCursor = lastCursor;
    if (probedCursor == null) return;
    let shouldScheduleNextEpochCheck = false;
    const check = (async (): Promise<void> => {
      try {
        const getEventsPage = options.getEventsPage ?? defaultGetEventsPage;
        const page = await getEventsPage(withAbortSignal(options.clientOptions, epochCheckSignal), {
          afterEpochVersion: probedCursor.epochVersion,
          epochGeneration: probedCursor.epochGeneration,
          pageLimit: 1,
        });
        if (
          !isEpochWatchdogActive(activeSocket) ||
          context == null ||
          context !== epochCheckContext ||
          activeSignal() !== epochCheckSignal
        ) {
          return;
        }

        const currentCursor = lastCursor;
        if (currentCursor == null) return;
        const pendingEvent = page.items.find(
          (event) => event.epoch_version > currentCursor.epochVersion,
        );
        if (pendingEvent != null) {
          scheduleVisibleEventLagConfirmation(
            activeSocket,
            probedCursor,
            pendingEvent.epoch_version,
          );
        } else {
          shouldScheduleNextEpochCheck = true;
        }
      } catch (error) {
        const expiredCursor = cursorExpiredError(error);
        if (expiredCursor != null) {
          const probeIsStale =
            !isEpochWatchdogActive(activeSocket) ||
            context !== epochCheckContext ||
            activeSignal() !== epochCheckSignal ||
            lastCursor?.epochVersion !== probedCursor.epochVersion ||
            lastCursor.epochGeneration !== probedCursor.epochGeneration;
          if (probeIsStale) {
            shouldScheduleNextEpochCheck = isEpochWatchdogActive(activeSocket);
            return;
          }
          await recoverFromCursorExpiry(expiredCursor);
          return;
        }
        if (isEpochWatchdogActive(activeSocket)) {
          reportDiagnostic(
            "epoch_check_failed",
            new Error("Workspace realtime visible-events check failed"),
          );
          shouldScheduleNextEpochCheck = true;
        }
      }
    })();
    epochCheckPromise = check;
    void check.finally(() => {
      if (epochCheckPromise === check) {
        epochCheckPromise = null;
        if (shouldScheduleNextEpochCheck) {
          scheduleEpochWatchdog(activeSocket, Date.now());
        }
      }
    });
  }

  function recordIncomingWebSocketFrame(activeSocket: WorkspaceRealtimeWebSocketLike): void {
    if (!isEpochWatchdogActive(activeSocket)) return;
    lastWebSocketFrameAt = Date.now();
    if (epochWatchdogTimer != null) {
      clearTimeout(epochWatchdogTimer);
      epochWatchdogTimer = null;
    }
    scheduleEpochWatchdog(activeSocket);
  }

  async function handleReadyFrame(
    frame: Extract<WorkspaceMessengerWebSocketFrameDto, { type: "ready" }>,
  ): Promise<void> {
    if (context == null || !isCurrentRuntime()) return;
    if (lastCursor != null && lastCursor.epochGeneration !== frame.epoch_generation) {
      await recoverFromCursorExpiry({
        type: "EventsCursorExpiredError",
        code: 410,
        error: "epoch_pruned",
        message: "Workspace realtime generation changed during websocket catch-up",
        reason: "epoch_generation_changed",
        epoch_generation: frame.epoch_generation,
        current_epoch_version: frame.epoch_version,
        minimum_epoch_version: frame.epoch_version,
      });
      return;
    }

    lastCursor = {
      epochGeneration: frame.epoch_generation,
      epochVersion: Math.max(lastCursor?.epochVersion ?? 0, frame.epoch_version),
    };
    options.cursorStorage.write(context.owner, lastCursor);
    lastEpochVersion = lastCursor.epochVersion;
    notificationsEnabled = true;
    reconnectAttempt = 0;
    await emitState("connected");
    if (socket != null) {
      scheduleEpochWatchdog(socket);
    }
  }

  // Parse errors may be skipped. An applier failure must stop the ordered stream.
  async function handleRawFrame(
    raw: unknown,
    isFrameCurrent: () => boolean,
    signal: AbortSignal,
  ): Promise<void> {
    let frame: WorkspaceMessengerWebSocketFrameDto;
    let event: WorkspaceRealtimeEvent | null;
    try {
      frame = parseWorkspaceWebSocketFrame(raw);
      event = normalizeWorkspaceWebSocketFrame(frame);
    } catch (error) {
      if (isFrameCurrent()) {
        try {
          await handleInvalidFrame(error);
        } catch (diagnosticError) {
          if (isFrameCurrent()) reportDiagnostic("websocket_error", diagnosticError);
        }
      }
      return;
    }
    if ("type" in frame && frame.type === "ready") {
      await handleReadyFrame(frame);
    } else if ("type" in frame && frame.type === "error") {
      await recoverFromCursorExpiry({ ...frame, type: "EventsCursorExpiredError" });
    } else if (event == null) {
      await handleUnsupportedFrame(frame, isFrameCurrent);
    } else {
      await handleNormalizedEvent(event, isFrameCurrent, signal);
    }
  }

  async function runCatchUp(activeContext: WorkspaceRealtimeRuntimeContext): Promise<boolean> {
    const signal = activeSignal();
    const isCurrent = () => isCurrentAttempt(activeContext, signal);
    if (!isCurrent()) return false;
    await emitState("catching_up");
    if (!isCurrent()) return false;

    // Catch-up sends events to the same applier but marks the source for diagnostics.
    const catchUpApplier: WorkspaceRealtimeCatchUpApplier = {
      applyEvent: (event, catchUpContext) =>
        applyTrackedEvent(event, {
          owner: catchUpContext.owner,
          ownerKey: catchUpContext.ownerKey,
          surface: catchUpContext.surface,
          signal: catchUpContext.signal,
          source: "catch_up",
          notificationsEnabled: false,
        }),
      skipEvent: (event, reason, catchUpContext) =>
        options.applier.skipEvent(event, reason, {
          owner: catchUpContext.owner,
          ownerKey: catchUpContext.ownerKey,
          surface: catchUpContext.surface,
          signal: catchUpContext.signal,
          source: "catch_up",
          notificationsEnabled: false,
        }),
    };

    const result = await catchUpWorkspaceRealtime({
      owner: activeContext.owner,
      ownerKey: activeContext.ownerKey,
      surface: activeContext.surface,
      clientOptions: withAbortSignal(options.clientOptions, signal),
      cursorStorage: options.cursorStorage,
      applier: catchUpApplier,
      ...(lastCursor == null ? {} : { startCursor: lastCursor }),
      isOwnerCurrent: isCurrent,
      onCursorCommitted(cursor) {
        lastCursor = cursor;
        lastEpochVersion = cursor.epochVersion;
      },
      pageLimit: options.pageLimit,
      getEpoch: options.getEpoch,
      getEventsPage: options.getEventsPage,
      normalizeRestEvent: options.normalizeRestEvent,
    });

    if (result.isStale || !isCurrent()) return false;
    lastCursor = result.lastCursor;
    lastEpochVersion = result.lastCursor.epochVersion;
    return true;
  }

  function attachExternalAbort(contextSignal: AbortSignal | undefined): void {
    cleanupExternalAbortListener();
    if (contextSignal == null) return;

    if (contextSignal.aborted) {
      void stop("external_abort");
      return;
    }

    const abortHandler = (): void => {
      void stop("external_abort");
    };
    contextSignal.addEventListener("abort", abortHandler, { once: true });
    removeExternalAbortListener = () => {
      contextSignal.removeEventListener("abort", abortHandler);
    };
  }

  function openWebSocket(activeContext: WorkspaceRealtimeRuntimeContext): void {
    if (!isCurrentRuntime()) return;
    // Open the socket only after catch-up from the saved cursor.
    // Otherwise live events may arrive before missed REST events.
    const currentCursor = lastCursor ?? options.cursorStorage.read(activeContext.owner);
    const url = buildMessengerWebSocketUrl({
      baseUrl: options.webSocketBaseUrl,
      lastEpochVersion: currentCursor?.epochVersion ?? INVALID_FRAME_SYNTHETIC_EPOCH,
      epochGeneration: currentCursor?.epochGeneration,
    });
    const protocols = buildMessengerWebSocketProtocols(options.clientOptions.accessToken ?? "");
    socket = webSocketFactory(url, protocols);
    const activeSocket = socket;
    const socketController = new AbortController();
    const pendingFrames: { data: unknown; bytes: number }[] = [];
    let pendingBytes = 0;
    let draining = false;
    let disposed = false;
    let accepting = true;
    let reconnectAfterDrain = false;
    const isFrameCurrent = (): boolean =>
      !disposed && context === activeContext && socket === activeSocket && isCurrentRuntime();
    disposeFrameQueue = () => {
      socketController.abort();
      disposed = true;
      accepting = false;
      reconnectAfterDrain = false;
      pendingFrames.length = 0;
      pendingBytes = 0;
    };

    const drainFrames = async (): Promise<void> => {
      if (draining) return;
      draining = true;
      let processed = 0;
      try {
        while (isFrameCurrent()) {
          const frame = pendingFrames.shift();
          if (frame == null) break;
          pendingBytes -= frame.bytes;
          try {
            await handleRawFrame(frame.data, isFrameCurrent, socketController.signal);
          } catch (error) {
            if (isFrameCurrent()) {
              const reason = recordApplicationFailure(error, "event_apply_failed");
              reportDiagnostic(reason, error);
              await disconnect(reason);
              if (context === activeContext && isCurrentRuntime()) scheduleReconnect(reason);
            }
            return;
          }
          processed += 1;
          if (processed === WEBSOCKET_FRAMES_PER_TASK && pendingFrames.length > 0) {
            // Let rendering, IPC and garbage collection run during a replay burst.
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 0);
            });
            processed = 0;
          }
        }
      } finally {
        draining = false;
        if (reconnectAfterDrain && isFrameCurrent()) {
          void reconnect("websocket_backpressure");
        }
      }
    };

    activeSocket.onopen = () => {
      notificationsEnabled = false;
    };
    activeSocket.onmessage = (event) => {
      if (!accepting || socket !== activeSocket) return;
      if (!isCurrentRuntime()) {
        reportDiagnostic("stale_owner");
        return;
      }
      recordIncomingWebSocketFrame(activeSocket);
      const bytes = typeof event.data === "string" ? event.data.length * 2 : 0;
      if (
        pendingFrames.length >= MAX_PENDING_WEBSOCKET_FRAMES ||
        pendingBytes + bytes > MAX_PENDING_WEBSOCKET_BYTES
      ) {
        // Discard only the socket backlog; REST replays it from the last applied cursor.
        accepting = false;
        pendingFrames.length = 0;
        pendingBytes = 0;
        reconnectAfterDrain = true;
        reportDiagnostic("websocket_backpressure");
        // Finish the current cache write before REST starts replaying its successor.
        if (!draining) void reconnect("websocket_backpressure");
        return;
      }
      pendingFrames.push({ data: event.data, bytes });
      pendingBytes += bytes;
      void drainFrames();
    };
    activeSocket.onerror = (event) => {
      reportDiagnostic("websocket_error", event);
      // Give a matching close event the first chance to select auth or cursor recovery.
      setTimeout(() => {
        if (!stopped && socket === activeSocket) {
          // Some browser/network failures never produce a close callback. Reconnect explicitly
          // so the REST catch-up path cannot remain blocked until a full page reload.
          scheduleReconnect("socket_error");
        }
      }, 0);
    };
    activeSocket.onclose = (event) => {
      if (socket !== activeSocket) return;
      disposeFrameQueue?.();
      disposeFrameQueue = null;
      socket = null;
      if (!stopped) {
        const closeCode = getWebSocketCloseCode(event);
        if (
          closeCode === WORKSPACE_WEBSOCKET_AUTH_CLOSE_CODE ||
          closeCode === WORKSPACE_WEBSOCKET_CURSOR_EXPIRED_CLOSE_CODE
        ) {
          // A preceding error may already have armed the generic reconnect path.
          clearReconnectTimer();
        }
        if (closeCode === WORKSPACE_WEBSOCKET_AUTH_CLOSE_CODE) {
          void refreshSessionAfterAuthFailure("websocket_auth_failed", event);
          return;
        }
        if (closeCode === WORKSPACE_WEBSOCKET_CURSOR_EXPIRED_CLOSE_CODE) {
          void recoverFromCursorExpiry({
            type: "EventsCursorExpiredError",
            code: 410,
            error: "epoch_pruned",
            message: "Workspace realtime cursor expired",
            reason: "websocket_closed",
            epoch_generation: lastCursor?.epochGeneration ?? "unknown",
            current_epoch_version: lastEpochVersion ?? 0,
            minimum_epoch_version: 0,
          });
          return;
        }
        scheduleReconnect("socket_close");
      }
    };
  }

  async function runCatchUpAndConnect(reason?: string): Promise<void> {
    const attemptContext = context;
    const signal = activeSignal();
    const isCurrent = () => attemptContext != null && isCurrentAttempt(attemptContext, signal);
    if (attemptContext == null || !isCurrent()) return;

    try {
      if (!(await preparePendingCursor(attemptContext, signal)) || !isCurrent()) return;
      for (const participant of pendingParticipants) {
        await options.prepareParticipant?.({ ...attemptContext, signal }, participant);
        if (!isCurrent()) return;
        pendingParticipants.delete(participant);
      }
      const shouldConnect = await runCatchUp(attemptContext);
      if (!shouldConnect || !isCurrent()) return;
      await emitState("connecting", reason);
      if (isCurrent()) openWebSocket(attemptContext);
    } catch (error) {
      if (!isCurrent()) return;
      const expiredCursor = cursorExpiredError(error);
      if (expiredCursor != null) {
        await recoverFromCursorExpiry(expiredCursor);
        return;
      }
      if (isAuthFailureError(error)) {
        await refreshSessionAfterAuthFailure("catch_up_auth_failed", error);
        return;
      }
      const failureReason =
        pendingPreparation != null
          ? "snapshot_recovery_failed"
          : recordApplicationFailure(error, "catch_up_failed");
      reportDiagnostic(failureReason, error);
      await emitState("failed", reason, error);
      if (isCurrent()) scheduleReconnect(failureReason);
    }
  }

  function scheduleReconnect(reason: string): void {
    if (context == null || stopped || reconnectTimer != null) return;
    reconnectAttempt += 1;
    void emitState("reconnecting", reason);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void reconnect(reason);
    }, reconnectDelayMs(reconnectAttempt));
  }

  async function disconnect(reason = "disconnect", waitForApplications = true): Promise<void> {
    const previousOwnerKey = context?.ownerKey;
    clearEpochWatchdogTimers();
    notificationsEnabled = false;
    disposeFrameQueue?.();
    disposeFrameQueue = null;
    const activeSocket = socket;
    socket = null;
    await emitState("disconnecting", reason);
    if (activeSocket != null) {
      activeSocket.onopen = null;
      activeSocket.onmessage = null;
      activeSocket.onerror = null;
      activeSocket.onclose = null;
      activeSocket.close(1000, reason);
    }
    // A disconnected socket's operation must finish before the same owner replays that event.
    if (waitForApplications && previousOwnerKey != null)
      await settleOwnerApplications(previousOwnerKey);
  }

  // Invalidate immediately and keep an old stop from releasing the new attempt.
  async function stopCurrent(reason: string): Promise<void> {
    if (stopped && context == null) return;
    const previousContext = context;
    const previousSignal = activeSignal();
    stopped = true;
    clearReconnectTimer();
    clearEpochWatchdogTimers();
    cleanupExternalAbortListener();
    lastAuthFailure = null;
    controller?.abort();
    await disconnect(reason, false);
    if (context !== previousContext || activeSignal() !== previousSignal) return;
    await emitState("stopped", reason);
    if (context !== previousContext || activeSignal() !== previousSignal) return;
    context = null;
    controller = null;
  }

  async function stop(
    reason = "stop",
    stopOptions?: { waitForApplications?: boolean },
  ): Promise<void> {
    startVersion += 1;
    await stopCurrent(reason);
    if (stopOptions?.waitForApplications === true) {
      // Another start may already have cleared the context while waiting for an old write.
      await Promise.all([...applicationsByOwner.keys()].map(settleOwnerApplications));
    }
  }

  async function start(nextContext: WorkspaceRealtimeRuntimeContext): Promise<void> {
    const version = ++startVersion;
    await stopCurrent("restart");
    await settleOwnerApplications(nextContext.ownerKey);
    if (version !== startVersion || nextContext.signal?.aborted === true) return;
    context = nextContext;
    controller = new AbortController();
    stopped = false;
    reconnectAttempt = 0;
    lastAuthRefreshToken = null;
    lastAuthFailure = null;
    authRefreshPromise = null;
    cursorRecoveryPromise = null;
    reconnectPromise = null;
    const resetRequired = options.cursorStorage.isSnapshotResetRequired(nextContext.owner);
    pendingPreparation =
      resetRequired || (options.prepareSnapshots != null && nextContext.startCursor == null)
        ? { expiry: null, resetRequired }
        : null;
    pendingParticipants.clear();
    epochCheckPromise = null;
    clearEpochWatchdogTimers();
    notificationsEnabled = false;
    lastCursor = resetRequired
      ? null
      : (nextContext.startCursor ?? options.cursorStorage.read(nextContext.owner));
    lastEpochVersion = lastCursor?.epochVersion ?? null;
    attachExternalAbort(nextContext.signal);
    if (!isCurrentRuntime()) return;
    if (!resetRequired && nextContext.startCursor != null) {
      options.cursorStorage.write(nextContext.owner, nextContext.startCursor);
    }
    const signal = activeSignal();
    const operation = (async () => {
      await emitState("starting");
      if (isCurrentAttempt(nextContext, signal)) await runCatchUpAndConnect("start");
    })();
    reconnectPromise = operation;
    try {
      await operation;
    } finally {
      if (reconnectPromise === operation) reconnectPromise = null;
    }
  }

  async function catchUp(nextContext: WorkspaceRealtimeRuntimeContext): Promise<void> {
    context = nextContext;
    await runCatchUp(nextContext);
  }

  async function connect(nextContext: WorkspaceRealtimeRuntimeContext): Promise<void> {
    context = nextContext;
    await emitState("connecting");
    openWebSocket(nextContext);
  }

  function reconnect(reason = "reconnect"): Promise<void> {
    if (context == null || stopped) return Promise.resolve();
    if (reconnectPromise != null) return reconnectPromise;
    if (authRefreshPromise != null) return authRefreshPromise;
    if (cursorRecoveryPromise != null) return cursorRecoveryPromise;

    clearReconnectTimer();
    const attemptContext = context;
    const signal = activeSignal();
    const operation = disconnect(reason).then(async () => {
      if (isCurrentAttempt(attemptContext, signal)) await runCatchUpAndConnect(reason);
    });
    reconnectPromise = operation;
    void operation
      .finally(() => {
        if (reconnectPromise === operation) reconnectPromise = null;
      })
      .catch(() => undefined);
    return operation;
  }

  async function nudge(reason = "nudge"): Promise<void> {
    await reconnect(reason);
  }

  return {
    start,
    stop,
    catchUp,
    connect,
    disconnect,
    nudge,
    reconnect,
  };
}
