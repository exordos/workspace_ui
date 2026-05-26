import { useCallback, useEffect, useRef } from "react";
import { createResilientInterval } from "~/shared/lib/visibility";
import { refreshRealmPresenceFromApi } from "./layout-realm-presence-refresh.lib";

export function useLayoutPresencePolling(options: { enabled: boolean; pollMs?: number }): void {
  const { enabled, pollMs = 90_000 } = options;
  const cancelledRef = useRef(false);

  const applyPresenceFromPoll = useCallback(() => {
    if (cancelledRef.current) return;
    refreshRealmPresenceFromApi({ isCancelled: () => cancelledRef.current });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) return;

    applyPresenceFromPoll();
    return createResilientInterval(applyPresenceFromPoll, pollMs);
  }, [enabled, pollMs, applyPresenceFromPoll]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);
}
