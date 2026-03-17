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
      type: "stream";
      streamId: number;
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
  if (activeTopic != null) {
    return { type: "topic", streamId: activeStreamId, topic: activeTopic };
  }
  return { type: "stream", streamId: activeStreamId };
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
