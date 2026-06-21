/**
 * Chat list store — manages sidebar chat entries (streams, DMs, topics).
 *
 * Built from raw messenger messages; incrementally updated via real-time events.
 * Tracks unread counts per topic/DM and a message-to-location index for flag/delete handling.
 */
import { create } from "zustand";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { logStoreAction } from "~/shared/lib/logger";
import {
  logChatListFlow,
  summarizeMessengerMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { areGroupSettingValuesEqual } from "~/shared/lib/messenger-group-setting.lib";
import { saveRecentDmPartners } from "~/shared/lib/recent-dms";
import {
  logSidebarUnreadFlow,
  summarizeMessageIdsForFlowDebug,
  summarizeSidebarUnreadTotals,
} from "~/shared/lib/sidebar-unread-debug.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { resolveTopicMoveTargetMessageIds } from "~/shared/lib/update-message-topic-move.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { isNumericUserId } from "~/shared/lib/user-id.lib";
import type {
  SidebarChat,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";
import {
  applyAddMessagesBatchPatch,
  buildDmLatestMap,
  buildStreamTopicLatestMap,
} from "./chat-list-add-messages-batch.lib";
import {
  buildChatListHydrateFromSnapshotState,
  buildDmMetadataRowsFromDmsMap,
  buildDmMetadataUpsertPatch,
  buildSetFromMessagesBootstrapState,
  buildUnreadLocationMap,
  clearBootstrapErrorPatch,
  type ChatListDmBootstrapDisplayContext,
  type ChatListHydrateFromSnapshotState,
  type SetFromMessagesBootstrapState,
} from "./chat-list-bootstrap.lib";
import {
  applyHandleDeleteMessagesStatePatch,
  buildResolvedDmPreviewFromMessage,
  buildResolvedPreviewFromMessage,
  fetchReplacementMessageForDeletedPreview,
  type DeletedPreviewContext,
} from "./chat-list-delete-messages.lib";
import { getDmPartnerName, resolvePersonalDmSidebarTitle } from "./chat-list-format.lib";
import {
  buildMentionLocationFlags,
  buildTopicMentionKey,
  messageLocationFromMockMessage,
  messageLocationFromRawMessage,
  type MentionLocationFlags,
} from "./chat-list-mention-locations.lib";
import {
  buildMentionUnreadSetFromIds,
  collectUnreadMentionIdsFromMessages,
  collectUnreadMentionIdsFromMockMessages,
  decrementMentionUnreadForMessageIds,
  isUnreadMentionFromOthers,
  mergeMentionUnreadPatch,
} from "./chat-list-mentions.lib";
import {
  applySidebarUnreadDeltas,
  computeSidebarUnreadTotals,
} from "./chat-list-sidebar-totals.lib";
import {
  getNewestTopicEntry,
  mergeStreamEntry,
  rebuildStreamFromTopics,
} from "./chat-list-stream-entry-merge.lib";
import { buildStreamMetadataEntry } from "./chat-list-stream-metadata.lib";
import {
  filterStreamMessagesForSidebar,
  mergeStreamSidebarPreviewsFromMessages,
} from "./chat-list-stream-preview-from-messages.lib";
import {
  addMessageIdToStreamTopicIndex,
  buildStreamTopicMessageIndex,
  collectMessageIdsForStream,
  getStreamTopicMessageIds,
  patchStreamTopicMessageIndex,
  removeStreamFromStreamTopicIndex,
  removeStreamTopicKeyFromIndex,
  streamTopicCompositeKey,
} from "./chat-list-stream-topic-index.lib";
import {
  applyReconcileUnreadMapsPatch,
  buildLatestUnreadDmMessageMap,
  buildLatestUnreadStreamMessageMap,
} from "./chat-list-unread-reconcile-apply.lib";
import { buildUnreadReconcileMapsFromRegisterSnapshot } from "./chat-list-unread-reconcile.lib";
import { messageToStreamEntry, messageToDmEntry, isUnreadFromOthers } from "./chat-list.lib";
import type { ChatListPatchMeta } from "./chat-list-patch-meta.types";
import type { ChatListState, MessageLocation } from "./chat-list.model.types";

type StreamTopicEntryInternal =
  StreamEntryInternal["topics"] extends Map<string, infer TopicEntry> ? TopicEntry : never;

/** Writable store fields accepted by patchSet (Zustand v5 setState is stricter than v4). */
type ChatListStateDataPatch =
  | Partial<ChatListState>
  | SetFromMessagesBootstrapState
  | ChatListHydrateFromSnapshotState;

type ChatListStateUpdater = (state: ChatListState) => ChatListState | ChatListStateDataPatch;

type ChatListPatchInput = ChatListStateDataPatch | ChatListStateUpdater;

function finalizeChatListPatch(
  state: ChatListState,
  patch: Partial<ChatListState>,
  meta: ChatListPatchMeta = {},
): Partial<ChatListState> {
  const result: Partial<ChatListState> = { ...patch };

  const mapsTouched = patch.streamsMap !== undefined || patch.dmsMap !== undefined;
  const totalsProvidedInPatch =
    patch.sidebarStreamsUnread !== undefined || patch.sidebarDmsUnread !== undefined;
  if (!totalsProvidedInPatch) {
    const shouldRecomputeSidebarTotals =
      meta.recomputeSidebarTotals ||
      (mapsTouched &&
        !meta.preserveSidebarTotals &&
        meta.sidebarStreamsUnreadDelta === undefined &&
        meta.sidebarDmsUnreadDelta === undefined);
    if (shouldRecomputeSidebarTotals) {
      Object.assign(
        result,
        computeSidebarUnreadTotals(
          patch.streamsMap ?? state.streamsMap,
          patch.dmsMap ?? state.dmsMap,
        ),
      );
    } else if (meta.preserveSidebarTotals) {
      result.sidebarStreamsUnread = state.sidebarStreamsUnread;
      result.sidebarDmsUnread = state.sidebarDmsUnread;
    } else if (
      meta.sidebarStreamsUnreadDelta !== undefined ||
      meta.sidebarDmsUnreadDelta !== undefined
    ) {
      Object.assign(
        result,
        applySidebarUnreadDeltas(state, {
          streams: meta.sidebarStreamsUnreadDelta,
          dms: meta.sidebarDmsUnreadDelta,
        }),
      );
    }
  }

  if (patch.lastAppliedMessages !== undefined) {
    const userId = patch.currentUserId ?? state.currentUserId;
    const mentionIds = collectUnreadMentionIdsFromMessages(patch.lastAppliedMessages ?? [], userId);
    result.mentionedUnreadMessageIds = buildMentionUnreadSetFromIds(mentionIds);
    result.mentionsUnreadCount = mentionIds.length;
  } else if (patch.currentUserId !== undefined && state.lastAppliedMessages != null) {
    const mentionIds = collectUnreadMentionIdsFromMessages(
      state.lastAppliedMessages,
      patch.currentUserId,
    );
    result.mentionedUnreadMessageIds = buildMentionUnreadSetFromIds(mentionIds);
    result.mentionsUnreadCount = mentionIds.length;
  }

  if (patch.streamTopicMessageIds !== undefined) {
    // Caller supplied an incremental index update.
  } else if (meta.rebuildStreamTopicIndex && patch.messageIdToLocation !== undefined) {
    result.streamTopicMessageIds = buildStreamTopicMessageIndex(patch.messageIdToLocation);
  } else if (patch.messageIdToLocation !== undefined) {
    result.streamTopicMessageIds = patchStreamTopicMessageIndex(
      state.streamTopicMessageIds,
      state.messageIdToLocation,
      patch.messageIdToLocation,
    );
  } else if (meta.rebuildStreamTopicIndex) {
    result.streamTopicMessageIds = buildStreamTopicMessageIndex(state.messageIdToLocation);
  }

  return result;
}

function streamsMapToSortedStreams(
  streamsMap: Map<string, StreamEntryInternal>,
  mentionFlags: MentionLocationFlags = buildMentionLocationFlags(new Set(), new Map()),
): StreamWithLast[] {
  return Array.from(streamsMap.values())
    .sort((a, b) => b.ts - a.ts)
    .map((s) => {
      const topics = Array.from(s.topics.values())
        .sort((a, b) => b.ts - a.ts)
        .map((t) => ({
          topicUuid: t.topicUuid,
          subject: t.subject,
          lastMessage: t.lastMessage,
          lastMessageSenderName: t.lastMessageSenderName,
          time: t.time,
          badge: t.unreadCount > 0 ? t.unreadCount : undefined,
          hasMention: false
            ? true
            : undefined,
        }));
      const badge = topics.reduce((sum, t) => sum + (t.badge ?? 0), 0);
      return {
        streamUuid: s.streamUuid,
        private: s.private,
        name: s.name,
        lastMessage: s.lastMessage,
        lastMessageSenderName: s.lastMessageSenderName,
        time: s.time,
        topics,
        badge: badge > 0 ? badge : undefined,
        hasMention: undefined,
      };
    });
}

function dmsMapToSortedDms(
  map: Map<string, DmEntryInternal>,
): Extract<SidebarChat, { type: "dm" }>[] {
  return Array.from(map.entries())
    .sort(([, a], [, b]) => (b.ts ?? 0) - (a.ts ?? 0))
    .map(([, x]) => ({
      type: "dm" as const,
      id: x.id,
      name: x.name,
      slug: x.slug,
      lastMessage: x.lastMessage,
      time: x.time,
      userIds: x.userIds,
      streamUuid: x.streamUuid,
      userUuid: x.userUuid,
      badge: x.unreadCount > 0 ? x.unreadCount : undefined,
      avatar_url: x.avatar_url,
      ts: x.ts,
    }));
}

function mergeTopicsForMove(
  oldTopic: StreamTopicEntryInternal,
  nextTopicName: string,
  targetTopic: StreamTopicEntryInternal | undefined,
): StreamTopicEntryInternal {
  if (targetTopic == null) {
    return { ...oldTopic, subject: nextTopicName };
  }
  const newest = oldTopic.ts >= targetTopic.ts ? oldTopic : targetTopic;
  const alternate = newest === oldTopic ? targetTopic : oldTopic;
  return {
    ...newest,
    subject: nextTopicName,
    unreadCount: oldTopic.unreadCount + targetTopic.unreadCount,
    lastMessageId: newest.lastMessageId ?? alternate.lastMessageId,
  };
}

const emptyStreamsMap = () => new Map<string, StreamEntryInternal>();
const emptyDmsMap = () => new Map<string, DmEntryInternal>();

// Referential-identity caches: recompute only when the underlying Map reference changes.
let _cachedStreams: StreamWithLast[] | null = null;
let _cachedStreamsMapRef: Map<string, StreamEntryInternal> | null = null;
let _cachedStreamsMentionIdsRef: ReadonlySet<MessageId> | null = null;
let _cachedStreamsLocationsRef: ReadonlyMap<MessageId, MessageLocation> | null = null;

let _cachedDms: Extract<SidebarChat, { type: "dm" }>[] | null = null;
let _cachedDmsMapRef: Map<string, DmEntryInternal> | null = null;
let _cachedDmsMentionIdsRef: ReadonlySet<MessageId> | null = null;
let _cachedDmsLocationsRef: ReadonlyMap<MessageId, MessageLocation> | null = null;

function getAvatarMap() {
  const source = useUsersStore.getState().getAvatarMap();
  const numeric = new Map<number, string>();
  for (const [key, value] of source) {
    const userId = Number(key);
    if (Number.isInteger(userId) && userId > 0) {
      numeric.set(userId, value);
    }
  }
  return numeric;
}

function persistRecentDmPartnersFromMap(map: Map<string, DmEntryInternal>): void {
  const partnerIds = Array.from(map.values())
    .sort((left, right) => (right.ts ?? 0) - (left.ts ?? 0))
    .map((dm) => dm.id)
    .slice(0, 50);
  saveRecentDmPartners(partnerIds);
}

function createDmBootstrapDisplayContext(): ChatListDmBootstrapDisplayContext {
  const usersStore = useUsersStore.getState();
  return {
    getParticipantDisplayName(userId) {
      const displayName = usersStore.getDisplayName(userId);
      if (displayName !== "Unknown") {
        return displayName;
      }
      const user = usersStore.getUser(userId);
      return getDmPartnerName({
        id: userId,
        full_name: user?.full_name,
        email: user?.email,
      });
    },
    getAvatarUrl: (userId) => usersStore.getAvatarUrl(userId),
    dmFallbackLabel: t("dm.privateChat"),
  };
}

// Skip map copies when only display fields changed — permission metadata updates are rare.
function hasStreamMetadataAccessChanged(
  existing: StreamEntryInternal,
  nextEntry: StreamEntryInternal,
): boolean {
  if (existing.streamUuid !== nextEntry.streamUuid) {
    return true;
  }
  if (existing.isArchived !== nextEntry.isArchived) {
    return true;
  }
  if (existing.creatorId !== nextEntry.creatorId) {
    return true;
  }
  if (existing.inviteOnly !== nextEntry.inviteOnly) {
    return true;
  }
  if (existing.private !== nextEntry.private) {
    return true;
  }
  if (
    !areGroupSettingValuesEqual(existing.canAddSubscribersGroup, nextEntry.canAddSubscribersGroup)
  ) {
    return true;
  }
  if (
    !areGroupSettingValuesEqual(
      existing.canRemoveSubscribersGroup,
      nextEntry.canRemoveSubscribersGroup,
    )
  ) {
    return true;
  }
  if (
    !areGroupSettingValuesEqual(
      existing.canAdministerChannelGroup,
      nextEntry.canAdministerChannelGroup,
    )
  ) {
    return true;
  }
  if (
    !areGroupSettingValuesEqual(existing.canResolveTopicsGroup, nextEntry.canResolveTopicsGroup)
  ) {
    return true;
  }
  if (
    !areGroupSettingValuesEqual(
      existing.canMoveMessagesOutOfChannelGroup,
      nextEntry.canMoveMessagesOutOfChannelGroup,
    )
  ) {
    return true;
  }
  return false;
}

export const useChatListStore = create<ChatListState>((set, get) => {
  let previewResolveGeneration = 0;
  const previewResolveAbortControllers = new Set<AbortController>();
  const invalidatePreviewResolveLifecycle = () => {
    previewResolveGeneration += 1;
    for (const controller of previewResolveAbortControllers) {
      controller.abort();
    }
    previewResolveAbortControllers.clear();
  };

  const patchSet = (update: ChatListPatchInput, meta: ChatListPatchMeta = {}) => {
    if (typeof update === "function") {
      set((state) => {
        const patch = update(state);
        if (patch === state) return state;
        return {
          ...state,
          ...finalizeChatListPatch(state, patch, meta),
        };
      });
      return;
    }
    set((state) => ({
      ...state,
      ...finalizeChatListPatch(state, update, meta),
    }));
  };

  const reconcileUnreadMaps = (
    unreadStreamCounts: Map<string, number>,
    unreadDmCounts: Map<string, number>,
    unreadLocationMap: Map<MessageId, MessageLocation>,
    latestUnreadStreams: Map<string, WorkspaceRawMessage>,
    latestUnreadDms: Map<string, WorkspaceRawMessage>,
    effectiveUserId: UserId | null,
  ) => {
    const totalsBefore = summarizeSidebarUnreadTotals(get());
    logSidebarUnreadFlow("store:reconcileUnreadMaps:start", {
      streamTopicBuckets: unreadStreamCounts.size,
      dmBuckets: unreadDmCounts.size,
      locationIndexIncoming: unreadLocationMap.size,
      totalsBefore,
    });
    patchSet((state) =>
      applyReconcileUnreadMapsPatch(state, {
        unreadStreamCounts,
        unreadDmCounts,
        unreadLocationMap,
        latestUnreadStreams,
        latestUnreadDms,
        effectiveUserId,
        avatarMap: getAvatarMap(),
      }),
    );
    logSidebarUnreadFlow("store:reconcileUnreadMaps:done", {
      totalsAfter: summarizeSidebarUnreadTotals(get()),
      locationIndexSize: get().messageIdToLocation.size,
    });

    persistRecentDmPartnersFromMap(get().dmsMap);
  };

  return {
    streamsMap: emptyStreamsMap(),
    dmsMap: emptyDmsMap(),
    sidebarDataHydrated: false,
    streamMetadataHydrated: false,
    currentUserId: null,
    lastAppliedMessages: null,
    messageIdToLocation: new Map(),
    streamTopicMessageIds: new Map(),
    sidebarStreamsUnread: 0,
    sidebarDmsUnread: 0,
    mentionsUnreadCount: 0,
    mentionedUnreadMessageIds: new Set<MessageId>(),
    mentionsUnreadCapped: false,
    mentionsUnreadApiSynced: false,
    bootstrapError: null,

    setBootstrapError(error) {
      logStoreAction("chatList", "setBootstrapError", { hasError: error != null });
      set({ bootstrapError: error });
    },

    clearBootstrapError() {
      logStoreAction("chatList", "clearBootstrapError");
      set(clearBootstrapErrorPatch());
    },

    setFromMessages(messages, currentUserId) {
      invalidatePreviewResolveLifecycle();
      const effectiveUserId = currentUserId ?? get().currentUserId;
      const bootstrapState = buildSetFromMessagesBootstrapState(
        messages,
        effectiveUserId,
        get().streamsMap,
        getAvatarMap(),
      );
      logChatListFlow("store: setFromMessages (full rebuild from messages)", {
        ...summarizeMessengerMessagesForFlowDebug(messages),
        currentUserId: effectiveUserId,
        streamsMapSize: bootstrapState.streamsMap.size,
        dmsMapSize: bootstrapState.dmsMap.size,
        messageIdToLocationSize: bootstrapState.messageIdToLocation.size,
      });
      patchSet(bootstrapState, { recomputeSidebarTotals: true, rebuildStreamTopicIndex: true });
      persistRecentDmPartnersFromMap(bootstrapState.dmsMap);
    },

    hydrateFromIndexedDbSnapshot(snapshot: ChatListSnapshotSerialized) {
      invalidatePreviewResolveLifecycle();
      const hydrateState = buildChatListHydrateFromSnapshotState(snapshot, get().currentUserId);
      _cachedStreams = null;
      _cachedStreamsMapRef = null;
      _cachedStreamsMentionIdsRef = null;
      _cachedStreamsLocationsRef = null;
      _cachedDms = null;
      _cachedDmsMapRef = null;
      _cachedDmsMentionIdsRef = null;
      _cachedDmsLocationsRef = null;
      patchSet(hydrateState, { recomputeSidebarTotals: true, rebuildStreamTopicIndex: true });
      logChatListFlow("store: hydrateFromIndexedDbSnapshot", {
        streamsMapSize: hydrateState.streamsMap.size,
        dmsMapSize: hydrateState.dmsMap.size,
        messageIdToLocationSize: hydrateState.messageIdToLocation.size,
        lastMessageId: snapshot.lastMessageId,
        currentUserId: hydrateState.currentUserId,
      });
      persistRecentDmPartnersFromMap(hydrateState.dmsMap);
    },

    reconcileUnreadFromMessages(messages, currentUserId) {
      const effectiveUserId = currentUserId ?? get().currentUserId;
      const unreadLocationMap = buildUnreadLocationMap(messages, effectiveUserId);
      const latestUnreadStreams = buildLatestUnreadStreamMessageMap(messages, effectiveUserId);
      const latestUnreadDms = buildLatestUnreadDmMessageMap(messages, effectiveUserId);
      const unreadStreamCounts = new Map<string, number>();
      const unreadDmCounts = new Map<string, number>();

      for (const location of unreadLocationMap.values()) {
        if (location.type === "stream") {
          const key = streamTopicCompositeKey(location.streamUuid, location.topic);
          unreadStreamCounts.set(key, (unreadStreamCounts.get(key) ?? 0) + 1);
        } else {
          unreadDmCounts.set(location.dmKey, (unreadDmCounts.get(location.dmKey) ?? 0) + 1);
        }
      }

      reconcileUnreadMaps(
        unreadStreamCounts,
        unreadDmCounts,
        unreadLocationMap,
        latestUnreadStreams,
        latestUnreadDms,
        effectiveUserId,
      );
    },

    reconcileUnreadFromSnapshot(snapshot, currentUserId) {
      const effectiveUserId = currentUserId ?? get().currentUserId;
      logSidebarUnreadFlow("store:reconcileUnreadFromSnapshot", {
        currentUserId: effectiveUserId,
        snapshot: {
          totalCount: snapshot.totalCount,
          streamBuckets: snapshot.streams.length,
          dmBuckets: snapshot.dms.length,
          oldUnreadsMissing: snapshot.oldUnreadsMissing === true,
        },
        totalsBefore: summarizeSidebarUnreadTotals(get()),
      });
      const maps = buildUnreadReconcileMapsFromRegisterSnapshot(snapshot, effectiveUserId);
      reconcileUnreadMaps(
        maps.unreadStreamCounts,
        maps.unreadDmCounts,
        maps.unreadLocationMap,
        new Map(),
        new Map(),
        effectiveUserId,
      );
      if (!get().mentionsUnreadApiSynced && (snapshot.mentionMessageIds?.length ?? 0) > 0) {
        get().reconcileMentionsFromRegisterIds(snapshot.mentionMessageIds);
      }
    },

    reconcileMentionsFromServer(messages, options) {
      const currentUserId = get().currentUserId;
      const mentionIds = collectUnreadMentionIdsFromMockMessages(messages, currentUserId);
      const nextSet = buildMentionUnreadSetFromIds(mentionIds);
      logChatListFlow("store: reconcileMentionsFromServer", {
        incomingCount: messages.length,
        mentionCount: mentionIds.length,
        capped: options?.capped === true,
      });
      patchSet((state) => {
        const nextLoc = new Map(state.messageIdToLocation);
        for (const message of messages) {
          const location = messageLocationFromMockMessage(message, currentUserId);
          if (location != null) {
            nextLoc.set(message.id, location);
          }
        }
        return {
          mentionedUnreadMessageIds: nextSet,
          mentionsUnreadCount: nextSet.size,
          mentionsUnreadCapped: options?.capped === true,
          mentionsUnreadApiSynced: true,
          messageIdToLocation: nextLoc,
        };
      });
    },

    reconcileMentionsFromRegisterIds(messageIds) {
      if (get().mentionsUnreadApiSynced) return;
      const nextSet = buildMentionUnreadSetFromIds(messageIds);
      logChatListFlow("store: reconcileMentionsFromRegisterIds", {
        mentionCount: nextSet.size,
      });
      patchSet({
        mentionedUnreadMessageIds: nextSet,
        mentionsUnreadCount: nextSet.size,
      });
    },

    decrementMentionsForReadMessages(messageIds) {
      if (messageIds.length === 0) return;
      patchSet((state) => {
        const next = decrementMentionUnreadForMessageIds(
          state.mentionedUnreadMessageIds,
          messageIds,
        );
        if (next.mentionsUnreadCount === state.mentionsUnreadCount) {
          return state;
        }
        return next;
      });
    },

    addMessage(message, options) {
      const suppressUnreadBump = options?.suppressUnreadBump === true;
      const currentUserId = get().currentUserId;
      patchSet((state) => {
        const mentionPatch = mergeMentionUnreadPatch(state, message, currentUserId, {});
        if (!isUnreadMentionFromOthers(message, currentUserId)) {
          return mentionPatch;
        }
        if (state.messageIdToLocation.has(message.id)) {
          return mentionPatch;
        }
        const location = messageLocationFromRawMessage(message, currentUserId);
        if (location == null) {
          return mentionPatch;
        }
        const nextLoc = new Map(state.messageIdToLocation);
        nextLoc.set(message.id, location);
        return { ...mentionPatch, messageIdToLocation: nextLoc };
      });

      const { type } = message;

      if (type === "stream" && message.stream_uuid != null) {
        const result = messageToStreamEntry(message);
        if (!result) return;
        const { streamUuid, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
        const topic = result.topic;
        const topicUnreadDelta =
          !suppressUnreadBump && isUnreadFromOthers(message, currentUserId) ? 1 : 0;
        if (topicUnreadDelta > 0) {
          logSidebarUnreadFlow("store:addMessage:stream", {
            messageId: message.id,
            streamId: streamUuid,
            topic: topic.subject,
            topicUnreadDelta,
            ...summarizeSidebarUnreadTotals(get()),
          });
        }
        patchSet((state) => {
          if (topicUnreadDelta > 0 && state.messageIdToLocation.has(message.id)) {
            logSidebarUnreadFlow("store:addMessage:stream:skip", {
              reason: "alreadyInLocationIndex",
              messageId: message.id,
            });
            return state;
          }
          const existing = state.streamsMap.get(streamUuid);
          if (existing && message.timestamp <= existing.ts) {
            const existingTopic = existing.topics.get(topic.subject);
            if (existingTopic && message.timestamp <= existingTopic.ts) {
              if (topicUnreadDelta === 0) {
                return state;
              }
              if (state.messageIdToLocation.has(message.id)) {
                logSidebarUnreadFlow("store:addMessage:stream:skip", {
                  reason: "staleTimestampAlreadyIndexed",
                  messageId: message.id,
                });
                return state;
              }
              logSidebarUnreadFlow("store:addMessage:stream:indexOnly", {
                messageId: message.id,
                streamId: streamUuid,
                topic: topic.subject,
              });
              const nextLoc = new Map(state.messageIdToLocation);
              nextLoc.set(message.id, {
                type: "stream",
                streamUuid,
                topic: topic.subject,
              });
              return {
                messageIdToLocation: nextLoc,
                streamTopicMessageIds: addMessageIdToStreamTopicIndex(
                  state.streamTopicMessageIds,
                  message.id,
                  streamUuid,
                  topic.subject,
                ),
              };
            }
          }
          const next = new Map(state.streamsMap);
          const merged = mergeStreamEntry(
            existing,
            streamUuid,
            name,
            lastMessage,
            lastMessageSenderName,
            time,
            ts,
            topic.subject,
            topic.lastMessage,
            topic.lastMessageSenderName,
            topic.time,
            topic.ts,
            topicUnreadDelta,
            message.id,
          );
          next.set(streamUuid, merged);
          const nextLoc = new Map(state.messageIdToLocation).set(message.id, {
            type: "stream",
            streamUuid,
            topic: topic.subject,
          });
          return {
            streamsMap: next,
            messageIdToLocation: nextLoc,
            sidebarStreamsUnread: state.sidebarStreamsUnread + topicUnreadDelta,
            streamTopicMessageIds: addMessageIdToStreamTopicIndex(
              state.streamTopicMessageIds,
              message.id,
              streamUuid,
              topic.subject,
            ),
          };
        });
        return;
      }

      if (type === "private" && Array.isArray(message.display_recipient)) {
        const dmEntry = messageToDmEntry(message, currentUserId, getAvatarMap());
        if (!dmEntry) return;
        const key = dmConversationKey(message.display_recipient, currentUserId);
        const unreadDelta =
          !suppressUnreadBump && isUnreadFromOthers(message, currentUserId) ? 1 : 0;
        if (unreadDelta > 0) {
          logSidebarUnreadFlow("store:addMessage:dm", {
            messageId: message.id,
            dmKey: key,
            unreadDelta,
            ...summarizeSidebarUnreadTotals(get()),
          });
        }
        patchSet((state) => {
          if (unreadDelta > 0 && state.messageIdToLocation.has(message.id)) {
            logSidebarUnreadFlow("store:addMessage:dm:skip", {
              reason: "alreadyInLocationIndex",
              messageId: message.id,
            });
            return state;
          }
          const existing = state.dmsMap.get(key);
          if (existing && message.timestamp <= existing.ts) {
            if (unreadDelta === 0) return state;
            if (state.messageIdToLocation.has(message.id)) {
              logSidebarUnreadFlow("store:addMessage:dm:skip", {
                reason: "staleTimestampAlreadyIndexed",
                messageId: message.id,
              });
              return state;
            }
            logSidebarUnreadFlow("store:addMessage:dm:indexOnly", {
              messageId: message.id,
              dmKey: key,
              unreadDelta,
              indexedOnly: existing == null,
            });
            const nextLoc = new Map(state.messageIdToLocation);
            nextLoc.set(message.id, { type: "dm", dmKey: key });
            if (existing == null) {
              return { messageIdToLocation: nextLoc };
            }
            const next = new Map(state.dmsMap);
            const dm = next.get(key);
            if (dm == null) {
              return { messageIdToLocation: nextLoc };
            }
            next.set(key, {
              ...dm,
              unreadCount: dm.unreadCount + unreadDelta,
            });
            return {
              dmsMap: next,
              messageIdToLocation: nextLoc,
              sidebarDmsUnread: state.sidebarDmsUnread + unreadDelta,
            };
          }
          const next = new Map(state.dmsMap);
          const avatar_url = dmEntry.avatar_url ?? existing?.avatar_url;
          next.set(key, {
            ...dmEntry,
            unreadCount: (existing?.unreadCount ?? 0) + unreadDelta,
            avatar_url,
            lastMessageId: message.id,
          });
          const nextLoc = new Map(state.messageIdToLocation);
          nextLoc.set(message.id, { type: "dm", dmKey: key });
          return {
            dmsMap: next,
            messageIdToLocation: nextLoc,
            sidebarDmsUnread: state.sidebarDmsUnread + unreadDelta,
          };
        });
        persistRecentDmPartnersFromMap(get().dmsMap);
      }
    },

    addMessages(messages) {
      logChatListFlow("store: addMessages (merge batch)", {
        ...summarizeMessengerMessagesForFlowDebug(messages),
        rawCount: messages.length,
        currentUserId: get().currentUserId,
        streamsMapSizeBefore: get().streamsMap.size,
        dmsMapSizeBefore: get().dmsMap.size,
      });
      const currentUserId = get().currentUserId;
      const streamTopicLatest = buildStreamTopicLatestMap(messages);
      const dmLatest = buildDmLatestMap(messages, currentUserId);
      const avatarMap = getAvatarMap();

      patchSet((state) =>
        applyAddMessagesBatchPatch(state, {
          messages,
          currentUserId,
          avatarMap,
          streamTopicLatest,
          dmLatest,
        }),
      );
      persistRecentDmPartnersFromMap(get().dmsMap);
      logChatListFlow("store: addMessages (done)", {
        streamsMapSizeAfter: get().streamsMap.size,
        dmsMapSizeAfter: get().dmsMap.size,
      });
    },

    upsertUnreadMessageLocations(messages) {
      if (messages.length === 0) return;
      const currentUserId = get().currentUserId;
      patchSet(
        (state) => {
          let changed = false;
          const nextLoc = new Map(state.messageIdToLocation);

          for (const m of messages) {
            if (!isUnreadFromOthers(m, currentUserId)) continue;
            if (nextLoc.has(m.id)) continue;

            if (m.type === "stream" && m.stream_uuid != null) {
              const topic = normalizeTopicForIdentity(m.subject ?? "");
              nextLoc.set(m.id, { type: "stream", streamUuid: m.stream_uuid, topic });
              changed = true;
            } else if (m.type === "private" && Array.isArray(m.display_recipient)) {
              const dmKey = dmConversationKey(m.display_recipient, currentUserId);
              if (dmKey.length === 0) continue;
              nextLoc.set(m.id, { type: "dm", dmKey });
              changed = true;
            }
          }

          if (!changed) return state;
          return { messageIdToLocation: nextLoc };
        },
        { preserveSidebarTotals: true },
      );
    },

    upsertMentionMessageLocations(messages) {
      if (messages.length === 0) return;
      const currentUserId = get().currentUserId;
      patchSet(
        (state) => {
          let changed = false;
          const nextLoc = new Map(state.messageIdToLocation);

          for (const message of messages) {
            if (nextLoc.has(message.id)) continue;
            const location = messageLocationFromMockMessage(message, currentUserId);
            if (location == null) continue;
            nextLoc.set(message.id, location);
            changed = true;
          }

          if (!changed) return state;
          return { messageIdToLocation: nextLoc };
        },
        { preserveSidebarTotals: true },
      );
    },

    applyStreamSidebarPreviewsFromMessages(messages) {
      const streamMessages = filterStreamMessagesForSidebar(messages);
      if (streamMessages.length === 0) return;
      logChatListFlow("store: applyStreamSidebarPreviewsFromMessages", {
        inputCount: messages.length,
        streamCount: streamMessages.length,
        ...summarizeMessengerMessagesForFlowDebug(streamMessages),
      });
      patchSet(
        (state) => {
          const nextStreams = mergeStreamSidebarPreviewsFromMessages(
            state.streamsMap,
            streamMessages,
          );
          if (nextStreams === state.streamsMap) return state;
          const nextLoc = new Map(state.messageIdToLocation);
          for (const m of streamMessages) {
            if (m.stream_uuid == null) continue;
            const topic = normalizeTopicForIdentity(m.subject ?? "");
            nextLoc.set(m.id, { type: "stream", streamUuid: m.stream_uuid, topic });
          }
          return {
            streamsMap: nextStreams,
            messageIdToLocation: nextLoc,
            sidebarDataHydrated: true,
          };
        },
        { preserveSidebarTotals: true },
      );
    },

    upsertStreamTopicShells(streamUuid, topics) {
      const normalizedStreamUuid = streamUuid.trim().toLowerCase();
      if (normalizedStreamUuid.length === 0 || topics.length === 0) return;

      patchSet(
        (state) => {
          const stream = state.streamsMap.get(normalizedStreamUuid);
          if (stream == null) return state;

          let nextTopics = stream.topics;
          let changed = false;
          for (const row of topics) {
            const topicUuid = row.topicUuid.trim().toLowerCase();
            const topicName = normalizeTopicForIdentity(row.name);
            if (topicUuid.length === 0 || topicName.length === 0) continue;
            const existing = nextTopics.get(topicName);
            if (existing?.topicUuid === topicUuid && existing.subject === topicName) continue;
            if (!changed) {
              nextTopics = new Map(nextTopics);
              changed = true;
            }
            nextTopics.set(topicName, {
              ...(existing ?? {
                lastMessage: "",
                lastMessageSenderName: undefined,
                time: "",
                ts: 0,
                unreadCount: 0,
              }),
              topicUuid,
              subject: topicName,
            });
          }
          if (!changed) return state;
          const nextStreams = new Map(state.streamsMap);
          nextStreams.set(normalizedStreamUuid, { ...stream, topics: nextTopics });
          return { streamsMap: nextStreams, sidebarDataHydrated: true };
        },
        { preserveSidebarTotals: true },
      );
    },

    upsertStreamMetadataRows(rows) {
      if (rows.length === 0) return;
      logChatListFlow("store: upsertStreamMetadataRows", { rowCount: rows.length });
      patchSet(
        (state) => {
          let changed = false;
          let nextStreams = state.streamsMap;
          for (const row of rows) {
            const streamUuid = row.streamUuid.trim().toLowerCase();
            if (streamUuid.length === 0) continue;
            const existing = nextStreams.get(streamUuid);
            const normalizedRow = { ...row, streamUuid };
            const nextEntry = buildStreamMetadataEntry(normalizedRow, existing);
            if (existing === undefined) {
              // Subscribed streams must appear even when the active message window has no rows for them.
              if (!changed) nextStreams = new Map(nextStreams);
              changed = true;
              nextStreams.set(streamUuid, nextEntry);
              continue;
            }
            if (existing.name !== nextEntry.name) {
              if (!changed) nextStreams = new Map(nextStreams);
              changed = true;
              nextStreams.set(streamUuid, nextEntry);
              continue;
            }
            if (hasStreamMetadataAccessChanged(existing, nextEntry)) {
              if (!changed) nextStreams = new Map(nextStreams);
              changed = true;
              nextStreams.set(streamUuid, nextEntry);
            }
          }
          if (!changed) return state;
          return { streamsMap: nextStreams, sidebarDataHydrated: true };
        },
        { preserveSidebarTotals: true },
      );
    },

    setStreamMetadataHydrated(value) {
      patchSet((state) => {
        if (state.streamMetadataHydrated === value) return state;
        return { streamMetadataHydrated: value };
      });
    },

    setStreamArchived(streamId, isArchived) {
      const streamUuid = streamId.trim().toLowerCase();
      if (streamUuid.length === 0) return;
      patchSet(
        (state) => {
          const existing = state.streamsMap.get(streamUuid);
          if (!existing || existing.isArchived === isArchived) return state;
          const nextStreams = new Map(state.streamsMap);
          if (isArchived === undefined) {
            const rest = { ...existing };
            delete rest.isArchived;
            nextStreams.set(streamUuid, rest);
          } else {
            nextStreams.set(streamUuid, { ...existing, isArchived });
          }
          return { streamsMap: nextStreams };
        },
        { preserveSidebarTotals: true },
      );
    },

    upsertDmMetadataRows(rows) {
      if (rows.length === 0) return;
      logChatListFlow("store: upsertDmMetadataRows", { rowCount: rows.length });
      const currentUserId = get().currentUserId;
      const display = createDmBootstrapDisplayContext();
      patchSet((state) => {
        const upsertPatch = buildDmMetadataUpsertPatch(rows, currentUserId, state.dmsMap, display);
        if (upsertPatch == null) return state;
        return {
          dmsMap: upsertPatch.dmsMap,
          sidebarDataHydrated: true,
          sidebarDmsUnread: state.sidebarDmsUnread + upsertPatch.sidebarDmsUnreadDelta,
        };
      });
      persistRecentDmPartnersFromMap(get().dmsMap);
    },

    setCurrentUserId(id) {
      const prev = get().currentUserId;
      if (prev !== id) {
        invalidatePreviewResolveLifecycle();
      }
      patchSet({ currentUserId: id });
      // Late currentUserId arrival: rebuild DM keys and titles that were built without the self participant.
      if (prev === null && id != null) {
        const { lastAppliedMessages, dmsMap } = get();
        if (lastAppliedMessages != null && lastAppliedMessages.length > 0) {
          get().setFromMessages(lastAppliedMessages, id);
          return;
        }
        if (dmsMap.size > 0) {
          // Metadata-only sidebar: soft rebuild now that currentUserId is known for DM keys.
          get().upsertDmMetadataRows(buildDmMetadataRowsFromDmsMap(dmsMap));
        }
      }
    },

    renameStream(streamId, nextName) {
      const trimmedName = nextName.trim();
      if (trimmedName.length === 0) return;
      patchSet(
        (state) => {
          const existing = state.streamsMap.get(streamId);
          if (!existing) return state;
          const nextStreams = new Map(state.streamsMap);
          nextStreams.set(normalizedStreamId, { ...existing, name: trimmedName });
          return { streamsMap: nextStreams };
        },
        { preserveSidebarTotals: true },
      );
    },

    moveStreamTopic({ streamId, oldTopic, newTopic, messageIds, anchorMessageId }) {
      const normalizedStreamId = streamId.trim().toLowerCase();
      if (normalizedStreamId.length === 0) return;
      const oldTopicKey = normalizeTopicForIdentity(oldTopic);
      const nextTopicKey = normalizeTopicForIdentity(newTopic);
      if (oldTopicKey === nextTopicKey) {
        return;
      }
      const targetMessageIds = resolveTopicMoveTargetMessageIds({ messageIds, anchorMessageId });
      if (targetMessageIds.length === 0) return;
      const affectedMessageIds = new Set(targetMessageIds);

      patchSet(
        (state) => {
          const stream = state.streamsMap.get(normalizedStreamId);
          if (!stream) return state;
          let nextLocations = state.messageIdToLocation;
          let locationsChanged = false;
          const ensureMutableLocations = () => {
            if (!locationsChanged) {
              nextLocations = new Map(nextLocations);
              locationsChanged = true;
            }
          };
          const assignTopicForLocation = (messageId: MessageId) => {
            const location = nextLocations.get(messageId);
            if (location?.type !== "stream" || location.streamUuid !== normalizedStreamId) return;
            if (location.topic === nextTopicKey) return;
            ensureMutableLocations();
            nextLocations.set(messageId, { ...location, topic: nextTopicKey });
          };

          for (const messageId of affectedMessageIds) {
            assignTopicForLocation(messageId);
          }

          const knownOldTopicMessageIds = [
            ...getStreamTopicMessageIds(state.streamTopicMessageIds, normalizedStreamId, oldTopicKey),
          ];
          const canMoveTopicEntry =
            knownOldTopicMessageIds.length > 0 &&
            knownOldTopicMessageIds.every((messageId) => affectedMessageIds.has(messageId));

          let streamsChanged = false;
          let nextStreams = state.streamsMap;
          if (canMoveTopicEntry) {
            const oldTopicEntry = stream.topics.get(oldTopicKey);
            if (oldTopicEntry) {
              const nextTopics = new Map(stream.topics);
              const targetTopicEntry = nextTopics.get(nextTopicKey);
              const mergedTopic = mergeTopicsForMove(oldTopicEntry, nextTopicKey, targetTopicEntry);
              nextTopics.set(nextTopicKey, mergedTopic);
              nextTopics.delete(oldTopicKey);

              const newestTopic = getNewestTopicEntry(nextTopics);
              nextStreams = new Map(state.streamsMap);
              nextStreams.set(normalizedStreamId, {
                ...stream,
                topics: nextTopics,
                ...(newestTopic != null
                  ? {
                      lastMessage: newestTopic.lastMessage,
                      lastMessageSenderName: newestTopic.lastMessageSenderName,
                      time: newestTopic.time,
                      ts: newestTopic.ts,
                    }
                  : {}),
              });
              streamsChanged = true;
            }
          }

          if (!locationsChanged && !streamsChanged) return state;

          let streamTopicMessageIds = state.streamTopicMessageIds;
          if (locationsChanged) {
            streamTopicMessageIds = patchStreamTopicMessageIndex(
              state.streamTopicMessageIds,
              state.messageIdToLocation,
              nextLocations,
            );
          }

          return {
            ...(streamsChanged ? { streamsMap: nextStreams } : {}),
            ...(locationsChanged ? { messageIdToLocation: nextLocations } : {}),
            ...(locationsChanged || streamsChanged ? { streamTopicMessageIds } : {}),
          };
        },
        { preserveSidebarTotals: true },
      );
    },

    moveTopicToStream({
      sourceStreamId,
      targetStreamId,
      oldTopic,
      newTopic,
      messageIds,
      anchorMessageId,
    }) {
      const normalizedSourceStreamId = sourceStreamId.trim().toLowerCase();
      const normalizedTargetStreamId = targetStreamId.trim().toLowerCase();
      if (normalizedSourceStreamId.length === 0 || normalizedTargetStreamId.length === 0) return;
      if (normalizedSourceStreamId === normalizedTargetStreamId) return;
      const oldTopicKey = normalizeTopicForIdentity(oldTopic);
      const nextTopicKey = normalizeTopicForIdentity(newTopic);
      const targetMessageIds = resolveTopicMoveTargetMessageIds({ messageIds, anchorMessageId });
      if (targetMessageIds.length === 0) return;
      const affectedMessageIds = new Set(targetMessageIds);

      patchSet(
        (state) => {
          const sourceStream = state.streamsMap.get(normalizedSourceStreamId);
          const targetStream = state.streamsMap.get(normalizedTargetStreamId);
          if (!sourceStream || !targetStream) return state;

          let nextLocations = state.messageIdToLocation;
          let locationsChanged = false;
          const ensureMutableLocations = () => {
            if (!locationsChanged) {
              nextLocations = new Map(nextLocations);
              locationsChanged = true;
            }
          };
          const assignStreamTopicForLocation = (messageId: MessageId) => {
            const location = nextLocations.get(messageId);
            if (location?.type !== "stream" || location.streamUuid !== normalizedSourceStreamId) return;
            if (location.streamUuid === normalizedTargetStreamId && location.topic === nextTopicKey) return;
            ensureMutableLocations();
            nextLocations.set(messageId, {
              type: "stream",
              streamUuid: normalizedTargetStreamId,
              topic: nextTopicKey,
            });
          };

          for (const messageId of affectedMessageIds) {
            assignStreamTopicForLocation(messageId);
          }

          const knownOldTopicMessageIds = [
            ...getStreamTopicMessageIds(state.streamTopicMessageIds, normalizedSourceStreamId, oldTopicKey),
          ];
          const canMoveTopicEntry =
            knownOldTopicMessageIds.length > 0 &&
            knownOldTopicMessageIds.every((messageId) => affectedMessageIds.has(messageId));

          let streamsChanged = false;
          let nextStreams = state.streamsMap;
          if (canMoveTopicEntry) {
            const oldTopicEntry = sourceStream.topics.get(oldTopicKey);
            if (oldTopicEntry) {
              const sourceTopics = new Map(sourceStream.topics);
              sourceTopics.delete(oldTopicKey);
              const sourceNewestTopic = getNewestTopicEntry(sourceTopics);

              const targetTopics = new Map(targetStream.topics);
              const targetTopicEntry = targetTopics.get(nextTopicKey);
              const mergedTopic = mergeTopicsForMove(oldTopicEntry, nextTopicKey, targetTopicEntry);
              targetTopics.set(nextTopicKey, mergedTopic);
              const targetNewestTopic = getNewestTopicEntry(targetTopics);

              nextStreams = new Map(state.streamsMap);
              nextStreams.set(normalizedSourceStreamId, {
                ...sourceStream,
                topics: sourceTopics,
                ...(sourceNewestTopic != null
                  ? {
                      lastMessage: sourceNewestTopic.lastMessage,
                      lastMessageSenderName: sourceNewestTopic.lastMessageSenderName,
                      time: sourceNewestTopic.time,
                      ts: sourceNewestTopic.ts,
                    }
                  : {
                      lastMessage: "",
                      lastMessageSenderName: undefined,
                      time: "",
                      ts: 0,
                    }),
              });
              nextStreams.set(normalizedTargetStreamId, {
                ...targetStream,
                topics: targetTopics,
                ...(targetNewestTopic != null
                  ? {
                      lastMessage: targetNewestTopic.lastMessage,
                      lastMessageSenderName: targetNewestTopic.lastMessageSenderName,
                      time: targetNewestTopic.time,
                      ts: targetNewestTopic.ts,
                    }
                  : {}),
              });
              streamsChanged = true;
            }
          }

          if (!locationsChanged && !streamsChanged) return state;

          let streamTopicMessageIds = state.streamTopicMessageIds;
          if (locationsChanged) {
            streamTopicMessageIds = patchStreamTopicMessageIndex(
              state.streamTopicMessageIds,
              state.messageIdToLocation,
              nextLocations,
            );
          }

          return {
            ...(streamsChanged ? { streamsMap: nextStreams } : {}),
            ...(locationsChanged ? { messageIdToLocation: nextLocations } : {}),
            ...(locationsChanged || streamsChanged ? { streamTopicMessageIds } : {}),
          };
        },
        { preserveSidebarTotals: true },
      );
    },

    removeStreamTopic(streamId, topic) {
      const streamUuid = streamId.trim().toLowerCase();
      if (streamUuid.length === 0) return;
      const topicKey = normalizeTopicForIdentity(topic);

      patchSet((state) => {
        const stream = state.streamsMap.get(streamUuid);
        if (!stream) return state;

        let nextLocations = state.messageIdToLocation;
        let locationsChanged = false;
        const messageIdsInTopic = getStreamTopicMessageIds(
          state.streamTopicMessageIds,
          streamId,
          topicKey,
        );
        if (messageIdsInTopic.length > 0) {
          nextLocations = new Map(nextLocations);
          locationsChanged = true;
          for (const messageId of messageIdsInTopic) {
            nextLocations.delete(messageId);
          }
        }

        if (!stream.topics.has(topicKey)) {
          if (!locationsChanged) return state;
          return { messageIdToLocation: nextLocations };
        }

        const removedTopicUnread = stream.topics.get(topicKey)?.unreadCount ?? 0;
        const nextTopics = new Map(stream.topics);
        nextTopics.delete(topicKey);
        const newestTopic = getNewestTopicEntry(nextTopics);
        const nextStreams = new Map(state.streamsMap);
        nextStreams.set(streamUuid, {
          ...stream,
          topics: nextTopics,
          ...(newestTopic != null
            ? {
                lastMessage: newestTopic.lastMessage,
                lastMessageSenderName: newestTopic.lastMessageSenderName,
                time: newestTopic.time,
                ts: newestTopic.ts,
              }
            : {
                lastMessage: "",
                lastMessageSenderName: undefined,
                time: "",
                ts: 0,
              }),
        });

        return {
          streamsMap: nextStreams,
          ...(locationsChanged ? { messageIdToLocation: nextLocations } : {}),
          sidebarStreamsUnread: state.sidebarStreamsUnread - removedTopicUnread,
          ...(locationsChanged
            ? {
                streamTopicMessageIds: patchStreamTopicMessageIndex(
                  state.streamTopicMessageIds,
                  state.messageIdToLocation,
                  nextLocations,
                ),
              }
            : {
                streamTopicMessageIds: removeStreamTopicKeyFromIndex(
                  state.streamTopicMessageIds,
                  streamId,
                  topicKey,
                ),
              }),
        };
      });
    },

    patchPersonalDmRowLabelsForUser(userId) {
      if (!isNumericUserId(userId) || !Number.isFinite(userId) || userId <= 0) return;
      const users = useUsersStore.getState();
      const storeDisplayName = users.getDisplayName(userId);
      if (storeDisplayName === "Unknown") return;
      const userFullName = users.getUser(userId)?.full_name;
      patchSet(
        (state) => {
          let changed = false;
          const next = new Map(state.dmsMap);
          for (const [key, entry] of next) {
            if (entry.id !== userId) continue;
            const resolved = resolvePersonalDmSidebarTitle({
              chatName: entry.name,
              userFullName,
              storeDisplayName,
            });
            if (resolved !== entry.name) {
              next.set(key, { ...entry, name: resolved });
              changed = true;
            }
          }
          if (!changed) return state;
          _cachedDms = null;
          _cachedDmsMapRef = null;
          return { dmsMap: next };
        },
        { preserveSidebarTotals: true },
      );
    },

    removeStream(streamId) {
      patchSet((state) => {
        if (!state.streamsMap.has(streamId)) return state;
        const stream = state.streamsMap.get(streamId);
        let removedStreamsUnread = 0;
        if (stream != null) {
          for (const topic of stream.topics.values()) {
            removedStreamsUnread += topic.unreadCount;
          }
        }
        const nextStreams = new Map(state.streamsMap);
        nextStreams.delete(streamId);

        const nextMessageLocations = new Map(state.messageIdToLocation);
        for (const messageId of collectMessageIdsForStream(state.streamTopicMessageIds, streamId)) {
          nextMessageLocations.delete(messageId);
        }

        const nextLastAppliedMessages =
          state.lastAppliedMessages?.filter((message) => message.stream_uuid !== streamId) ?? null;

        return {
          streamsMap: nextStreams,
          messageIdToLocation: nextMessageLocations,
          lastAppliedMessages: nextLastAppliedMessages,
          sidebarStreamsUnread: state.sidebarStreamsUnread - removedStreamsUnread,
          streamTopicMessageIds: removeStreamFromStreamTopicIndex(
            state.streamTopicMessageIds,
            streamId,
          ),
        };
      });
    },

    syncDerivedScalars() {
      const state = get();
      patchSet(
        {
          streamsMap: state.streamsMap,
          dmsMap: state.dmsMap,
          messageIdToLocation: state.messageIdToLocation,
          lastAppliedMessages: state.lastAppliedMessages,
          currentUserId: state.currentUserId,
        },
        { recomputeSidebarTotals: true, rebuildStreamTopicIndex: true },
      );
    },

    clear() {
      logChatListFlow("store: clear", {});
      invalidatePreviewResolveLifecycle();
      _cachedStreams = null;
      _cachedStreamsMapRef = null;
      _cachedStreamsMentionIdsRef = null;
      _cachedStreamsLocationsRef = null;
      _cachedDms = null;
      _cachedDmsMapRef = null;
      _cachedDmsMentionIdsRef = null;
      _cachedDmsLocationsRef = null;
      patchSet(
        {
          streamsMap: emptyStreamsMap(),
          dmsMap: emptyDmsMap(),
          sidebarDataHydrated: false,
          streamMetadataHydrated: false,
          currentUserId: null,
          lastAppliedMessages: null,
          messageIdToLocation: new Map(),
          sidebarStreamsUnread: 0,
          sidebarDmsUnread: 0,
          streamTopicMessageIds: new Map(),
          mentionsUnreadCount: 0,
          mentionedUnreadMessageIds: new Set<MessageId>(),
          mentionsUnreadCapped: false,
          mentionsUnreadApiSynced: false,
        },
        { recomputeSidebarTotals: true, rebuildStreamTopicIndex: true },
      );
    },

    decrementUnreadForMessages(messageIds) {
      if (messageIds.length === 0) return;
      const totalsBefore = summarizeSidebarUnreadTotals(get());
      logSidebarUnreadFlow("store:decrementUnreadForMessages", {
        ...summarizeMessageIdsForFlowDebug(messageIds),
        totalsBefore,
      });
      patchSet((state) => {
        const locMap = state.messageIdToLocation;
        let nextStreams = state.streamsMap;
        let nextDms = state.dmsMap;
        const nextLoc = new Map(locMap);
        let sidebarStreamsUnreadDelta = 0;
        let sidebarDmsUnreadDelta = 0;
        for (const mid of messageIds) {
          const loc = locMap.get(mid);
          if (!loc) continue;
          if (loc.type === "stream") {
            const stream = nextStreams.get(loc.streamUuid);
            if (!stream) continue;
            const topic = stream.topics.get(loc.topic);
            if (!topic || topic.unreadCount <= 0) continue;
            sidebarStreamsUnreadDelta -= 1;
            nextStreams = new Map(nextStreams);
            const nextTopics = new Map(stream.topics);
            nextTopics.set(loc.topic, {
              ...topic,
              unreadCount: Math.max(0, topic.unreadCount - 1),
            });
            nextStreams.set(loc.streamUuid, { ...stream, topics: nextTopics });
          } else {
            const dm = nextDms.get(loc.dmKey);
            if (!dm || dm.unreadCount <= 0) continue;
            sidebarDmsUnreadDelta -= 1;
            nextDms = new Map(nextDms);
            nextDms.set(loc.dmKey, { ...dm, unreadCount: Math.max(0, dm.unreadCount - 1) });
          }
        }
        return {
          streamsMap: nextStreams,
          dmsMap: nextDms,
          messageIdToLocation: nextLoc,
          sidebarStreamsUnread: state.sidebarStreamsUnread + sidebarStreamsUnreadDelta,
          sidebarDmsUnread: state.sidebarDmsUnread + sidebarDmsUnreadDelta,
          streamTopicMessageIds: patchStreamTopicMessageIndex(
            state.streamTopicMessageIds,
            state.messageIdToLocation,
            nextLoc,
          ),
        };
      });
      logSidebarUnreadFlow("store:decrementUnreadForMessages:done", {
        totalsAfter: summarizeSidebarUnreadTotals(get()),
      });
    },

    decrementUnreadForTopic(streamId, topic, count) {
      if (!Number.isFinite(count) || count <= 0) return;
      const normalizedStreamId = streamId.trim().toLowerCase();
      if (normalizedStreamId.length === 0) return;
      const topicKey = normalizeTopicForIdentity(topic);
      logSidebarUnreadFlow("store:decrementUnreadForTopic", {
        streamId,
        topic: topicKey,
        count,
        totalsBefore: summarizeSidebarUnreadTotals(get()),
      });
      patchSet((state) => {
        const stream = state.streamsMap.get(normalizedStreamId);
        const streamTopic = stream?.topics.get(topicKey);
        if (!stream || !streamTopic || streamTopic.unreadCount <= 0) return state;
        const decrement = Math.min(count, streamTopic.unreadCount);
        const nextStreams = new Map(state.streamsMap);
        const nextTopics = new Map(stream.topics);
        nextTopics.set(topicKey, {
          ...streamTopic,
          unreadCount: streamTopic.unreadCount - decrement,
        });
        nextStreams.set(normalizedStreamId, { ...stream, topics: nextTopics });
        return {
          streamsMap: nextStreams,
          sidebarStreamsUnread: state.sidebarStreamsUnread - decrement,
        };
      });
    },

    decrementUnreadForDmKey(dmKey, count) {
      if (!Number.isFinite(count) || count <= 0) return;
      const key = dmKey.trim();
      if (key.length === 0) return;
      logSidebarUnreadFlow("store:decrementUnreadForDmKey", {
        dmKey: key,
        count,
        totalsBefore: summarizeSidebarUnreadTotals(get()),
      });
      patchSet((state) => {
        const dm = state.dmsMap.get(key);
        if (!dm || dm.unreadCount <= 0) return state;
        const decrement = Math.min(count, dm.unreadCount);
        const nextDms = new Map(state.dmsMap);
        nextDms.set(key, { ...dm, unreadCount: dm.unreadCount - decrement });
        return {
          dmsMap: nextDms,
          sidebarDmsUnread: state.sidebarDmsUnread - decrement,
        };
      });
    },

    incrementUnreadForMessages(messageIds) {
      if (messageIds.length === 0) return;
      logSidebarUnreadFlow("store:incrementUnreadForMessages", {
        ...summarizeMessageIdsForFlowDebug(messageIds),
        totalsBefore: summarizeSidebarUnreadTotals(get()),
      });
      patchSet((state) => {
        const locMap = state.messageIdToLocation;
        let nextStreams = state.streamsMap;
        let nextDms = state.dmsMap;
        let sidebarStreamsUnreadDelta = 0;
        let sidebarDmsUnreadDelta = 0;
        for (const mid of messageIds) {
          const loc = locMap.get(mid);
          if (!loc) continue;
          if (loc.type === "stream") {
            const stream = nextStreams.get(loc.streamUuid);
            if (!stream) continue;
            const topic = stream.topics.get(loc.topic);
            if (!topic) continue;
            sidebarStreamsUnreadDelta += 1;
            nextStreams = new Map(nextStreams);
            const nextTopics = new Map(stream.topics);
            nextTopics.set(loc.topic, { ...topic, unreadCount: topic.unreadCount + 1 });
            nextStreams.set(loc.streamUuid, { ...stream, topics: nextTopics });
          } else {
            const dm = nextDms.get(loc.dmKey);
            if (!dm) continue;
            sidebarDmsUnreadDelta += 1;
            nextDms = new Map(nextDms);
            nextDms.set(loc.dmKey, { ...dm, unreadCount: dm.unreadCount + 1 });
          }
        }
        return {
          streamsMap: nextStreams,
          dmsMap: nextDms,
          sidebarStreamsUnread: state.sidebarStreamsUnread + sidebarStreamsUnreadDelta,
          sidebarDmsUnread: state.sidebarDmsUnread + sidebarDmsUnreadDelta,
        };
      });
    },

    handleDeleteMessages(messageIds, options) {
      if (messageIds.length === 0) return;
      const deletedMessageIds = new Set(messageIds);
      const replacementMessages = options?.replacementMessages ?? [];
      const resolveMissingPreview = options?.resolveMissingPreview ?? true;
      let contextsToResolveFromNetwork: DeletedPreviewContext[] = [];
      const currentUserId = get().currentUserId;

      patchSet(
        (state) => {
          const result = applyHandleDeleteMessagesStatePatch(state, {
            messageIds,
            deletedMessageIds,
            replacementMessages,
            resolveMissingPreview,
            currentUserId,
          });
          contextsToResolveFromNetwork = result.contextsToResolveFromNetwork;
          return result.patch;
        },
        { preserveSidebarTotals: true },
      );

      if (!resolveMissingPreview || contextsToResolveFromNetwork.length === 0) return;
      const previewResolveAbortController = new AbortController();
      previewResolveAbortControllers.add(previewResolveAbortController);
      const previewResolveStartedGeneration = previewResolveGeneration;
      const uniqueContexts = new Map<string, DeletedPreviewContext>();
      for (const context of contextsToResolveFromNetwork) {
        const key =
          context.kind === "stream"
            ? streamTopicCompositeKey(context.streamId, context.topicKey)
            : `dm:${context.dmKey}`;
        uniqueContexts.set(key, context);
      }
      void Promise.all(
        Array.from(uniqueContexts.values()).map(async (context) => {
          if (
            previewResolveAbortController.signal.aborted ||
            previewResolveStartedGeneration !== previewResolveGeneration
          ) {
            return;
          }
          const replacement = await fetchReplacementMessageForDeletedPreview(
            context,
            currentUserId,
            previewResolveAbortController.signal,
          );
          if (
            replacement == null ||
            previewResolveAbortController.signal.aborted ||
            previewResolveStartedGeneration !== previewResolveGeneration
          ) {
            return;
          }
          if (context.kind === "stream") {
            const streamContext = context;
            patchSet(
              (state) => {
                if (
                  previewResolveAbortController.signal.aborted ||
                  previewResolveStartedGeneration !== previewResolveGeneration
                ) {
                  return state;
                }
                const stream = state.streamsMap.get(streamContext.streamId);
                const topic = stream?.topics.get(streamContext.topicKey);
                if (!stream || !topic || topic.lastMessageId != null) return state;
                const nextStreams = new Map(state.streamsMap);
                const nextTopics = new Map(stream.topics);
                nextTopics.set(streamContext.topicKey, {
                  ...topic,
                  ...buildResolvedPreviewFromMessage(replacement),
                });
                const nextStream = rebuildStreamFromTopics(
                  { ...stream, topics: nextTopics },
                  nextTopics,
                );
                nextStreams.set(streamContext.streamId, nextStream);
                return { streamsMap: nextStreams };
              },
              { preserveSidebarTotals: true },
            );
            return;
          }

          const dmContext = context;
          patchSet(
            (state) => {
              if (
                previewResolveAbortController.signal.aborted ||
                previewResolveStartedGeneration !== previewResolveGeneration
              ) {
                return state;
              }
              const dm = state.dmsMap.get(dmContext.dmKey);
              if (!dm || dm.lastMessageId != null) return state;
              const nextDms = new Map(state.dmsMap);
              nextDms.set(dmContext.dmKey, {
                ...dm,
                ...buildResolvedDmPreviewFromMessage(replacement),
              });
              return { dmsMap: nextDms };
            },
            { preserveSidebarTotals: true },
          );
        }),
      ).finally(() => {
        previewResolveAbortControllers.delete(previewResolveAbortController);
      });
    },

    streams() {
      const state = get();
      const map = state.streamsMap;
      const mentionIds = state.mentionedUnreadMessageIds;
      const locations = state.messageIdToLocation;
      if (
        map === _cachedStreamsMapRef &&
        mentionIds === _cachedStreamsMentionIdsRef &&
        locations === _cachedStreamsLocationsRef &&
        _cachedStreams != null
      ) {
        return _cachedStreams;
      }
      const mentionFlags = buildMentionLocationFlags(mentionIds, locations);
      _cachedStreamsMapRef = map;
      _cachedStreamsMentionIdsRef = mentionIds;
      _cachedStreamsLocationsRef = locations;
      _cachedStreams = streamsMapToSortedStreams(map, mentionFlags);
      return _cachedStreams;
    },

    dms() {
      const state = get();
      const map = state.dmsMap;
      const mentionIds = state.mentionedUnreadMessageIds;
      const locations = state.messageIdToLocation;
      if (
        map === _cachedDmsMapRef &&
        mentionIds === _cachedDmsMentionIdsRef &&
        locations === _cachedDmsLocationsRef &&
        _cachedDms != null
      ) {
        return _cachedDms;
      }
      _cachedDmsMapRef = map;
      _cachedDmsMentionIdsRef = mentionIds;
      _cachedDmsLocationsRef = locations;
      _cachedDms = dmsMapToSortedDms(map);
      return _cachedDms;
    },
  };
});
