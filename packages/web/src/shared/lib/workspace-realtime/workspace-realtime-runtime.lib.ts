import {
  buildMessengerWebSocketProtocols,
  buildMessengerWebSocketUrl,
  normalizeWorkspaceWebSocketFrame,
  parseWorkspaceWebSocketFrame,
} from "~/shared/api/messenger-realtime.api";
import type { MessengerClientOptions } from "~/shared/api/messenger-realtime.api";
import type {
  WorkspaceMessengerEpochVersion,
  WorkspaceMessengerWebSocketFrameDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import { catchUpWorkspaceRealtime } from "./workspace-realtime-catch-up.lib";
import type {
  WorkspaceRealtimeCatchUpApplier,
  WorkspaceRealtimeCatchUpOptions,
} from "./workspace-realtime-catch-up.lib";
import type {
  WorkspaceRealtimeCursorOwner,
  WorkspaceRealtimeDurableCursorStorage,
} from "./workspace-realtime-cursor.lib";

export type WorkspaceRealtimeSurface = "active" | "background";

// Режим runtime нужен не UI, а диагностике: по нему видно, где realtime застрял.
export type WorkspaceRealtimeRuntimeMode =
  | "idle"
  | "starting"
  | "catching_up"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnecting"
  | "stopped"
  | "failed";

export type WorkspaceRealtimeEventSource = "catch_up" | "websocket";

// Причины skip намеренно общие для догонки и WebSocket, чтобы оба пути писали одинаковую диагностику.
export type WorkspaceRealtimeSkipReason =
  | "duplicate_epoch"
  | "unsupported_event"
  | "stale_owner"
  | "invalid_frame"
  | "background_apply_deferred"
  | "transport_stopped";

export interface WorkspaceRealtimeRuntimeOwner extends WorkspaceRealtimeCursorOwner {
  // runtimeGeneration отделяет старый socket той же org/project от нового после refresh/re-login.
  runtimeGeneration: number;
}

export interface WorkspaceRealtimeRuntimeContext {
  owner: WorkspaceRealtimeRuntimeOwner;
  // ownerKey не содержит runtimeGeneration: он задаёт durable scope cursor/store.
  // Само поколение проверяется отдельно через owner.
  ownerKey: string;
  surface: WorkspaceRealtimeSurface;
  signal?: AbortSignal;
}

export interface WorkspaceRealtimeEventContext extends WorkspaceRealtimeRuntimeContext {
  source: WorkspaceRealtimeEventSource;
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
  // Transport не знает про Zustand и UI. Applier - единственная точка записи в доменный слой.
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
  reason: WorkspaceRealtimeSkipReason | "websocket_error" | "catch_up_failed";
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

export interface WorkspaceRealtimeRuntimeOptions {
  clientOptions: MessengerClientOptions;
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
  options: MessengerClientOptions,
  signal: AbortSignal | undefined,
): MessengerClientOptions {
  // REST-запросы догонки должны отменяться вместе с тем же runtime, что держит socket.
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

export function createWorkspaceRealtimeNoopApplier(): WorkspaceRealtimeEventApplier {
  return {
    applyEvent() {
      // Phase 2 держит transport живым, но еще не пишет события в messengerStore.
      // Domain apply path появится отдельным слоем в Phase 3.
    },
    skipEvent() {
      // Background/unsupported события пока только двигают cursor в transport core.
    },
    onTransportStateChange() {
      // Диагностическое состояние можно подключить позже без смены transport API.
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
  let stopped = true;
  let removeExternalAbortListener: (() => void) | null = null;

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

  async function skipEvent(
    event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
    reason: WorkspaceRealtimeSkipReason,
    source: WorkspaceRealtimeEventSource,
  ): Promise<void> {
    if (context == null) return;
    await options.applier.skipEvent(event, reason, { ...context, source });
  }

  function advanceCursor(epochVersion: WorkspaceMessengerEpochVersion): boolean {
    if (context == null) return false;
    const previousEpochVersion =
      lastEpochVersion ??
      options.cursorStorage.read(context.owner) ??
      INVALID_FRAME_SYNTHETIC_EPOCH;
    const nextEpochVersion = Math.max(previousEpochVersion, epochVersion);
    // Durable cursor двигается в transport после успешного решения: apply или осознанный skip.
    options.cursorStorage.write(context.owner, nextEpochVersion);
    lastEpochVersion = nextEpochVersion;
    return nextEpochVersion > previousEpochVersion;
  }

  function sendAck(epochVersion: WorkspaceMessengerEpochVersion): void {
    socket?.send(JSON.stringify({ type: "ack", epoch_version: epochVersion }));
  }

  async function handleNormalizedEvent(event: WorkspaceRealtimeEvent): Promise<boolean> {
    if (context == null) return false;
    if (!isCurrentRuntime()) {
      // Событие от старого socket не применяем и cursor не двигаем: новый runtime сам сделает догонку.
      reportDiagnostic("stale_owner", event);
      return false;
    }

    const currentCursor = lastEpochVersion ?? options.cursorStorage.read(context.owner);
    if (currentCursor != null && event.epoch_version <= currentCursor) {
      await skipEvent(event, "duplicate_epoch", "websocket");
      advanceCursor(event.epoch_version);
      return false;
    }

    await options.applier.applyEvent(event, { ...context, source: "websocket" });
    return advanceCursor(event.epoch_version);
  }

  async function handleUnsupportedFrame(
    frame: WorkspaceMessengerWebSocketFrameDto,
  ): Promise<boolean> {
    if (context == null) return false;
    if ("epoch_version" in frame && typeof frame.epoch_version === "number") {
      const skippedEvent = { epoch_version: frame.epoch_version };
      const currentCursor = lastEpochVersion ?? options.cursorStorage.read(context.owner);
      const reason =
        currentCursor != null && frame.epoch_version <= currentCursor
          ? "duplicate_epoch"
          : "unsupported_event";
      // Если служебный/неподдержанный кадр несёт epoch, он всё равно участвует в порядке событий.
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

  async function handleRawFrame(raw: unknown): Promise<void> {
    try {
      const frame = parseWorkspaceWebSocketFrame(raw);
      if (frame.type === "connected" || frame.type === "hello") {
        return;
      }
      if (frame.type === "ping") {
        // Сервер присылает JSON ping как прикладной heartbeat, поэтому отвечаем JSON pong явно.
        socket?.send(
          JSON.stringify(frame.ts == null ? { type: "pong" } : { type: "pong", ts: frame.ts }),
        );
        return;
      }
      const event = normalizeWorkspaceWebSocketFrame(frame);
      if (event == null) {
        const advanced = await handleUnsupportedFrame(frame);
        if (advanced && "epoch_version" in frame && typeof frame.epoch_version === "number") {
          sendAck(frame.epoch_version);
        }
        return;
      }
      if (await handleNormalizedEvent(event)) {
        sendAck(event.epoch_version);
      }
    } catch (error) {
      await handleInvalidFrame(error);
    }
  }

  async function runCatchUp(activeContext: WorkspaceRealtimeRuntimeContext): Promise<boolean> {
    if (!isCurrentRuntime()) return false;
    await emitState("catching_up");

    // Догонка отдаёт события в тот же applier, но помечает source,
    // чтобы диагностика отличала догоняющую загрузку от live socket.
    const catchUpApplier: WorkspaceRealtimeCatchUpApplier = {
      applyEvent: (event, catchUpContext) =>
        options.applier.applyEvent(event, {
          owner: catchUpContext.owner,
          ownerKey: catchUpContext.ownerKey,
          surface: catchUpContext.surface,
          signal: catchUpContext.signal,
          source: "catch_up",
        }),
      skipEvent: (event, reason, catchUpContext) =>
        options.applier.skipEvent(event, reason, {
          owner: catchUpContext.owner,
          ownerKey: catchUpContext.ownerKey,
          surface: catchUpContext.surface,
          signal: catchUpContext.signal,
          source: "catch_up",
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

    lastEpochVersion = result.lastEpochVersion;
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
    // Открываем socket только после догонки от сохранённого cursor.
    // Иначе live-события могут прийти раньше пропущенных REST-событий.
    const currentCursor =
      lastEpochVersion ??
      options.cursorStorage.read(activeContext.owner) ??
      INVALID_FRAME_SYNTHETIC_EPOCH;
    const url = buildMessengerWebSocketUrl({
      baseUrl: options.webSocketBaseUrl,
      lastEpochVersion: currentCursor,
    });
    const protocols = buildMessengerWebSocketProtocols(options.clientOptions.accessToken ?? "");
    socket = webSocketFactory(url, protocols);

    socket.onopen = () => {
      reconnectAttempt = 0;
      void emitState("connected");
    };
    socket.onmessage = (event) => {
      void handleRawFrame(event.data);
    };
    socket.onerror = (event) => {
      reportDiagnostic("websocket_error", event);
    };
    socket.onclose = () => {
      socket = null;
      if (!stopped) {
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
    lastEpochVersion = options.cursorStorage.read(nextContext.owner);
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
