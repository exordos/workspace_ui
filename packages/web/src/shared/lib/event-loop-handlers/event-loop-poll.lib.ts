/**
 * Long-poll iteration helpers for `event-loop.ts` (keeps `runLoop` cognitive complexity low).
 */
import type { ZulipEvent } from "~/shared/api/zulip.types";
import {
  isLikelyNetworkError,
  noteApiTransportFailure,
  noteApiTransportSuccess,
} from "~/shared/lib/connection-health";
import { createLogger } from "~/shared/lib/logger";
import { isOnline, waitForOnline } from "~/shared/lib/network";
import { shouldReRegisterEventQueueFromPollResponse } from "~/shared/lib/zulip-event-queue-errors.lib";

const log = createLogger("realtime");

export function shouldExitEventLoop(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

export async function waitForNetworkAtLoopStart(options: {
  signal?: AbortSignal;
  onRestored: () => void;
}): Promise<"exit" | "continue"> {
  if (isOnline()) return "continue";
  log.info("Offline, waiting for network...");
  await waitForOnline();
  if (shouldExitEventLoop(options.signal)) return "exit";
  log.info("Network restored, continuing");
  options.onRestored();
  return "continue";
}

export function isAbortLikePollError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") {
    return true;
  }
  if (err instanceof Error) {
    return err.name === "AbortError" || err.message.includes("abort");
  }
  return false;
}

export type EventPollCatchDisposition =
  | "exit"
  | "continue"
  | "clear_queue_continue"
  | "clear_queue_wake_continue"
  | "re_register";

export function resolveEventPollCatchDisposition(
  err: unknown,
  options: { signal?: AbortSignal; hasQueueId: boolean },
): EventPollCatchDisposition {
  if (shouldExitEventLoop(options.signal)) return "exit";

  if (isAbortLikePollError(err)) {
    return options.hasQueueId ? "clear_queue_continue" : "continue";
  }

  if (!isOnline()) {
    log.info("Request failed while offline, will wait for network");
    return "clear_queue_continue";
  }

  if (isLikelyNetworkError(err)) {
    log.info("Transport error during event poll, will re-register");
    noteApiTransportFailure(err);
    return "clear_queue_wake_continue";
  }

  noteApiTransportFailure(err);
  return "re_register";
}

export interface PollZulipEventsOptions {
  signal?: AbortSignal;
  queueId: string;
  lastEventId: number;
  longpollTimeoutSec: number;
  getEvents: (
    queueId: string,
    lastEventId: number,
    options: { timeoutSec?: number; signal?: AbortSignal },
  ) => Promise<{ events?: ZulipEvent[] }>;
  setActivePollAbort: (controller: AbortController | null) => void;
  abortActivePoll: () => void;
}

export async function pollZulipEventsOnce(
  options: PollZulipEventsOptions,
): Promise<{ events?: ZulipEvent[] }> {
  const {
    signal,
    queueId,
    lastEventId,
    longpollTimeoutSec,
    getEvents,
    setActivePollAbort,
    abortActivePoll,
  } = options;

  abortActivePoll();
  const pollAbort = new AbortController();
  setActivePollAbort(pollAbort);
  const onOuterAbort = () => {
    pollAbort.abort();
  };
  signal?.addEventListener("abort", onOuterAbort);

  try {
    return await getEvents(queueId, lastEventId, {
      timeoutSec: longpollTimeoutSec,
      signal: pollAbort.signal,
    });
  } finally {
    signal?.removeEventListener("abort", onOuterAbort);
    setActivePollAbort(null);
  }
}

export async function applySuccessfulPollResult(options: {
  result: { events?: ZulipEvent[] };
  onReRegister: () => Promise<void>;
  onEvents: (events: ZulipEvent[]) => void;
  resetRetryCount: () => void;
}): Promise<"continue" | "handled"> {
  if (shouldReRegisterEventQueueFromPollResponse(options.result)) {
    await options.onReRegister();
    return "handled";
  }

  options.resetRetryCount();
  if (options.result.events) {
    options.onEvents(options.result.events);
  }
  noteApiTransportSuccess();
  return "continue";
}

export interface RunEventLoopPollCycleOptions {
  signal?: AbortSignal;
  getQueueId: () => string | null;
  lastEventId: number;
  longpollTimeoutSec: number;
  getEvents: PollZulipEventsOptions["getEvents"];
  setActivePollAbort: PollZulipEventsOptions["setActivePollAbort"];
  abortActivePoll: PollZulipEventsOptions["abortActivePoll"];
  onReRegister: () => Promise<void>;
  onEvents: (events: ZulipEvent[]) => void;
  resetRetryCount: () => void;
  clearQueueId: () => void;
  wake: () => void;
  resetRetryCountOnTransportError: () => void;
}

/** One long-poll attempt for an active queue (success path + catch dispositions). */
export async function runEventLoopPollCycle(
  options: RunEventLoopPollCycleOptions,
): Promise<"exit" | "continue"> {
  const activeQueueId = options.getQueueId();
  if (activeQueueId == null) return "continue";

  try {
    const result = await pollZulipEventsOnce({
      signal: options.signal,
      queueId: activeQueueId,
      lastEventId: options.lastEventId,
      longpollTimeoutSec: options.longpollTimeoutSec,
      getEvents: options.getEvents,
      setActivePollAbort: options.setActivePollAbort,
      abortActivePoll: options.abortActivePoll,
    });

    if (shouldExitEventLoop(options.signal)) return "exit";

    const pollOutcome = await applySuccessfulPollResult({
      result,
      onReRegister: options.onReRegister,
      onEvents: options.onEvents,
      resetRetryCount: options.resetRetryCount,
    });
    if (pollOutcome === "handled") {
      return "continue";
    }
    return "continue";
  } catch (err) {
    const disposition = resolveEventPollCatchDisposition(err, {
      signal: options.signal,
      hasQueueId: options.getQueueId() != null,
    });
    if (disposition === "exit") return "exit";
    if (disposition === "continue") return "continue";
    if (disposition === "clear_queue_continue") {
      options.clearQueueId();
      return "continue";
    }
    if (disposition === "clear_queue_wake_continue") {
      options.clearQueueId();
      options.resetRetryCountOnTransportError();
      options.wake();
      return "continue";
    }
    await options.onReRegister();
    return "continue";
  }
}
