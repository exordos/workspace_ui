import type { WorkspaceMessageStoreState } from "~/entities/message/message.model";
import type { MessengerMessage } from "./messenger.types";

// Reuses the message cache transaction's check both before and after the write.
export type KnownMessageCacheWriter = (
  ownerKey: string,
  message: MessengerMessage,
  isWriteCurrent?: () => boolean,
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
  | { source: "realtime" }
);

// Cache and event projection can tolerate read and local reaction changes to the same body.
function hasSameBody(
  current: MessengerMessage | undefined,
  snapshot: MessengerMessage,
): current is MessengerMessage {
  return (
    current?.conversationId === snapshot.conversationId &&
    current.payload === snapshot.payload &&
    current.pollState === snapshot.pollState &&
    current.updatedAt === snapshot.updatedAt &&
    current.pinned === snapshot.pinned &&
    current.starred === snapshot.starred
  );
}

// A read-only update can overtake the body write without persisting the edited body.
function patchCurrentBody(
  ownerKey: string,
  snapshot: MessengerMessage,
  currentBody: () => MessengerMessage | undefined,
  patchCache: KnownMessageCacheWriter,
): Promise<void> | void {
  const current = currentBody();
  if (current == null) return;
  const { read } = current;
  const retryRead = () => {
    const latest = currentBody();
    if (latest != null && latest.read !== read)
      return patchCurrentBody(ownerKey, snapshot, currentBody, patchCache);
  };
  try {
    // Keep the accepted aggregate when a local reaction changes the live projection.
    const write = patchCache(
      ownerKey,
      snapshot.read === read ? snapshot : { ...snapshot, read },
      () => currentBody()?.read === read,
    );
    return write instanceof Promise ? write.then(retryRead, () => undefined) : retryRead();
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
  const applied = initial.applyLiveKnownBodyMutation(
    message,
    input.source === "http" ? input.capturedMutationRevision : undefined,
  );
  if (!currentOwner()) return stale;
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
    return hasSameBody(readBody(), applied);
  };

  // A stale HTTP response still returns and may persist the already accepted canonical body.
  const effective = readBody();
  if (input.source === "http" && effective != null) {
    input.project(effective, store.getState().messagesById);
    if (!currentOwner()) return stale;
  }
  const currentBody = () => {
    if (!currentOwner() || effective == null) return undefined;
    const current = readBody();
    return hasSameBody(current, effective) ? current : undefined;
  };
  const canWrite = input.source === "http" || shouldProject();
  const snapshot = applied && hasSameBody(effective, applied) ? applied : effective;
  return {
    status: "applied" as const,
    message: readBody() ?? null, // Latest canonical message for the caller.
    eventMessage: applied === false ? null : applied, // Body and server aggregates from this publication.
    previous, // Snapshot before publication, used by realtime reaction synchronization.
    shouldProject,
    currentRead: () => currentBody()?.read, // Read projection may change while the body stays current.
    cacheWrite:
      canWrite && snapshot != null && patchCache != null
        ? patchCurrentBody(ownerKey, snapshot, currentBody, patchCache)
        : undefined,
  };
}
