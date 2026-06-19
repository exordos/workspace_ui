import { moveStreamTopicToChannel } from "~/shared/api/messenger-read-state";

export async function moveTopicToChannel(
  sourceStreamId: number,
  topic: string,
  targetStreamId: number,
  targetTopic: string,
): Promise<boolean> {
  return moveStreamTopicToChannel(sourceStreamId, topic, targetStreamId, targetTopic);
}
