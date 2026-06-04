import { guard } from "~/shared/lib/guards";
import { optimisticMutation } from "~/shared/lib/optimistic-mutation.lib";
import { useMuteStore } from "./mute-chat.model";
import { captureTopicVisibilityOverrideSnapshot } from "./mute-chat.optimistic.lib";
import type { TopicVisibilityLevel } from "./notification-level.lib";

function applyTopicVisibilityLevelOptimistic(
  streamId: number,
  topic: string,
  level: TopicVisibilityLevel,
): void {
  const muteStore = useMuteStore.getState();
  switch (level) {
    case "muted":
      muteStore.muteTopic(streamId, topic);
      break;
    case "unmuted":
      muteStore.unmuteTopic(streamId, topic);
      break;
    case "followed":
      muteStore.followTopic(streamId, topic);
      break;
    case "inherit":
      muteStore.clearTopicVisibilityOverride(streamId, topic);
      break;
    default: {
      const _exhaustive: never = level;
      void _exhaustive;
    }
  }
}

interface RunOptimisticTopicVisibilityLevelUpdateParams {
  streamId: number;
  topic: string;
  level: TopicVisibilityLevel;
  request: () => Promise<boolean>;
}

export async function runOptimisticTopicVisibilityLevelUpdate({
  streamId,
  topic,
  level,
  request,
}: RunOptimisticTopicVisibilityLevelUpdateParams): Promise<boolean> {
  guard.streamId(streamId, "runOptimisticTopicVisibilityLevelUpdate");
  const snapshot = captureTopicVisibilityOverrideSnapshot(streamId, topic);
  const result = await optimisticMutation({
    apply: () => applyTopicVisibilityLevelOptimistic(streamId, topic, level),
    request,
    reconcile: () => {},
    rollback: () => {
      const muteStore = useMuteStore.getState();
      if (snapshot === "muted") {
        muteStore.muteTopic(streamId, topic);
        return;
      }
      if (snapshot === "followed") {
        muteStore.followTopic(streamId, topic);
        return;
      }
      if (snapshot === "unmuted") {
        muteStore.unmuteTopic(streamId, topic);
        return;
      }
      muteStore.clearTopicVisibilityOverride(streamId, topic);
    },
    rollbackOnFalsy: true,
    label: "topic-visibility-level",
  });
  return result === true;
}

/** @deprecated Use runOptimisticTopicVisibilityLevelUpdate */
export async function runOptimisticTopicNotificationLevelUpdate(
  params: RunOptimisticTopicVisibilityLevelUpdateParams & {
    level: TopicVisibilityLevel;
  },
): Promise<boolean> {
  return runOptimisticTopicVisibilityLevelUpdate(params);
}
