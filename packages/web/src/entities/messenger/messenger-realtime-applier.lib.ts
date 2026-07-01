import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
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

function isSupportedRealtimeEvent(event: WorkspaceRealtimeEvent): boolean {
  const eventType = (event as { type?: unknown }).type;
  return (
    eventType === "message" ||
    eventType === "stream" ||
    eventType === "stream_binding" ||
    eventType === "topic" ||
    eventType === "folder" ||
    eventType === "folder_item"
  );
}

function isBackgroundLightweightEvent(event: WorkspaceRealtimeEvent): boolean {
  // stream_binding is not stored in background yet: it contains membership data, not a lightweight id/counter snapshot.
  return event.type !== "stream_binding";
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

export function createMessengerRealtimeActiveApplier(
  options: MessengerRealtimeActiveApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  const activeCache = options.cache ?? messengerRealtimeActiveCache;
  return {
    applyEvent(event, context) {
      if (!isActiveCurrentOwner(context, options)) return;

      const store = useMessengerStore.getState();
      const messageStore = useWorkspaceMessageStore.getState();
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

      switch (event.type) {
        case "message": {
          if (event.kind === "message.deleted") {
            const deletedMessage = {
              uuid: event.message.uuid,
              streamUuid: event.message.stream_uuid,
              topicUuid: event.message.topic_uuid,
            };
            messageStore.removeMessage(event.message.uuid);
            store.clearMessagePointer(context.ownerKey, {
              uuid: event.message.uuid,
              streamUuid: event.message.stream_uuid,
              topicUuid: event.message.topic_uuid,
            });
            if (activeCache.deleteCachedMessage != null) {
              writeRealtimeCacheBestEffort(() =>
                activeCache.deleteCachedMessage?.(
                  context.ownerKey,
                  deletedMessage.uuid,
                  conversationIdsForDeletedRealtimeMessage(deletedMessage),
                ),
              );
            }
            break;
          }

          {
            const message = adaptMessengerMessage(event.message);
            messageStore.upsertMessage(message);
            store.applyMessagePointer(context.ownerKey, message);
            if (event.kind === "message.updated") {
              if (activeCache.patchCachedMessage != null) {
                writeRealtimeCacheBestEffort(() =>
                  activeCache.patchCachedMessage?.(context.ownerKey, message),
                );
              }
            } else {
              writeRealtimeMessagePageCache(activeCache, context.ownerKey, message);
            }
          }
          break;
        }
        case "stream": {
          if (event.kind === "stream.deleted") {
            store.removeStream(context.ownerKey, { uuid: event.stream.uuid });
            if (activeCache.deleteCachedStream != null) {
              writeRealtimeCacheBestEffort(() =>
                activeCache.deleteCachedStream?.(context.ownerKey, event.stream.uuid),
              );
            }
            break;
          }

          {
            const stream = adaptMessengerStream(event.stream);
            store.upsertStream(context.ownerKey, stream);
            if (activeCache.upsertCachedStream != null) {
              writeRealtimeCacheBestEffort(() =>
                activeCache.upsertCachedStream?.(context.ownerKey, stream),
              );
            }
          }
          break;
        }
        case "stream_binding": {
          const streamBindings = event.stream_bindings.map(adaptMessengerStreamBinding);
          store.upsertStreamBindings(context.ownerKey, streamBindings);
          if (activeCache.upsertCachedStreamBindings != null) {
            writeRealtimeCacheBestEffort(() =>
              activeCache.upsertCachedStreamBindings?.(context.ownerKey, streamBindings),
            );
          }
          break;
        }
        case "topic": {
          if (event.kind === "topic.deleted") {
            const deletedMessages = removeTopicMessagesFromWorkspaceStore(
              event.topic.stream_uuid,
              event.topic.uuid,
            );
            store.removeTopic(context.ownerKey, {
              uuid: event.topic.uuid,
              streamUuid: event.topic.stream_uuid,
            });
            for (const deletedMessage of deletedMessages) {
              if (activeCache.deleteCachedMessage != null) {
                writeRealtimeCacheBestEffort(() =>
                  activeCache.deleteCachedMessage?.(
                    context.ownerKey,
                    deletedMessage.uuid,
                    conversationIdsForDeletedRealtimeMessage(deletedMessage),
                  ),
                );
              }
            }
            if (activeCache.deleteCachedTopic != null) {
              writeRealtimeCacheBestEffort(() =>
                activeCache.deleteCachedTopic?.(
                  context.ownerKey,
                  event.topic.uuid,
                  event.topic.stream_uuid,
                ),
              );
            }
            break;
          }

          {
            const topic = adaptMessengerTopic(event.topic);
            store.upsertTopic(context.ownerKey, topic);
            if (activeCache.upsertCachedTopic != null) {
              writeRealtimeCacheBestEffort(() =>
                activeCache.upsertCachedTopic?.(context.ownerKey, topic),
              );
            }
          }
          break;
        }
        case "folder": {
          if (event.kind === "folder.deleted") {
            store.removeFolder(context.ownerKey, { uuid: event.folder.uuid });
            if (activeCache.deleteCachedFolder != null) {
              writeRealtimeCacheBestEffort(() =>
                activeCache.deleteCachedFolder?.(context.ownerKey, event.folder.uuid),
              );
            }
            break;
          }

          {
            const folder = adaptMessengerFolder(event.folder);
            store.applyFolderSnapshot(context.ownerKey, folder);
            if (activeCache.upsertCachedFolder != null) {
              writeRealtimeCacheBestEffort(() =>
                activeCache.upsertCachedFolder?.(context.ownerKey, folder),
              );
            }
          }
          break;
        }
        case "folder_item":
          store.removeFolderItem(
            context.ownerKey,
            { uuid: event.folder_item.uuid },
            { preserveFolderUnreadCount: true },
          );
          if (activeCache.deleteCachedFolderItem != null) {
            writeRealtimeCacheBestEffort(() =>
              activeCache.deleteCachedFolderItem?.(context.ownerKey, event.folder_item.uuid),
            );
          }
          break;
      }

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
      if (!isSupportedRealtimeEvent(event)) {
        store.recordSkippedEvent(context.ownerKey, event, "unsupported_event", context);
        return;
      }

      // Background projection stores only lightweight id snapshots and counters.
      // It has no notification side effects or messengerStore writes, so background does not become a second active path.
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
