/**
 * Hydrates missing stream/topic sidebar previews from register unread snapshot.
 *
 * Why: register `unread_snapshot` is authoritative for counts, but contains only message ids.
 * For chats whose latest activity is older than the global 5000-message preview window,
 * sidebar rows can show unread badges while lacking preview text and timestamps used for sorting.
 *
 * Network preview repair was removed with the legacy Zulip API cutover. The pure id resolver stays
 * for local callers/tests; the hydrate entrypoint is now a controlled no-op.
 */
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

function maxPositiveInt(values: readonly number[]): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (!Number.isInteger(v) || v <= 0) continue;
    if (max == null || v > max) max = v;
  }
  return max;
}

function hasNonEmptyPreviewText(value: string | undefined): boolean {
  return (value?.trim() ?? "").length > 0;
}

function shouldHydrateBucketPreview(
  streamsMap: Map<number, StreamEntryInternal>,
  bucket: { streamId: number; topic: string },
): boolean {
  const stream = streamsMap.get(bucket.streamId);
  const topicKey = normalizeTopicForIdentity(bucket.topic);
  const topic = stream?.topics.get(topicKey);

  // If the topic row is missing or has empty preview text — hydrate.
  if (!hasNonEmptyPreviewText(topic?.lastMessage)) return true;

  // If topic has preview but stream-level preview text is empty — hydrate.
  // (Stream preview should reflect latest topic activity.)
  if (!hasNonEmptyPreviewText(stream?.lastMessage)) return true;

  return false;
}

export function resolveLatestUnreadMessageIdsForMissingPreviews(
  snapshot: ZulipUnreadMessagesSnapshot,
  streamsMap: Map<number, StreamEntryInternal>,
): number[] {
  const ids = new Set<number>();
  for (const bucket of snapshot.streams) {
    if (!Number.isInteger(bucket.streamId) || bucket.streamId <= 0) continue;
    if (!Array.isArray(bucket.unreadMessageIds) || bucket.unreadMessageIds.length === 0) continue;
    if (
      !shouldHydrateBucketPreview(streamsMap, { streamId: bucket.streamId, topic: bucket.topic })
    ) {
      continue;
    }
    const latest = maxPositiveInt(bucket.unreadMessageIds);
    if (latest != null) {
      ids.add(latest);
    }
  }
  return [...ids];
}

/**
 * Legacy unread preview hydrate no longer performs network repair. Sidebar counts stay intact;
 * preview text is filled only by local/Workspace-native data paths.
 */
export function hydrateStreamSidebarPreviewsFromUnreadSnapshot(
  snapshot: ZulipUnreadMessagesSnapshot | null | undefined,
  cancelled?: () => boolean,
): Promise<void> {
  void snapshot;
  void cancelled;
  return Promise.resolve();
}
