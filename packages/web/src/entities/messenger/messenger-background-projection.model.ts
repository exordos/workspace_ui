import { create } from "zustand";
import type {
  WorkspaceMessengerEpochVersion,
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerFolderItemChatType,
  WorkspaceMessengerFolderSystemType,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerTopicNotificationMode,
  WorkspaceMessengerUuid,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";
import {
  hasWorkspaceMentionForCurrentUser,
  hasWorkspaceWildcardMention,
} from "~/shared/lib/workspace-desktop-notifications.lib";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import {
  workspaceMessengerMessageRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import type {
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeSkipReason,
  WorkspaceRealtimeSkippedEvent,
  WorkspaceRealtimeTransportState,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import {
  resolveMessengerMessageLiveEffectPolicy,
  type MessengerMessageLiveEffectPolicyReason,
} from "./messenger-live-effects.lib";

const MAX_RECENT_EVENTS = 50;
const MAX_NOTIFICATION_CANDIDATES = 50;
const MAX_SKIPPED_EVENTS = 50;
// Background keeps only limited in-memory data to speed up cold start.
// This is not a second chat store: only compact notification data and short chat names live here.
const MAX_LIGHTWEIGHT_SNAPSHOTS = 200;
const LIGHTWEIGHT_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

const EMPTY_BACKGROUND_PROJECTIONS: Record<string, MessengerBackgroundProjection> = {};

// Background candidate хранит только компактные данные для будущей нотификации:
// summary, UUID и готовые Workspace-маршруты. Полный body сообщения сюда не кладем.
export type MessengerBackgroundConversationAudience = "private" | "channel" | "unknown";

export interface MessengerBackgroundNotificationCandidate {
  ownerKey: string;
  organizationId: string;
  projectId: string;
  epochVersion: WorkspaceMessengerEpochVersion;
  messageUuid: WorkspaceMessengerUuid;
  streamUuid: WorkspaceMessengerUuid;
  topicUuid: WorkspaceMessengerUuid;
  authorUuid: WorkspaceMessengerUuid;
  isOwn: boolean;
  read: boolean;
  createdAt: string;
  previewText: string;
  audience: MessengerBackgroundConversationAudience;
  streamName: string | null;
  topicName: string | null;
  messageRoute: string;
  streamRoute: string;
  topicRoute: string;
  streamConversationId: string;
  topicConversationId: string;
  streamNotificationMode: WorkspaceMessengerStreamNotificationMode | null;
  topicNotificationMode: WorkspaceMessengerTopicNotificationMode | null;
  hasCurrentUserMention?: boolean;
  hasWildcardMention?: boolean;
  notificationEligible?: boolean;
  liveEffectPolicyReason?: MessengerMessageLiveEffectPolicyReason;
  observedAt: number;
}

export interface MessengerBackgroundRecentEvent {
  ownerKey: string;
  epochVersion: WorkspaceMessengerEpochVersion;
  kind: string;
  source: WorkspaceRealtimeEventContext["source"];
  observedAt: number;
}

export interface MessengerBackgroundSkippedEvent {
  ownerKey: string;
  epochVersion: WorkspaceMessengerEpochVersion;
  reason: WorkspaceRealtimeSkipReason;
  kind: string;
  source: WorkspaceRealtimeEventContext["source"];
  observedAt: number;
}

export interface MessengerBackgroundStreamSnapshot {
  ownerKey: string;
  streamUuid: WorkspaceMessengerUuid;
  streamName: string;
  unreadCount: number;
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
  notificationMode: WorkspaceMessengerStreamNotificationMode;
  isPrivate: boolean;
  lastMessageUuid: WorkspaceMessengerUuid | null;
  isArchived: boolean;
  epochVersion: WorkspaceMessengerEpochVersion;
  updatedAt: string;
  observedAt: number;
}

export interface MessengerBackgroundTopicSnapshot {
  ownerKey: string;
  topicUuid: WorkspaceMessengerUuid;
  streamUuid: WorkspaceMessengerUuid;
  topicName: string | null;
  unreadCount: number;
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
  notificationMode: WorkspaceMessengerTopicNotificationMode;
  lastMessageUuid: WorkspaceMessengerUuid | null;
  isDefault: boolean;
  isDone: boolean;
  epochVersion: WorkspaceMessengerEpochVersion;
  updatedAt: string;
  observedAt: number;
}

export interface MessengerBackgroundFolderSnapshot {
  ownerKey: string;
  folderUuid: WorkspaceMessengerUuid;
  unreadCount: number;
  systemType: WorkspaceMessengerFolderSystemType;
  folderItemIds: WorkspaceMessengerUuid[];
  epochVersion: WorkspaceMessengerEpochVersion;
  updatedAt: string;
  observedAt: number;
}

export interface MessengerBackgroundFolderItemSnapshot {
  ownerKey: string;
  folderItemUuid: WorkspaceMessengerUuid;
  folderUuid: WorkspaceMessengerUuid | null;
  streamUuid: WorkspaceMessengerUuid;
  chatType: WorkspaceMessengerFolderItemChatType;
  orderIndex: number | null;
  unreadCount: number;
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
  epochVersion: WorkspaceMessengerEpochVersion;
  updatedAt: string;
  observedAt: number;
}

export interface MessengerBackgroundMessageIdSnapshot {
  ownerKey: string;
  messageUuid: WorkspaceMessengerUuid;
  streamUuid: WorkspaceMessengerUuid;
  topicUuid: WorkspaceMessengerUuid;
  authorUuid: WorkspaceMessengerUuid | null;
  isOwn: boolean | null;
  read: boolean | null;
  epochVersion: WorkspaceMessengerEpochVersion;
  createdAt: string | null;
  updatedAt: string | null;
  observedAt: number;
  deletedAt: number | null;
}

export interface MessengerBackgroundFolderItemTopology {
  streamUuid: WorkspaceMessengerUuid;
  folderUuid: WorkspaceMessengerUuid | null;
}

export interface MessengerBackgroundProjection {
  ownerKey: string;
  lastEpochVersion: WorkspaceMessengerEpochVersion | null;
  unreadByFolderId: Record<WorkspaceMessengerUuid, number>;
  unreadByFolderItemId: Record<WorkspaceMessengerUuid, number>;
  streamSnapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundStreamSnapshot>;
  topicSnapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundTopicSnapshot>;
  folderSnapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderSnapshot>;
  folderItemSnapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemSnapshot>;
  folderItemTopologyById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemTopology>;
  messageIdSnapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundMessageIdSnapshot>;
  recentEvents: MessengerBackgroundRecentEvent[];
  notificationCandidates: MessengerBackgroundNotificationCandidate[];
  skippedEvents: MessengerBackgroundSkippedEvent[];
  lastTransportState: WorkspaceRealtimeTransportState | null;
}

export interface MessengerBackgroundProjectionStoreState {
  projectionsByOwnerKey: Record<string, MessengerBackgroundProjection>;
  recordAppliedEvent: (
    ownerKey: string,
    event: WorkspaceRealtimeEvent,
    context: WorkspaceRealtimeEventContext,
  ) => void;
  recordSkippedEvent: (
    ownerKey: string,
    event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
    reason: WorkspaceRealtimeSkipReason,
    context: WorkspaceRealtimeEventContext,
  ) => void;
  recordTransportState: (state: WorkspaceRealtimeTransportState) => void;
  removeStreamProjection: (ownerKey: string, streamUuid: WorkspaceMessengerUuid) => void;
  clearOwner: (ownerKey: string) => void;
  clear: () => void;
}

type WorkspaceRealtimeMessageSnapshotEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "message"; message: WorkspaceMessengerMessageDto }
>;
type WorkspaceRealtimeDeletedMessageEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "message"; kind: "message.deleted" }
>;
type WorkspaceRealtimeStreamEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "stream"; stream: WorkspaceMessengerStreamDto }
>;
type WorkspaceRealtimeDeletedStreamEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "stream"; kind: "stream.deleted" }
>;
type WorkspaceRealtimeTopicEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "topic"; topic: WorkspaceMessengerTopicDto }
>;
type WorkspaceRealtimeDeletedTopicEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "topic"; kind: "topic.deleted" }
>;
type WorkspaceRealtimeFolderEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "folder"; folder: WorkspaceMessengerFolderDto }
>;
type WorkspaceRealtimeDeletedFolderEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "folder"; kind: "folder.deleted" }
>;
type WorkspaceRealtimeFolderItemEvent = Extract<WorkspaceRealtimeEvent, { type: "folder_item" }>;

function createEmptyProjection(ownerKey: string): MessengerBackgroundProjection {
  return {
    ownerKey,
    lastEpochVersion: null,
    unreadByFolderId: {},
    unreadByFolderItemId: {},
    streamSnapshotsById: {},
    topicSnapshotsById: {},
    folderSnapshotsById: {},
    folderItemSnapshotsById: {},
    folderItemTopologyById: {},
    messageIdSnapshotsById: {},
    recentEvents: [],
    notificationCandidates: [],
    skippedEvents: [],
    lastTransportState: null,
  };
}

function appendBounded<T>(items: T[], item: T, limit: number): T[] {
  // Background projection lives in memory, so each collection stays short.
  const next = [item, ...items];
  return next.length > limit ? next.slice(0, limit) : next;
}

function omitRecordKey<T>(
  record: Record<WorkspaceMessengerUuid, T>,
  key: WorkspaceMessengerUuid,
): Record<WorkspaceMessengerUuid, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function advanceEpoch(
  current: WorkspaceMessengerEpochVersion | null,
  next: WorkspaceMessengerEpochVersion,
): WorkspaceMessengerEpochVersion {
  return Math.max(current ?? next, next);
}

function pruneRecentItems<T extends { observedAt: number }>(
  items: T[],
  limit: number,
  now: number,
): T[] {
  const expiresBefore = now - LIGHTWEIGHT_SNAPSHOT_TTL_MS;
  return items.filter((item) => item.observedAt >= expiresBefore).slice(0, limit);
}

function pruneSnapshotRecord<T extends { observedAt: number }>(
  record: Record<WorkspaceMessengerUuid, T>,
  getId: (snapshot: T) => WorkspaceMessengerUuid,
  now: number,
): Record<WorkspaceMessengerUuid, T> {
  const expiresBefore = now - LIGHTWEIGHT_SNAPSHOT_TTL_MS;
  const entries = Object.values(record)
    .filter((snapshot) => snapshot.observedAt >= expiresBefore)
    .sort((left, right) => right.observedAt - left.observedAt)
    .slice(0, MAX_LIGHTWEIGHT_SNAPSHOTS);

  const next: Record<WorkspaceMessengerUuid, T> = {};
  for (const snapshot of entries) {
    next[getId(snapshot)] = snapshot;
  }
  return next;
}

function compactProjection(
  projection: MessengerBackgroundProjection,
  now: number,
): MessengerBackgroundProjection {
  // Compaction runs on every event because background runtime can live for hours without UI opening.
  return {
    ...projection,
    recentEvents: pruneRecentItems(projection.recentEvents, MAX_RECENT_EVENTS, now),
    notificationCandidates: pruneRecentItems(
      projection.notificationCandidates,
      MAX_NOTIFICATION_CANDIDATES,
      now,
    ),
    skippedEvents: pruneRecentItems(projection.skippedEvents, MAX_SKIPPED_EVENTS, now),
    streamSnapshotsById: pruneSnapshotRecord(
      projection.streamSnapshotsById,
      (snapshot) => snapshot.streamUuid,
      now,
    ),
    topicSnapshotsById: pruneSnapshotRecord(
      projection.topicSnapshotsById,
      (snapshot) => snapshot.topicUuid,
      now,
    ),
    folderSnapshotsById: pruneSnapshotRecord(
      projection.folderSnapshotsById,
      (snapshot) => snapshot.folderUuid,
      now,
    ),
    folderItemSnapshotsById: pruneSnapshotRecord(
      projection.folderItemSnapshotsById,
      (snapshot) => snapshot.folderItemUuid,
      now,
    ),
    messageIdSnapshotsById: pruneSnapshotRecord(
      projection.messageIdSnapshotsById,
      (snapshot) => snapshot.messageUuid,
      now,
    ),
  };
}

function eventKind(event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent): string {
  if ("kind" in event && typeof event.kind === "string") {
    return event.kind;
  }

  if ("type" in event && typeof event.type === "string") {
    return event.type;
  }

  return "unknown";
}

function isMessageCreatedEvent(
  event: WorkspaceRealtimeEvent,
): event is WorkspaceRealtimeMessageSnapshotEvent {
  return (
    event.type === "message" && event.kind !== "message.updated" && event.kind !== "message.deleted"
  );
}

function applyEventProjection(
  projection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeEvent,
  context: WorkspaceRealtimeEventContext,
): MessengerBackgroundProjection {
  const observedAt = Date.now();
  const recentEvent: MessengerBackgroundRecentEvent = {
    ownerKey: context.ownerKey,
    epochVersion: event.epoch_version,
    kind: eventKind(event),
    source: context.source,
    observedAt,
  };
  const baseProjection = compactProjection(
    {
      ...projection,
      lastEpochVersion: advanceEpoch(projection.lastEpochVersion, event.epoch_version),
      recentEvents: appendBounded(projection.recentEvents, recentEvent, MAX_RECENT_EVENTS),
    },
    observedAt,
  );

  if (event.type === "message" && event.kind === "message.deleted") {
    return applyDeletedMessageProjection(baseProjection, event, context, observedAt);
  }

  if (event.type === "message") {
    return applyMessageProjection(baseProjection, event, context, observedAt);
  }

  if (event.type === "stream" && event.kind === "stream.deleted") {
    return applyDeletedStreamProjection(baseProjection, event, observedAt);
  }

  if (event.type === "stream") {
    return applyStreamProjection(baseProjection, event, context, observedAt);
  }

  if (event.type === "topic" && event.kind === "topic.deleted") {
    return applyDeletedTopicProjection(baseProjection, event, observedAt);
  }

  if (event.type === "topic") {
    return applyTopicProjection(baseProjection, event, context, observedAt);
  }

  if (event.type === "folder" && event.kind === "folder.deleted") {
    return applyDeletedFolderProjection(baseProjection, event, observedAt);
  }

  if (event.type === "folder") {
    return applyFolderProjection(baseProjection, event, context, observedAt);
  }

  if (event.type === "folder_item") {
    return applyFolderItemProjection(baseProjection, event, observedAt);
  }

  return baseProjection;
}

function applyDeletedMessageProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeDeletedMessageEvent,
  context: WorkspaceRealtimeEventContext,
  observedAt: number,
): MessengerBackgroundProjection {
  // Delete keeps a tombstone without text or author; that is enough to stop treating the message as live.
  return compactProjection(
    {
      ...baseProjection,
      messageIdSnapshotsById: {
        ...baseProjection.messageIdSnapshotsById,
        [event.message.uuid]: {
          ownerKey: context.ownerKey,
          messageUuid: event.message.uuid,
          streamUuid: event.message.stream_uuid,
          topicUuid: event.message.topic_uuid,
          authorUuid: null,
          isOwn: null,
          read: null,
          epochVersion: event.epoch_version,
          createdAt: null,
          updatedAt: null,
          observedAt,
          deletedAt: observedAt,
        },
      },
    },
    observedAt,
  );
}

function applyMessageProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeMessageSnapshotEvent,
  context: WorkspaceRealtimeEventContext,
  observedAt: number,
): MessengerBackgroundProjection {
  const nextProjection: MessengerBackgroundProjection = {
    ...baseProjection,
    messageIdSnapshotsById: {
      ...baseProjection.messageIdSnapshotsById,
      [event.message.uuid]: {
        ownerKey: context.ownerKey,
        messageUuid: event.message.uuid,
        streamUuid: event.message.stream_uuid,
        topicUuid: event.message.topic_uuid,
        authorUuid: event.message.author_uuid,
        isOwn: event.message.is_own,
        read: event.message.read,
        epochVersion: event.epoch_version,
        createdAt: event.message.created_at,
        updatedAt: event.message.updated_at,
        observedAt,
        deletedAt: null,
      },
    },
  };

  if (!isMessageCreatedEvent(event) || context.notificationsEnabled !== true) {
    // Updates are needed for the id snapshot but must not become notification candidates again.
    return compactProjection(nextProjection, observedAt);
  }

  const liveEffectPolicy = resolveMessengerMessageLiveEffectPolicy(event.message);
  if (!liveEffectPolicy.notificationEligible) {
    return compactProjection(nextProjection, observedAt);
  }

  const streamNotificationMode =
    baseProjection.streamSnapshotsById[event.message.stream_uuid]?.notificationMode ?? null;
  const streamSnapshot = baseProjection.streamSnapshotsById[event.message.stream_uuid];
  const topicSnapshot = baseProjection.topicSnapshotsById[event.message.topic_uuid];
  const topicNotificationMode = topicSnapshot?.notificationMode ?? null;
  const previewText = summarizeWorkspaceMessageMarkdown(event.message.payload.content).text;
  // Пока stream snapshot не приехал, тип разговора честно не угадываем.
  const audience: MessengerBackgroundConversationAudience =
    streamSnapshot == null ? "unknown" : streamSnapshot.isPrivate ? "private" : "channel";
  // Для default topic держим null, чтобы следующий слой сам собрал корректный заголовок.
  const topicName = topicSnapshot?.topicName ?? null;
  // В фоне считаем только уверенные признаки: UUID-mention текущего пользователя и простые wildcard.
  const hasCurrentUserMention =
    event.message.mentioned ??
    hasWorkspaceMentionForCurrentUser({
      kind: audience === "private" ? "dm" : "stream",
      markdown: event.message.payload.content,
      isOwn: event.message.is_own,
      read: event.message.read,
      currentUserUuid: context.owner.userUuid,
    });
  const hasWildcardMention = hasWorkspaceWildcardMention(event.message.payload.content);
  const candidate: MessengerBackgroundNotificationCandidate = {
    ownerKey: context.ownerKey,
    organizationId: context.owner.organizationId,
    projectId: context.owner.projectId,
    epochVersion: event.epoch_version,
    messageUuid: event.message.uuid,
    streamUuid: event.message.stream_uuid,
    topicUuid: event.message.topic_uuid,
    authorUuid: event.message.author_uuid,
    isOwn: event.message.is_own,
    read: event.message.read,
    createdAt: event.message.created_at,
    previewText,
    audience,
    streamName: streamSnapshot?.streamName ?? null,
    topicName,
    messageRoute: workspaceMessengerMessageRoute({
      orgId: context.owner.organizationId,
      projectId: context.owner.projectId,
      messageUuid: event.message.uuid,
    }),
    streamRoute: workspaceMessengerStreamRoute({
      orgId: context.owner.organizationId,
      projectId: context.owner.projectId,
      streamUuid: event.message.stream_uuid,
    }),
    topicRoute: workspaceMessengerTopicRoute({
      orgId: context.owner.organizationId,
      projectId: context.owner.projectId,
      streamUuid: event.message.stream_uuid,
      topicUuid: event.message.topic_uuid,
    }),
    streamConversationId: conversationIdForStream(event.message.stream_uuid),
    topicConversationId: conversationIdForTopic(
      event.message.stream_uuid,
      event.message.topic_uuid,
    ),
    streamNotificationMode,
    topicNotificationMode,
    hasCurrentUserMention,
    hasWildcardMention,
    notificationEligible: liveEffectPolicy.notificationEligible,
    liveEffectPolicyReason: liveEffectPolicy.reason,
    observedAt,
  };
  return compactProjection(
    {
      ...nextProjection,
      notificationCandidates: appendBounded(
        nextProjection.notificationCandidates,
        candidate,
        MAX_NOTIFICATION_CANDIDATES,
      ),
    },
    observedAt,
  );
}

function applyDeletedStreamProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeDeletedStreamEvent,
  observedAt: number,
): MessengerBackgroundProjection {
  return removeStreamProjection(baseProjection, event.stream.uuid, observedAt);
}

function removeStreamProjection(
  baseProjection: MessengerBackgroundProjection,
  streamUuid: WorkspaceMessengerUuid,
  observedAt: number,
): MessengerBackgroundProjection {
  const streamSnapshotsById = omitRecordKey(baseProjection.streamSnapshotsById, streamUuid);
  const topicSnapshotsById = removeSnapshotsByStreamUuid(
    baseProjection.topicSnapshotsById,
    streamUuid,
  );
  const folderItemSnapshotsById = removeFolderItemSnapshotsByStreamUuid(
    baseProjection.folderItemSnapshotsById,
    streamUuid,
  );
  const folderSnapshotsById = filterFolderSnapshotsByExistingItems(
    baseProjection.folderSnapshotsById,
    folderItemSnapshotsById,
  );
  const messageIdSnapshotsById = removeMessageSnapshotsByStreamUuid(
    baseProjection.messageIdSnapshotsById,
    streamUuid,
  );
  const affectedFolderIds = new Set<WorkspaceMessengerUuid>();
  const folderItemTopologyById: Record<
    WorkspaceMessengerUuid,
    MessengerBackgroundFolderItemTopology
  > = {};
  const durableUnreadByFolderItemId = { ...baseProjection.unreadByFolderItemId };
  for (const [folderItemUuid, topology] of Object.entries(baseProjection.folderItemTopologyById)) {
    if (topology.streamUuid === streamUuid) {
      delete durableUnreadByFolderItemId[folderItemUuid];
      if (topology.folderUuid != null) affectedFolderIds.add(topology.folderUuid);
    } else {
      folderItemTopologyById[folderItemUuid] = topology;
    }
  }
  const folderUnreadProjection = projectBackgroundFolderUnreadTotals(
    {
      ...baseProjection,
      folderItemTopologyById,
      unreadByFolderItemId: durableUnreadByFolderItemId,
      folderSnapshotsById,
    },
    durableUnreadByFolderItemId,
    affectedFolderIds,
  );

  return compactProjection(
    {
      ...baseProjection,
      unreadByFolderItemId: durableUnreadByFolderItemId,
      streamSnapshotsById,
      topicSnapshotsById,
      folderSnapshotsById: folderUnreadProjection.folderSnapshotsById,
      folderItemSnapshotsById,
      folderItemTopologyById,
      messageIdSnapshotsById,
      notificationCandidates: baseProjection.notificationCandidates.filter(
        (candidate) => candidate.streamUuid !== streamUuid,
      ),
      unreadByFolderId: folderUnreadProjection.unreadByFolderId,
    },
    observedAt,
  );
}

function applyStreamProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeStreamEvent,
  context: WorkspaceRealtimeEventContext,
  observedAt: number,
): MessengerBackgroundProjection {
  const activeUnreadCount = event.stream.active_unread_count ?? event.stream.unread_count;
  const passiveUnreadCount = event.stream.passive_unread_count ?? 0;
  const folderUnreadProjection = projectStreamUnreadIntoBackgroundFolders(
    baseProjection,
    event.stream.uuid,
    event.stream.unread_count,
    activeUnreadCount,
    passiveUnreadCount,
  );

  return compactProjection(
    {
      ...baseProjection,
      ...folderUnreadProjection,
      streamSnapshotsById: {
        ...baseProjection.streamSnapshotsById,
        [event.stream.uuid]: {
          ownerKey: context.ownerKey,
          streamUuid: event.stream.uuid,
          streamName: event.stream.name,
          unreadCount: event.stream.unread_count,
          activeUnreadCount,
          passiveUnreadCount,
          notificationMode: event.stream.notification_mode,
          isPrivate: event.stream.private,
          lastMessageUuid: event.stream.last_message_uuid ?? null,
          isArchived: event.stream.is_archived,
          epochVersion: event.epoch_version,
          updatedAt: event.stream.updated_at,
          observedAt,
        },
      },
    },
    observedAt,
  );
}

function projectStreamUnreadIntoBackgroundFolders(
  projection: MessengerBackgroundProjection,
  streamUuid: WorkspaceMessengerUuid,
  unreadCount: number,
  activeUnreadCount: number,
  passiveUnreadCount: number,
): Pick<
  MessengerBackgroundProjection,
  "folderItemSnapshotsById" | "folderSnapshotsById" | "unreadByFolderItemId" | "unreadByFolderId"
> {
  const itemProjection = projectStreamUnreadIntoBackgroundFolderItems(
    projection,
    streamUuid,
    unreadCount,
    activeUnreadCount,
    passiveUnreadCount,
  );
  const folderProjection = projectBackgroundFolderUnreadTotals(
    projection,
    itemProjection.unreadByFolderItemId,
    itemProjection.affectedFolderIds,
  );

  return {
    folderItemSnapshotsById: itemProjection.folderItemSnapshotsById,
    folderSnapshotsById: folderProjection.folderSnapshotsById,
    unreadByFolderItemId: itemProjection.unreadByFolderItemId,
    unreadByFolderId: folderProjection.unreadByFolderId,
  };
}

function projectStreamUnreadIntoBackgroundFolderItems(
  projection: MessengerBackgroundProjection,
  streamUuid: WorkspaceMessengerUuid,
  unreadCount: number,
  activeUnreadCount: number,
  passiveUnreadCount: number,
): {
  affectedFolderIds: Set<WorkspaceMessengerUuid>;
  folderItemSnapshotsById: MessengerBackgroundProjection["folderItemSnapshotsById"];
  unreadByFolderItemId: MessengerBackgroundProjection["unreadByFolderItemId"];
} {
  let folderItemSnapshotsById = projection.folderItemSnapshotsById;
  let unreadByFolderItemId = projection.unreadByFolderItemId;
  const affectedFolderIds = new Set<WorkspaceMessengerUuid>();

  for (const [folderItemUuid, topology] of Object.entries(projection.folderItemTopologyById)) {
    if (topology.streamUuid !== streamUuid) continue;

    const itemSnapshot = projection.folderItemSnapshotsById[folderItemUuid];
    if (
      itemSnapshot != null &&
      (itemSnapshot.unreadCount !== unreadCount ||
        itemSnapshot.activeUnreadCount !== activeUnreadCount ||
        itemSnapshot.passiveUnreadCount !== passiveUnreadCount)
    ) {
      if (folderItemSnapshotsById === projection.folderItemSnapshotsById) {
        folderItemSnapshotsById = { ...projection.folderItemSnapshotsById };
      }
      folderItemSnapshotsById[folderItemUuid] = {
        ...itemSnapshot,
        unreadCount,
        activeUnreadCount,
        passiveUnreadCount,
      };
    }

    if (projection.unreadByFolderItemId[folderItemUuid] !== activeUnreadCount) {
      if (unreadByFolderItemId === projection.unreadByFolderItemId) {
        unreadByFolderItemId = { ...projection.unreadByFolderItemId };
      }
      unreadByFolderItemId[folderItemUuid] = activeUnreadCount;
    }

    if (topology.folderUuid != null) {
      affectedFolderIds.add(topology.folderUuid);
    }
  }

  return {
    affectedFolderIds,
    folderItemSnapshotsById,
    unreadByFolderItemId,
  };
}

function projectBackgroundFolderUnreadTotals(
  projection: MessengerBackgroundProjection,
  unreadByFolderItemId: MessengerBackgroundProjection["unreadByFolderItemId"],
  affectedFolderIds: Set<WorkspaceMessengerUuid>,
): Pick<MessengerBackgroundProjection, "folderSnapshotsById" | "unreadByFolderId"> {
  let folderSnapshotsById = projection.folderSnapshotsById;
  let unreadByFolderId = projection.unreadByFolderId;
  for (const folderUuid of affectedFolderIds) {
    const folderSnapshot = projection.folderSnapshotsById[folderUuid];
    const nextFolderUnreadCount = Object.entries(projection.folderItemTopologyById).reduce(
      (total, [folderItemUuid, topology]) =>
        topology.folderUuid === folderUuid
          ? total + (unreadByFolderItemId[folderItemUuid] ?? 0)
          : total,
      0,
    );

    if (folderSnapshot != null && folderSnapshot.unreadCount !== nextFolderUnreadCount) {
      if (folderSnapshotsById === projection.folderSnapshotsById) {
        folderSnapshotsById = { ...projection.folderSnapshotsById };
      }
      folderSnapshotsById[folderUuid] = {
        ...folderSnapshot,
        unreadCount: nextFolderUnreadCount,
      };
    }

    if (projection.unreadByFolderId[folderUuid] !== nextFolderUnreadCount) {
      if (unreadByFolderId === projection.unreadByFolderId) {
        unreadByFolderId = { ...projection.unreadByFolderId };
      }
      unreadByFolderId[folderUuid] = nextFolderUnreadCount;
    }
  }

  return {
    folderSnapshotsById,
    unreadByFolderId,
  };
}

function applyDeletedTopicProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeDeletedTopicEvent,
  observedAt: number,
): MessengerBackgroundProjection {
  const topicSnapshotsById = omitRecordKey(baseProjection.topicSnapshotsById, event.topic.uuid);
  return compactProjection(
    {
      ...baseProjection,
      topicSnapshotsById,
      messageIdSnapshotsById: removeMessageSnapshotsByTopicUuid(
        baseProjection.messageIdSnapshotsById,
        event.topic.uuid,
      ),
    },
    observedAt,
  );
}

function applyTopicProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeTopicEvent,
  context: WorkspaceRealtimeEventContext,
  observedAt: number,
): MessengerBackgroundProjection {
  return compactProjection(
    {
      ...baseProjection,
      topicSnapshotsById: {
        ...baseProjection.topicSnapshotsById,
        [event.topic.uuid]: {
          ownerKey: context.ownerKey,
          topicUuid: event.topic.uuid,
          streamUuid: event.topic.stream_uuid,
          topicName: event.topic.is_default ? null : event.topic.name,
          unreadCount: event.topic.unread_count,
          activeUnreadCount: event.topic.active_unread_count ?? event.topic.unread_count,
          passiveUnreadCount: event.topic.passive_unread_count ?? 0,
          notificationMode: event.topic.notification_mode,
          lastMessageUuid: event.topic.last_message_uuid ?? null,
          isDefault: event.topic.is_default,
          isDone: event.topic.is_done,
          epochVersion: event.epoch_version,
          updatedAt: event.topic.updated_at,
          observedAt,
        },
      },
    },
    observedAt,
  );
}

function applyDeletedFolderProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeDeletedFolderEvent,
  observedAt: number,
): MessengerBackgroundProjection {
  const unreadByFolderId = omitRecordKey(baseProjection.unreadByFolderId, event.folder.uuid);
  const folderSnapshotsById = omitRecordKey(baseProjection.folderSnapshotsById, event.folder.uuid);
  const folderItemSnapshotsById = removeFolderItemSnapshotsByFolderUuid(
    baseProjection.folderItemSnapshotsById,
    event.folder.uuid,
  );
  const folderItemTopologyById = removeFolderItemTopologyByFolderUuid(
    baseProjection.folderItemTopologyById,
    event.folder.uuid,
  );
  const unreadByFolderItemId = { ...baseProjection.unreadByFolderItemId };
  for (const [folderItemUuid, topology] of Object.entries(baseProjection.folderItemTopologyById)) {
    if (topology.folderUuid === event.folder.uuid) {
      delete unreadByFolderItemId[folderItemUuid];
    }
  }
  return compactProjection(
    {
      ...baseProjection,
      unreadByFolderId,
      unreadByFolderItemId,
      folderSnapshotsById,
      folderItemSnapshotsById,
      folderItemTopologyById,
    },
    observedAt,
  );
}

function applyFolderProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeFolderEvent,
  context: WorkspaceRealtimeEventContext,
  observedAt: number,
): MessengerBackgroundProjection {
  const nextUnreadByFolderItemId = { ...baseProjection.unreadByFolderItemId };
  const nextFolderItemSnapshotsById = { ...baseProjection.folderItemSnapshotsById };
  const nextFolderItemTopologyById = { ...baseProjection.folderItemTopologyById };
  const previousFolderItemIds = Object.entries(baseProjection.folderItemTopologyById)
    .filter(([, topology]) => topology.folderUuid === event.folder.uuid)
    .map(([folderItemUuid]) => folderItemUuid);
  const nextFolderItemIds: WorkspaceMessengerUuid[] = [];

  for (const previousFolderItemId of previousFolderItemIds) {
    delete nextUnreadByFolderItemId[previousFolderItemId];
    delete nextFolderItemSnapshotsById[previousFolderItemId];
    delete nextFolderItemTopologyById[previousFolderItemId];
  }

  for (const item of event.folder.folder_items) {
    const folderUuid = item.folder_uuid ?? item.folder ?? null;
    nextFolderItemIds.push(item.uuid);
    nextUnreadByFolderItemId[item.uuid] = item.active_unread_count ?? item.unread_count;
    nextFolderItemSnapshotsById[item.uuid] = {
      ownerKey: context.ownerKey,
      folderItemUuid: item.uuid,
      folderUuid,
      streamUuid: item.stream_uuid,
      chatType: item.chat_type,
      orderIndex: item.order_index ?? null,
      unreadCount: item.unread_count,
      activeUnreadCount: item.active_unread_count ?? item.unread_count,
      passiveUnreadCount: item.passive_unread_count ?? 0,
      epochVersion: event.epoch_version,
      updatedAt: item.updated_at,
      observedAt,
    };
    nextFolderItemTopologyById[item.uuid] = {
      streamUuid: item.stream_uuid,
      folderUuid,
    };
  }

  return compactProjection(
    {
      ...baseProjection,
      unreadByFolderId: {
        ...baseProjection.unreadByFolderId,
        [event.folder.uuid]: event.folder.unread_count,
      },
      unreadByFolderItemId: nextUnreadByFolderItemId,
      folderSnapshotsById: {
        ...baseProjection.folderSnapshotsById,
        [event.folder.uuid]: {
          ownerKey: context.ownerKey,
          folderUuid: event.folder.uuid,
          unreadCount: event.folder.unread_count,
          systemType: event.folder.system_type,
          folderItemIds: nextFolderItemIds,
          epochVersion: event.epoch_version,
          updatedAt: event.folder.updated_at,
          observedAt,
        },
      },
      folderItemSnapshotsById: nextFolderItemSnapshotsById,
      folderItemTopologyById: nextFolderItemTopologyById,
    },
    observedAt,
  );
}

function applyFolderItemProjection(
  baseProjection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeFolderItemEvent,
  observedAt: number,
): MessengerBackgroundProjection {
  const unreadByFolderItemId = omitRecordKey(
    baseProjection.unreadByFolderItemId,
    event.folder_item.uuid,
  );
  const folderItemSnapshotsById = omitRecordKey(
    baseProjection.folderItemSnapshotsById,
    event.folder_item.uuid,
  );
  const removedTopology = baseProjection.folderItemTopologyById[event.folder_item.uuid];
  const folderItemTopologyById = omitRecordKey(
    baseProjection.folderItemTopologyById,
    event.folder_item.uuid,
  );
  const folderSnapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderSnapshot> = {};

  for (const folderSnapshot of Object.values(baseProjection.folderSnapshotsById)) {
    folderSnapshotsById[folderSnapshot.folderUuid] = {
      ...folderSnapshot,
      folderItemIds: folderSnapshot.folderItemIds.filter(
        (folderItemId) => folderItemId !== event.folder_item.uuid,
      ),
    };
  }
  const affectedFolderIds = new Set<WorkspaceMessengerUuid>();
  if (removedTopology?.folderUuid != null) {
    affectedFolderIds.add(removedTopology.folderUuid);
  }
  const folderUnreadProjection = projectBackgroundFolderUnreadTotals(
    {
      ...baseProjection,
      folderItemTopologyById,
      unreadByFolderItemId,
      folderSnapshotsById,
    },
    unreadByFolderItemId,
    affectedFolderIds,
  );

  return compactProjection(
    {
      ...baseProjection,
      unreadByFolderItemId,
      folderSnapshotsById: folderUnreadProjection.folderSnapshotsById,
      folderItemSnapshotsById,
      folderItemTopologyById,
      unreadByFolderId: folderUnreadProjection.unreadByFolderId,
    },
    observedAt,
  );
}

function removeSnapshotsByStreamUuid(
  snapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundTopicSnapshot>,
  streamUuid: WorkspaceMessengerUuid,
): Record<WorkspaceMessengerUuid, MessengerBackgroundTopicSnapshot> {
  const next: Record<WorkspaceMessengerUuid, MessengerBackgroundTopicSnapshot> = {};
  for (const snapshot of Object.values(snapshotsById)) {
    if (snapshot.streamUuid !== streamUuid) {
      next[snapshot.topicUuid] = snapshot;
    }
  }
  return next;
}

function removeFolderItemSnapshotsByStreamUuid(
  snapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemSnapshot>,
  streamUuid: WorkspaceMessengerUuid,
): Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemSnapshot> {
  const next: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemSnapshot> = {};
  for (const snapshot of Object.values(snapshotsById)) {
    if (snapshot.streamUuid !== streamUuid) {
      next[snapshot.folderItemUuid] = snapshot;
    }
  }
  return next;
}

function removeFolderItemSnapshotsByFolderUuid(
  snapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemSnapshot>,
  folderUuid: WorkspaceMessengerUuid,
): Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemSnapshot> {
  const next: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemSnapshot> = {};
  for (const snapshot of Object.values(snapshotsById)) {
    if (snapshot.folderUuid !== folderUuid) {
      next[snapshot.folderItemUuid] = snapshot;
    }
  }
  return next;
}

function removeFolderItemTopologyByFolderUuid(
  topologyById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemTopology>,
  folderUuid: WorkspaceMessengerUuid,
): Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemTopology> {
  const next: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemTopology> = {};
  for (const [folderItemUuid, topology] of Object.entries(topologyById)) {
    if (topology.folderUuid !== folderUuid) {
      next[folderItemUuid] = topology;
    }
  }
  return next;
}

function removeMessageSnapshotsByStreamUuid(
  snapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundMessageIdSnapshot>,
  streamUuid: WorkspaceMessengerUuid,
): Record<WorkspaceMessengerUuid, MessengerBackgroundMessageIdSnapshot> {
  const next: Record<WorkspaceMessengerUuid, MessengerBackgroundMessageIdSnapshot> = {};
  for (const snapshot of Object.values(snapshotsById)) {
    if (snapshot.streamUuid !== streamUuid) {
      next[snapshot.messageUuid] = snapshot;
    }
  }
  return next;
}

function removeMessageSnapshotsByTopicUuid(
  snapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundMessageIdSnapshot>,
  topicUuid: WorkspaceMessengerUuid,
): Record<WorkspaceMessengerUuid, MessengerBackgroundMessageIdSnapshot> {
  const next: Record<WorkspaceMessengerUuid, MessengerBackgroundMessageIdSnapshot> = {};
  for (const snapshot of Object.values(snapshotsById)) {
    if (snapshot.topicUuid !== topicUuid) {
      next[snapshot.messageUuid] = snapshot;
    }
  }
  return next;
}

function filterFolderSnapshotsByExistingItems(
  folderSnapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderSnapshot>,
  folderItemSnapshotsById: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderItemSnapshot>,
): Record<WorkspaceMessengerUuid, MessengerBackgroundFolderSnapshot> {
  const next: Record<WorkspaceMessengerUuid, MessengerBackgroundFolderSnapshot> = {};
  for (const folderSnapshot of Object.values(folderSnapshotsById)) {
    next[folderSnapshot.folderUuid] = {
      ...folderSnapshot,
      folderItemIds: folderSnapshot.folderItemIds.filter(
        (folderItemId) => folderItemSnapshotsById[folderItemId] != null,
      ),
    };
  }
  return next;
}

function applySkippedProjection(
  projection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
  reason: WorkspaceRealtimeSkipReason,
  context: WorkspaceRealtimeEventContext,
): MessengerBackgroundProjection {
  const observedAt = Date.now();
  const compactedProjection = compactProjection(projection, observedAt);
  const skippedEvent: MessengerBackgroundSkippedEvent = {
    ownerKey: context.ownerKey,
    epochVersion: event.epoch_version,
    reason,
    kind: eventKind(event),
    source: context.source,
    observedAt,
  };

  return compactProjection(
    {
      ...compactedProjection,
      lastEpochVersion: advanceEpoch(compactedProjection.lastEpochVersion, event.epoch_version),
      skippedEvents: appendBounded(
        compactedProjection.skippedEvents,
        skippedEvent,
        MAX_SKIPPED_EVENTS,
      ),
    },
    observedAt,
  );
}

export function selectMessengerBackgroundProjectionSnapshot(
  state: MessengerBackgroundProjectionStoreState,
  ownerKey: string,
): MessengerBackgroundProjection | null {
  return state.projectionsByOwnerKey[ownerKey] ?? null;
}

export function getMessengerBackgroundProjectionSnapshot(
  ownerKey: string,
): MessengerBackgroundProjection | null {
  return selectMessengerBackgroundProjectionSnapshot(
    useMessengerBackgroundProjectionStore.getState(),
    ownerKey,
  );
}

export const useMessengerBackgroundProjectionStore =
  create<MessengerBackgroundProjectionStoreState>((set) => ({
    projectionsByOwnerKey: EMPTY_BACKGROUND_PROJECTIONS,

    recordAppliedEvent(ownerKey, event, context) {
      logStoreAction("messengerBackgroundProjection", "recordAppliedEvent", {
        ownerKey,
        epochVersion: event.epoch_version,
        kind: eventKind(event),
      });
      set((state) => {
        const projection = state.projectionsByOwnerKey[ownerKey] ?? createEmptyProjection(ownerKey);
        return {
          projectionsByOwnerKey: {
            ...state.projectionsByOwnerKey,
            [ownerKey]: applyEventProjection(projection, event, context),
          },
        };
      });
    },

    recordSkippedEvent(ownerKey, event, reason, context) {
      logStoreAction("messengerBackgroundProjection", "recordSkippedEvent", {
        ownerKey,
        epochVersion: event.epoch_version,
        reason,
      });
      set((state) => {
        const projection = state.projectionsByOwnerKey[ownerKey] ?? createEmptyProjection(ownerKey);
        return {
          projectionsByOwnerKey: {
            ...state.projectionsByOwnerKey,
            [ownerKey]: applySkippedProjection(projection, event, reason, context),
          },
        };
      });
    },

    recordTransportState(state) {
      logStoreAction("messengerBackgroundProjection", "recordTransportState", {
        ownerKey: state.ownerKey,
        mode: state.mode,
      });
      set((storeState) => {
        const projection =
          storeState.projectionsByOwnerKey[state.ownerKey] ?? createEmptyProjection(state.ownerKey);
        return {
          projectionsByOwnerKey: {
            ...storeState.projectionsByOwnerKey,
            [state.ownerKey]: {
              ...projection,
              lastTransportState: state,
            },
          },
        };
      });
    },

    removeStreamProjection(ownerKey, streamUuid) {
      logStoreAction("messengerBackgroundProjection", "removeStreamProjection", {
        ownerKey,
        streamUuid,
      });
      set((state) => {
        const projection = state.projectionsByOwnerKey[ownerKey];
        if (projection == null) return state;
        return {
          projectionsByOwnerKey: {
            ...state.projectionsByOwnerKey,
            [ownerKey]: removeStreamProjection(projection, streamUuid, Date.now()),
          },
        };
      });
    },

    clearOwner(ownerKey) {
      logStoreAction("messengerBackgroundProjection", "clearOwner", { ownerKey });
      set((state) => {
        if (state.projectionsByOwnerKey[ownerKey] == null) return state;
        const nextProjections = omitRecordKey(state.projectionsByOwnerKey, ownerKey);
        return { projectionsByOwnerKey: nextProjections };
      });
    },

    clear() {
      logStoreAction("messengerBackgroundProjection", "clear");
      set({ projectionsByOwnerKey: EMPTY_BACKGROUND_PROJECTIONS });
    },
  }));
