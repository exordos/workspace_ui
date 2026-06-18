// Compatibility facade: stream unread math now lives in entities/unread-sync.
export {
  computeInstanceStreamUnreadCountWithMute,
  toSafeUnreadCount,
} from "~/entities/unread-sync/unread-instance-count-stream.lib";
export type { UnreadStreamMutePredicates as LayoutStreamUnreadMutePredicates } from "~/entities/unread-sync/unread-instance-count-stream.lib";
