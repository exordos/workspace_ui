/**
 * Local /activity bootstrap from message IDB.
 *
 * Cache paints the first frame quickly; server refresh remains the source of truth.
 */
import type {
  ActivityFilter,
  MockMessage,
  WorkspaceRawMessage,
} from "~/shared/api/messenger.types";
import { getInstanceMessagesAscending } from "~/shared/lib/message-cache-db";
import { mockMessageToRawMessage } from "~/shared/lib/message-mock-to-raw.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

function getActivityMessagesNewestTimestamp(messages: readonly WorkspaceRawMessage[]): number {
  if (messages.length === 0) return 0;
  let newest = messages[0]?.timestamp ?? 0;
  for (const message of messages) {
    if (message.timestamp > newest) {
      newest = message.timestamp;
    }
  }
  return newest;
}

function getActivityMessagesLastIdFingerprint(messages: readonly WorkspaceRawMessage[]): string {
  let maxId = "";
  for (const message of messages) {
    if (message.id > maxId) {
      maxId = message.id;
    }
  }
  return maxId;
}

export function isActivityMessagesSnapshotFresher(
  candidate: readonly WorkspaceRawMessage[],
  current: readonly WorkspaceRawMessage[],
): boolean {
  if (candidate.length === 0) return false;
  if (current.length === 0) return true;

  const candidateNewestTimestamp = getActivityMessagesNewestTimestamp(candidate);
  const currentNewestTimestamp = getActivityMessagesNewestTimestamp(current);
  if (candidateNewestTimestamp !== currentNewestTimestamp) {
    return candidateNewestTimestamp > currentNewestTimestamp;
  }

  const candidateIdFingerprint = getActivityMessagesLastIdFingerprint(candidate);
  const currentIdFingerprint = getActivityMessagesLastIdFingerprint(current);
  return candidateIdFingerprint > currentIdFingerprint;
}

/** Whether a cached message belongs in an activity filter (exported for tests). */
export function matchesActivityFilter(
  message: MockMessage,
  filter: ActivityFilter,
  currentUserId: UserId | null,
): boolean {
  const flags = message.flags ?? [];
  if (filter === "starred") {
    return flags.includes("starred");
  }
  if (filter === "mentions") {
    return flags.includes("mentioned");
  }
  if ((message.reactions?.length ?? 0) === 0) {
    return false;
  }
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  if (numericCurrentUserId == null) {
    return false;
  }
  // Workspace reactions view: own messages that have at least one emoji reaction.
  return message.sender_id === numericCurrentUserId && (message.reactions?.length ?? 0) > 0;
}

/** Oldest→newest slice aligned with server pagination shape to avoid UI jumps after hydrate. */
export async function hydrateActivityMessagesFromCache(
  instanceId: string | null,
  filter: ActivityFilter,
  currentUserId: UserId | null,
  limit = 200,
): Promise<WorkspaceRawMessage[]> {
  if (instanceId == null) return [];
  const all = await getInstanceMessagesAscending(instanceId);
  const filtered = all.filter((message) => matchesActivityFilter(message, filter, currentUserId));
  const tail = filtered.length <= limit ? filtered : filtered.slice(filtered.length - limit);
  return tail.map(mockMessageToRawMessage);
}
