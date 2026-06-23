import { moveStreamTopicToChannel } from "~/shared/api/messenger-read-state";

export async function moveTopicToChannel(
  topicUuid: string,
  sourceStreamId: string,
  topic: string,
  targetStreamId: string,
  targetTopic: string,
): Promise<Awaited<ReturnType<typeof moveStreamTopicToChannel>>> {
  return moveStreamTopicToChannel(topicUuid, sourceStreamId, topic, targetStreamId, targetTopic);
}
