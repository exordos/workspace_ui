import { guard } from "~/shared/lib/guards";
import { optimisticMutation } from "~/shared/lib/optimistic-mutation.lib";
import { useMuteStore } from "./mute-chat.model";
import type { TopicNotificationMode } from "./notification-level.lib";

export type TopicVisibilityOverrideSnapshot = TopicNotificationMode;

function restoreTopicVisibilityOverrideFromSnapshot(
  streamId: string,
  topic: string,
  snapshot: TopicVisibilityOverrideSnapshot,
): void {
  useMuteStore.getState().setTopicNotificationMode(streamId, topic, snapshot);
}

export function captureTopicVisibilityOverrideSnapshot(
  streamId: string,
  topic: string,
): TopicVisibilityOverrideSnapshot {
  guard.streamUuid(streamId, "captureTopicVisibilityOverrideSnapshot");

  const muteStore = useMuteStore.getState();
  return muteStore.getTopicNotificationMode(streamId, topic);
}

interface RunOptimisticTopicVisibilityUpdateParams {
  streamId: string;
  topic: string;
  applyOptimistic: () => void;
  request: () => Promise<boolean>;
}

export async function runOptimisticTopicVisibilityUpdate({
  streamId,
  topic,
  applyOptimistic,
  request,
}: RunOptimisticTopicVisibilityUpdateParams): Promise<boolean> {
  const snapshot = captureTopicVisibilityOverrideSnapshot(streamId, topic);
  const result = await optimisticMutation({
    apply: applyOptimistic,
    request,
    reconcile: () => {},
    rollback: () => restoreTopicVisibilityOverrideFromSnapshot(streamId, topic, snapshot),
    rollbackOnFalsy: true,
    label: "topic-visibility",
  });
  return result === true;
}

interface RunOptimisticStreamMuteUpdateParams {
  streamId: string;
  applyOptimistic: (wasMuted: boolean) => void;
  request: (wasMuted: boolean) => Promise<boolean>;
}

export async function runOptimisticStreamMuteUpdate({
  streamId,
  applyOptimistic,
  request,
}: RunOptimisticStreamMuteUpdateParams): Promise<boolean> {
  guard.streamUuid(streamId, "runOptimisticStreamMuteUpdate");

  const muteStore = useMuteStore.getState();
  const wasMuted = muteStore.isStreamMuted(streamId);
  const result = await optimisticMutation({
    apply: () => applyOptimistic(wasMuted),
    request: () => request(wasMuted),
    reconcile: () => {},
    rollback: () => {
      if (wasMuted) {
        muteStore.muteStream(streamId);
      } else {
        muteStore.unmuteStream(streamId);
      }
    },
    rollbackOnFalsy: true,
    label: "stream-mute",
  });
  return result === true;
}
