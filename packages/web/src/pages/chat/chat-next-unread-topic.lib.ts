import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import type { TopicWithLast } from "~/shared/types/sidebar-chat";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";

interface ResolveNextUnreadTopicRouteOptions {
  streamId: number;
  streamName: string;
  currentTopic?: string;
  topics?: readonly TopicWithLast[];
}

export function resolveNextUnreadTopicRoute({
  streamId,
  streamName,
  currentTopic,
  topics,
}: ResolveNextUnreadTopicRouteOptions): string | null {
  const unreadTopics = (topics ?? []).filter((topic) => (topic.badge ?? 0) > 0);
  if (unreadTopics.length === 0) {
    return null;
  }

  const currentIndex = unreadTopics.findIndex((topic) => topic.subject === currentTopic);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % unreadTopics.length : 0;
  const nextTopic = unreadTopics[nextIndex];
  if (!nextTopic) {
    return null;
  }

  const streamSlug = slugForStream({ stream_id: streamId, name: streamName });
  return withCurrentOrgRoute(
    `/stream/${streamSlug}/topic/${encodeURIComponent(nextTopic.subject)}`,
  );
}
