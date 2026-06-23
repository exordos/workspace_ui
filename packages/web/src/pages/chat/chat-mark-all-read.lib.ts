import { markDmAsRead, markTopicAsRead } from "~/shared/api/messenger-read-state";
import type { UserId } from "~/shared/lib/user-id.lib";

interface ResolveMarkAllAsReadTargetOptions {
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeStreamId: string | null;
  activeTopic: string | undefined;
}

export type MarkAllAsReadTarget =
  | {
      type: "dm";
      userIds: UserId[];
    }
  | {
      type: "topic";
      streamId: string;
      topic: string;
    };

// Only topic routes and DM routes support open-chat mark-all.
export function resolveMarkAllAsReadTarget({
  isDmView,
  activeDmUserIds,
  activeStreamId,
  activeTopic,
}: ResolveMarkAllAsReadTargetOptions): MarkAllAsReadTarget | null {
  if (isDmView) {
    if (activeDmUserIds == null || activeDmUserIds.length === 0) return null;
    return { type: "dm", userIds: activeDmUserIds };
  }

  if (activeStreamId == null) return null;
  // Stream-wide route (no topic in URL): do not resolve a mark-all target — reading is per-topic only.
  if (activeTopic == null) return null;
  return { type: "topic", streamId: activeStreamId, topic: activeTopic };
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
    return markDmAsRead(options.target.userIds);
  }
  return markTopicAsRead(options.target.streamId, options.target.topic);
}
