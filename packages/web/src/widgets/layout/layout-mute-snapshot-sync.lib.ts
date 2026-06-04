/**
 * Debounced mute-store → IndexedDB sync.
 * Coalesces frequent mute changes into one snapshot without overloading IDB.
 */
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { MuteSnapshotRowV2 } from "~/shared/lib/mute-snapshot-db";
import { persistMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

const MUTE_SNAPSHOT_SYNC_DEBOUNCE_MS = 750;

interface StartMuteSnapshotSyncOptions {
  instanceId: string;
  debounceMs?: number;
  persistSnapshotRow?: (row: MuteSnapshotRowV2) => Promise<void>;
}

interface MuteRefs {
  mutedStreamIds: ReturnType<typeof useMuteStore.getState>["mutedStreamIds"];
  mutedTopicKeys: ReturnType<typeof useMuteStore.getState>["mutedTopicKeys"];
  unmutedTopicKeys: ReturnType<typeof useMuteStore.getState>["unmutedTopicKeys"];
  followedTopicKeys: ReturnType<typeof useMuteStore.getState>["followedTopicKeys"];
  streamDesktopNotifyEnabledIds: ReturnType<
    typeof useMuteStore.getState
  >["streamDesktopNotifyEnabledIds"];
  streamDesktopNotifyDisabledIds: ReturnType<
    typeof useMuteStore.getState
  >["streamDesktopNotifyDisabledIds"];
  streamAudibleNotifyEnabledIds: ReturnType<
    typeof useMuteStore.getState
  >["streamAudibleNotifyEnabledIds"];
  streamAudibleNotifyDisabledIds: ReturnType<
    typeof useMuteStore.getState
  >["streamAudibleNotifyDisabledIds"];
}

function hasTrackedMuteRefsChanged(prev: MuteRefs, next: MuteRefs): boolean {
  return (
    prev.mutedStreamIds !== next.mutedStreamIds ||
    prev.mutedTopicKeys !== next.mutedTopicKeys ||
    prev.unmutedTopicKeys !== next.unmutedTopicKeys ||
    prev.followedTopicKeys !== next.followedTopicKeys ||
    prev.streamDesktopNotifyEnabledIds !== next.streamDesktopNotifyEnabledIds ||
    prev.streamDesktopNotifyDisabledIds !== next.streamDesktopNotifyDisabledIds ||
    prev.streamAudibleNotifyEnabledIds !== next.streamAudibleNotifyEnabledIds ||
    prev.streamAudibleNotifyDisabledIds !== next.streamAudibleNotifyDisabledIds
  );
}

function toSnapshotTopicRows(keys: ReadonlySet<string>): { streamId: number; topic: string }[] {
  const rows: { streamId: number; topic: string }[] = [];
  for (const key of keys) {
    const separatorIndex = key.indexOf(":");
    if (separatorIndex <= 0) continue;
    const streamId = Number(key.slice(0, separatorIndex));
    if (!Number.isInteger(streamId) || streamId <= 0) continue;
    const topic = key.slice(separatorIndex + 1);
    if (topic.length === 0) continue;
    rows.push({ streamId, topic });
  }
  return rows;
}

function buildMuteSnapshotRow(instanceId: string): MuteSnapshotRowV2 {
  const state = useMuteStore.getState();
  const mutedStreamIds = Array.from(state.mutedStreamIds).filter(
    (streamId) => Number.isInteger(streamId) && streamId > 0,
  );
  return {
    instanceId,
    version: 2,
    savedAt: Date.now(),
    mutedStreamIds,
    mutedTopics: toSnapshotTopicRows(state.mutedTopicKeys),
    unmutedTopics: toSnapshotTopicRows(state.unmutedTopicKeys),
    followedTopics: toSnapshotTopicRows(state.followedTopicKeys),
    streamDesktopNotifyEnabledIds: Array.from(state.streamDesktopNotifyEnabledIds).filter(
      (streamId) => Number.isInteger(streamId) && streamId > 0,
    ),
    streamDesktopNotifyDisabledIds: Array.from(state.streamDesktopNotifyDisabledIds).filter(
      (streamId) => Number.isInteger(streamId) && streamId > 0,
    ),
    streamAudibleNotifyEnabledIds: Array.from(state.streamAudibleNotifyEnabledIds).filter(
      (streamId) => Number.isInteger(streamId) && streamId > 0,
    ),
    streamAudibleNotifyDisabledIds: Array.from(state.streamAudibleNotifyDisabledIds).filter(
      (streamId) => Number.isInteger(streamId) && streamId > 0,
    ),
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
      mutedTopicKeys: state.mutedTopicKeys,
      unmutedTopicKeys: state.unmutedTopicKeys,
      followedTopicKeys: state.followedTopicKeys,
      streamDesktopNotifyEnabledIds: state.streamDesktopNotifyEnabledIds,
      streamDesktopNotifyDisabledIds: state.streamDesktopNotifyDisabledIds,
      streamAudibleNotifyEnabledIds: state.streamAudibleNotifyEnabledIds,
      streamAudibleNotifyDisabledIds: state.streamAudibleNotifyDisabledIds,
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
      mutedTopicKeys: nextState.mutedTopicKeys,
      unmutedTopicKeys: nextState.unmutedTopicKeys,
      followedTopicKeys: nextState.followedTopicKeys,
      streamDesktopNotifyEnabledIds: nextState.streamDesktopNotifyEnabledIds,
      streamDesktopNotifyDisabledIds: nextState.streamDesktopNotifyDisabledIds,
      streamAudibleNotifyEnabledIds: nextState.streamAudibleNotifyEnabledIds,
      streamAudibleNotifyDisabledIds: nextState.streamAudibleNotifyDisabledIds,
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
