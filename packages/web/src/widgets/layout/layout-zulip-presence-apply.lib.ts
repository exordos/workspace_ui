import { useUsersStore } from "~/entities/user/user.model";
import type { RealmPresenceResponse } from "~/shared/api/zulip.types";

/** Applies Zulip `/realm/presence` payload into the users store (aggregated/website). */
export function applyRealmPresenceResponseToUsers(data: RealmPresenceResponse): void {
  if (data.result === "error" || !data.presences) return;
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
}
