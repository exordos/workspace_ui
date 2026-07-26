import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { invalidateWorkspaceFileResourceCache } from "~/shared/lib/workspace-file-loader.lib";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
  WorkspaceRealtimeSkipReason,
  WorkspaceRealtimeSkippedEvent,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import {
  adaptMessengerFolder,
  adaptMessengerMessage,
  adaptMessengerStream,
  adaptMessengerStreamBinding,
  adaptMessengerTopic,
} from "./messenger-adapters.lib";
import { useMessengerBackgroundProjectionStore } from "./messenger-background-projection.model";
import { messengerRealtimeActiveCache } from "./messenger-cache.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import { useMessengerStore } from "./messenger.model";
import type {
  MessengerConversationId,
  MessengerDeletedMessage,
  MessengerFolder,
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

type MessengerRealtimeEvent = Exclude<WorkspaceRealtimeEvent, { type: "user" }>;
type MessengerMessageRealtimeEvent = Extract<MessengerRealtimeEvent, { type: "message" }>;
type MessengerStreamRealtimeEvent = Extract<MessengerRealtimeEvent, { type: "stream" }>;
type MessengerStreamBindingRealtimeEvent = Extract<
  MessengerRealtimeEvent,
  { type: "stream_binding" }
>;
type MessengerTopicRealtimeEvent = Extract<MessengerRealtimeEvent, { type: "topic" }>;
type MessengerFolderRealtimeEvent = Extract<MessengerRealtimeEvent, { type: "folder" }>;
type MessengerFolderItemRealtimeEvent = Extract<MessengerRealtimeEvent, { type: "folder_item" }>;
type MessengerFileRealtimeEvent = Extract<MessengerRealtimeEvent, { type: "file" }>;

export interface MessengerRealtimeCacheConversationPage {
  messages: readonly MessengerMessage[];
  source: "realtime";
}

export interface MessengerRealtimeActiveCacheWriter {
  patchCachedMessage?: (ownerKey: string, message: MessengerMessage) => Promise<void> | void;
  deleteCachedMessage?: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    conversationIds: readonly MessengerConversationId[],
  ) => Promise<void> | void;
  writeConversationMessagePage?: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    page: MessengerRealtimeCacheConversationPage,
  ) => Promise<void> | void;
  upsertCachedStream?: (ownerKey: string, stream: MessengerStream) => Promise<void> | void;
  deleteCachedStream?: (ownerKey: string, streamUuid: MessengerUuid) => Promise<void> | void;
  upsertCachedStreamBindings?: (
    ownerKey: string,
    streamBindings: readonly MessengerStreamBinding[],
  ) => Promise<void> | void;
  deleteCachedStreamBinding?: (
    ownerKey: string,
    streamBindingUuid: MessengerUuid,
  ) => Promise<void> | void;
  upsertCachedTopic?: (ownerKey: string, topic: MessengerTopic) => Promise<void> | void;
  deleteCachedTopic?: (
    ownerKey: string,
    topicUuid: MessengerUuid,
    streamUuid: MessengerUuid,
  ) => Promise<void> | void;
  upsertCachedFolder?: (ownerKey: string, folder: MessengerFolder) => Promise<void> | void;
  deleteCachedFolder?: (ownerKey: string, folderUuid: MessengerUuid) => Promise<void> | void;
  deleteCachedFolderItem?: (
    ownerKey: string,
    folderItemUuid: MessengerUuid,
  ) => Promise<void> | void;
  writeRealtimeCursor?: (ownerKey: string, epochVersion: number) => Promise<void> | void;
}

export interface MessengerRealtimeActiveApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  cache?: MessengerRealtimeActiveCacheWriter;
  onMessageCreated?: (
    ownerKey: string,
    message: MessengerMessage,
    stream: MessengerStream | null,
    context: WorkspaceRealtimeEventContext,
  ) => void | Promise<void>;
  // message.updated приносит только новый aggregate счетчиков, но не reactionUuid
  // текущего пользователя. Этот hook оставляет точку подключения для SWR-слоя:
  // он сможет перечитать own reaction rows без того, чтобы realtime applier знал
  // про API/cache orchestration.
  onMessageReactionAggregateUpdated?: (
    ownerKey: string,
    message: MessengerMessage,
  ) => void | Promise<void>;
  onFileChanged?: (ownerKey: string, event: MessengerFileRealtimeEvent) => void | Promise<void>;
}

export interface MessengerRealtimeBackgroundApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
}

const log = createLogger("realtime:workspace-messenger");

function isActiveCurrentOwner(
  context: WorkspaceRealtimeEventContext,
  options: MessengerRealtimeActiveApplierOptions,
): boolean {
  if (context.surface !== "active") return false;
  if (context.signal?.aborted === true) return false;

  // ownerKey does not include runtimeGeneration, so check stale sockets before any store write.
  return options.isOwnerCurrent?.(context.owner) ?? true;
}

function isBackgroundCurrentOwner(
  context: WorkspaceRealtimeEventContext,
  options: MessengerRealtimeBackgroundApplierOptions,
): boolean {
  if (context.surface !== "background") return false;
  if (context.signal?.aborted === true) return false;

  // Background runtime can live for several org/projects, so owner checks stay equally strict.
  return options.isOwnerCurrent?.(context.owner) ?? true;
}

function eventKind(event: { type?: unknown; kind?: unknown }): string {
  if (typeof event.kind === "string") {
    return event.kind;
  }

  return typeof event.type === "string" ? event.type : "unknown";
}

function isSupportedRealtimeEvent(event: WorkspaceRealtimeEvent): event is MessengerRealtimeEvent {
  const eventType = (event as { type?: unknown }).type;
  return (
    eventType === "message" ||
    eventType === "stream" ||
    eventType === "stream_binding" ||
    eventType === "topic" ||
    eventType === "folder" ||
    eventType === "folder_item" ||
    eventType === "file"
  );
}

function isNonMessengerRealtimeEvent(event: WorkspaceRealtimeEvent): boolean {
  return event.type === "user";
}

function isBackgroundLightweightEvent(event: WorkspaceRealtimeEvent): boolean {
  // Membership and file bytes have no safe background projection. They are applied
  // by the active runtime, where their scoped stores and caches are available.
  return event.type !== "stream_binding" && event.type !== "file";
}

function skippedEpoch(event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent): number {
  return event.epoch_version;
}

function conversationIdsForRealtimeMessage(message: MessengerMessage): MessengerConversationId[] {
  const streamConversationId = conversationIdForStream(message.streamUuid);
  return streamConversationId === message.conversationId
    ? [message.conversationId]
    : [message.conversationId, streamConversationId];
}

function conversationIdsForDeletedRealtimeMessage(
  message: MessengerDeletedMessage,
): MessengerConversationId[] {
  return [
    conversationIdForStream(message.streamUuid),
    conversationIdForTopic(message.streamUuid, message.topicUuid),
  ];
}

function areReactionAggregatesEqual(
  left: MessengerMessage["reactions"],
  right: MessengerMessage["reactions"],
): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;

  return leftEntries.every(([emojiName, count]) => right[emojiName] === count);
}

function writeRealtimeCacheBestEffort(write: () => Promise<void> | void): void {
  try {
    const result = write();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Cache write failures must not stop realtime event application.
  }
}

function writeRealtimeMessagePageCache(
  cache: MessengerRealtimeActiveCacheWriter | undefined,
  ownerKey: string,
  message: MessengerMessage,
): void {
  const writeConversationMessagePage = cache?.writeConversationMessagePage;
  if (writeConversationMessagePage == null) return;

  writeRealtimeCacheBestEffort(async () => {
    await Promise.all(
      conversationIdsForRealtimeMessage(message).map((conversationId) =>
        Promise.resolve(
          writeConversationMessagePage(ownerKey, conversationId, {
            messages: [message],
            source: "realtime",
          }),
        ),
      ),
    );
  });
}

function writeRealtimeCursorCache(
  cache: MessengerRealtimeActiveCacheWriter | undefined,
  ownerKey: string,
  epochVersion: number,
): void {
  if (cache?.writeRealtimeCursor == null) return;
  writeRealtimeCacheBestEffort(() => cache.writeRealtimeCursor?.(ownerKey, epochVersion));
}

function deleteRealtimeCachedMessage(
  cache: MessengerRealtimeActiveCacheWriter,
  ownerKey: string,
  message: MessengerDeletedMessage,
): void {
  if (cache.deleteCachedMessage == null) return;

  writeRealtimeCacheBestEffort(() =>
    cache.deleteCachedMessage?.(
      ownerKey,
      message.uuid,
      conversationIdsForDeletedRealtimeMessage(message),
    ),
  );
}

function removeTopicMessagesFromWorkspaceStore(
  streamUuid: string,
  topicUuid: string,
): MessengerDeletedMessage[] {
  const messageStore = useWorkspaceMessageStore.getState();
  const conversationIds = [
    conversationIdForStream(streamUuid),
    conversationIdForTopic(streamUuid, topicUuid),
  ];
  const removedMessages: MessengerDeletedMessage[] = [];
  for (const message of Object.values(messageStore.messagesById)) {
    if (message.streamUuid !== streamUuid || message.topicUuid !== topicUuid) continue;
    removedMessages.push({
      uuid: message.uuid,
      streamUuid: message.streamUuid,
      topicUuid: message.topicUuid,
    });
    messageStore.removeMessage(message.uuid, { conversationIds });
  }
  return removedMessages;
}

function applyMessageRealtimeEvent(
  event: MessengerMessageRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  activeCache: MessengerRealtimeActiveCacheWriter,
  options: MessengerRealtimeActiveApplierOptions,
): void {
  const store = useMessengerStore.getState();
  const messageStore = useWorkspaceMessageStore.getState();

  if (event.kind === "message.deleted") {
    const deletedMessage = {
      uuid: event.message.uuid,
      streamUuid: event.message.stream_uuid,
      topicUuid: event.message.topic_uuid,
    };
    messageStore.removeMessage(event.message.uuid);
    store.clearMessagePointer(ownerKey, {
      uuid: event.message.uuid,
      streamUuid: event.message.stream_uuid,
      topicUuid: event.message.topic_uuid,
    });
    deleteRealtimeCachedMessage(activeCache, ownerKey, deletedMessage);
    return;
  }

  const message = adaptMessengerMessage(event.message);
  const stream = store.streamsById[message.streamUuid] ?? null;
  const previousMessage = messageStore.messagesById[message.uuid];
  messageStore.upsertMessage(message);
  store.applyMessagePointer(ownerKey, message);
  if (event.kind === "message.updated") {
    if (activeCache.patchCachedMessage != null) {
      writeRealtimeCacheBestEffort(() => activeCache.patchCachedMessage?.(ownerKey, message));
    }
    if (
      previousMessage != null &&
      !areReactionAggregatesEqual(previousMessage.reactions, message.reactions) &&
      options.onMessageReactionAggregateUpdated != null
    ) {
      writeRealtimeCacheBestEffort(() =>
        options.onMessageReactionAggregateUpdated?.(ownerKey, message),
      );
    }
    return;
  }

  writeRealtimeMessagePageCache(activeCache, ownerKey, message);
  if (context.notificationsEnabled === true && options.onMessageCreated != null) {
    writeRealtimeCacheBestEffort(() =>
      options.onMessageCreated?.(ownerKey, message, stream, context),
    );
  }
}

function applyStreamRealtimeEvent(
  event: MessengerStreamRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): void {
  const store = useMessengerStore.getState();

  if (event.kind === "stream.deleted") {
    store.removeStream(ownerKey, { uuid: event.stream.uuid });
    if (activeCache.deleteCachedStream != null) {
      writeRealtimeCacheBestEffort(() =>
        activeCache.deleteCachedStream?.(ownerKey, event.stream.uuid),
      );
    }
    return;
  }

  const stream = adaptMessengerStream(event.stream);
  const previousFoldersById = store.foldersById;
  store.upsertStream(ownerKey, stream);
  if (activeCache.upsertCachedStream != null) {
    writeRealtimeCacheBestEffort(() => activeCache.upsertCachedStream?.(ownerKey, stream));
  }
  if (activeCache.upsertCachedFolder != null) {
    const nextStore = useMessengerStore.getState();
    for (const folderUuid of nextStore.folderIds) {
      const folder = nextStore.foldersById[folderUuid];
      if (folder == null || folder === previousFoldersById[folderUuid]) continue;
      writeRealtimeCacheBestEffort(() => activeCache.upsertCachedFolder?.(ownerKey, folder));
    }
  }
}

function applyStreamBindingRealtimeEvent(
  event: MessengerStreamBindingRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): void {
  if (event.kind === "stream_binding.deleted") {
    useMessengerStore.getState().removeStreamBinding(ownerKey, {
      uuid: event.stream_binding.uuid,
      streamUuid: event.stream_binding.stream_uuid,
    });
    if (activeCache.deleteCachedStreamBinding != null) {
      writeRealtimeCacheBestEffort(() =>
        activeCache.deleteCachedStreamBinding?.(ownerKey, event.stream_binding.uuid),
      );
    }
    return;
  }

  const bindings =
    event.kind === "stream_binding.updated"
      ? [adaptMessengerStreamBinding(event.stream_binding)]
      : event.stream_bindings.map(adaptMessengerStreamBinding);
  useMessengerStore.getState().upsertStreamBindings(ownerKey, bindings);
  if (activeCache.upsertCachedStreamBindings != null) {
    writeRealtimeCacheBestEffort(() =>
      activeCache.upsertCachedStreamBindings?.(ownerKey, bindings),
    );
  }
}

function applyFileRealtimeEvent(
  event: MessengerFileRealtimeEvent,
  ownerKey: string,
  options: MessengerRealtimeActiveApplierOptions,
): void {
  invalidateWorkspaceFileResourceCache(ownerKey, event.file.uuid);
  if (options.onFileChanged != null) {
    writeRealtimeCacheBestEffort(() => options.onFileChanged?.(ownerKey, event));
  }
}

function applyTopicRealtimeEvent(
  event: MessengerTopicRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): void {
  const store = useMessengerStore.getState();

  if (event.kind === "topic.deleted") {
    const deletedMessages = removeTopicMessagesFromWorkspaceStore(
      event.topic.stream_uuid,
      event.topic.uuid,
    );
    store.removeTopic(ownerKey, {
      uuid: event.topic.uuid,
      streamUuid: event.topic.stream_uuid,
    });
    for (const deletedMessage of deletedMessages) {
      deleteRealtimeCachedMessage(activeCache, ownerKey, deletedMessage);
    }
    if (activeCache.deleteCachedTopic != null) {
      writeRealtimeCacheBestEffort(() =>
        activeCache.deleteCachedTopic?.(ownerKey, event.topic.uuid, event.topic.stream_uuid),
      );
    }
    return;
  }

  const topic = adaptMessengerTopic(event.topic);
  store.upsertTopic(ownerKey, topic);
  if (activeCache.upsertCachedTopic != null) {
    writeRealtimeCacheBestEffort(() => activeCache.upsertCachedTopic?.(ownerKey, topic));
  }
}

function applyFolderRealtimeEvent(
  event: MessengerFolderRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): void {
  const store = useMessengerStore.getState();

  if (event.kind === "folder.deleted") {
    store.removeFolder(ownerKey, { uuid: event.folder.uuid });
    if (activeCache.deleteCachedFolder != null) {
      writeRealtimeCacheBestEffort(() =>
        activeCache.deleteCachedFolder?.(ownerKey, event.folder.uuid),
      );
    }
    return;
  }

  const folder = adaptMessengerFolder(event.folder);
  store.applyFolderSnapshot(ownerKey, folder);
  if (activeCache.upsertCachedFolder != null) {
    writeRealtimeCacheBestEffort(() => activeCache.upsertCachedFolder?.(ownerKey, folder));
  }
}

function applyFolderItemRealtimeEvent(
  event: MessengerFolderItemRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): void {
  useMessengerStore
    .getState()
    .removeFolderItem(
      ownerKey,
      { uuid: event.folder_item.uuid },
      { preserveFolderUnreadCount: true },
    );
  if (activeCache.deleteCachedFolderItem != null) {
    writeRealtimeCacheBestEffort(() =>
      activeCache.deleteCachedFolderItem?.(ownerKey, event.folder_item.uuid),
    );
  }
}

function applySupportedRealtimeEvent(
  event: MessengerRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  activeCache: MessengerRealtimeActiveCacheWriter,
  options: MessengerRealtimeActiveApplierOptions,
): void {
  switch (event.type) {
    case "message":
      applyMessageRealtimeEvent(event, ownerKey, context, activeCache, options);
      break;
    case "stream":
      applyStreamRealtimeEvent(event, ownerKey, activeCache);
      break;
    case "stream_binding":
      applyStreamBindingRealtimeEvent(event, ownerKey, activeCache);
      break;
    case "topic":
      applyTopicRealtimeEvent(event, ownerKey, activeCache);
      break;
    case "folder":
      applyFolderRealtimeEvent(event, ownerKey, activeCache);
      break;
    case "folder_item":
      applyFolderItemRealtimeEvent(event, ownerKey, activeCache);
      break;
    case "file":
      applyFileRealtimeEvent(event, ownerKey, options);
      break;
  }
}

function applyLightweightProjectionEvent(
  event: MessengerRealtimeEvent,
  context: WorkspaceRealtimeEventContext,
): void {
  if (!isBackgroundLightweightEvent(event)) {
    return;
  }

  useMessengerBackgroundProjectionStore
    .getState()
    .recordAppliedEvent(context.ownerKey, event, context);
}

export function createMessengerRealtimeActiveApplier(
  options: MessengerRealtimeActiveApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  const activeCache = options.cache ?? messengerRealtimeActiveCache;
  return {
    applyEvent(event, context) {
      if (!isActiveCurrentOwner(context, options)) return;

      const store = useMessengerStore.getState();
      if (isNonMessengerRealtimeEvent(event)) return;
      if (!isSupportedRealtimeEvent(event)) {
        log.warn("Skipped unsupported workspace realtime event", {
          ownerKey: context.ownerKey,
          kind: eventKind(event),
          epochVersion: event.epoch_version,
        });
        // Unknown events also move the visible realtime cursor; the durable cursor is moved by transport.
        store.markRealtimeEventSkipped(context.ownerKey, event.epoch_version, "unsupported_event");
        return;
      }

      applySupportedRealtimeEvent(event, context.ownerKey, context, activeCache, options);
      applyLightweightProjectionEvent(event, context);

      store.setRealtimeCursor(context.ownerKey, event.epoch_version);
      writeRealtimeCursorCache(activeCache, context.ownerKey, event.epoch_version);
    },

    skipEvent(event, reason: WorkspaceRealtimeSkipReason, context) {
      if (!isActiveCurrentOwner(context, options)) return;

      if (reason === "unsupported_event") {
        log.warn("Skipped unsupported workspace realtime event", {
          ownerKey: context.ownerKey,
          epochVersion: skippedEpoch(event),
        });
      }

      useMessengerStore
        .getState()
        .markRealtimeEventSkipped(context.ownerKey, skippedEpoch(event), reason);
    },

    onTransportStateChange() {
      // The active apply path does not store diagnostics in messengerStore yet.
    },
  };
}

export function createMessengerRealtimeBackgroundApplier(
  options: MessengerRealtimeBackgroundApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      if (!isBackgroundCurrentOwner(context, options)) return;

      const store = useMessengerBackgroundProjectionStore.getState();
      if (isNonMessengerRealtimeEvent(event)) return;
      if (!isSupportedRealtimeEvent(event)) {
        store.recordSkippedEvent(context.ownerKey, event, "unsupported_event", context);
        return;
      }

      // Background projection хранит только легкие снимки, compact preview и route-данные.
      // Побочных эффектов нотификаций и записей в messengerStore тут по-прежнему нет.
      if (isBackgroundLightweightEvent(event)) {
        store.recordAppliedEvent(context.ownerKey, event, context);
        return;
      }

      store.recordSkippedEvent(context.ownerKey, event, "background_apply_deferred", context);
    },

    skipEvent(event, reason, context) {
      if (!isBackgroundCurrentOwner(context, options)) return;

      useMessengerBackgroundProjectionStore
        .getState()
        .recordSkippedEvent(context.ownerKey, event, reason, context);
    },

    onTransportStateChange(state, context) {
      if (context.surface !== "background") return;
      if (context.signal?.aborted === true) return;
      if (!(options.isOwnerCurrent?.(context.owner) ?? true)) return;

      useMessengerBackgroundProjectionStore.getState().recordTransportState(state);
    },
  };
}
