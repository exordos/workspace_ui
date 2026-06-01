import React, { useCallback, useState } from "react";
import {
  muteTopic,
  unmuteTopic,
  unmuteTopicInMutedStream,
} from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { runOptimisticTopicVisibilityUpdate } from "~/features/mute-chat/mute-chat.optimistic.lib";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";

interface TopicMuteButtonProps {
  streamId: number;
  topic: string;
  onMuteError?: (retry: () => void) => void;
}

export const TopicMuteButton = React.memo<TopicMuteButtonProps>(
  ({ streamId, topic, onMuteError }) => {
    const isEffectivelyMuted = useMuteStore((s) => s.isEffectivelyMuted(streamId, topic));
    const [pending, setPending] = useState(false);

    const runToggle = useCallback(async () => {
      if (pending) return;

      setPending(true);
      try {
        const muteStore = useMuteStore.getState();
        const isMutedNow = muteStore.isEffectivelyMuted(streamId, topic);
        const isStreamMutedNow = muteStore.isStreamMuted(streamId);
        const ok = await runOptimisticTopicVisibilityUpdate({
          streamId,
          topic,
          applyOptimistic: () => {
            const optimisticStore = useMuteStore.getState();
            if (isMutedNow) {
              if (isStreamMutedNow) {
                optimisticStore.unmuteTopic(streamId, topic);
                return;
              }
              optimisticStore.clearTopicVisibilityOverride(streamId, topic);
              return;
            }
            optimisticStore.muteTopic(streamId, topic);
          },
          request: () => {
            if (isMutedNow) {
              if (isStreamMutedNow) {
                return unmuteTopicInMutedStream(streamId, topic);
              }
              return unmuteTopic(streamId, topic);
            }
            return muteTopic(streamId, topic);
          },
        });
        if (ok) return;
        onMuteError?.(() => {
          void runToggle();
        });
      } finally {
        setPending(false);
      }
    }, [onMuteError, pending, streamId, topic]);

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        void runToggle();
      },
      [runToggle],
    );

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`flex h-6 w-6 items-center justify-center rounded border border-transparent text-text-muted transition-opacity hover:text-text-primary disabled:cursor-not-allowed ${
          isEffectivelyMuted || pending
            ? "bg-bg-elevated/70 border-border-subtle text-notice-base opacity-100"
            : "opacity-0 focus-visible:opacity-100 group-focus-within/topic:opacity-100 group-hover/topic:opacity-100"
        }`}
        aria-label={isEffectivelyMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
        title={isEffectivelyMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
      >
        <Icon name={isEffectivelyMuted ? "bell_off" : "bell"} size={14} />
      </button>
    );
  },
);
