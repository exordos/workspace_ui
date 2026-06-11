import { useCallback, useState } from "react";
import { runOptimisticTopicVisibilityLevelUpdate } from "~/features/mute-chat/mute-chat-topic-notification.optimistic.lib";
import { setTopicVisibilityLevel } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { TopicVisibilityLevel } from "~/features/mute-chat/notification-level.lib";
import { getNextTopicVisibilityLevel } from "~/features/mute-chat/notification-level.ui.lib";

interface UseTopicVisibilityLevelControlParams {
  streamId: number;
  topic: string;
  onError?: (retry: () => void) => void;
}

export function useTopicVisibilityLevelControl({
  streamId,
  topic,
  onError,
}: UseTopicVisibilityLevelControlParams) {
  const visibilityLevel = useMuteStore((s) => s.getTopicVisibilityLevel(streamId, topic));
  const streamMuted = useMuteStore((s) => s.isStreamMuted(streamId));
  const topicExplicitlyUnmuted = useMuteStore((s) => s.isTopicUnmuted(streamId, topic));
  const [pending, setPending] = useState(false);

  const applyLevel = useCallback(
    async (level: TopicVisibilityLevel) => {
      if (pending || level === visibilityLevel) return;
      setPending(true);
      try {
        const ok = await runOptimisticTopicVisibilityLevelUpdate({
          streamId,
          topic,
          level,
          request: () => setTopicVisibilityLevel(streamId, topic, level),
        });
        if (ok) return;
        onError?.(() => {
          void applyLevel(level);
        });
      } finally {
        setPending(false);
      }
    },
    [onError, pending, streamId, topic, visibilityLevel],
  );

  const cycleLevel = useCallback(() => {
    void applyLevel(
      getNextTopicVisibilityLevel(visibilityLevel, streamMuted, topicExplicitlyUnmuted),
    );
  }, [applyLevel, streamMuted, topicExplicitlyUnmuted, visibilityLevel]);

  return {
    visibilityLevel,
    streamMuted,
    topicExplicitlyUnmuted,
    pending,
    applyLevel,
    cycleLevel,
  };
}
