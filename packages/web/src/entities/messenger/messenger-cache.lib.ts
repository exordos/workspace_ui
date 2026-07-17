import {
  applyMessengerMessagePointerCache,
  clearMessengerMessagePointerCache,
  createMessengerCatalogCacheReconcileFence,
  deleteCachedMessage,
  deleteCachedStreamMessageBuckets,
  deleteCachedTopicMessageBuckets,
  deleteMessengerFolderCatalogCache,
  deleteMessengerFolderItemCatalogCache,
  deleteMessengerStreamBindingCatalogCache,
  deleteOwnMessageReaction,
  deleteOwnMessageReactionsForMessage,
  deleteOwnMessageReactionsForMessages,
  deleteMessengerStreamCatalogCache,
  deleteMessengerTopicCatalogCache,
  patchCachedMessage,
  readCachedMessagesByUuids,
  readConversationMessageWindow,
  readMessengerCatalogCache,
  readOwnMessageReaction,
  readOwnMessageReactions,
  replaceOwnMessageReactionsForOwner,
  replaceOwnMessageReactionsForMessage,
  upsertCachedMessages,
  upsertMessengerConversationsCache,
  upsertMessengerFolderSnapshotsCache,
  upsertMessengerStreamBindingsCache as upsertMessengerStreamBindingsCatalogCache,
  upsertMessengerStreamsCache,
  upsertMessengerTopicsCache,
  upsertOwnMessageReaction,
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
  WorkspaceMessengerOwnMessageReactionCacheRow,
  WorkspaceMessengerOwnMessageReactionCacheWrite,
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

// Entity-слой оставляет низкоуровневую IndexedDB-схему внутри shared/lib, но
// отдает будущим action/loaders уже доменно названные helpers для своих реакций.
export type MessengerOwnMessageReactionCacheRow = WorkspaceMessengerOwnMessageReactionCacheRow;
export type MessengerOwnMessageReactionCacheWrite = WorkspaceMessengerOwnMessageReactionCacheWrite;

function hasCatalogData(snapshot: WorkspaceMessengerCatalogCacheSnapshot): boolean {
  return (
    snapshot.streams.length > 0 ||
    snapshot.topics.length > 0 ||
    snapshot.conversations.length > 0 ||
    snapshot.folders.length > 0 ||
    snapshot.streamBindings.length > 0
  );
}

function catalogWriteSnapshot(
  payload: MessengerBootstrapPayload,
  options: MessengerCatalogPayloadCacheWriteOptions = {},
): WorkspaceMessengerCatalogCacheWriteSnapshot {
  const shouldWriteFolders = options.mode !== "reconcile" || options.reconcileFolders === true;
  const shouldWriteStreamBindings =
    options.mode !== "reconcile" || payload.streamBindings.length > 0;
  return {
    streams: payload.streams,
    streamBindings: shouldWriteStreamBindings ? payload.streamBindings : undefined,
    topics: payload.topics,
    conversations: payload.conversations,
    folders: shouldWriteFolders ? payload.folders : undefined,
    folderItems: shouldWriteFolders ? payload.folders.flatMap((folder) => folder.items) : undefined,
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

export async function replaceMessengerFolderSnapshotsCache(
  ownerKey: string,
  folders: MessengerFolder[],
): Promise<void> {
  await writeMessengerCatalogCache(
    ownerKey,
    {
      folders,
      folderItems: folders.flatMap((folder) => folder.items),
    },
    { mode: "reconcile" },
  );
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

export async function deleteMessengerStreamBindingCache(
  ownerKey: string,
  streamBindingUuid: MessengerUuid,
): Promise<void> {
  await deleteMessengerStreamBindingCatalogCache(ownerKey, streamBindingUuid);
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

// Эти helpers хранят не сами счетчики reactions, а только локальную карту
// "моя emojiName -> reactionUuid". Счетчики остаются правдой backend message DTO.
export async function readMessengerOwnMessageReactionsCache(
  ownerKey: string,
  messageUuids: readonly MessengerUuid[],
): Promise<MessengerOwnMessageReactionCacheRow[]> {
  return readOwnMessageReactions(ownerKey, messageUuids);
}

// Точечное чтение нужно remove/toggle сценарию после reload, когда message store
// еще не обогащен ownReactionUuidsByEmojiName.
export async function readMessengerOwnMessageReactionCache(
  ownerKey: string,
  messageUuid: MessengerUuid,
  emojiName: string,
): Promise<MessengerOwnMessageReactionCacheRow | null> {
  return readOwnMessageReaction(ownerKey, messageUuid, emojiName);
}

// Reconcile ограничен одним сообщением: пустой rows очищает только это
// сообщение, а не весь owner cache и не весь видимый window.
export async function replaceMessengerOwnMessageReactionsForMessageCache(
  ownerKey: string,
  messageUuid: MessengerUuid,
  rows: readonly MessengerOwnMessageReactionCacheWrite[],
): Promise<void> {
  await replaceOwnMessageReactionsForMessage(ownerKey, messageUuid, rows);
}

export async function replaceMessengerOwnMessageReactionsForOwnerCache(
  ownerKey: string,
  rows: readonly MessengerOwnMessageReactionCacheWrite[],
): Promise<void> {
  await replaceOwnMessageReactionsForOwner(ownerKey, rows);
}

// Upsert вызывается после create/revalidate и сохраняет reactionUuid, нужный
// для последующего DELETE /message_reactions/{reaction_uuid}.
export async function upsertMessengerOwnMessageReactionCache(
  ownerKey: string,
  row: MessengerOwnMessageReactionCacheWrite,
): Promise<void> {
  await upsertOwnMessageReaction(ownerKey, row);
}

// Удаление одной emojiName отражает успешное удаление своей реакции через API.
export async function deleteMessengerOwnMessageReactionCache(
  ownerKey: string,
  messageUuid: MessengerUuid,
  emojiName: string,
): Promise<void> {
  await deleteOwnMessageReaction(ownerKey, messageUuid, emojiName);
}

// Эти функции нужны cleanup-сценариям message/topic/stream. Они принимают только
// явные UUID сообщений, чтобы не удалять реакции сообщений вне текущего события.
export async function deleteMessengerOwnMessageReactionsForMessageCache(
  ownerKey: string,
  messageUuid: MessengerUuid,
): Promise<void> {
  await deleteOwnMessageReactionsForMessage(ownerKey, messageUuid);
}

export async function deleteMessengerOwnMessageReactionsForMessagesCache(
  ownerKey: string,
  messageUuids: readonly MessengerUuid[],
): Promise<void> {
  await deleteOwnMessageReactionsForMessages(ownerKey, messageUuids);
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
  deleteCachedStreamBinding: deleteMessengerStreamBindingCache,
  upsertCachedTopic: upsertMessengerTopicCache,
  deleteCachedTopic: deleteMessengerTopicCache,
  upsertCachedFolder: writeMessengerFolderSnapshotCache,
  deleteCachedFolder: deleteMessengerFolderCache,
  deleteCachedFolderItem: deleteMessengerFolderItemCache,
  writeRealtimeCursor: writeMessengerRealtimeCursorCache,
};
