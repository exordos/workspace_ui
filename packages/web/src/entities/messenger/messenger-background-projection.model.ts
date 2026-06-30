import { create } from "zustand";
import type {
  WorkspaceMessengerEpochVersion,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerUuid,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";
import type {
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeSkipReason,
  WorkspaceRealtimeSkippedEvent,
  WorkspaceRealtimeTransportState,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";

const MAX_RECENT_EVENTS = 50;
const MAX_NOTIFICATION_CANDIDATES = 50;
const MAX_SKIPPED_EVENTS = 50;

const EMPTY_BACKGROUND_PROJECTIONS: Record<string, MessengerBackgroundProjection> = {};

export interface MessengerBackgroundNotificationCandidate {
  ownerKey: string;
  epochVersion: WorkspaceMessengerEpochVersion;
  messageUuid: WorkspaceMessengerUuid;
  streamUuid: WorkspaceMessengerUuid;
  topicUuid: WorkspaceMessengerUuid;
  authorUuid: WorkspaceMessengerUuid;
  isOwn: boolean;
  createdAt: string;
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

export interface MessengerBackgroundProjection {
  ownerKey: string;
  lastEpochVersion: WorkspaceMessengerEpochVersion | null;
  unreadByFolderId: Record<WorkspaceMessengerUuid, number>;
  unreadByFolderItemId: Record<WorkspaceMessengerUuid, number>;
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
  clearOwner: (ownerKey: string) => void;
  clear: () => void;
}

type WorkspaceRealtimeMessageSnapshotEvent = Extract<
  WorkspaceRealtimeEvent,
  { type: "message"; message: WorkspaceMessengerMessageDto }
>;

function createEmptyProjection(ownerKey: string): MessengerBackgroundProjection {
  return {
    ownerKey,
    lastEpochVersion: null,
    unreadByFolderId: {},
    unreadByFolderItemId: {},
    recentEvents: [],
    notificationCandidates: [],
    skippedEvents: [],
    lastTransportState: null,
  };
}

function appendBounded<T>(items: T[], item: T, limit: number): T[] {
  const next = [item, ...items];
  return next.length > limit ? next.slice(0, limit) : next;
}

function advanceEpoch(
  current: WorkspaceMessengerEpochVersion | null,
  next: WorkspaceMessengerEpochVersion,
): WorkspaceMessengerEpochVersion {
  return Math.max(current ?? next, next);
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
  const recentEvent: MessengerBackgroundRecentEvent = {
    ownerKey: context.ownerKey,
    epochVersion: event.epoch_version,
    kind: eventKind(event),
    source: context.source,
    observedAt: Date.now(),
  };
  const baseProjection: MessengerBackgroundProjection = {
    ...projection,
    lastEpochVersion: advanceEpoch(projection.lastEpochVersion, event.epoch_version),
    recentEvents: appendBounded(projection.recentEvents, recentEvent, MAX_RECENT_EVENTS),
  };

  if (isMessageCreatedEvent(event)) {
    const candidate: MessengerBackgroundNotificationCandidate = {
      ownerKey: context.ownerKey,
      epochVersion: event.epoch_version,
      messageUuid: event.message.uuid,
      streamUuid: event.message.stream_uuid,
      topicUuid: event.message.topic_uuid,
      authorUuid: event.message.author_uuid,
      isOwn: event.message.is_own,
      createdAt: event.message.created_at,
    };
    return {
      ...baseProjection,
      notificationCandidates: appendBounded(
        baseProjection.notificationCandidates,
        candidate,
        MAX_NOTIFICATION_CANDIDATES,
      ),
    };
  }

  if (event.type === "folder" && event.kind !== "folder.deleted") {
    const nextUnreadByFolderItemId = { ...baseProjection.unreadByFolderItemId };
    for (const item of event.folder.folder_items) {
      nextUnreadByFolderItemId[item.uuid] = item.unread_count;
    }

    return {
      ...baseProjection,
      unreadByFolderId: {
        ...baseProjection.unreadByFolderId,
        [event.folder.uuid]: event.folder.unread_count,
      },
      unreadByFolderItemId: nextUnreadByFolderItemId,
    };
  }

  return baseProjection;
}

function applySkippedProjection(
  projection: MessengerBackgroundProjection,
  event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
  reason: WorkspaceRealtimeSkipReason,
  context: WorkspaceRealtimeEventContext,
): MessengerBackgroundProjection {
  const skippedEvent: MessengerBackgroundSkippedEvent = {
    ownerKey: context.ownerKey,
    epochVersion: event.epoch_version,
    reason,
    kind: eventKind(event),
    source: context.source,
    observedAt: Date.now(),
  };

  return {
    ...projection,
    lastEpochVersion: advanceEpoch(projection.lastEpochVersion, event.epoch_version),
    skippedEvents: appendBounded(projection.skippedEvents, skippedEvent, MAX_SKIPPED_EVENTS),
  };
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

    clearOwner(ownerKey) {
      logStoreAction("messengerBackgroundProjection", "clearOwner", { ownerKey });
      set((state) => {
        if (state.projectionsByOwnerKey[ownerKey] == null) return state;
        const { [ownerKey]: _removed, ...nextProjections } = state.projectionsByOwnerKey;
        return { projectionsByOwnerKey: nextProjections };
      });
    },

    clear() {
      logStoreAction("messengerBackgroundProjection", "clear");
      set({ projectionsByOwnerKey: EMPTY_BACKGROUND_PROJECTIONS });
    },
  }));
