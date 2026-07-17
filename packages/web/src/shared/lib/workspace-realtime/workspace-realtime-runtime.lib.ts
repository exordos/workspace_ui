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
import type { WorkspaceClientOptions } from "~/shared/api/workspace-client";
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
    | "auth_failed"
    | "auth_refresh_failed"
    | "cursor_expired"
    | "snapshot_recovery_failed";
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
  resetAuthoritativeSnapshots?: (
    context: WorkspaceRealtimeRuntimeContext,
    error: WorkspaceEventsCursorExpiredErrorDto,
  ) => Promise<void> | void;
  onDiagnostic?: (diagnostic: WorkspaceRealtimeDiagnostic) => unknown;
}

export interface WorkspaceRealtimeTransportCore {
  start(context: WorkspaceRealtimeRuntimeContext): Promise<void>;
  stop(reason?: string): Promise<void>;
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

function isSameRuntimeOwner(
  left: WorkspaceRealtimeRuntimeOwner,
  right: WorkspaceRealtimeRuntimeOwner,
): boolean {
  return (
    left.accountId === right.accountId &&
    left.instanceId === right.instanceId &&
    left.organizationId === right.organizationId &&
    left.projectId === right.projectId &&
    left.userUuid === right.userUuid &&
    left.runtimeGeneration === right.runtimeGeneration
  );
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
  let frameQueue: Promise<void> = Promise.resolve();

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

  function cleanupExternalAbortListener(): void {
    removeExternalAbortListener?.();
    removeExternalAbortListener = null;
  }

  function isCurrentRuntime(): boolean {
    if (context == null || stopped) return false;
    return isOwnerCurrent(context.owner, options, activeSignal());
  }

  async function emitState(
    mode: WorkspaceRealtimeRuntimeMode,
    reason?: string,
    error?: unknown,
  ): Promise<void> {
    if (context == null) return;
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

  function scheduleAuthRefreshRetry(reason: string, error?: unknown): void {
    if (context == null || stopped || reconnectTimer != null) return;
    lastAuthFailure = { reason, error };
    reconnectAttempt += 1;
    void emitState("reconnecting", reason, error);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      lastAuthRefreshToken = null;
      const failure = lastAuthFailure;
      void refreshSessionAfterAuthFailure(failure?.reason ?? "auth_refresh_retry", failure?.error);
    }, reconnectDelayMs(reconnectAttempt));
  }

  function refreshSessionAfterAuthFailure(reason: string, error?: unknown): Promise<void> {
    if (authRefreshPromise != null) return authRefreshPromise;
    const nextRefreshPromise = runSessionRefreshAfterAuthFailure(reason, error);
    authRefreshPromise = nextRefreshPromise;
    void nextRefreshPromise.finally(() => {
      if (authRefreshPromise === nextRefreshPromise) {
        authRefreshPromise = null;
      }
    });
    return nextRefreshPromise;
  }

  async function runSessionRefreshAfterAuthFailure(reason: string, error?: unknown): Promise<void> {
    if (context == null || stopped) return;

    const accessToken = options.clientOptions.accessToken ?? "";
    if (lastAuthRefreshToken === accessToken) {
      await emitState("failed", reason, error);
      scheduleAuthRefreshRetry("auth_refresh_backoff", error);
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

    const refreshOwner = context.owner;
    const refreshSignal = activeSignal();

    try {
      await options.refreshSession(refreshOwner.accountId, {
        force: true,
        signal: refreshSignal,
      });
      if (
        stopped ||
        activeSignal() !== refreshSignal ||
        refreshSignal?.aborted === true ||
        context == null ||
        !isSameRuntimeOwner(context.owner, refreshOwner)
      ) {
        return;
      }
      await stop("auth_refreshed");
    } catch (refreshError) {
      if (
        stopped ||
        activeSignal() !== refreshSignal ||
        refreshSignal?.aborted === true ||
        context == null ||
        !isSameRuntimeOwner(context.owner, refreshOwner)
      ) {
        return;
      }
      reportDiagnostic("auth_refresh_failed", refreshError);
      await emitState("failed", reason, refreshError);
      scheduleAuthRefreshRetry("auth_refresh_failed", refreshError);
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

  async function handleNormalizedEvent(event: WorkspaceRealtimeEvent): Promise<boolean> {
    if (context == null) return false;
    if (!isCurrentRuntime()) {
      // Do not apply stale socket events or move the cursor; the new runtime will catch up.
      reportDiagnostic("stale_owner", event);
      return false;
    }

    const currentCursor = lastCursor ?? options.cursorStorage.read(context.owner);
    if (currentCursor != null && event.epoch_version <= currentCursor.epochVersion) {
      await skipEvent(event, "duplicate_epoch", "websocket");
      advanceCursor(event.epoch_version);
      return false;
    }

    await options.applier.applyEvent(event, {
      ...context,
      source: "websocket",
      notificationsEnabled,
    });
    return advanceCursor(event.epoch_version);
  }

  async function handleUnsupportedFrame(
    frame: WorkspaceMessengerWebSocketFrameDto,
  ): Promise<boolean> {
    if (context == null) return false;
    if ("epoch_version" in frame && typeof frame.epoch_version === "number") {
      const skippedEvent = { epoch_version: frame.epoch_version };
      const currentCursor = lastCursor ?? options.cursorStorage.read(context.owner);
      const reason =
        currentCursor != null && frame.epoch_version <= currentCursor.epochVersion
          ? "duplicate_epoch"
          : "unsupported_event";
      // Service or unsupported frames with an epoch still participate in event ordering.
      await skipEvent(skippedEvent, reason, "websocket");
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

  async function recoverFromCursorExpiry(
    error: WorkspaceEventsCursorExpiredErrorDto,
  ): Promise<void> {
    if (cursorRecoveryPromise != null) {
      return cursorRecoveryPromise;
    }

    const recovery = (async (): Promise<void> => {
      if (context == null || stopped) return;

      reportDiagnostic("cursor_expired", error);
      notificationsEnabled = false;
      lastCursor = null;
      lastEpochVersion = null;
      options.cursorStorage.clear(context.owner);
      await disconnect("cursor_expired");

      try {
        await options.resetAuthoritativeSnapshots?.(context, error);
      } catch (snapshotError) {
        reportDiagnostic("snapshot_recovery_failed", snapshotError);
        await emitState("failed", "snapshot_recovery_failed", snapshotError);
      }

      if (!stopped && isCurrentRuntime()) {
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
  }

  async function handleRawFrame(raw: unknown): Promise<void> {
    try {
      const frame = parseWorkspaceWebSocketFrame(raw);
      if ("type" in frame && frame.type === "ready") {
        await handleReadyFrame(frame);
        return;
      }
      if ("type" in frame && frame.type === "error") {
        await recoverFromCursorExpiry({
          ...frame,
          type: "EventsCursorExpiredError",
        });
        return;
      }
      const event = normalizeWorkspaceWebSocketFrame(frame);
      if (event == null) {
        await handleUnsupportedFrame(frame);
        return;
      }
      await handleNormalizedEvent(event);
    } catch (error) {
      await handleInvalidFrame(error);
    }
  }

  async function runCatchUp(activeContext: WorkspaceRealtimeRuntimeContext): Promise<boolean> {
    if (!isCurrentRuntime()) return false;
    await emitState("catching_up");

    // Catch-up sends events to the same applier but marks the source for diagnostics.
    const catchUpApplier: WorkspaceRealtimeCatchUpApplier = {
      applyEvent: (event, catchUpContext) =>
        options.applier.applyEvent(event, {
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
      clientOptions: withAbortSignal(options.clientOptions, activeSignal()),
      cursorStorage: options.cursorStorage,
      applier: catchUpApplier,
      isOwnerCurrent: (owner) => isOwnerCurrent(owner, options, activeSignal()),
      pageLimit: options.pageLimit,
      getEpoch: options.getEpoch,
      getEventsPage: options.getEventsPage,
      normalizeRestEvent: options.normalizeRestEvent,
    });

    lastCursor = result.lastCursor;
    lastEpochVersion = result.lastCursor.epochVersion;
    return !result.isStale && isCurrentRuntime();
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

    activeSocket.onopen = () => {
      notificationsEnabled = false;
    };
    activeSocket.onmessage = (event) => {
      frameQueue = frameQueue
        .then(async () => {
          // Preserve server epoch order and ignore frames left behind by an old socket.
          if (stopped || socket !== activeSocket) return;
          await handleRawFrame(event.data);
        })
        .catch((error: unknown) => {
          reportDiagnostic("websocket_error", error);
        });
    };
    activeSocket.onerror = (event) => {
      reportDiagnostic("websocket_error", event);
    };
    activeSocket.onclose = (event) => {
      socket = null;
      if (!stopped) {
        const closeCode = getWebSocketCloseCode(event);
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
    if (context == null || stopped) return;

    try {
      const shouldConnect = await runCatchUp(context);
      if (!shouldConnect || context == null || stopped) return;
      await emitState("connecting", reason);
      openWebSocket(context);
    } catch (error) {
      if (stopped || activeSignal()?.aborted === true) return;
      const expiredCursor = cursorExpiredError(error);
      if (expiredCursor != null) {
        await recoverFromCursorExpiry(expiredCursor);
        return;
      }
      if (isAuthFailureError(error)) {
        await refreshSessionAfterAuthFailure("catch_up_auth_failed", error);
        return;
      }
      reportDiagnostic("catch_up_failed", error);
      await emitState("failed", reason, error);
      scheduleReconnect("catch_up_failed");
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

  async function disconnect(reason = "disconnect"): Promise<void> {
    await emitState("disconnecting", reason);
    const activeSocket = socket;
    socket = null;
    if (activeSocket != null) {
      activeSocket.onopen = null;
      activeSocket.onmessage = null;
      activeSocket.onerror = null;
      activeSocket.onclose = null;
      activeSocket.close(1000, reason);
    }
  }

  async function stop(reason = "stop"): Promise<void> {
    if (stopped && context == null) return;
    stopped = true;
    clearReconnectTimer();
    cleanupExternalAbortListener();
    lastAuthFailure = null;
    controller?.abort();
    await disconnect(reason);
    await emitState("stopped", reason);
    context = null;
    controller = null;
  }

  async function start(nextContext: WorkspaceRealtimeRuntimeContext): Promise<void> {
    await stop("restart");
    context = nextContext;
    controller = new AbortController();
    stopped = false;
    reconnectAttempt = 0;
    lastAuthRefreshToken = null;
    lastAuthFailure = null;
    cursorRecoveryPromise = null;
    notificationsEnabled = false;
    lastCursor = options.cursorStorage.read(nextContext.owner);
    lastEpochVersion = lastCursor?.epochVersion ?? null;
    attachExternalAbort(nextContext.signal);
    await emitState("starting");
    await runCatchUpAndConnect("start");
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

  async function reconnect(reason = "reconnect"): Promise<void> {
    if (context == null || stopped) return;
    await disconnect(reason);
    await runCatchUpAndConnect(reason);
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
