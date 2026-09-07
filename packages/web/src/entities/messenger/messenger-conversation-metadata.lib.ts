import type {
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";
import { readMessengerCatalogPayloadCache } from "./messenger-cache.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStream, MessengerTopic, MessengerUuid } from "./messenger.types";

/**
 * Stream and topic facts a notification decision needs, taken from the catalog
 * instead of from the realtime projection.
 *
 * The background projection knows only the streams and topics whose events it has
 * seen recently, so a message in a conversation that has been quiet arrives with no
 * snapshot behind it. The catalog knows every one of them: the loaded messenger
 * store for the owner on screen, its IndexedDB cache for any other owner.
 */
export interface WorkspaceConversationStreamMetadata {
  streamName: string | null;
  isPrivate: boolean;
  notificationMode: WorkspaceMessengerStreamNotificationMode;
}

export interface WorkspaceConversationTopicMetadata {
  topicName: string | null;
  notificationMode: WorkspaceMessengerTopicNotificationMode;
}

export interface WorkspaceConversationMetadata {
  stream: WorkspaceConversationStreamMetadata | null;
  topic: WorkspaceConversationTopicMetadata | null;
}

interface MessengerCatalogSnapshot {
  streamsById: Record<MessengerUuid, MessengerStream>;
  topicsById: Record<MessengerUuid, MessengerTopic>;
}

/** A burst of candidates must not turn into a burst of IndexedDB catalog reads. */
const CATALOG_CACHE_MEMO_MS = 5_000;
const catalogCacheMemoByOwnerKey = new Map<
  string,
  { readAt: number; snapshot: Promise<MessengerCatalogSnapshot | null> }
>();

function streamMetadata(
  stream: MessengerStream | undefined,
): WorkspaceConversationStreamMetadata | null {
  return stream == null
    ? null
    : {
        streamName: stream.name,
        isPrivate: stream.isPrivate,
        notificationMode: stream.notificationMode,
      };
}

function topicMetadata(
  topic: MessengerTopic | undefined,
): WorkspaceConversationTopicMetadata | null {
  return topic == null
    ? null
    : {
        // The default topic keeps a null name, so the title layer builds its own.
        topicName: topic.isDefault ? null : topic.name,
        notificationMode: topic.notificationMode,
      };
}

function readActiveCatalog(ownerKey: string): MessengerCatalogSnapshot | null {
  const store = useMessengerStore.getState();
  return store.ownerKey === ownerKey
    ? { streamsById: store.streamsById, topicsById: store.topicsById }
    : null;
}

function readCachedCatalog(ownerKey: string): Promise<MessengerCatalogSnapshot | null> {
  const memo = catalogCacheMemoByOwnerKey.get(ownerKey);
  if (memo != null && Date.now() - memo.readAt < CATALOG_CACHE_MEMO_MS) {
    return memo.snapshot;
  }

  const snapshot = readMessengerCatalogPayloadCache(ownerKey)
    .then((cached) =>
      cached == null
        ? null
        : {
            streamsById: Object.fromEntries(
              cached.payload.streams.map((stream) => [stream.uuid, stream]),
            ),
            topicsById: Object.fromEntries(
              cached.payload.topics.map((topic) => [topic.uuid, topic]),
            ),
          },
    )
    .catch(() => null);
  catalogCacheMemoByOwnerKey.set(ownerKey, { readAt: Date.now(), snapshot });
  return snapshot;
}

export async function resolveWorkspaceConversationMetadata(input: {
  ownerKey: string;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
}): Promise<WorkspaceConversationMetadata> {
  const activeCatalog = readActiveCatalog(input.ownerKey);
  const active: WorkspaceConversationMetadata = {
    stream: streamMetadata(activeCatalog?.streamsById[input.streamUuid]),
    topic: topicMetadata(activeCatalog?.topicsById[input.topicUuid]),
  };
  if (active.stream != null && active.topic != null) {
    return active;
  }

  const cachedCatalog = await readCachedCatalog(input.ownerKey);
  return {
    stream: active.stream ?? streamMetadata(cachedCatalog?.streamsById[input.streamUuid]),
    topic: active.topic ?? topicMetadata(cachedCatalog?.topicsById[input.topicUuid]),
  };
}

export function clearWorkspaceConversationMetadataMemo(): void {
  catalogCacheMemoByOwnerKey.clear();
}
