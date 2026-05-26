import { fetchRealmPresence } from "~/shared/api/zulip";
import { applyRealmPresenceResponseToUsers } from "./layout-zulip-presence-apply.lib";

export interface RefreshRealmPresenceOptions {
  isCancelled?: () => boolean;
}

/** Fetches `/realm/presence` and merges into the users store. */
export function refreshRealmPresenceFromApi(options?: RefreshRealmPresenceOptions): void {
  void fetchRealmPresence()
    .then((data) => {
      if (options?.isCancelled?.()) return;
      applyRealmPresenceResponseToUsers(data);
    })
    .catch(() => {});
}
