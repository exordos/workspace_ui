import {
  captureDeletedMessagePointerRepair,
  type DeletedMessagePointerRepairPlan,
} from "../chats/messenger-deleted-message-pointer-repair.lib";
import { useMessengerStore } from "../chats/messenger.model";
import { conversationIdForStream, conversationIdForTopic } from "../messenger-ids.lib";
import type { WorkspaceMessageStoreState } from "./message.model";
import type { MessengerMessageCacheDeletion } from "../messenger-cache.lib";
import type { MessengerDeletedMessage } from "../messenger.types";

// Reuses the existing message tombstone and window membership rules.
type DeletionStore = Pick<
  WorkspaceMessageStoreState,
  "ownerKey" | "messagesById" | "deletedMessageRevisionById" | "removeMessage"
>;

// HTTP and active realtime supply the same authoritative deletion and runtime fence.
interface AcceptMessageDeletionInput {
  ownerKey: string; // Scope of the loaded messages, catalog and durable cache.
  reported: MessengerDeletedMessage; // Request or event placement, possibly predating a move.
  isCurrent: () => boolean; // Runtime generation and abort check from the caller.
  store: { getState: () => DeletionStore }; // Active message store or a caller's injected store.
  deleteCache?: MessengerMessageCacheDeletion; // Scoped delete of all memberships.
  beforeRequest?: DeletedMessagePointerRepairPlan; // HTTP repair targets before waiting for DELETE.
}

// Keeps the source topic's repair and queries the same stream only once after a move.
function preparePointerRepairs(
  ownerKey: string,
  reported: MessengerDeletedMessage,
  canonical: MessengerDeletedMessage,
  beforeRequest: DeletedMessagePointerRepairPlan | undefined,
): DeletedMessagePointerRepairPlan[] {
  const origin = captureDeletedMessagePointerRepair(ownerKey, reported);
  if (beforeRequest != null) {
    origin.targets = {
      stream: origin.targets.stream || beforeRequest.targets.stream,
      topic: origin.targets.topic || beforeRequest.targets.topic,
      streamConversation:
        origin.targets.streamConversation || beforeRequest.targets.streamConversation,
      topicConversation:
        origin.targets.topicConversation || beforeRequest.targets.topicConversation,
    };
  }
  if (reported.streamUuid === canonical.streamUuid && reported.topicUuid === canonical.topicUuid)
    return [origin];

  const destination = captureDeletedMessagePointerRepair(ownerKey, canonical);
  if (reported.streamUuid === canonical.streamUuid) {
    destination.targets.stream ||= origin.targets.stream;
    destination.targets.streamConversation ||= origin.targets.streamConversation;
    origin.targets.stream = false;
    origin.targets.streamConversation = false;
  }
  return [destination, origin];
}

// An acknowledged DELETE removes the UUID across windows and coordinates its cache cleanup.
export function acceptMessageDeletion(input: AcceptMessageDeletionInput) {
  const { ownerKey, reported, store, deleteCache, beforeRequest } = input;
  const initial = store.getState();
  const currentOwner = () => input.isCurrent() && store.getState().ownerKey === initial.ownerKey;
  const stale = { status: "stale-owner" } as const;
  if (!currentOwner() || (initial.ownerKey != null && initial.ownerKey !== ownerKey)) return stale;

  const known = initial.messagesById[reported.uuid];
  const canonical =
    known == null
      ? reported
      : { uuid: reported.uuid, streamUuid: known.streamUuid, topicUuid: known.topicUuid };
  const plans = preparePointerRepairs(ownerKey, reported, canonical, beforeRequest);
  initial.removeMessage(reported.uuid);
  if (!currentOwner()) return stale;
  // Another delivery of the same deletion can advance the revision without invalidating cleanup.
  const isCurrent = () => {
    const state = store.getState();
    return (
      currentOwner() &&
      state.messagesById[reported.uuid] == null &&
      state.deletedMessageRevisionById[reported.uuid] != null
    );
  };
  for (const { message } of plans) {
    if (!isCurrent()) return stale;
    useMessengerStore.getState().clearMessagePointer(ownerKey, message);
  }
  if (!isCurrent()) return stale;

  let cacheWrite: Promise<void> | void = undefined;
  if (deleteCache != null) {
    const conversationIds = [
      ...new Set(
        plans.flatMap(({ message }) => [
          conversationIdForStream(message.streamUuid),
          conversationIdForTopic(message.streamUuid, message.topicUuid),
        ]),
      ),
    ];
    try {
      const write = deleteCache(ownerKey, reported.uuid, conversationIds, {
        allMemberships: true,
        isWriteCurrent: isCurrent,
      });
      if (write instanceof Promise) cacheWrite = write.catch(() => undefined);
    } catch {
      // Cache errors do not reverse an acknowledged deletion.
    }
  }
  return { status: "applied" as const, plans, cacheWrite, isCurrent };
}
