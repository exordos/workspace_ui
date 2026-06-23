import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { getCurrentInstance } from "~/shared/api/client";
import type { MessengerStreamTopic } from "~/shared/api/messenger.types";
import { deleteChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { moveTopicToStreamInCache } from "~/shared/lib/message-cache-db";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import { encodeTopicForRoute, normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { moveTopicToChannel } from "./move-topic-to-stream.api";
import {
  buildMoveTopicTargetStreamOptions,
  resolveMoveTopicTargetName,
  resolveSelectedTargetStreamId,
} from "./move-topic-to-stream.lib";

export interface UseMoveTopicToStreamOptions {
  streamId: string;
  topic: string;
  topicUuid?: string;
  streamName: string;
}

export function useMoveTopicToStream(options: UseMoveTopicToStreamOptions) {
  const { streamId, topic, topicUuid, streamName } = options;
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
  const normalizedTopicUuid = topicUuid?.trim().toLowerCase();
  const effectiveStreamName = streamName.trim() || (streamEntry?.name ?? "").trim();
  const streamSlug = effectiveStreamName.length > 0 ? buildStreamSlug(streamId) : null;

  // Permission groups deferred — Messenger API remains the final arbiter on submit.
  const canMove =
    topicTrimmed.length > 0 &&
    normalizedTopicUuid != null &&
    normalizedTopicUuid.length > 0 &&
    streamSlug != null &&
    currentUserId != null;

  const targetStreamOptions = useMemo(
    () =>
      buildMoveTopicTargetStreamOptions(
        Array.from(streamsMap.values()).map((stream) => ({
          streamId: stream.streamUuid,
          name: stream.name,
        })),
        streamId,
      ),
    [streamId, streamsMap],
  );

  const syncTopicMoveLocally = useCallback(
    (
      targetStreamId: string,
      targetStreamName: string,
      oldTopic: string,
      newTopic: string,
      updatedTopic: MessengerStreamTopic,
    ) => {
      const oldTopicKey = normalizeTopicForIdentity(oldTopic);
      const updatedTopicUuid = updatedTopic.uuid.trim().toLowerCase();
      useChatListStore.getState().removeStreamTopic(streamId, oldTopic);
      useChatListStore.getState().upsertStreamTopicShells(updatedTopic.stream_uuid, [
        {
          topicUuid: updatedTopic.uuid,
          streamUuid: updatedTopic.stream_uuid,
          name: updatedTopic.name,
          unreadCount: updatedTopic.unread_count,
          isDefault: updatedTopic.is_default,
          isDone: updatedTopic.is_done,
        },
      ]);
      const messageIds = useCurrentChatMessagesStore
        .getState()
        .messages.filter((message) => {
          if (message.stream_uuid !== streamId) return false;
          const messageTopicUuid = message.topic_uuid?.trim().toLowerCase();
          if (messageTopicUuid != null && messageTopicUuid.length > 0) {
            return messageTopicUuid === updatedTopicUuid;
          }
          return normalizeTopicForIdentity(message.subject ?? "") === oldTopicKey;
        })
        .map((message) => message.id);
      const anchorMessageId = messageIds[0];
      const moveParams = {
        sourceStreamId: streamId,
        targetStreamId,
        oldTopic: updatedTopicUuid,
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

      const targetSlug = buildStreamSlug(targetStreamId);
      const openContext = useCurrentChatMessagesStore.getState().context;
      const isOpenTopic =
        openContext?.type === "stream" &&
        openContext.streamWideView !== true &&
        openContext.streamId === streamId &&
        (openContext.topicUuid?.trim().toLowerCase() === updatedTopicUuid ||
          normalizeTopicForIdentity(openContext.topic) === oldTopicKey);
      if (!isOpenTopic) {
        return;
      }
      useCurrentChatMessagesStore.getState().setContext({
        ...openContext,
        streamId: targetStreamId,
        streamName: targetStreamName,
        topic: newTopic,
        topicUuid: updatedTopicUuid,
      });
      void navigate(
        withCurrentOrgRoute(
          `/stream/${targetSlug}/topic/${encodeURIComponent(encodeTopicForRoute(updatedTopicUuid))}`,
        ),
        { replace: true },
      );
    },
    [navigate, streamId],
  );

  const openMoveDialog = useCallback(() => {
    if (!canMove || normalizedTopicUuid == null || movePending) {
      return;
    }
    setMoveError(null);
    setTargetStreamIdRaw("");
    setMoveTopicDraft(topic);
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
    void moveTopicToChannel(normalizedTopicUuid, streamId, topic, targetStreamId, targetTopic)
      .then((updatedTopic) => {
        if (updatedTopic == null) {
          setMoveError("channel.moveTopicToChannelError");
          return;
        }
        syncTopicMoveLocally(
          targetStreamId,
          targetStreamName,
          topic,
          updatedTopic.name,
          updatedTopic,
        );
        setMoveDialogOpen(false);
      })
      .finally(() => {
        setMovePending(false);
      });
  }, [
    canMove,
    movePending,
    moveTopicDraft,
    normalizedTopicUuid,
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
