import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getWorkspaceRateLimitBlockedUntil,
  subscribeWorkspaceRateLimitGate,
} from "~/shared/lib/messenger-rate-limit-gate";

/**
 * Live countdown (seconds) until Messenger API rate-limit gate releases; zero when idle or offline.
 * Seconds are derived in effects only so render stays pure (no `Date.now()` during render).
 */
export function useWorkspaceRateLimitCountdownSeconds(online: boolean): number {
  const blockedUntil = useSyncExternalStore(
    subscribeWorkspaceRateLimitGate,
    getWorkspaceRateLimitBlockedUntil,
    getWorkspaceRateLimitBlockedUntil,
  );
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!online) {
      setSeconds(0);
      return;
    }

    const computeSeconds = (): number => {
      const until = getWorkspaceRateLimitBlockedUntil();
      return Math.max(0, Math.ceil((until - Date.now()) / 1000));
    };

    setSeconds(computeSeconds());

    const until = getWorkspaceRateLimitBlockedUntil();
    if (until <= Date.now()) {
      return;
    }

    const id = setInterval(() => {
      setSeconds(computeSeconds());
      if (Date.now() >= getWorkspaceRateLimitBlockedUntil()) {
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
