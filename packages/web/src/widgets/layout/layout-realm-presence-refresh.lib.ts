import { fetchRealmPresence } from "~/shared/api/messenger-users";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { applyRealmPresenceResponseToUsers } from "./layout-messenger-presence-apply.lib";

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
    .catch((err) => reportUnexpectedError("layout:realmPresence", err));
}
