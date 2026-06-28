import { markDmAsRead, markTopicAsRead } from "~/shared/api/messenger-read-state";
import type { UserId } from "~/shared/lib/user-id.lib";

interface ResolveMarkAllAsReadTargetOptions {
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeDmStreamId?: string | null;
  activeStreamId: string | null;
  activeTopic: string | undefined;
  activeTopicUuid?: string | null;
}

export type MarkAllAsReadTarget =
  | {
      type: "dm";
      userIds: UserId[];
      streamId?: string;
    }
  | {
      type: "topic";
      streamId: string;
      topic: string;
      topicUuid?: string;
    };

// Only topic routes and DM routes support open-chat mark-all.
export function resolveMarkAllAsReadTarget({
  isDmView,
  activeDmUserIds,
  activeDmStreamId,
  activeStreamId,
  activeTopic,
  activeTopicUuid,
}: ResolveMarkAllAsReadTargetOptions): MarkAllAsReadTarget | null {
  if (isDmView) {
    const userIds = activeDmUserIds ?? [];
    if (userIds.length === 0 && activeDmStreamId == null) return null;
    return {
      type: "dm",
      userIds,
      ...(activeDmStreamId != null ? { streamId: activeDmStreamId } : {}),
    };
  }

  if (activeStreamId == null) return null;
  // Stream-wide route (no topic in URL): do not resolve a mark-all target — reading is per-topic only.
  if (activeTopic == null) return null;
  return {
    type: "topic",
    streamId: activeStreamId,
    topic: activeTopic,
    ...(activeTopicUuid != null ? { topicUuid: activeTopicUuid } : {}),
  };
}

export interface ApplyOpenChatMarkAllAsReadOptions {
  target: MarkAllAsReadTarget;
  currentUserId: UserId | null;
}

/** Marks the open chat read through the server-owned target API. */
export async function applyOpenChatMarkAllAsRead(
  options: ApplyOpenChatMarkAllAsReadOptions,
): Promise<boolean> {
  if (options.target.type === "dm") {
    return markDmAsRead(options.target.userIds, options.target.streamId);
  }
  return markTopicAsRead(options.target.streamId, options.target.topic, options.target.topicUuid);
}
