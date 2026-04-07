import { useCallback, useEffect, useRef } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchRealmPresence } from "~/shared/api/zulip";
import { createResilientInterval } from "~/shared/lib/visibility";

export function useLayoutPresencePolling(options: {
  enabled: boolean;
  pollMs?: number;
}): void {
  const { enabled, pollMs = 90_000 } = options;
  const cancelledRef = useRef(false);

  const applyPresence = useCallback(() => {
    if (cancelledRef.current) return;
    void fetchRealmPresence()
      .then((data) => {
        if (cancelledRef.current || data.result === "error" || !data.presences) return;
        const store = useUsersStore.getState();
        for (const [email, entry] of Object.entries(data.presences)) {
          const agg = entry.aggregated ?? entry.website;
          if (agg?.status != null && agg?.timestamp != null) {
            store.setPresenceByEmail(email, {
              status: agg.status === "idle" ? "idle" : "active",
              timestamp: agg.timestamp,
            });
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) return;

    applyPresence();
    return createResilientInterval(applyPresence, pollMs);
  }, [enabled, pollMs, applyPresence]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);
}

