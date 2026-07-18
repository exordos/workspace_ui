import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import {
  EXTERNAL_CAPABILITY,
  isExternalCapabilityAvailable,
} from "~/features/external-accounts/external-capabilities.lib";
import { useExternalOperationPreflight } from "~/features/external-accounts/external-operation-preflight.hook";
import { renameStreamTopic, setTopicResolvedState } from "~/shared/api/messenger-read-state";
import type { MessengerStreamTopic } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  resolveMarkTopicResolvedVisibility,
  resolveMarkTopicResolvedVisibilityForTopic,
} from "./mark-topic-resolved.lib";
import { isTopicRenameUnchanged, resolveRenamedTopicName } from "./rename-stream-topic.lib";

const log = createLogger("mark-topic-resolved");

export interface UseMarkTopicResolvedOptions {
  streamId: string;
  topic: string;
  topicUuid?: string;
  /** Canonical stream name for slug/API (not localized display label). */
  streamName: string;
}

export function useMarkTopicResolved(explicitTarget?: UseMarkTopicResolvedOptions) {
  const context = useCurrentChatMessagesStore((s) => s.context);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const streamIdFromContext = context?.type === "stream" ? context.streamId : null;
  const streamIdForMap = explicitTarget?.streamId ?? streamIdFromContext;
  const streamNameFromMap = useChatListStore((s) =>
    streamIdForMap != null ? (s.streamsMap.get(streamIdForMap)?.name ?? "") : "",
  );
  const externalProvider = useChatListStore((s) => {
    if (streamIdForMap == null) return null;
    const stream = s.streamsMap.get(streamIdForMap);
    if (stream == null) return null;
    const explicitTopicUuid = explicitTarget?.topicUuid?.trim().toLowerCase();
    const contextTopicUuid =
      context?.type === "stream" ? context.topicUuid?.trim().toLowerCase() : undefined;
    const targetTopicUuid = explicitTopicUuid ?? contextTopicUuid;
    const targetTopicName =
      explicitTarget?.topic ?? (context?.type === "stream" ? context.topic : null);
    let topicProvider = stream.provider;
    if (targetTopicUuid != null && targetTopicUuid.length > 0) {
      topicProvider =
        Array.from(stream.topics.values()).find(
          (candidate) => candidate.topicUuid?.trim().toLowerCase() === targetTopicUuid,
        )?.provider ?? topicProvider;
    } else if (targetTopicName != null) {
      topicProvider = stream.topics.get(targetTopicName)?.provider ?? topicProvider;
    }
    return topicProvider ?? null;
  });
  const topicDoneFromMap = useChatListStore((s) => {
    if (streamIdForMap == null) return false;
    const stream = s.streamsMap.get(streamIdForMap);
    if (stream == null) return false;
    const explicitTopicUuid = explicitTarget?.topicUuid?.trim().toLowerCase();
    const contextTopicUuid =
      context?.type === "stream" ? context.topicUuid?.trim().toLowerCase() : undefined;
    const targetTopicUuid = explicitTopicUuid ?? contextTopicUuid;
    if (targetTopicUuid != null && targetTopicUuid.length > 0) {
      for (const topicEntry of stream.topics.values()) {
        if (topicEntry.topicUuid?.trim().toLowerCase() === targetTopicUuid) {
          return topicEntry.isDone === true;
        }
      }
    }
    const targetTopic =
      explicitTarget?.topic ?? (context?.type === "stream" ? context.topic : null);
    if (targetTopic == null) return false;
    return stream.topics.get(targetTopic)?.isDone === true;
  });
  const [resolvePending, setResolvePending] = useState(false);
  const [renamePending, setRenamePending] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTopicDraft, setRenameTopicDraft] = useState("");
  const externalPreflight = useExternalOperationPreflight();

  const visibility = useMemo(() => {
    if (explicitTarget != null) {
      const nameFromMap = streamNameFromMap.trim();
      return resolveMarkTopicResolvedVisibilityForTopic({
        streamId: explicitTarget.streamId,
        topic: explicitTarget.topic,
        topicUuid: explicitTarget.topicUuid,
        streamName: nameFromMap.length > 0 ? nameFromMap : explicitTarget.streamName,
        currentUserId,
        buildStreamSlug,
      });
    }
    return resolveMarkTopicResolvedVisibility({
      context,
      currentUserId,
      streamNameFromMap,
      buildStreamSlug,
    });
  }, [context, currentUserId, streamNameFromMap, explicitTarget]);

  const { canToggle, streamId, topic } = {
    canToggle: visibility.canToggle,
    streamId: visibility.streamId,
    topic: visibility.topic,
  };
  const topicUuid = visibility.topicUuid;

  const isResolved = topicDoneFromMap;
  const canRenameTopic =
    canToggle &&
    (externalProvider == null ||
      isExternalCapabilityAvailable(
        externalProvider.capabilities,
        EXTERNAL_CAPABILITY.topicRename,
      ));
  const pending = resolvePending || renamePending || externalPreflight.pending;
  const channelName = visibility.effectiveStreamName;

  const syncServerTopicMetadata = useCallback((updatedTopic: MessengerStreamTopic) => {
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
  }, []);

  const syncTopicRenameLocally = useCallback(
    (oldTopic: string, newTopic: string, updatedTopic: MessengerStreamTopic) => {
      if (streamId == null) {
        return;
      }
      syncServerTopicMetadata(updatedTopic);
      const oldTopicKey = normalizeTopicForIdentity(oldTopic);
      const updatedTopicUuid = updatedTopic.uuid.trim().toLowerCase();
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
      const topicMoveParams = {
        streamId,
        oldTopic: updatedTopicUuid,
        newTopic,
        ...(messageIds.length > 0 ? { messageIds } : {}),
        ...(anchorMessageId != null ? { anchorMessageId } : {}),
      };

      useCurrentChatMessagesStore.getState().moveStreamTopicMessages(topicMoveParams);
      if (newTopic === oldTopic) {
        return;
      }
      const openContext = useCurrentChatMessagesStore.getState().context;
      const isOpenTopic =
        openContext?.type === "stream" &&
        openContext.streamWideView !== true &&
        openContext.streamId === streamId &&
        (openContext.topicUuid?.trim().toLowerCase() === updatedTopicUuid ||
          normalizeTopicForIdentity(openContext.topic) === normalizeTopicForIdentity(oldTopic));
      if (!isOpenTopic) {
        return;
      }
      useCurrentChatMessagesStore.getState().setContext({
        ...openContext,
        topic: newTopic,
        topicUuid: updatedTopicUuid,
      });
    },
    [streamId, syncServerTopicMetadata],
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
    if (!canToggle || topic == null || topicUuid == null || streamId == null || pending) {
      return;
    }

    const shouldResolve = !isResolved;

    setResolvePending(true);
    void setTopicResolvedState(topicUuid, streamId, topic, shouldResolve)
      .then((updatedTopic) => {
        if (updatedTopic == null) return;
        syncServerTopicMetadata(updatedTopic);
      })
      .finally(() => {
        setResolvePending(false);
      });
  }, [canToggle, topic, topicUuid, streamId, pending, isResolved, syncServerTopicMetadata]);

  const openRenameDialog = useCallback(() => {
    if (!canRenameTopic || topic == null || pending) {
      return;
    }
    setRenameTopicDraft(topic);
    setRenameDialogOpen(true);
  }, [canRenameTopic, pending, topic]);

  const submitRename = useCallback(() => {
    if (
      !canRenameTopic ||
      topic == null ||
      topicUuid == null ||
      streamId == null ||
      renamePending ||
      externalPreflight.pending
    ) {
      return;
    }

    const targetTopic = resolveRenamedTopicName(topic, renameTopicDraft);
    if (targetTopic == null || isTopicRenameUnchanged(topic, renameTopicDraft)) {
      setRenameDialogOpen(false);
      return;
    }

    setRenameDialogOpen(false);
    externalPreflight.run({
      provider: externalProvider,
      action: EXTERNAL_CAPABILITY.topicRename,
      target: { type: "topic", uuid: topicUuid },
      execute: () => {
        setRenamePending(true);
        void renameStreamTopic(topicUuid, streamId, topic, targetTopic)
          .then((updatedTopic) => {
            if (updatedTopic == null) return;
            syncTopicRenameLocally(topic, updatedTopic.name || targetTopic, updatedTopic);
            setRenameDialogOpen(false);
          })
          .finally(() => {
            setRenamePending(false);
          });
      },
    });
  }, [
    canRenameTopic,
    topic,
    topicUuid,
    streamId,
    renamePending,
    renameTopicDraft,
    syncTopicRenameLocally,
    externalPreflight,
    externalProvider,
  ]);

  return {
    canToggle,
    canRenameTopic,
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
    renamePending: renamePending || externalPreflight.pending,
    externalPreflightDialog: {
      error: externalPreflight.error,
      losses: externalPreflight.losses,
      onConfirm: externalPreflight.confirm,
      onDismiss: externalPreflight.dismiss,
    },
  };
}
