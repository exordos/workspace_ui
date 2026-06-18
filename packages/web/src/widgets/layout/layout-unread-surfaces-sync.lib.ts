// Compatibility facade: shared unread sync now lives in entities/unread-sync.
export {
  syncUnreadSurfacesFromDelta,
  syncUnreadSurfacesFromEventDelta,
  syncUnreadSurfacesFromSnapshot,
} from "~/entities/unread-sync/unread-surfaces-sync.lib";
export type {
  SyncUnreadSurfacesFromDeltaOptions,
  SyncUnreadSurfacesFromSnapshotOptions,
  UnreadDeltaSyncSource as LayoutUnreadDeltaSyncSource,
  UnreadEventDeltaSyncSource as LayoutUnreadEventDeltaSyncSource,
  UnreadSurfaceSyncSource as LayoutUnreadSurfaceSyncSource,
} from "~/entities/unread-sync/unread-surfaces-sync.lib";
