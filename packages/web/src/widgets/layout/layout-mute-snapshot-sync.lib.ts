/**
 * Debounced mute-store → IndexedDB sync.
 * Coalesces frequent mute changes into one snapshot without overloading IDB.
 */
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { MuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { persistMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

const MUTE_SNAPSHOT_SYNC_DEBOUNCE_MS = 750;

interface StartMuteSnapshotSyncOptions {
  instanceId: string;
  debounceMs?: number;
  persistSnapshotRow?: (row: MuteSnapshotRow) => Promise<void>;
}

interface MuteRefs {
  mutedStreamIds: ReturnType<typeof useMuteStore.getState>["mutedStreamIds"];
  mutedTopicKeys: ReturnType<typeof useMuteStore.getState>["mutedTopicKeys"];
  unmutedTopicKeys: ReturnType<typeof useMuteStore.getState>["unmutedTopicKeys"];
  followedTopicKeys: ReturnType<typeof useMuteStore.getState>["followedTopicKeys"];
}

function hasTrackedMuteRefsChanged(prev: MuteRefs, next: MuteRefs): boolean {
  return (
    prev.mutedStreamIds !== next.mutedStreamIds ||
    prev.mutedTopicKeys !== next.mutedTopicKeys ||
    prev.unmutedTopicKeys !== next.unmutedTopicKeys ||
    prev.followedTopicKeys !== next.followedTopicKeys
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

function buildMuteSnapshotRow(instanceId: string): MuteSnapshotRow {
  const state = useMuteStore.getState();
  const mutedStreamIds = Array.from(state.mutedStreamIds).filter(
    (streamId) => Number.isInteger(streamId) && streamId > 0,
  );
  return {
    instanceId,
    version: 1,
    savedAt: Date.now(),
    mutedStreamIds,
    mutedTopics: toSnapshotTopicRows(state.mutedTopicKeys),
    unmutedTopics: toSnapshotTopicRows(state.unmutedTopicKeys),
    followedTopics: toSnapshotTopicRows(state.followedTopicKeys),
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
