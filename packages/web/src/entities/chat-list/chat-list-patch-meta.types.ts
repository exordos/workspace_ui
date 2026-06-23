/**
 * Optional metadata for chat-list store patches — not persisted in Zustand state.
 *
 * Drives derived field updates that should not be inferred from a patch alone.
 */
export interface ChatListPatchMeta {
  /** Deprecated no-op: unread totals are server-owned and never derived from local maps. */
  recomputeSidebarTotals?: boolean;
  /** Keep current sidebar unread scalars when maps change but unread did not. */
  preserveSidebarTotals?: boolean;
  /** Full rebuild streamTopicMessageIds from messageIdToLocation in the patch. */
  rebuildStreamTopicIndex?: boolean;
}
