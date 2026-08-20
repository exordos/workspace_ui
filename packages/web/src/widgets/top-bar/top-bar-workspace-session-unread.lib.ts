import type { MessengerBackgroundProjection } from "~/entities/messenger/messenger-background-projection.model";

function sumUnreadCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + Math.max(0, count), 0);
}

function isActiveUnreadCandidate(
  projection: MessengerBackgroundProjection,
  candidate: MessengerBackgroundProjection["notificationCandidates"][number],
): boolean {
  if (candidate.isOwn || candidate.read) return false;

  const currentSnapshot = projection.messageIdSnapshotsById[candidate.messageUuid];
  return (
    currentSnapshot == null || (currentSnapshot.read !== true && currentSnapshot.deletedAt == null)
  );
}

const ALL_CHATS_FOLDER_UUID = "00000000-0000-0000-0000-000000000000";

export function getBackgroundProjectionUnreadCount(
  projection: MessengerBackgroundProjection | undefined,
): number {
  if (projection == null) return 0;

  const allFolderUnreadCount = projection.unreadByFolderId[ALL_CHATS_FOLDER_UUID];
  if (allFolderUnreadCount != null) {
    return Math.max(0, allFolderUnreadCount);
  }

  const allFolderItemUnreadCounts = Object.entries(projection.folderItemTopologyById).flatMap(
    ([folderItemUuid, topology]) =>
      topology.folderUuid === ALL_CHATS_FOLDER_UUID
        ? [projection.unreadByFolderItemId[folderItemUuid] ?? 0]
        : [],
  );
  if (allFolderItemUnreadCounts.length > 0) {
    return allFolderItemUnreadCounts.reduce((sum, count) => sum + Math.max(0, count), 0);
  }

  if (Object.keys(projection.unreadByFolderId).length > 0) {
    return sumUnreadCounts(projection.unreadByFolderId);
  }

  if (Object.keys(projection.unreadByFolderItemId).length > 0) {
    return sumUnreadCounts(projection.unreadByFolderItemId);
  }

  const streamSnapshots = Object.values(projection.streamSnapshotsById);
  if (streamSnapshots.length > 0) {
    const knownStreamUuids = new Set(streamSnapshots.map((snapshot) => snapshot.streamUuid));
    const streamUnreadCount = streamSnapshots.reduce(
      (sum, snapshot) =>
        snapshot.isArchived
          ? sum
          : sum + Math.max(0, snapshot.activeUnreadCount ?? snapshot.unreadCount),
      0,
    );
    // message.created arrives before its authoritative stream.updated snapshot.
    const hasPendingUnknownStream = projection.notificationCandidates.some(
      (candidate) =>
        !knownStreamUuids.has(candidate.streamUuid) &&
        isActiveUnreadCandidate(projection, candidate),
    );
    return streamUnreadCount + (hasPendingUnknownStream ? 1 : 0);
  }

  const hasActiveUnreadCandidate = projection.notificationCandidates.some((candidate) =>
    isActiveUnreadCandidate(projection, candidate),
  );
  return hasActiveUnreadCandidate ? 1 : 0;
}
