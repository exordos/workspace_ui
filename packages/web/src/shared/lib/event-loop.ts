/**
 * Long-poll event loop for Zulip Real-Time Events API.
 *
 * Network awareness:
 * - Detects offline state, pauses retries (no wasted requests)
 * - On reconnect: immediately re-registers queue and resumes
 *
 * Background tab resilience:
 * - Long-poll fetch works in background (not throttled)
 * - On tab resume: nudges event loop to continue without timer delay
 */
import {
  getEvents,
  getEventsForCredentials,
  registerQueue,
  registerQueueForCredentials,
} from "~/shared/api/zulip-queue";
import type { RegisterQueueResult, ZulipCredentials, ZulipEvent } from "~/shared/api/zulip.types";
import {
  isLikelyNetworkError,
  noteApiTransportFailure,
  noteApiTransportSuccess,
} from "~/shared/lib/connection-health";
import {
  runEventLoopPollCycle,
  shouldExitEventLoop,
  waitForNetworkAtLoopStart,
} from "~/shared/lib/event-loop-handlers/event-loop-poll.lib";
import { attachEventLoopLifecycle } from "~/shared/lib/event-loop-lifecycle.lib";
import { createLogger } from "~/shared/lib/logger";
import { isOnline, waitForOnline } from "~/shared/lib/network";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  clearZulipEventQueueId,
  setZulipEventQueueId,
} from "~/shared/lib/zulip-event-queue-registry.lib";

const log = createLogger("realtime");

const DEFAULT_EVENT_TYPES = [
  "message",
  "update_message_flags",
  "reaction",
  "delete_message",
  "typing",
  "update_message",
  "presence",
  "user_status",
  "subscription",
  /** Stream lifecycle events so renames and deletes update UI without reload. */
  "stream",
  "user_topic",
  "user_settings",
] as const;

const RETRY_PAUSE_MS = 2000;
const MAX_RETRY_PAUSE_MS = 30000;
const DEFAULT_LONGPOLL_TIMEOUT_SEC = 90;

export interface StartZulipEventLoopOptions {
  onEvent: (event: ZulipEvent) => void;
  onBadQueue?: () => void;
  /** Called after the event queue is registered or re-registered successfully. */
  onQueueReady?: () => void;
  /** Called when the tab resumes after being hidden (in addition to waking the poll loop). */
  onTabStaleResume?: (hiddenDurationMs: number) => void;
  /** Called when a queue is registered (for cleanup on logout/instance switch). */
  onQueueRegistered?: (queueId: string, registration?: RegisterQueueResult) => void;
  /** Instance that owns this loop — used to expose `queue_id` for message send on that org. */
  instanceId?: string;
  signal?: AbortSignal;
  eventTypes?: string[];
  fetchEventTypes?: string[];
}

export interface StartZulipEventLoopForCredentialsOptions extends StartZulipEventLoopOptions {
  credentials: ZulipCredentials;
}

interface EventLoopTransport {
  registerQueue: (
    eventTypes: string[],
    fetchEventTypes?: string[],
  ) => ReturnType<typeof registerQueue>;
  getEvents: (
    queueId: string,
    lastEventId: number,
    options?: { timeoutSec?: number; signal?: AbortSignal },
  ) => ReturnType<typeof getEvents>;
}

function startZulipEventLoopWithTransport(
  transport: EventLoopTransport,
  options: StartZulipEventLoopOptions,
): void {
  const {
    onEvent,
    onBadQueue,
    onQueueReady,
    onTabStaleResume,
    onQueueRegistered,
    instanceId,
    signal,
    eventTypes = [...DEFAULT_EVENT_TYPES],
    fetchEventTypes,
  } = options;
  const registryInstanceId = instanceId?.trim() ?? "";
  const onQueueReadyCb = onQueueReady;
  const queueState: { id: string | null } = { id: null };
  let lastEventId = -1;
  let longpollTimeoutSec = DEFAULT_LONGPOLL_TIMEOUT_SEC;
  let retryCount = 0;
  let wakeUpResolve: (() => void) | null = null;
  let activePollAbort: AbortController | null = null;

  function setQueueId(nextQueueId: string): void {
    queueState.id = nextQueueId;
    if (registryInstanceId.length > 0) {
      setZulipEventQueueId(registryInstanceId, nextQueueId);
    }
  }

  function clearQueueId(): void {
    queueState.id = null;
    if (registryInstanceId.length > 0) {
      clearZulipEventQueueId(registryInstanceId);
    }
  }

  function handleEvent(event: ZulipEvent): void {
    lastEventId = Math.max(lastEventId, event.id);
    if (event.type === "heartbeat") return;
    onEvent(event);
  }

  function wake(): void {
    if (wakeUpResolve) {
      wakeUpResolve();
      wakeUpResolve = null;
    }
  }

  function abortActivePoll(): void {
    activePollAbort?.abort();
    activePollAbort = null;
  }

  /** Drop stale queue + interrupt in-flight long-poll so register/events resume promptly. */
  function nudgeEventLoopAfterNetworkRestore(reason: "reconnect" | "online"): void {
    log.info("Network restored, nudging event loop", { reason });
    retryCount = 0;
    clearQueueId();
    abortActivePoll();
    wake();
  }

  /** Abort hung long-poll immediately — do not wait for server timeout (up to 90s). */
  function pauseEventLoopForOffline(): void {
    log.info("Network offline, interrupting event loop");
    retryCount = 0;
    abortActivePoll();
    wake();
  }

  const detachLifecycle = attachEventLoopLifecycle({
    onTabResume: (hiddenDurationMs) => {
      log.info("Tab resumed, nudging event loop", { hiddenDurationMs });
      wake();
      onTabStaleResume?.(hiddenDurationMs);
    },
    onReconnect: () => {
      nudgeEventLoopAfterNetworkRestore("reconnect");
    },
    onOnline: () => {
      // onReconnect already nudges after offline→online; skip duplicate wake.
    },
    onOffline: () => {
      pauseEventLoopForOffline();
    },
  });

  let cleanedUp = false;
  let removeAbortListener: (() => void) | null = null;

  const cleanupLoop = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    detachLifecycle();
    abortActivePoll();
    clearQueueId();
    removeAbortListener?.();
    removeAbortListener = null;
    wake();
  };

  if (signal) {
    const handleAbort = () => {
      cleanupLoop();
    };
    signal.addEventListener("abort", handleAbort);
    removeAbortListener = () => {
      signal.removeEventListener("abort", handleAbort);
    };
  }

  function interruptibleSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      wakeUpResolve = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  function getRetryDelay(): number {
    const delay = Math.min(RETRY_PAUSE_MS * Math.pow(1.5, retryCount), MAX_RETRY_PAUSE_MS);
    retryCount++;
    return delay;
  }

  async function registerEventQueue(): Promise<boolean> {
    try {
      log.info("Registering event queue");
      // Register returns sidebar bootstrap metadata together with queue_id.
      const reg = await transport.registerQueue(eventTypes, fetchEventTypes);
      const nextQueueId = reg.queue_id;
      setQueueId(nextQueueId);
      lastEventId = reg.last_event_id;
      longpollTimeoutSec = reg.event_queue_longpoll_timeout_seconds ?? DEFAULT_LONGPOLL_TIMEOUT_SEC;
      retryCount = 0;
      log.info("Queue registered", { queueId: nextQueueId, lastEventId });
      onQueueRegistered?.(nextQueueId, reg);
      onQueueReadyCb?.();
      noteApiTransportSuccess();
      return true;
    } catch (err) {
      if (signal?.aborted) return false;
      if (!isOnline()) {
        await waitForOnline();
        if (signal?.aborted) return false;
        return false;
      }
      noteApiTransportFailure(err);
      const delay = isLikelyNetworkError(err) ? RETRY_PAUSE_MS : getRetryDelay();
      if (isLikelyNetworkError(err)) {
        retryCount = 0;
      }
      log.warn("Queue registration failed, retrying", { delayMs: delay, retryCount });
      await interruptibleSleep(delay);
      return false;
    }
  }

  async function reRegisterEventQueueAfterPollFailure(): Promise<void> {
    log.warn("Event poll failed, re-registering queue");
    clearQueueId();
    retryCount = 0;
    onBadQueue?.();
    wake();
    await registerEventQueue();
  }

  async function runLoop(): Promise<void> {
    while (true) {
      if (shouldExitEventLoop(signal)) return;

      const networkWait = await waitForNetworkAtLoopStart({
        signal,
        onRestored: () => {
          clearQueueId();
          retryCount = 0;
        },
      });
      if (networkWait === "exit") return;

      if (queueState.id == null) {
        await registerEventQueue();
        continue;
      }

      const pollCycle = await runEventLoopPollCycle({
        signal,
        getQueueId: () => queueState.id,
        lastEventId,
        longpollTimeoutSec,
        getEvents: transport.getEvents,
        setActivePollAbort: (controller) => {
          activePollAbort = controller;
        },
        abortActivePoll,
        onReRegister: reRegisterEventQueueAfterPollFailure,
        onEvents: (events) => {
          for (const ev of events) {
            handleEvent(ev);
          }
        },
        resetRetryCount: () => {
          retryCount = 0;
        },
        clearQueueId,
        wake,
        resetRetryCountOnTransportError: () => {
          retryCount = 0;
        },
      });
      if (pollCycle === "exit") return;
    }
  }

  void runLoop()
    .catch((err) => {
      reportUnexpectedError("realtime", err, { phase: "event-loop-exit" });
    })
    .finally(() => {
      cleanupLoop();
    });
}

export function startZulipEventLoop(options: StartZulipEventLoopOptions): void {
  startZulipEventLoopWithTransport(
    {
      registerQueue: (eventTypes, fetchEventTypes) => registerQueue(eventTypes, fetchEventTypes),
      getEvents: (queueId, lastEventId, requestOptions) =>
        getEvents(queueId, lastEventId, requestOptions),
    },
    options,
  );
}

export function startZulipEventLoopForCredentials(
  options: StartZulipEventLoopForCredentialsOptions,
): void {
  const { credentials, ...loopOptions } = options;
  startZulipEventLoopWithTransport(
    {
      registerQueue: (eventTypes, fetchEventTypes) =>
        registerQueueForCredentials(credentials, eventTypes, fetchEventTypes),
      getEvents: (queueId, lastEventId, requestOptions) =>
        getEventsForCredentials(credentials, queueId, lastEventId, requestOptions),
    },
    loopOptions,
  );
}
