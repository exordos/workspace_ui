import type { MessengerStream } from "./messenger.types";

export function editableStreamKeySharing(
  stream: MessengerStream | undefined,
  userUuid: string | undefined,
): boolean | undefined {
  return stream?.encryption === true && stream.ownerUuid === userUuid
    ? stream.allowKeySharingByHolders
    : undefined;
}

export function isNewerStreamKeySharingSnapshot(
  current: MessengerStream | undefined,
  incomingUpdatedAt: string,
): boolean {
  // Message activity can advance stream.updatedAt independently of stream metadata.
  const confirmedAt = current?.keySharingUpdatedAt;
  if (confirmedAt === undefined) return false;
  const difference = Date.parse(confirmedAt) - Date.parse(incomingUpdatedAt);
  if (difference) return difference > 0;

  // PostgreSQL can serialize updates to the same stream within one millisecond.
  const fraction = (timestamp: string) => (/\.(\d+)/.exec(timestamp)?.[1] ?? "").padEnd(6, "0");
  return fraction(confirmedAt) > fraction(incomingUpdatedAt);
}

export function preserveConfirmedStreamKeySharing(
  snapshot: MessengerStream,
  current: MessengerStream | undefined,
): MessengerStream {
  if (
    current?.allowKeySharingByHolders === undefined ||
    (snapshot.allowKeySharingByHolders !== undefined &&
      !isNewerStreamKeySharingSnapshot(current, snapshot.updatedAt))
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    allowKeySharingByHolders: current.allowKeySharingByHolders,
    keySharingUpdatedAt: current.keySharingUpdatedAt,
  };
}
