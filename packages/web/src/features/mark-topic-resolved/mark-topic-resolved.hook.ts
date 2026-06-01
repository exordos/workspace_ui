import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { getCurrentInstance } from "~/shared/api/client";
import { renameStreamTopic, setTopicResolvedState } from "~/shared/api/zulip-read-state";
import { deleteChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { createLogger } from "~/shared/lib/logger";
import { moveTopicMessagesInCache } from "~/shared/lib/message-cache-db";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import { encodeTopicForRoute, normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  isTopicResolved,
  toResolvedTopicName,
  toUnresolvedTopicName,
} from "~/shared/lib/topic-resolve";
import { resolveMarkTopicResolvedVisibility } from "./mark-topic-resolved.lib";
import { isTopicRenameUnchanged, resolveRenamedTopicName } from "./rename-stream-topic.lib";

const log = createLogger("mark-topic-resolved");

export function useMarkTopicResolved() {
  const navigate = useNavigate();
  const context = useCurrentChatMessagesStore((s) => s.context);
  const messages = useCurrentChatMessagesStore((s) => s.messages);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const streamIdFromContext = context?.type === "stream" ? context.streamId : null;
  const streamNameFromMap = useChatListStore((s) =>
    streamIdFromContext != null ? (s.streamsMap.get(streamIdFromContext)?.name ?? "") : "",
  );
  const [resolvePending, setResolvePending] = useState(false);
  const [renamePending, setRenamePending] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTopicDraft, setRenameTopicDraft] = useState("");

  const visibility = useMemo(
    () =>
      resolveMarkTopicResolvedVisibility({
        context,
        currentUserId,
        streamNameFromMap,
        buildStreamSlug,
      }),
    [context, currentUserId, streamNameFromMap],
  );

  const { canToggle, streamSlug, streamId, topic } = {
    canToggle: visibility.canToggle,
    streamSlug: visibility.streamSlug,
    streamId: visibility.streamId,
    topic: visibility.topic,
  };

  const isResolved = topic != null ? isTopicResolved(topic) : false;
  const pending = resolvePending || renamePending;
  const channelName = visibility.effectiveStreamName;

  const syncTopicRenameLocally = useCallback(
    (oldTopic: string, newTopic: string) => {
      if (streamId == null || streamSlug == null) {
        return;
      }
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
      const topicMoveParams = {
        streamId,
        oldTopic,
        newTopic,
        ...(messageIds.length > 0 ? { messageIds } : {}),
        ...(anchorMessageId != null ? { anchorMessageId } : {}),
      };

      useChatListStore.getState().moveStreamTopic(topicMoveParams);
      useCurrentChatMessagesStore.getState().moveStreamTopicMessages(topicMoveParams);
      const instanceId = getCurrentInstance()?.id;
      if (instanceId != null && instanceId.length > 0) {
        void moveTopicMessagesInCache({
          instanceId,
          ...topicMoveParams,
        }).catch(() => {});
        void deleteChatListSnapshotRow(instanceId).catch(() => {});
      }
      if (newTopic === oldTopic) {
        return;
      }
      void navigate(
        withCurrentOrgRoute(
          `/stream/${streamSlug}/topic/${encodeURIComponent(encodeTopicForRoute(newTopic))}`,
        ),
        { replace: true },
      );
    },
    [messages, navigate, streamId, streamSlug],
  );

  const lastLoggedVisibilityKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const logKey = JSON.stringify({
      canToggle: visibility.canToggle,
      blockers: visibility.blockers,
      streamId: visibility.streamId,
      topic: visibility.topic,
    });
    if (lastLoggedVisibilityKeyRef.current === logKey) {
      return;
    }
    lastLoggedVisibilityKeyRef.current = logKey;

    if (visibility.canToggle) {
      log.info("header menu visible", {
        streamId: visibility.streamId,
        topic: visibility.topic,
        streamSlug: visibility.streamSlug,
      });
      return;
    }

    if (visibility.contextType === "stream" && visibility.streamWideView !== true) {
      log.warn("header menu hidden", {
        blockers: visibility.blockers,
        streamId: visibility.streamId,
        topic: visibility.topic,
        streamNameFromMap: visibility.streamNameFromMap,
        streamNameFromContext: visibility.streamNameFromContext,
        effectiveStreamName: visibility.effectiveStreamName,
        streamSlug: visibility.streamSlug,
        currentUserId: visibility.currentUserId,
        streamWideView: visibility.streamWideView,
      });
    } else {
      log.debug("header menu not applicable", {
        contextType: visibility.contextType,
        streamWideView: visibility.streamWideView,
      });
    }
  }, [visibility]);

  const toggleTopicResolved = useCallback(() => {
    if (!canToggle || topic == null || streamId == null || pending) {
      return;
    }

    const shouldResolve = !isResolved;
    const nextTopicName = shouldResolve ? toResolvedTopicName(topic) : toUnresolvedTopicName(topic);

    setResolvePending(true);
    void setTopicResolvedState(streamId, topic, shouldResolve)
      .then((ok) => {
        if (!ok) return;
        syncTopicRenameLocally(topic, nextTopicName);
      })
      .finally(() => {
        setResolvePending(false);
      });
  }, [canToggle, topic, streamId, pending, isResolved, syncTopicRenameLocally]);

  const openRenameDialog = useCallback(() => {
    if (!canToggle || topic == null || pending) {
      return;
    }
    setRenameTopicDraft(toUnresolvedTopicName(topic));
    setRenameDialogOpen(true);
  }, [canToggle, pending, topic]);

  const submitRename = useCallback(() => {
    if (!canToggle || topic == null || streamId == null || renamePending) {
      return;
    }

    const targetTopic = resolveRenamedTopicName(topic, renameTopicDraft);
    if (targetTopic == null || isTopicRenameUnchanged(topic, renameTopicDraft)) {
      setRenameDialogOpen(false);
      return;
    }

    setRenamePending(true);
    void renameStreamTopic(streamId, topic, targetTopic)
      .then((ok) => {
        if (!ok) return;
        syncTopicRenameLocally(topic, targetTopic);
        setRenameDialogOpen(false);
      })
      .finally(() => {
        setRenamePending(false);
      });
  }, [canToggle, topic, streamId, renamePending, renameTopicDraft, syncTopicRenameLocally]);

  return {
    canToggle,
    isResolved,
    toggleTopicResolved,
    pending,
    visibility,
    channelName,
    renameDialogOpen,
    setRenameDialogOpen,
    renameTopicDraft,
    setRenameTopicDraft,
    openRenameDialog,
    submitRename,
    renamePending,
  };
}
