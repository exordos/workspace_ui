import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { getCurrentInstance } from "~/shared/api/client";
import { deleteChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { moveTopicToStreamInCache } from "~/shared/lib/message-cache-db";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import { encodeTopicForRoute, normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { toUnresolvedTopicName } from "~/shared/lib/topic-resolve";
import { moveTopicToChannel } from "./move-topic-to-stream.api";
import {
  buildMoveTopicTargetStreamOptions,
  resolveMoveTopicTargetName,
  resolveSelectedTargetStreamId,
} from "./move-topic-to-stream.lib";

export interface UseMoveTopicToStreamOptions {
  streamId: number;
  topic: string;
  streamName: string;
}

export function useMoveTopicToStream(options: UseMoveTopicToStreamOptions) {
  const { streamId, topic, streamName } = options;
  const navigate = useNavigate();
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const streamEntry = useChatListStore((s) => s.streamsMap.get(streamId));

  const [movePending, setMovePending] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [targetStreamIdRaw, setTargetStreamIdRaw] = useState("");
  const [moveTopicDraft, setMoveTopicDraft] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);

  const topicTrimmed = topic.trim();
  const effectiveStreamName = streamName.trim() || (streamEntry?.name ?? "").trim();
  const streamSlug =
    effectiveStreamName.length > 0 ? buildStreamSlug(streamId, effectiveStreamName) : null;

  // Permission groups deferred — Zulip API remains the final arbiter on submit.
  const canMove = topicTrimmed.length > 0 && streamSlug != null && currentUserId != null;

  const targetStreamOptions = useMemo(
    () =>
      buildMoveTopicTargetStreamOptions(
        Array.from(streamsMap.values()).map((stream) => ({
          streamId: stream.stream_id,
          name: stream.name,
        })),
        streamId,
      ),
    [streamId, streamsMap],
  );

  const syncTopicMoveLocally = useCallback(
    (targetStreamId: number, targetStreamName: string, oldTopic: string, newTopic: string) => {
      const oldTopicKey = normalizeTopicForIdentity(oldTopic);
      const messageIds = useCurrentChatMessagesStore
        .getState()
        .messages.filter(
          (message) =>
            message.stream_id === streamId &&
            normalizeTopicForIdentity(message.subject ?? "") === oldTopicKey,
        )
        .map((message) => message.id);
      const anchorMessageId = messageIds[0];
      const moveParams = {
        sourceStreamId: streamId,
        targetStreamId,
        oldTopic,
        newTopic,
        ...(messageIds.length > 0 ? { messageIds } : {}),
        ...(anchorMessageId != null ? { anchorMessageId } : {}),
      };

      useChatListStore.getState().moveTopicToStream(moveParams);
      useCurrentChatMessagesStore.getState().moveTopicToStreamMessages({
        ...moveParams,
        targetStreamName,
      });

      const instanceId = getCurrentInstance()?.id;
      if (instanceId != null && instanceId.length > 0) {
        void moveTopicToStreamInCache({
          instanceId,
          ...moveParams,
        }).catch(() => {});
        void deleteChatListSnapshotRow(instanceId).catch(() => {});
      }

      const targetSlug = buildStreamSlug(targetStreamId, targetStreamName);
      const openContext = useCurrentChatMessagesStore.getState().context;
      const isOpenTopic =
        openContext?.type === "stream" &&
        openContext.streamWideView !== true &&
        openContext.streamId === streamId &&
        normalizeTopicForIdentity(openContext.topic) === oldTopicKey;
      if (!isOpenTopic) {
        return;
      }
      void navigate(
        withCurrentOrgRoute(
          `/stream/${targetSlug}/topic/${encodeURIComponent(encodeTopicForRoute(newTopic))}`,
        ),
        { replace: true },
      );
    },
    [navigate, streamId],
  );

  const openMoveDialog = useCallback(() => {
    if (!canMove || movePending) {
      return;
    }
    setMoveError(null);
    setTargetStreamIdRaw("");
    setMoveTopicDraft(toUnresolvedTopicName(topic));
    setMoveDialogOpen(true);
  }, [canMove, movePending, topic]);

  const submitMove = useCallback(() => {
    if (!canMove || movePending) {
      return;
    }

    const targetStreamId = resolveSelectedTargetStreamId(targetStreamIdRaw, targetStreamOptions);
    if (targetStreamId == null) {
      return;
    }

    const targetTopic = resolveMoveTopicTargetName(topic, moveTopicDraft);
    if (targetTopic == null) {
      return;
    }

    const targetStreamName =
      targetStreamOptions.find((stream) => stream.streamId === targetStreamId)?.name ?? "";

    setMovePending(true);
    setMoveError(null);
    void moveTopicToChannel(streamId, topic, targetStreamId, targetTopic)
      .then((ok) => {
        if (!ok) {
          setMoveError("channel.moveTopicToChannelError");
          return;
        }
        syncTopicMoveLocally(targetStreamId, targetStreamName, topic, targetTopic);
        setMoveDialogOpen(false);
      })
      .finally(() => {
        setMovePending(false);
      });
  }, [
    canMove,
    movePending,
    moveTopicDraft,
    streamId,
    syncTopicMoveLocally,
    targetStreamIdRaw,
    targetStreamOptions,
    topic,
  ]);

  return {
    canMove,
    movePending,
    moveDialogOpen,
    setMoveDialogOpen,
    targetStreamIdRaw,
    setTargetStreamIdRaw,
    moveTopicDraft,
    setMoveTopicDraft,
    targetStreamOptions,
    openMoveDialog,
    submitMove,
    moveError,
    channelName: effectiveStreamName,
  };
}
