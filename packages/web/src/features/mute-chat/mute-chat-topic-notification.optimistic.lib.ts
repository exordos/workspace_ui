import { guard } from "~/shared/lib/guards";
import { optimisticMutation } from "~/shared/lib/optimistic-mutation.lib";
import { useMuteStore } from "./mute-chat.model";
import { captureTopicVisibilityOverrideSnapshot } from "./mute-chat.optimistic.lib";
import { topicVisibilityLevelToMode, type TopicVisibilityLevel } from "./notification-level.lib";

function applyTopicVisibilityLevelOptimistic(
  streamId: string,
  topic: string,
  level: TopicVisibilityLevel,
): void {
  useMuteStore
    .getState()
    .setTopicNotificationMode(streamId, topic, topicVisibilityLevelToMode(level));
}

interface RunOptimisticTopicVisibilityLevelUpdateParams {
  streamId: string;
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
  guard.streamUuid(streamId, "runOptimisticTopicVisibilityLevelUpdate");
  const snapshot = captureTopicVisibilityOverrideSnapshot(streamId, topic);
  const result = await optimisticMutation({
    apply: () => applyTopicVisibilityLevelOptimistic(streamId, topic, level),
    request,
    reconcile: () => {},
    rollback: () => {
      useMuteStore.getState().setTopicNotificationMode(streamId, topic, snapshot);
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
