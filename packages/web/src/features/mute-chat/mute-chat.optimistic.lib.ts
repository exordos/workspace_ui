import { guard } from "~/shared/lib/guards";
import { optimisticMutation } from "~/shared/lib/optimistic-mutation.lib";
import { useMuteStore } from "./mute-chat.model";

export type TopicVisibilityOverrideSnapshot = "muted" | "unmuted" | "followed" | "none";

function restoreTopicVisibilityOverrideFromSnapshot(
  streamId: number,
  topic: string,
  snapshot: TopicVisibilityOverrideSnapshot,
): void {
  const muteStore = useMuteStore.getState();
  if (snapshot === "muted") {
    muteStore.muteTopic(streamId, topic);
    return;
  }
  if (snapshot === "unmuted") {
    muteStore.unmuteTopic(streamId, topic);
    return;
  }
  if (snapshot === "followed") {
    muteStore.followTopic(streamId, topic);
    return;
  }
  muteStore.clearTopicVisibilityOverride(streamId, topic);
}

export function captureTopicVisibilityOverrideSnapshot(
  streamId: number,
  topic: string,
): TopicVisibilityOverrideSnapshot {
  guard.streamId(streamId, "captureTopicVisibilityOverrideSnapshot");

  const muteStore = useMuteStore.getState();
  if (muteStore.isTopicMuted(streamId, topic)) return "muted";
  if (muteStore.isTopicUnmuted(streamId, topic)) return "unmuted";
  if (muteStore.isTopicFollowed(streamId, topic)) return "followed";
  return "none";
}

interface RunOptimisticTopicVisibilityUpdateParams {
  streamId: number;
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
  streamId: number;
  applyOptimistic: (wasMuted: boolean) => void;
  request: (wasMuted: boolean) => Promise<boolean>;
}

export async function runOptimisticStreamMuteUpdate({
  streamId,
  applyOptimistic,
  request,
}: RunOptimisticStreamMuteUpdateParams): Promise<boolean> {
  guard.streamId(streamId, "runOptimisticStreamMuteUpdate");

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
