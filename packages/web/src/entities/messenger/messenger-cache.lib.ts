import {
  deleteCachedMessage,
  patchCachedMessage,
  readConversationMessageWindow,
  readMessengerCatalogCache,
  writeConversationMessagePage,
  writeMessengerCatalogCache,
  writeRealtimeCursor,
} from "~/shared/lib/workspace-messenger-cache-db";
import type {
  WorkspaceMessengerCatalogCacheSnapshot,
  WorkspaceMessengerCatalogCacheWriteSnapshot,
  WorkspaceMessengerConversationMessagePage,
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
    snapshot.users.length > 0
  );
}

function catalogWriteSnapshot(
  payload: MessengerBootstrapPayload,
): WorkspaceMessengerCatalogCacheWriteSnapshot {
  return {
    streams: payload.streams,
    topics: payload.topics,
    conversations: payload.conversations,
    folders: payload.folders,
    folderItems: payload.folders.flatMap((folder) => folder.items),
    users: payload.users,
  };
}

function snapshotPayload(
  snapshot: WorkspaceMessengerCatalogCacheSnapshot,
): MessengerBootstrapPayload {
  return {
    streams: snapshot.streams as unknown as MessengerStream[],
    streamBindings: [],
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
): Promise<void> {
  await writeMessengerCatalogCache(ownerKey, catalogWriteSnapshot(payload));
}

function replaceByUuid<TItem extends { uuid: string }>(
  items: readonly TItem[],
  item: TItem,
): TItem[] {
  const next = items.filter((current) => current.uuid !== item.uuid);
  next.push(item);
  return next;
}

function removeByUuid<TItem extends { uuid: string }>(
  items: readonly TItem[],
  uuid: string,
): TItem[] {
  return items.filter((item) => item.uuid !== uuid);
}

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

async function readCatalogPayloadOrEmpty(ownerKey: string): Promise<MessengerBootstrapPayload> {
  const cached = await readMessengerCatalogPayloadCache(ownerKey);
  return (
    cached?.payload ?? {
      streams: [],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [],
      users: [],
    }
  );
}

async function writeMergedCatalogPayload(
  ownerKey: string,
  mutate: (payload: MessengerBootstrapPayload) => MessengerBootstrapPayload,
): Promise<void> {
  const payload = await readCatalogPayloadOrEmpty(ownerKey);
  await writeMessengerCatalogPayloadCache(ownerKey, mutate(payload));
}

export async function writeMessengerFolderSnapshotCache(
  ownerKey: string,
  folder: MessengerFolder,
): Promise<void> {
  await writeMergedCatalogPayload(ownerKey, (payload) => ({
    ...payload,
    folders: replaceByUuid(payload.folders, folder),
  }));
}

export async function upsertMessengerStreamCache(
  ownerKey: string,
  stream: MessengerStream,
): Promise<void> {
  await writeMergedCatalogPayload(ownerKey, (payload) => {
    const topics = payload.topics.filter((topic) => topic.streamUuid === stream.uuid);
    const affectedConversationIds = new Set<MessengerConversationId>([
      conversationIdForStream(stream.uuid),
      ...topics.map((topic) => conversationIdForTopic(stream.uuid, topic.uuid)),
    ]);
    const conversations = payload.conversations.filter(
      (conversation) => !affectedConversationIds.has(conversation.id),
    );
    conversations.push(conversationFromStream(stream));
    for (const topic of topics) {
      conversations.push(conversationFromTopic(topic, stream));
    }

    return {
      ...payload,
      streams: replaceByUuid(payload.streams, stream),
      conversations,
    };
  });
}

export async function deleteMessengerStreamCache(
  ownerKey: string,
  streamUuid: MessengerUuid,
): Promise<void> {
  await writeMergedCatalogPayload(ownerKey, (payload) => ({
    ...payload,
    streams: removeByUuid(payload.streams, streamUuid),
    topics: payload.topics.filter((topic) => topic.streamUuid !== streamUuid),
    conversations: payload.conversations.filter(
      (conversation) => conversation.streamUuid !== streamUuid,
    ),
  }));
}

export async function upsertMessengerStreamBindingsCache(
  ownerKey: string,
  streamBindings: readonly MessengerStreamBinding[],
): Promise<void> {
  await writeMergedCatalogPayload(ownerKey, (payload) => ({
    ...payload,
    streamBindings: streamBindings.reduce(
      (next, binding) => replaceByUuid(next, binding),
      payload.streamBindings,
    ),
  }));
}

export async function upsertMessengerTopicCache(
  ownerKey: string,
  topic: MessengerTopic,
): Promise<void> {
  await writeMergedCatalogPayload(ownerKey, (payload) => {
    const stream = payload.streams.find((item) => item.uuid === topic.streamUuid);
    const topicConversationId = conversationIdForTopic(topic.streamUuid, topic.uuid);
    const conversations = payload.conversations.filter(
      (conversation) => conversation.id !== topicConversationId,
    );
    if (stream != null) {
      conversations.push(conversationFromTopic(topic, stream));
    }

    return {
      ...payload,
      topics: replaceByUuid(payload.topics, topic),
      conversations,
    };
  });
}

export async function deleteMessengerTopicCache(
  ownerKey: string,
  topicUuid: MessengerUuid,
  streamUuid: MessengerUuid,
): Promise<void> {
  const conversationId = conversationIdForTopic(streamUuid, topicUuid);
  await writeMergedCatalogPayload(ownerKey, (payload) => ({
    ...payload,
    topics: removeByUuid(payload.topics, topicUuid),
    conversations: payload.conversations.filter(
      (conversation) => conversation.id !== conversationId,
    ),
  }));
}

export async function deleteMessengerFolderCache(
  ownerKey: string,
  folderUuid: MessengerUuid,
): Promise<void> {
  await writeMergedCatalogPayload(ownerKey, (payload) => ({
    ...payload,
    folders: removeByUuid(payload.folders, folderUuid),
  }));
}

export async function deleteMessengerFolderItemCache(
  ownerKey: string,
  folderItemUuid: MessengerUuid,
): Promise<void> {
  await writeMergedCatalogPayload(ownerKey, (payload) => ({
    ...payload,
    folders: payload.folders.map((folder) => ({
      ...folder,
      items: folder.items.filter((item) => item.uuid !== folderItemUuid),
    })),
  }));
}

function withMessagePointers(
  payload: MessengerBootstrapPayload,
  message: MessengerMessage,
): MessengerBootstrapPayload {
  const streamConversationId = conversationIdForStream(message.streamUuid);
  return {
    ...payload,
    streams: payload.streams.map((stream) =>
      stream.uuid === message.streamUuid
        ? { ...stream, lastMessageUuid: message.uuid, updatedAt: message.createdAt }
        : stream,
    ),
    topics: payload.topics.map((topic) =>
      topic.uuid === message.topicUuid
        ? { ...topic, lastMessageUuid: message.uuid, updatedAt: message.createdAt }
        : topic,
    ),
    conversations: payload.conversations.map((conversation) =>
      conversation.id === streamConversationId || conversation.id === message.conversationId
        ? { ...conversation, lastMessageUuid: message.uuid }
        : conversation,
    ),
  };
}

function withoutMessagePointers(
  payload: MessengerBootstrapPayload,
  messageUuid: MessengerUuid,
): MessengerBootstrapPayload {
  return {
    ...payload,
    streams: payload.streams.map((stream) =>
      stream.lastMessageUuid === messageUuid ? { ...stream, lastMessageUuid: null } : stream,
    ),
    topics: payload.topics.map((topic) =>
      topic.lastMessageUuid === messageUuid ? { ...topic, lastMessageUuid: null } : topic,
    ),
    conversations: payload.conversations.map((conversation) =>
      conversation.lastMessageUuid === messageUuid
        ? { ...conversation, lastMessageUuid: null }
        : conversation,
    ),
  };
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
    await writeMergedCatalogPayload(ownerKey, (payload) => withMessagePointers(payload, message));
  }
}

export async function patchMessengerCachedMessage(
  ownerKey: string,
  message: MessengerMessage,
): Promise<void> {
  await patchCachedMessage(ownerKey, message);
  await writeMergedCatalogPayload(ownerKey, (payload) => withMessagePointers(payload, message));
}

export async function deleteMessengerCachedMessage(
  ownerKey: string,
  messageUuid: MessengerUuid,
  conversationIds: readonly MessengerConversationId[],
): Promise<void> {
  await deleteCachedMessage(ownerKey, messageUuid, conversationIds);
  await writeMergedCatalogPayload(ownerKey, (payload) =>
    withoutMessagePointers(payload, messageUuid),
  );
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
