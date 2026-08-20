import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import {
  adaptMessengerFolder,
  adaptMessengerMessage,
  adaptMessengerStream,
  adaptMessengerStreamBinding,
  adaptMessengerTopic,
} from "./messenger-adapters.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import type { MessengerReadBoundary } from "./messenger-read-boundary.lib";
import type {
  MessengerConversationId,
  MessengerFolder,
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

export interface MessengerRealtimeCacheConversationPage {
  messages: readonly MessengerMessage[];
  source: "realtime";
}

export interface MessengerRealtimeCacheWriter {
  advanceReadBoundary: (boundary: MessengerReadBoundary) => Promise<void> | void;
  markCachedMessagesRead: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
  ) => Promise<void> | void;
  patchCachedMessage: (ownerKey: string, message: MessengerMessage) => Promise<void> | void;
  deleteCachedMessage: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    conversationIds: readonly MessengerConversationId[],
  ) => Promise<void> | void;
  writeConversationMessagePage: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    page: MessengerRealtimeCacheConversationPage,
  ) => Promise<void> | void;
  upsertCachedStream: (ownerKey: string, stream: MessengerStream) => Promise<void> | void;
  deleteCachedStream: (ownerKey: string, streamUuid: MessengerUuid) => Promise<void> | void;
  upsertCachedStreamBindings: (
    ownerKey: string,
    streamBindings: readonly MessengerStreamBinding[],
  ) => Promise<void> | void;
  deleteCachedStreamBinding: (
    ownerKey: string,
    streamBindingUuid: MessengerUuid,
  ) => Promise<void> | void;
  upsertCachedTopic: (ownerKey: string, topic: MessengerTopic) => Promise<void> | void;
  deleteCachedTopic: (
    ownerKey: string,
    topicUuid: MessengerUuid,
    streamUuid: MessengerUuid,
  ) => Promise<void> | void;
  upsertCachedFolder: (ownerKey: string, folder: MessengerFolder) => Promise<void> | void;
  deleteCachedFolder: (ownerKey: string, folderUuid: MessengerUuid) => Promise<void> | void;
  deleteCachedFolderItem: (ownerKey: string, folderItemUuid: MessengerUuid) => Promise<void> | void;
  writeRealtimeCursor: (ownerKey: string, epochVersion: number) => Promise<void> | void;
}

export type MessengerRealtimeCacheApplyStatus = "applied" | "deferred";

export interface ApplyMessengerRealtimeEventToCacheOptions {
  event: WorkspaceRealtimeEvent;
  ownerKey: string;
  writer: MessengerRealtimeCacheWriter;
  isWriteCurrent: () => boolean;
}

async function applyMessageEvent(
  event: Extract<WorkspaceRealtimeEvent, { type: "message" }>,
  ownerKey: string,
  writer: MessengerRealtimeCacheWriter,
  isWriteCurrent: () => boolean,
): Promise<MessengerRealtimeCacheApplyStatus> {
  if (event.kind === "message.deleted") {
    await writer.deleteCachedMessage(ownerKey, event.message.uuid, [
      conversationIdForStream(event.message.stream_uuid),
      conversationIdForTopic(event.message.stream_uuid, event.message.topic_uuid),
    ]);
    return isWriteCurrent() ? "applied" : "deferred";
  }

  const message = adaptMessengerMessage(event.message);
  if (event.kind === "message.updated") {
    await writer.patchCachedMessage(ownerKey, message);
    return isWriteCurrent() ? "applied" : "deferred";
  }
  if (event.kind === "message.read") {
    const readMessage = { ...message, read: true };
    await writer.patchCachedMessage(ownerKey, readMessage);
    if (!isWriteCurrent()) return "deferred";
    await writer.advanceReadBoundary({
      ownerKey,
      streamUuid: readMessage.streamUuid,
      topicUuid: readMessage.topicUuid,
      createdAt: readMessage.createdAt,
      messageUuid: readMessage.uuid,
      epochVersion: event.epoch_version,
    });
    return isWriteCurrent() ? "applied" : "deferred";
  }

  const page: MessengerRealtimeCacheConversationPage = {
    messages: [message],
    source: "realtime",
  };
  const conversationIds = [conversationIdForStream(message.streamUuid), message.conversationId];
  for (const conversationId of new Set(conversationIds)) {
    if (!isWriteCurrent()) return "deferred";
    await writer.writeConversationMessagePage(ownerKey, conversationId, page);
  }
  return isWriteCurrent() ? "applied" : "deferred";
}

async function applyDomainMutation(
  event: WorkspaceRealtimeEvent,
  ownerKey: string,
  writer: MessengerRealtimeCacheWriter,
  isWriteCurrent: () => boolean,
): Promise<MessengerRealtimeCacheApplyStatus> {
  switch (event.type) {
    case "message":
      return applyMessageEvent(event, ownerKey, writer, isWriteCurrent);
    case "messages":
      await writer.markCachedMessagesRead(ownerKey, event.messageUuids);
      return "applied";
    case "stream":
      if (event.kind === "stream.deleted") {
        await writer.deleteCachedStream(ownerKey, event.stream.uuid);
      } else {
        await writer.upsertCachedStream(ownerKey, adaptMessengerStream(event.stream));
      }
      return "applied";
    case "stream_binding":
      if (event.kind === "stream_binding.deleted") {
        await writer.deleteCachedStreamBinding(ownerKey, event.stream_binding.uuid);
      } else {
        const bindings =
          event.kind === "stream_binding.updated"
            ? [adaptMessengerStreamBinding(event.stream_binding)]
            : event.stream_bindings.map(adaptMessengerStreamBinding);
        await writer.upsertCachedStreamBindings(ownerKey, bindings);
      }
      return "applied";
    case "topic":
      if (event.kind === "topic.deleted") {
        await writer.deleteCachedTopic(ownerKey, event.topic.uuid, event.topic.stream_uuid);
      } else {
        await writer.upsertCachedTopic(ownerKey, adaptMessengerTopic(event.topic));
      }
      return "applied";
    case "folder":
      if (event.kind === "folder.deleted") {
        await writer.deleteCachedFolder(ownerKey, event.folder.uuid);
      } else {
        await writer.upsertCachedFolder(ownerKey, adaptMessengerFolder(event.folder));
      }
      return "applied";
    case "folder_item":
      await writer.deleteCachedFolderItem(ownerKey, event.folder_item.uuid);
      return "applied";
    case "file":
    case "user":
    case "external_account":
    case "external_chat":
      return "deferred";
  }
}

export async function applyMessengerRealtimeEventToCache({
  event,
  ownerKey,
  writer,
  isWriteCurrent,
}: ApplyMessengerRealtimeEventToCacheOptions): Promise<MessengerRealtimeCacheApplyStatus> {
  if (!isWriteCurrent()) return "deferred";

  const status = await applyDomainMutation(event, ownerKey, writer, isWriteCurrent);
  if (status === "deferred" || !isWriteCurrent()) return "deferred";

  await writer.writeRealtimeCursor(ownerKey, event.epoch_version);
  return "applied";
}
