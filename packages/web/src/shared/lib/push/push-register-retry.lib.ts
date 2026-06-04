/**
 * Exponential backoff retry for Zulip push token registration.
 */

const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface PushRegisterRetryResult {
  ok: boolean;
  lastError: string | null;
  attempts: number;
}

export async function registerPushTokenWithRetry(
  registerFn: (token: string) => Promise<boolean>,
  token: string,
  delaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): Promise<PushRegisterRetryResult> {
  const maxAttempts = delaysMs.length + 1;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const ok = await registerFn(token);
      if (ok) {
        return { ok: true, lastError: null, attempts: attempt + 1 };
      }
      lastError = "Push token registration rejected by server";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    const delay = delaysMs[attempt];
    if (delay != null) {
      await sleepMs(delay);
    }
  }

  return { ok: false, lastError, attempts: maxAttempts };
}
