import type { WorkspaceMessageStoreState } from "~/entities/message/message.model";
import { withoutOptimisticMessageReactionCounts } from "./messenger-cache.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import {
  advanceMessengerReadBoundary,
  compareMessengerMessageOrder,
  type MessengerReadBoundary,
} from "./messenger-read-boundary.lib";
import type { KnownMessageCacheWriter } from "./messages-accept-update.lib";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

// Disk supports a durable topic boundary, exact flag updates and a body-cache fallback.
export interface ConfirmedMessageReadCache {
  advanceReadBoundary?: (
    boundary: MessengerReadBoundary,
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  markCachedMessagesRead?: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
    conversationIds?: readonly MessengerConversationId[],
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  patchCachedMessage?: KnownMessageCacheWriter;
}

type ReadStore = Pick<
  WorkspaceMessageStoreState,
  "ownerKey" | "messagesById" | "deletedMessageRevisionById"
>;

// Both sources confirm flags; only a topic boundary marks peers by message order.
type AcceptMessageReadInput = {
  ownerKey: string; // Active session and its cache partition.
  isCurrent: () => boolean; // Runtime generation and abort guard from the source.
  cache: ConfirmedMessageReadCache;
} & (
  | {
      kind: "boundary";
      boundary: Omit<MessengerReadBoundary, "ownerKey">;
      conversationIds?: readonly MessengerConversationId[]; // Optional loaded windows to visit.
      capturedMutationRevision?: number; // HTTP fence for evidence about an unknown anchor.
      projectedMessages?: readonly MessengerMessage[]; // HTTP counter projection before confirmation.
      projectPointer?: (message: MessengerMessage, messagesById: ReadStore["messagesById"]) => void;
      store: {
        getState: () => ReadStore & Pick<WorkspaceMessageStoreState, "confirmMessagesReadUpTo">;
      };
    }
  | {
      kind: "exact";
      messageUuids: readonly MessengerUuid[];
      store: { getState: () => ReadStore & Pick<WorkspaceMessageStoreState, "markMessagesRead"> };
    }
);

// A cache failure does not invalidate server read evidence or block the realtime cursor.
function writeReadCacheBestEffort(write: () => Promise<void> | void): Promise<void> | void {
  try {
    const result = write();
    return result instanceof Promise ? result.catch(() => undefined) : result;
  } catch {
    return;
  }
}

// Prefer atomic flag-only writes to preserve the canonical body already in IndexedDB.
function persistReadFlags(
  { cache, ownerKey, store }: AcceptMessageReadInput,
  messageUuids: readonly MessengerUuid[],
  isCurrent: () => boolean,
): Promise<void> | void {
  if (!isCurrent() || messageUuids.length === 0) return;
  if (cache.markCachedMessagesRead != null) {
    return writeReadCacheBestEffort(() =>
      cache.markCachedMessagesRead?.(ownerKey, messageUuids, [], isCurrent),
    );
  }
  const patchCache = cache.patchCachedMessage;
  if (patchCache == null) return;
  const writes: Promise<void>[] = [];
  for (const uuid of messageUuids) {
    if (!isCurrent()) break;
    const message = store.getState().messagesById[uuid];
    if (message?.read !== true) continue;
    const snapshot = withoutOptimisticMessageReactionCounts(message);
    const write = writeReadCacheBestEffort(() =>
      patchCache(ownerKey, snapshot, () => {
        const latest = store.getState().messagesById[uuid];
        if (
          !isCurrent() ||
          latest?.read !== true ||
          latest.conversationId !== message.conversationId ||
          latest.updatedAt !== message.updatedAt ||
          latest.payload !== message.payload ||
          latest.pollState !== message.pollState ||
          latest.pinned !== message.pinned ||
          latest.starred !== message.starred ||
          latest.reactionUserUuidsByEmojiName !== message.reactionUserUuidsByEmojiName
        )
          return false;
        const { reactions } = withoutOptimisticMessageReactionCounts(latest);
        const counts = Object.entries(snapshot.reactions);
        return (
          counts.length === Object.keys(reactions).length &&
          counts.every(([emojiName, count]) => reactions[emojiName] === count)
        );
      }),
    );
    if (write instanceof Promise) writes.push(write);
  }
  if (writes.length > 0) return Promise.all(writes).then(() => undefined);
}

// Applies server read evidence once, preserving everything about the current body except its flag.
export function acceptMessageRead(input: AcceptMessageReadInput) {
  const { ownerKey, store, cache } = input;
  const initialOwner = store.getState().ownerKey;
  const isCurrent = () => input.isCurrent() && store.getState().ownerKey === initialOwner;
  const stale = { status: "stale-owner" } as const;
  if (!isCurrent() || (initialOwner != null && initialOwner !== ownerKey)) return stale;

  if (input.kind === "exact") {
    input.store.getState().markMessagesRead(input.messageUuids);
    if (!isCurrent()) return stale;
    return {
      status: "applied" as const,
      isCurrent,
      cacheWrite: persistReadFlags(input, input.messageUuids, isCurrent),
      message: null,
    };
  }

  const reported = input.boundary;
  const boundary = advanceMessengerReadBoundary({ ...reported, ownerKey });
  const changes = input.store.getState().confirmMessagesReadUpTo(
    { ...reported, uuid: reported.messageUuid },
    {
      conversationIds: input.conversationIds ?? [
        conversationIdForTopic(reported.streamUuid, reported.topicUuid),
        conversationIdForStream(reported.streamUuid),
      ],
    },
    input.capturedMutationRevision,
  );
  if (!isCurrent()) return stale;
  const { messagesById } = store.getState();
  const message = messagesById[reported.messageUuid] ?? null;
  if (message != null) input.projectPointer?.(message, messagesById);
  if (!isCurrent()) return stale;

  const uuids = new Set<MessengerUuid>();
  if (
    message?.read === true ||
    (message == null && store.getState().deletedMessageRevisionById[reported.messageUuid] == null)
  ) {
    uuids.add(reported.messageUuid);
  }
  for (const changed of changes) uuids.add(changed.uuid);
  for (const projected of input.projectedMessages ?? []) {
    const current = store.getState().messagesById[projected.uuid];
    if (
      current?.read === true &&
      current.streamUuid === reported.streamUuid &&
      current.topicUuid === reported.topicUuid &&
      compareMessengerMessageOrder(
        { createdAt: current.createdAt, messageUuid: current.uuid },
        reported,
      ) <= 0
    )
      uuids.add(current.uuid);
  }

  const persistFlags = () => persistReadFlags(input, [...uuids], isCurrent);
  const boundaryWrite = writeReadCacheBestEffort(() =>
    cache.advanceReadBoundary?.(boundary, isCurrent),
  );
  const cacheWrite =
    boundaryWrite instanceof Promise ? boundaryWrite.then(persistFlags) : persistFlags();
  return { status: "applied" as const, message, cacheWrite, isCurrent };
}
