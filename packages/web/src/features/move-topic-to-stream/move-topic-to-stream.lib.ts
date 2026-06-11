import { resolveRenamedTopicName } from "~/features/mark-topic-resolved/rename-stream-topic.lib";

export interface MoveTopicTargetStream {
  streamId: number;
  name: string;
}

/** Resolves target topic name, preserving resolved checkmark when applicable. */
export function resolveMoveTopicTargetName(
  currentTopic: string,
  nextNameInput: string,
): string | null {
  return resolveRenamedTopicName(currentTopic, nextNameInput);
}

export function buildMoveTopicTargetStreamOptions(
  streams: readonly MoveTopicTargetStream[],
  sourceStreamId: number,
): MoveTopicTargetStream[] {
  return streams
    .filter((stream) => stream.streamId !== sourceStreamId && stream.name.trim().length > 0)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveSelectedTargetStreamId(
  targetStreamIdRaw: string,
  options: readonly MoveTopicTargetStream[],
): number | null {
  const parsed = Number.parseInt(targetStreamIdRaw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return options.some((stream) => stream.streamId === parsed) ? parsed : null;
}
