import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { normalizeMessageId, type MessageId } from "~/shared/lib/message-id.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";

function resolveInboxFocusMessageId(messageIds: MessageId[]): MessageId | null {
  const latest = messageIds[messageIds.length - 1];
  return normalizeMessageId(latest);
}

function withMessageFocus(route: string, focusMessageId: MessageId | null): string {
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
    const streamRoute = withCurrentOrgRoute(
      `/stream/${slug}/topic/${encodeURIComponent(encodeTopicForRoute(normalizedTopic))}`,
    );
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
