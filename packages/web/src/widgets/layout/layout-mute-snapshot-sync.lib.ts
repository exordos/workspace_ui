/**
 * Debounced mute-store → IndexedDB sync.
 * Coalesces frequent mute changes into one snapshot without overloading IDB.
 */
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { TopicNotificationMode } from "~/features/mute-chat/notification-level.lib";
import type { MuteSnapshotRowV4 } from "~/shared/lib/mute-snapshot-db";
import { persistMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

const MUTE_SNAPSHOT_SYNC_DEBOUNCE_MS = 750;

interface StartMuteSnapshotSyncOptions {
  instanceId: string;
  debounceMs?: number;
  persistSnapshotRow?: (row: MuteSnapshotRowV4) => Promise<void>;
}

interface MuteRefs {
  mutedStreamIds: ReturnType<typeof useMuteStore.getState>["mutedStreamIds"];
  streamNotificationModes: ReturnType<typeof useMuteStore.getState>["streamNotificationModes"];
  topicNotificationModes: ReturnType<typeof useMuteStore.getState>["topicNotificationModes"];
}

function hasTrackedMuteRefsChanged(prev: MuteRefs, next: MuteRefs): boolean {
  return (
    prev.mutedStreamIds !== next.mutedStreamIds ||
    prev.streamNotificationModes !== next.streamNotificationModes ||
    prev.topicNotificationModes !== next.topicNotificationModes
  );
}

function toSnapshotTopicModeRows(
  modes: ReadonlyMap<string, TopicNotificationMode>,
): { streamId: string; topic: string; mode: TopicNotificationMode }[] {
  const rows: { streamId: string; topic: string; mode: TopicNotificationMode }[] = [];
  for (const [key, mode] of modes) {
    const separatorIndex = key.indexOf(":");
    if (separatorIndex <= 0) continue;
    const streamId = key.slice(0, separatorIndex).trim().toLowerCase();
    if (streamId.length === 0) continue;
    const topic = key.slice(separatorIndex + 1);
    if (topic.length === 0) continue;
    rows.push({ streamId, topic, mode });
  }
  return rows;
}

function buildMuteSnapshotRow(instanceId: string): MuteSnapshotRowV4 {
  const state = useMuteStore.getState();
  const mutedStreamIds = Array.from(state.mutedStreamIds).filter(
    (streamId) => streamId.trim().length > 0,
  );
  return {
    instanceId,
    version: 4,
    savedAt: Date.now(),
    mutedStreamIds,
    streamNotificationModes: Array.from(state.streamNotificationModes)
      .filter(([streamId]) => streamId.trim().length > 0)
      .map(([streamId, mode]) => ({ streamId, mode })),
    topicNotificationModes: toSnapshotTopicModeRows(state.topicNotificationModes),
  };
}

export function startMuteSnapshotSync(options: StartMuteSnapshotSyncOptions): () => void {
  const {
    instanceId,
    debounceMs = MUTE_SNAPSHOT_SYNC_DEBOUNCE_MS,
    persistSnapshotRow = persistMuteSnapshotRow,
  } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let queued = false;

  let trackedRefs: MuteRefs = (() => {
    const state = useMuteStore.getState();
    return {
      mutedStreamIds: state.mutedStreamIds,
      streamNotificationModes: state.streamNotificationModes,
      topicNotificationModes: state.topicNotificationModes,
    };
  })();

  const flushNow = () => {
    if (inFlight || !queued) return;
    queued = false;
    inFlight = true;
    void persistSnapshotRow(buildMuteSnapshotRow(instanceId))
      .catch((err) => reportUnexpectedError("layout:muteSnapshot", err, { instanceId }))
      .finally(() => {
        inFlight = false;
        if (queued) {
          scheduleFlush();
        }
      });
  };

  const scheduleFlush = () => {
    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      flushNow();
    }, debounceMs);
  };

  const queueFlush = () => {
    queued = true;
    if (inFlight) return;
    scheduleFlush();
  };

  const unsubscribe = useMuteStore.subscribe((nextState) => {
    const nextRefs: MuteRefs = {
      mutedStreamIds: nextState.mutedStreamIds,
      streamNotificationModes: nextState.streamNotificationModes,
      topicNotificationModes: nextState.topicNotificationModes,
    };
    if (!hasTrackedMuteRefsChanged(trackedRefs, nextRefs)) {
      return;
    }
    trackedRefs = nextRefs;
    queueFlush();
  });

  return () => {
    unsubscribe();
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    flushNow();
  };
}
