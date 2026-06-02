/**
 * Shared abort/timeout setup for Zulip long-poll event requests.
 */

export interface LongPollAbortSetup {
  controller: AbortController;
  signal: AbortSignal;
  cleanup: () => void;
}

export function createLongPollAbortSetup(options?: {
  timeoutSec?: number;
  signal?: AbortSignal;
}): LongPollAbortSetup {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (options?.timeoutSec != null && options.timeoutSec > 0) {
    timeoutId = setTimeout(() => controller.abort(), options.timeoutSec * 1000);
  }

  const onAbort = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
    controller.abort();
  };
  if (options?.signal) {
    options.signal.addEventListener("abort", onAbort);
  }

  const cleanup = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
    if (options?.signal) {
      options.signal.removeEventListener("abort", onAbort);
    }
  };

  return { controller, signal: controller.signal, cleanup };
}
