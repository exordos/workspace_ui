/**
 * Optional metadata for chat-list store patches — not persisted in Zustand state.
 *
 * Drives incremental updates of derived fields (sidebar totals, stream-topic index)
 * instead of full O(N) recompute in finalizeChatListPatch.
 */
export interface ChatListPatchMeta {
  /** Add to sidebarStreamsUnread instead of scanning all topics. */
  sidebarStreamsUnreadDelta?: number;
  /** Add to sidebarDmsUnread instead of scanning all DMs. */
  sidebarDmsUnreadDelta?: number;
  /** Full O(streams×topics + dms) unread sum from maps in the patch. */
  recomputeSidebarTotals?: boolean;
  /** Keep current sidebar unread scalars when maps change but unread did not. */
  preserveSidebarTotals?: boolean;
  /** Full rebuild streamTopicMessageIds from messageIdToLocation in the patch. */
  rebuildStreamTopicIndex?: boolean;
}
