import type { WorkspaceMessageStoreState } from "./message.model";
import type { MessengerMessage } from "../messenger.types";

// Reuses the message cache transaction's check both before and after the write.
export type KnownMessageCacheWriter = (
  ownerKey: string,
  message: MessengerMessage,
  isWriteCurrent?: () => boolean,
  currentPoll?: () => MessengerMessage | undefined, // Live fallback for an uncached poll body.
) => Promise<void> | void;

type UpdateStore = Pick<
  WorkspaceMessageStoreState,
  | "ownerKey"
  | "messagesById"
  | "applyLiveKnownBodyMutation"
  | "messageMutationRevision"
  | "messageMutationRevisionById"
>;

// HTTP has a request fence and a catalog projection. Realtime already arrives in event order.
type AcceptMessageUpdateInput = {
  ownerKey: string; // Owner of the active store and cache.
  isCurrent: () => boolean; // Runtime, generation and request-specific checks.
  message: MessengerMessage; // Normalized HTTP response or realtime event.
  store: { getState: () => UpdateStore }; // Store to reconcile.
  patchCache?: KnownMessageCacheWriter; // Optional durable message writer.
} & (
  | {
      source: "http";
      capturedMutationRevision: number; // Store revision before the edit request.
      project: (message: MessengerMessage, messagesById: UpdateStore["messagesById"]) => void; // Catalog pointer.
    }
  | {
      source: "poll-response";
      project: (message: MessengerMessage, messagesById: UpdateStore["messagesById"]) => void; // Catalog pointer.
    }
  | { source: "realtime" }
);

// Compare the accepted pair and its metadata independently of read flags and reactions.
function hasSamePoll(
  current: MessengerMessage | undefined,
  snapshot: MessengerMessage,
): current is MessengerMessage {
  return (
    current?.conversationId === snapshot.conversationId &&
    current.payload === snapshot.payload &&
    current.pollState === snapshot.pollState &&
    current.updatedAt === snapshot.updatedAt
  );
}

// Cache and event projection can tolerate read and local reaction changes to the same body.
function hasSameBody(
  current: MessengerMessage | undefined,
  snapshot: MessengerMessage,
): current is MessengerMessage {
  return (
    hasSamePoll(current, snapshot) &&
    current.pinned === snapshot.pinned &&
    current.starred === snapshot.starred
  );
}

// HTTP poll writes retain this confirmed realtime reaction projection by reference.
function hasSameRealtimePollFields(
  current: MessengerMessage | undefined,
  snapshot: MessengerMessage,
): current is MessengerMessage {
  return (
    current?.conversationId === snapshot.conversationId &&
    current.payload.kind === "poll" &&
    current.pinned === snapshot.pinned &&
    current.starred === snapshot.starred &&
    current.reactionUserUuidsByEmojiName === snapshot.reactionUserUuidsByEmojiName
  );
}

// Read or HTTP poll updates can overtake the full realtime body write.
function patchCurrentBody(
  ownerKey: string,
  snapshot: MessengerMessage,
  currentBody: () => MessengerMessage | undefined,
  patchCache: KnownMessageCacheWriter,
  refreshPoll: boolean,
): Promise<void> | void {
  const current = currentBody();
  if (current == null) return;
  const { read } = current;
  const isSnapshotCurrent = (latest: MessengerMessage | undefined) =>
    latest?.read === read && (!refreshPoll || hasSamePoll(latest, current));
  const retry = () => {
    const latest = currentBody();
    if (latest != null && !isSnapshotCurrent(latest))
      return patchCurrentBody(ownerKey, snapshot, currentBody, patchCache, refreshPoll);
  };
  try {
    // Keep the accepted aggregate when a local reaction changes the live projection.
    const body = refreshPoll
      ? {
          ...snapshot,
          payload: current.payload,
          pollState: current.pollState,
          updatedAt: current.updatedAt,
          read,
        }
      : snapshot.read === read
        ? snapshot
        : { ...snapshot, read };
    const write = patchCache(ownerKey, body, () => isSnapshotCurrent(currentBody()));
    return write instanceof Promise ? write.then(retry, () => undefined) : retry();
  } catch {
    // Cache errors do not change the result of the edit or block its cursor.
    return;
  }
}

// Reconciles an edit or move without letting a superseded body overwrite the current cache.
export function acceptMessageUpdate(input: AcceptMessageUpdateInput) {
  const { ownerKey, isCurrent, message, store, patchCache } = input;
  const initial = store.getState();
  const currentOwner = () => isCurrent() && store.getState().ownerKey === initial.ownerKey;
  const stale = { status: "stale-owner" } as const;
  if (!currentOwner() || (initial.ownerKey != null && initial.ownerKey !== ownerKey)) return stale;

  const readBody = () => store.getState().messagesById[message.uuid];
  const previous = initial.messagesById[message.uuid];
  const isPollResponse = input.source === "poll-response";
  const applied = isPollResponse
    ? initial.applyLiveKnownBodyMutation(message, undefined, "poll-response")
    : initial.applyLiveKnownBodyMutation(
        message,
        input.source === "http" ? input.capturedMutationRevision : undefined,
      );
  if (!currentOwner()) return stale;
  const refreshPoll =
    input.source === "realtime" && applied !== false && applied?.payload.kind === "poll";
  const hasAcceptedBody = (
    current: MessengerMessage | undefined,
    accepted: MessengerMessage,
  ): current is MessengerMessage =>
    refreshPoll ? hasSameRealtimePollFields(current, accepted) : hasSameBody(current, accepted);
  const shouldProject = () => {
    if (!currentOwner() || applied === false) return false;
    // Unknown UUIDs still advance the revision and the realtime projection.
    if (applied == null) {
      return (
        readBody() == null &&
        store.getState().messageMutationRevisionById[message.uuid] ===
          initial.messageMutationRevision + 1
      );
    }
    return hasAcceptedBody(readBody(), applied);
  };

  // A stale HTTP response still returns and may persist the already accepted canonical body.
  const effective = readBody();
  if (input.source !== "realtime" && effective != null) {
    input.project(effective, store.getState().messagesById);
    if (!currentOwner()) return stale;
  }
  const canWrite = input.source === "http" || shouldProject();
  const snapshot = applied && hasAcceptedBody(effective, applied) ? applied : effective;
  const currentBody = () => {
    if (!currentOwner() || effective == null) return undefined;
    const current = readBody();
    return hasAcceptedBody(current, snapshot ?? effective) ? current : undefined;
  };
  const currentPoll = () => {
    const current = readBody();
    return currentOwner() && applied && hasSamePoll(current, applied) ? current : undefined;
  };
  return {
    status: "applied" as const,
    message: readBody() ?? null, // Latest canonical message for the caller.
    eventMessage: applied === false ? null : applied, // Body and server aggregates from this publication.
    previous, // Snapshot before publication, used by realtime reaction synchronization.
    shouldProject,
    currentRead: () => currentBody()?.read, // Read projection may change while the body stays current.
    currentPollUpdatedAt: () => (refreshPoll ? currentBody()?.updatedAt : undefined),
    cacheWrite:
      canWrite && snapshot != null && patchCache != null && !isPollResponse
        ? patchCurrentBody(ownerKey, snapshot, currentBody, patchCache, refreshPoll)
        : isPollResponse && applied && patchCache != null && currentPoll() != null
          ? patchPollResponse(ownerKey, applied, currentPoll, patchCache)
          : undefined,
  };
}

// Poll writes preserve durable independent fields, so only the accepted pair controls validity.
function patchPollResponse(
  ownerKey: string,
  snapshot: MessengerMessage,
  currentPoll: () => MessengerMessage | undefined,
  patchCache: KnownMessageCacheWriter,
): Promise<void> | void {
  try {
    const write = patchCache(ownerKey, snapshot, () => currentPoll() != null, currentPoll);
    return write instanceof Promise ? write.catch(() => undefined) : write;
  } catch {
    // The operation has already been accepted in memory.
    return;
  }
}
