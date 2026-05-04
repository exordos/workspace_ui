import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import {
  muteTopic,
  unmuteTopic,
  unmuteTopicInMutedStream,
} from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { t } from "~/i18n/i18n";
import { getCurrentInstance } from "~/shared/api/client";
import { setTopicResolvedState } from "~/shared/api/zulip";
import { deleteChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { moveTopicMessagesInCache } from "~/shared/lib/message-cache-db";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import {
  isTopicResolved,
  toResolvedTopicName,
  toUnresolvedTopicName,
} from "~/shared/lib/topic-resolve";
import { Icon } from "~/shared/ui/icon";

interface TopicMuteButtonProps {
  streamId: number;
  topic: string;
  onMuteError?: (retry: () => void) => void;
}

export const TopicMuteButton = React.memo<TopicMuteButtonProps>(
  ({ streamId, topic, onMuteError }) => {
    const isStreamMuted = useMuteStore((s) => s.isStreamMuted(streamId));
    const isTopicMuted = useMuteStore((s) => s.isTopicMuted(streamId, topic));
    const isTopicUnmuted = useMuteStore((s) => s.isTopicUnmuted(streamId, topic));
    const isTopicFollowed = useMuteStore((s) => s.isTopicFollowed(streamId, topic));
    const isEffectivelyMuted = useMuteStore((s) => s.isEffectivelyMuted(streamId, topic));
    const [pending, setPending] = useState(false);

    const restoreTopicOverride = useCallback(
      (wasTopicMuted: boolean, wasTopicUnmuted: boolean, wasTopicFollowed: boolean) => {
        const muteStore = useMuteStore.getState();
        if (wasTopicMuted) {
          muteStore.muteTopic(streamId, topic);
          return;
        }
        if (wasTopicUnmuted) {
          muteStore.unmuteTopic(streamId, topic);
          return;
        }
        if (wasTopicFollowed) {
          muteStore.followTopic(streamId, topic);
          return;
        }
        muteStore.clearTopicVisibilityOverride(streamId, topic);
      },
      [streamId, topic],
    );

    const runToggle = useCallback(async () => {
      if (pending) return;

      const wasTopicMuted = isTopicMuted;
      const wasTopicUnmuted = isTopicUnmuted;
      const wasTopicFollowed = isTopicFollowed;
      const muteStore = useMuteStore.getState();

      let request: Promise<boolean>;
      if (isEffectivelyMuted) {
        if (isStreamMuted) {
          muteStore.unmuteTopic(streamId, topic);
          request = unmuteTopicInMutedStream(streamId, topic);
        } else {
          muteStore.clearTopicVisibilityOverride(streamId, topic);
          request = unmuteTopic(streamId, topic);
        }
      } else {
        muteStore.muteTopic(streamId, topic);
        request = muteTopic(streamId, topic);
      }

      setPending(true);
      try {
        const ok = await request;
        if (ok) return;
        restoreTopicOverride(wasTopicMuted, wasTopicUnmuted, wasTopicFollowed);
        onMuteError?.(() => {
          void runToggle();
        });
      } finally {
        setPending(false);
      }
    }, [
      isEffectivelyMuted,
      isStreamMuted,
      isTopicMuted,
      isTopicFollowed,
      isTopicUnmuted,
      onMuteError,
      pending,
      restoreTopicOverride,
      streamId,
      topic,
    ]);

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
            : "opacity-0 group-focus-within/topic:opacity-100 group-hover/topic:opacity-100 focus-visible:opacity-100"
        }`}
        aria-label={isEffectivelyMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
        title={isEffectivelyMuted ? t("channel.unmuteTopic") : t("channel.muteTopic")}
      >
        <Icon name={isEffectivelyMuted ? "bell_off" : "bell"} size={14} />
      </button>
    );
  },
);

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
          useChatListStore.getState().moveStreamTopic({
            streamId,
            oldTopic: topic,
            newTopic: nextTopicName,
          });
          useCurrentChatMessagesStore.getState().moveStreamTopicMessages({
            streamId,
            oldTopic: topic,
            newTopic: nextTopicName,
          });
          const instanceId = getCurrentInstance()?.id;
          if (instanceId != null && instanceId.length > 0) {
            void moveTopicMessagesInCache({
              instanceId,
              streamId,
              oldTopic: topic,
              newTopic: nextTopicName,
            }).catch(() => {});
            void deleteChatListSnapshotRow(instanceId).catch(() => {});
          }
          if (!isActiveTopic) return;
          if (nextTopicName === topic) return;
          void navigate(
            withCurrentOrgRoute(
              `/stream/${streamSlug}/topic/${encodeURIComponent(encodeTopicForRoute(nextTopicName))}`,
            ),
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
