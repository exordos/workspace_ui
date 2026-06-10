import { moveStreamTopicToChannel } from "~/shared/api/zulip-read-state";

export async function moveTopicToChannel(
  sourceStreamId: number,
  topic: string,
  targetStreamId: number,
  targetTopic: string,
): Promise<boolean> {
  return moveStreamTopicToChannel(sourceStreamId, topic, targetStreamId, targetTopic);
}
