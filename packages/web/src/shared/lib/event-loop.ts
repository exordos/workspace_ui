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
import type { ZulipCredentials, ZulipEvent } from "~/shared/api/zulip.types";
import { createLogger } from "~/shared/lib/logger";
import { isOnline, waitForOnline, onReconnect } from "~/shared/lib/network";
import { onTabResume } from "~/shared/lib/visibility";

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
  "user_topic",
] as const;

const RETRY_PAUSE_MS = 2000;
const MAX_RETRY_PAUSE_MS = 30000;
const DEFAULT_LONGPOLL_TIMEOUT_SEC = 90;

export interface StartZulipEventLoopOptions {
  onEvent: (event: ZulipEvent) => void;
  onBadQueue?: () => void;
  onReconnect?: () => void;
  /** Called when a queue is registered (for cleanup on logout/instance switch). */
  onQueueRegistered?: (queueId: string) => void;
  signal?: AbortSignal;
  eventTypes?: string[];
}

export interface StartZulipEventLoopForCredentialsOptions extends StartZulipEventLoopOptions {
  credentials: ZulipCredentials;
}

interface EventLoopTransport {
  registerQueue: (eventTypes: string[]) => ReturnType<typeof registerQueue>;
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
    onReconnect: onReconnectCb,
    onQueueRegistered,
    signal,
    eventTypes = [...DEFAULT_EVENT_TYPES],
  } = options;
  const queueState: { id: string | null } = { id: null };
  let lastEventId = -1;
  let longpollTimeoutSec = DEFAULT_LONGPOLL_TIMEOUT_SEC;
  let retryCount = 0;
  let wakeUpResolve: (() => void) | null = null;

  function setQueueId(nextQueueId: string): void {
    queueState.id = nextQueueId;
  }

  function clearQueueId(): void {
    queueState.id = null;
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

  const unsubResume = onTabResume(() => {
    log.info("Tab resumed, nudging event loop");
    wake();
  });

  const unsubReconnect = onReconnect(() => {
    log.info("Network back online, nudging event loop");
    retryCount = 0;
    wake();
  });

  let cleanedUp = false;
  let removeAbortListener: (() => void) | null = null;

  const cleanupLoop = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    unsubResume();
    unsubReconnect();
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

  async function runLoop(): Promise<void> {
    while (true) {
      if (signal?.aborted) return;

      // Wait for network if offline — no wasted requests
      if (!isOnline()) {
        log.info("Offline, waiting for network...");
        await waitForOnline();
        if (signal?.aborted) return;
        log.info("Network restored, continuing");
        clearQueueId();
        retryCount = 0;
      }

      if (queueState.id == null) {
        try {
          log.info("Registering event queue");
          const reg = await transport.registerQueue(eventTypes);
          const nextQueueId = reg.queue_id;
          setQueueId(nextQueueId);
          lastEventId = reg.last_event_id;
          longpollTimeoutSec =
            reg.event_queue_longpoll_timeout_seconds ?? DEFAULT_LONGPOLL_TIMEOUT_SEC;
          retryCount = 0;
          log.info("Queue registered", { queueId: nextQueueId, lastEventId });
          onQueueRegistered?.(nextQueueId);
          onReconnectCb?.();
        } catch {
          if (signal?.aborted) return;
          if (!isOnline()) continue;
          const delay = getRetryDelay();
          log.warn("Queue registration failed, retrying", { delayMs: delay, retryCount });
          await interruptibleSleep(delay);
          continue;
        }
      }

      try {
        const activeQueueId = queueState.id;
        if (activeQueueId == null) {
          continue;
        }

        const result = await transport.getEvents(activeQueueId, lastEventId, {
          timeoutSec: longpollTimeoutSec,
          signal,
        });
        if (signal?.aborted) return;

        retryCount = 0;

        if (result.result === "error" && result.code === "BAD_EVENT_QUEUE_ID") {
          log.warn("BAD_EVENT_QUEUE_ID, re-registering");
          clearQueueId();
          onBadQueue?.();
          continue;
        }

        if (result.events) {
          for (const ev of result.events) {
            handleEvent(ev);
          }
        }
      } catch (err) {
        if (signal?.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("abort") || msg === "The operation was aborted") return;

        if (!isOnline()) {
          log.info("Request failed while offline, will wait for network");
          clearQueueId();
          continue;
        }

        const delay = getRetryDelay();
        log.warn("Event poll failed, retrying", { error: msg, delayMs: delay });
        clearQueueId();
        await interruptibleSleep(delay);
      }
    }
  }

  void runLoop()
    .catch(() => {})
    .finally(() => {
      cleanupLoop();
    });
}

export function startZulipEventLoop(options: StartZulipEventLoopOptions): void {
  startZulipEventLoopWithTransport(
    {
      registerQueue: (eventTypes) => registerQueue(eventTypes),
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
      registerQueue: (eventTypes) => registerQueueForCredentials(credentials, eventTypes),
      getEvents: (queueId, lastEventId, requestOptions) =>
        getEventsForCredentials(credentials, queueId, lastEventId, requestOptions),
    },
    loopOptions,
  );
}
