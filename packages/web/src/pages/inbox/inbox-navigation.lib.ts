import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";

function resolveInboxFocusMessageId(messageIds: number[]): number | null {
  let maxId: number | null = null;
  for (const id of messageIds) {
    if (!Number.isInteger(id) || id <= 0) continue;
    maxId = maxId == null ? id : Math.max(maxId, id);
  }
  return maxId;
}

function withMessageFocus(route: string, focusMessageId: number | null): string {
  if (focusMessageId == null) return route;
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}msg=${focusMessageId}`;
}

export function buildInboxEntryRoute(entry: InboxEntry): string | null {
  const focusMessageId = resolveInboxFocusMessageId(entry.messageIds);

  if (entry.streamId != null) {
    const slug = slugForStream({
      stream_id: entry.streamId,
      name: entry.streamName ?? String(entry.streamId),
    });
    const normalizedTopic = entry.topic?.trim() ?? "";
    const streamRoute =
      normalizedTopic.length > 0
        ? withCurrentOrgRoute(`/stream/${slug}/topic/${encodeURIComponent(normalizedTopic)}`)
        : withCurrentOrgRoute(`/stream/${slug}`);
    return withMessageFocus(streamRoute, focusMessageId);
  }

  if (entry.dmSlug != null) {
    return withMessageFocus(withCurrentOrgRoute(`/dm/${entry.dmSlug}`), focusMessageId);
  }

  if (entry.senderId != null) {
    return withMessageFocus(withCurrentOrgRoute(`/dm/${entry.senderId}`), focusMessageId);
  }

  return null;
}
