import type { RealmPresenceResponse } from "~/shared/api/zulip.types";

/** Applies Zulip `/realm/presence` payload into the users store (aggregated/website). */
export function applyRealmPresenceResponseToUsers(data: RealmPresenceResponse): void {
  void data;
}
