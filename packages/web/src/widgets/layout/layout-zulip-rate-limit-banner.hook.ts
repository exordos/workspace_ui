import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getZulipRateLimitBlockedUntil,
  subscribeZulipRateLimitGate,
} from "~/shared/lib/zulip-rate-limit-gate";

/**
 * Live countdown (seconds) until Zulip API rate-limit gate releases; zero when idle or offline.
 * Seconds are derived in effects only so render stays pure (no `Date.now()` during render).
 */
export function useZulipRateLimitCountdownSeconds(online: boolean): number {
  const blockedUntil = useSyncExternalStore(
    subscribeZulipRateLimitGate,
    getZulipRateLimitBlockedUntil,
    getZulipRateLimitBlockedUntil,
  );
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!online) {
      setSeconds(0);
      return;
    }

    const computeSeconds = (): number => {
      const until = getZulipRateLimitBlockedUntil();
      return Math.max(0, Math.ceil((until - Date.now()) / 1000));
    };

    setSeconds(computeSeconds());

    const until = getZulipRateLimitBlockedUntil();
    if (until <= Date.now()) {
      return;
    }

    const id = setInterval(() => {
      setSeconds(computeSeconds());
      if (Date.now() >= getZulipRateLimitBlockedUntil()) {
        clearInterval(id);
      }
    }, 1000);

    return () => {
      clearInterval(id);
    };
  }, [online, blockedUntil]);

  if (!online) {
    return 0;
  }
  return seconds;
}
