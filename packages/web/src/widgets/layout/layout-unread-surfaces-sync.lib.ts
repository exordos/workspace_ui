// Compatibility facade: shared unread sync now lives in entities/unread-sync.
export {
  syncUnreadSurfacesFromDelta,
  syncUnreadSurfacesFromEventDelta,
} from "~/entities/unread-sync/unread-surfaces-sync.lib";
export type {
  SyncUnreadSurfacesFromDeltaOptions,
  UnreadDeltaSyncSource as LayoutUnreadDeltaSyncSource,
  UnreadEventDeltaSyncSource as LayoutUnreadEventDeltaSyncSource,
} from "~/entities/unread-sync/unread-surfaces-sync.lib";
