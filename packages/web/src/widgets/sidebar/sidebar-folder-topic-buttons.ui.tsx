import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { muteTopic, unmuteTopic } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { t } from "~/i18n/i18n";
import { setTopicResolvedState } from "~/shared/api/zulip";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import {
  isTopicResolved,
  toResolvedTopicName,
  toUnresolvedTopicName,
} from "~/shared/lib/topic-resolve";
import { Icon } from "~/shared/ui/icon";

export const TopicMuteButton = React.memo<{ streamId: number; topic: string }>(({ streamId, topic }) => {
  const isMuted = useMuteStore((s) => s.isTopicMuted(streamId, topic));
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMuted) {
        useMuteStore.getState().unmuteTopic(streamId, topic);
        void unmuteTopic(streamId, topic);
      } else {
        useMuteStore.getState().muteTopic(streamId, topic);
        void muteTopic(streamId, topic);
      }
    },
    [streamId, topic, isMuted],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex h-6 w-6 items-center justify-center rounded text-text-muted transition-opacity hover:text-text-primary ${
        isMuted
          ? "opacity-100"
          : "opacity-0 group-focus-within/topic:opacity-100 group-hover/topic:opacity-100 focus-visible:opacity-100"
      }`}
      aria-label={isMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
      title={isMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
    >
      <Icon name="bell" size={14} className={isMuted ? "opacity-40" : ""} />
    </button>
  );
});

export const TopicResolvedButton = React.memo<{
  streamId: number;
  topic: string;
  streamSlug: string;
  isActiveTopic: boolean;
}>(({ streamId, topic, streamSlug, isActiveTopic }) => {
  const navigate = useNavigate();
  const [isUpdating, setIsUpdating] = useState(false);
  const isResolved = isTopicResolved(topic);
  const buttonLabel = isResolved ? t("channel.markTopicAsNotDone") : t("channel.markTopicAsDone");

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isUpdating) return;

      const shouldResolve = !isResolved;
      const nextTopicName = shouldResolve
        ? toResolvedTopicName(topic)
        : toUnresolvedTopicName(topic);

      setIsUpdating(true);
      void setTopicResolvedState(streamId, topic, shouldResolve)
        .then((ok) => {
          if (!ok) return;
          if (!isActiveTopic) return;
          if (nextTopicName === topic) return;
          void navigate(
            withCurrentOrgRoute(`/stream/${streamSlug}/topic/${encodeURIComponent(nextTopicName)}`),
            { replace: true },
          );
        })
        .finally(() => {
          setIsUpdating(false);
        });
    },
    [isUpdating, isResolved, streamId, topic, isActiveTopic, streamSlug, navigate],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isUpdating}
      className={`flex h-6 w-6 items-center justify-center rounded text-text-muted transition-opacity hover:text-text-primary disabled:cursor-not-allowed ${
        isResolved || isUpdating
          ? "opacity-100"
          : "opacity-0 group-focus-within/topic:opacity-100 group-hover/topic:opacity-100 focus-visible:opacity-100"
      }`}
      aria-label={buttonLabel}
      title={buttonLabel}
    >
      <Icon name="check" size={14} className={isResolved ? "text-accent" : ""} />
    </button>
  );
});
