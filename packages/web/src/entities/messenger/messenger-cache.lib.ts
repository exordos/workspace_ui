import {
  applyMessengerMessagePointerCache,
  clearMessengerMessagePointerCache,
  createMessengerCatalogCacheReconcileFence,
  deleteCachedMessage,
  deleteCachedStreamMessageBuckets,
  deleteCachedTopicMessageBuckets,
  deleteMessengerFolderCatalogCache,
  deleteMessengerFolderItemCatalogCache,
  deleteMessengerStreamCatalogCache,
  deleteMessengerTopicCatalogCache,
  patchCachedMessage,
  readCachedMessagesByUuids,
  readConversationMessageWindow,
  readMessengerCatalogCache,
  upsertCachedMessages,
  upsertMessengerConversationsCache,
  upsertMessengerFolderSnapshotsCache,
  upsertMessengerStreamBindingsCache as upsertMessengerStreamBindingsCatalogCache,
  upsertMessengerStreamsCache,
  upsertMessengerTopicsCache,
  writeConversationMessagePage,
  writeMessengerCatalogCache,
  writeRealtimeCursor,
} from "~/shared/lib/workspace-messenger-cache-db";
import type {
  WorkspaceMessengerCatalogCacheSnapshot,
  WorkspaceMessengerCatalogCacheWriteOptions,
  WorkspaceMessengerCatalogCacheWriteSnapshot,
  WorkspaceMessengerConversationMessagePage,
  WorkspaceMessengerCachedConversation,
} from "~/shared/lib/workspace-messenger-cache-db";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import type {
  MessengerBootstrapPayload,
  MessengerConversation,
  MessengerConversationId,
  MessengerFolder,
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUser,
  MessengerUuid,
} from "./messenger.types";

export interface MessengerCatalogCachePayload {
  payload: MessengerBootstrapPayload;
  epochVersion: number | null;
}

export interface MessengerCatalogPayloadCacheWriteOptions extends WorkspaceMessengerCatalogCacheWriteOptions {
  reconcileFolders?: boolean;
}

export interface MessengerConversationCacheWindow {
  messages: MessengerMessage[];
  nextPageMarker: string | null;
  hasMore: boolean;
}

function hasCatalogData(snapshot: WorkspaceMessengerCatalogCacheSnapshot): boolean {
  return (
    snapshot.streams.length > 0 ||
    snapshot.topics.length > 0 ||
    snapshot.conversations.length > 0 ||
    snapshot.folders.length > 0 ||
    snapshot.users.length > 0 ||
    snapshot.streamBindings.length > 0
  );
}

function catalogWriteSnapshot(
  payload: MessengerBootstrapPayload,
  options: MessengerCatalogPayloadCacheWriteOptions = {},
): WorkspaceMessengerCatalogCacheWriteSnapshot {
  const shouldWriteFolders = options.mode !== "reconcile" || options.reconcileFolders === true;
  return {
    streams: payload.streams,
    streamBindings: payload.streamBindings,
    topics: payload.topics,
    conversations: payload.conversations,
    folders: shouldWriteFolders ? payload.folders : undefined,
    folderItems: shouldWriteFolders ? payload.folders.flatMap((folder) => folder.items) : undefined,
    users: payload.users,
  };
}

function snapshotPayload(
  snapshot: WorkspaceMessengerCatalogCacheSnapshot,
): MessengerBootstrapPayload {
  return {
    streams: snapshot.streams as unknown as MessengerStream[],
    streamBindings: snapshot.streamBindings as unknown as MessengerStreamBinding[],
    topics: snapshot.topics as unknown as MessengerTopic[],
    conversations: snapshot.conversations as unknown as MessengerConversation[],
    folders: snapshot.folders as unknown as MessengerFolder[],
    users: snapshot.users as unknown as MessengerUser[],
  };
}

export async function readMessengerCatalogPayloadCache(
  ownerKey: string,
): Promise<MessengerCatalogCachePayload | null> {
  const snapshot = await readMessengerCatalogCache(ownerKey);
  if (!hasCatalogData(snapshot)) return null;

  return {
    payload: snapshotPayload(snapshot),
    epochVersion: snapshot.realtimeCursor?.epochVersion ?? null,
  };
}

export async function writeMessengerCatalogPayloadCache(
  ownerKey: string,
  payload: MessengerBootstrapPayload,
  options: MessengerCatalogPayloadCacheWriteOptions = {},
): Promise<void> {
  await writeMessengerCatalogCache(ownerKey, catalogWriteSnapshot(payload, options), options);
}

export { createMessengerCatalogCacheReconcileFence };

function conversationFromStream(stream: MessengerStream): MessengerConversation {
  return {
    id: conversationIdForStream(stream.uuid),
    streamUuid: stream.uuid,
    title: stream.name,
    audience: stream.audience,
    isPrivate: stream.isPrivate,
    unreadCount: stream.unreadCount,
    isArchived: stream.isArchived,
    directUserUuid: stream.directUserUuid,
    lastMessageUuid: stream.lastMessageUuid,
    notificationMode: stream.notificationMode,
  };
}

function cachedConversation(
  conversation: MessengerConversation,
  updatedAt: string | null | undefined,
): WorkspaceMessengerCachedConversation {
  return { ...conversation, updatedAt };
}

function conversationFromTopic(
  topic: MessengerTopic,
  stream: MessengerStream,
): MessengerConversation {
  return {
    id: conversationIdForTopic(stream.uuid, topic.uuid),
    streamUuid: stream.uuid,
    topicUuid: topic.uuid,
    title: topic.name,
    audience: stream.audience,
    isPrivate: stream.isPrivate,
    unreadCount: topic.unreadCount,
    isArchived: stream.isArchived,
    directUserUuid: stream.directUserUuid,
    lastMessageUuid: topic.lastMessageUuid,
    notificationMode: topic.notificationMode,
    isDone: topic.isDone,
    isDefaultTopic: topic.isDefault,
  };
}

export async function writeMessengerFolderSnapshotCache(
  ownerKey: string,
  folder: MessengerFolder,
): Promise<void> {
  await upsertMessengerFolderSnapshotsCache(ownerKey, [folder], folder.items);
}

export async function upsertMessengerStreamCache(
  ownerKey: string,
  stream: MessengerStream,
): Promise<void> {
  const snapshot = await readMessengerCatalogCache(ownerKey);
  const topics = snapshot.topics.filter((topic) => topic.streamUuid === stream.uuid);
  await Promise.all([
    upsertMessengerStreamsCache(ownerKey, [stream]),
    upsertMessengerConversationsCache(ownerKey, [
      cachedConversation(conversationFromStream(stream), stream.updatedAt),
      ...topics.map((topic) =>
        cachedConversation(
          conversationFromTopic(topic as unknown as MessengerTopic, stream),
          topic.updatedAt ?? stream.updatedAt,
        ),
      ),
    ]),
  ]);
}

export async function deleteMessengerStreamCache(
  ownerKey: string,
  streamUuid: MessengerUuid,
): Promise<void> {
  await Promise.all([
    deleteMessengerStreamCatalogCache(ownerKey, streamUuid),
    deleteCachedStreamMessageBuckets(ownerKey, streamUuid),
  ]);
}

export async function upsertMessengerStreamBindingsCache(
  ownerKey: string,
  streamBindings: readonly MessengerStreamBinding[],
): Promise<void> {
  await upsertMessengerStreamBindingsCatalogCache(ownerKey, streamBindings);
}

export async function upsertMessengerTopicCache(
  ownerKey: string,
  topic: MessengerTopic,
): Promise<void> {
  const snapshot = await readMessengerCatalogCache(ownerKey);
  const stream = snapshot.streams.find((item) => item.uuid === topic.streamUuid);
  const conversations =
    stream == null
      ? []
      : [
          cachedConversation(
            conversationFromTopic(topic, stream as unknown as MessengerStream),
            topic.updatedAt,
          ),
        ];
  await Promise.all([
    upsertMessengerTopicsCache(ownerKey, [topic]),
    upsertMessengerConversationsCache(ownerKey, conversations),
  ]);
}

export async function deleteMessengerTopicCache(
  ownerKey: string,
  topicUuid: MessengerUuid,
  streamUuid: MessengerUuid,
): Promise<void> {
  await Promise.all([
    deleteMessengerTopicCatalogCache(ownerKey, topicUuid, streamUuid),
    deleteCachedTopicMessageBuckets(ownerKey, streamUuid, topicUuid),
  ]);
}

export async function deleteMessengerFolderCache(
  ownerKey: string,
  folderUuid: MessengerUuid,
): Promise<void> {
  await deleteMessengerFolderCatalogCache(ownerKey, folderUuid);
}

export async function deleteMessengerFolderItemCache(
  ownerKey: string,
  folderItemUuid: MessengerUuid,
): Promise<void> {
  await deleteMessengerFolderItemCatalogCache(ownerKey, folderItemUuid);
}

export async function readMessengerConversationWindowCache(
  ownerKey: string,
  conversationId: MessengerConversationId,
): Promise<MessengerConversationCacheWindow> {
  const cached = await readConversationMessageWindow(ownerKey, conversationId);
  return {
    messages: cached.messages as unknown as MessengerMessage[],
    nextPageMarker: cached.window?.nextPageMarker ?? null,
    hasMore: cached.window?.hasMore ?? false,
  };
}

export async function readMessengerMessageBodyCache(
  ownerKey: string,
  messageUuids: readonly MessengerUuid[],
): Promise<MessengerMessage[]> {
  const cached = await readCachedMessagesByUuids(ownerKey, messageUuids);
  return cached as unknown as MessengerMessage[];
}

export async function writeMessengerMessageBodyCache(
  ownerKey: string,
  messages: readonly MessengerMessage[],
): Promise<void> {
  await upsertCachedMessages(ownerKey, messages);
}

export async function writeMessengerConversationWindowCache(
  ownerKey: string,
  conversationId: MessengerConversationId,
  page: WorkspaceMessengerConversationMessagePage,
): Promise<void> {
  await writeConversationMessagePage(ownerKey, conversationId, page);
}

export async function writeMessengerLiveMessageCache(
  ownerKey: string,
  conversationId: MessengerConversationId,
  page: { messages: readonly MessengerMessage[] },
): Promise<void> {
  await writeConversationMessagePage(ownerKey, conversationId, page);
  const message = page.messages.at(-1);
  if (message != null) {
    await applyMessengerMessagePointerCache(ownerKey, message);
  }
}

export async function patchMessengerCachedMessage(
  ownerKey: string,
  message: MessengerMessage,
): Promise<void> {
  await patchCachedMessage(ownerKey, message);
  await applyMessengerMessagePointerCache(ownerKey, message);
}

export async function deleteMessengerCachedMessage(
  ownerKey: string,
  messageUuid: MessengerUuid,
  conversationIds: readonly MessengerConversationId[],
): Promise<void> {
  await deleteCachedMessage(ownerKey, messageUuid, conversationIds);
  await clearMessengerMessagePointerCache(ownerKey, messageUuid);
}

export async function writeMessengerRealtimeCursorCache(
  ownerKey: string,
  epochVersion: number,
): Promise<void> {
  await writeRealtimeCursor(ownerKey, epochVersion);
}

export const messengerMessageActionCache = {
  patchCachedMessage: patchMessengerCachedMessage,
  deleteCachedMessage: deleteMessengerCachedMessage,
  writeConversationMessagePage: writeMessengerLiveMessageCache,
};

export const messengerRealtimeActiveCache = {
  patchCachedMessage: patchMessengerCachedMessage,
  deleteCachedMessage: deleteMessengerCachedMessage,
  writeConversationMessagePage: writeMessengerLiveMessageCache,
  upsertCachedStream: upsertMessengerStreamCache,
  deleteCachedStream: deleteMessengerStreamCache,
  upsertCachedStreamBindings: upsertMessengerStreamBindingsCache,
  upsertCachedTopic: upsertMessengerTopicCache,
  deleteCachedTopic: deleteMessengerTopicCache,
  upsertCachedFolder: writeMessengerFolderSnapshotCache,
  deleteCachedFolder: deleteMessengerFolderCache,
  deleteCachedFolderItem: deleteMessengerFolderItemCache,
  writeRealtimeCursor: writeMessengerRealtimeCursorCache,
};
