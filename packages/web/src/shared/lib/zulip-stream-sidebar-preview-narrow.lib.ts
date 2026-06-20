/**
 * Zulip GET /messages narrows for metadata-first stream sidebar preview (channels only, no DMs).
 */
import type { ZulipMessagesNarrowClause } from "~/shared/lib/zulip-topic-narrow.lib";

/** Excludes direct messages from a narrow (`-is:dm`). */
export const EXCLUDE_DM_NARROW_CLAUSE: ZulipMessagesNarrowClause = {
  negated: true,
  operator: "is",
  operand: "dm",
};

/** Narrows for stream sidebar preview: optional unread filter + always exclude DMs. */
export function buildStreamSidebarPreviewNarrow(unreadOnly: boolean): ZulipMessagesNarrowClause[] {
  if (unreadOnly) {
    return [{ operator: "is", operand: "unread" }, EXCLUDE_DM_NARROW_CLAUSE];
  }
  return [EXCLUDE_DM_NARROW_CLAUSE];
}
