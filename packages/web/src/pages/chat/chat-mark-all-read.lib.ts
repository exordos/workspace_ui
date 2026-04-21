interface ResolveMarkAllAsReadTargetOptions {
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStreamId: number | null;
  activeTopic: string | undefined;
}

export type MarkAllAsReadTarget =
  | {
      type: "dm";
      userIds: number[];
    }
  | {
      type: "topic";
      streamId: number;
      topic: string;
    };

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

export function collectUnreadMessageIds(
  messages: readonly {
    id: number;
    flags?: string[];
  }[],
): number[] {
  return messages
    .filter((message) => !(message.flags ?? []).includes("read"))
    .map((message) => message.id);
}

/** Message shape needed to decide if an id still counts as unread for optimistic read application. */
export interface MessageReadFlagSlice {
  id: number;
  flags?: string[];
}

/**
 * Resolves each message id against the in-memory store first, then the effective on-screen list
 * (e.g. IndexedDB hook merge). Skips ids that are already marked read.
 *
 * Store-only lookup fails when the visible list is ahead of or wider than `store.messages` — then
 * optimistic flag updates and chat-list decrements were skipped even after a successful API call.
 */
export function filterMessageIdsStillUnreadForOptimisticApply(
  messageIds: readonly number[],
  options: {
    storeMessages: readonly MessageReadFlagSlice[];
    effectiveMessages: readonly MessageReadFlagSlice[];
  },
): number[] {
  const { storeMessages, effectiveMessages } = options;
  const out: number[] = [];
  for (const messageId of messageIds) {
    const fromStore = storeMessages.find((m) => m.id === messageId);
    const message = fromStore ?? effectiveMessages.find((m) => m.id === messageId);
    if (message != null && !(message.flags ?? []).includes("read")) {
      out.push(messageId);
    }
  }
  return out;
}
