import { restoreWorkspaceComposerDraftsForStream } from "~/entities/composer-draft/composer-draft.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { invalidateWorkspaceFileResourceCache } from "~/shared/lib/workspace-file-loader.lib";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeContext,
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
import {
  messengerRealtimeActiveCache,
  messengerRealtimeBackgroundCache,
  restoreMessengerStreamCache,
} from "./messenger-cache.lib";
import {
  captureDeletedMessagePointerRepair,
  type DeletedMessagePointerRepairPlan,
} from "./messenger-deleted-message-pointer-repair.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import { resolveMessengerMessageLiveEffectPolicy } from "./messenger-live-effects.lib";
import { settleMessengerOutgoingMessage } from "./messenger-outbox.model";
import {
  advanceMessengerReadBoundary,
  applyMessengerReadBoundary,
  type MessengerReadBoundary,
} from "./messenger-read-boundary.lib";
import {
  applyMessengerRealtimeEventToCache,
  type MessengerRealtimeCacheWriter,
} from "./messenger-realtime-cache.lib";
import { removeMessengerStreamProjection } from "./messenger-stream-projection-cleanup.lib";
import { restoreMessengerStream, useMessengerStore } from "./messenger.model";
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
type MessengerMessagesRealtimeEvent = Extract<MessengerRealtimeEvent, { type: "messages" }>;
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
  writeCreatedMessages?: (
    ownerKey: string,
    messages: readonly MessengerMessage[],
    epochVersion: number | undefined,
    isWriteCurrent: () => boolean,
  ) => Promise<void> | void;
  advanceReadBoundary?: (boundary: MessengerReadBoundary) => Promise<void> | void;
  markCachedMessagesRead?: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
  ) => Promise<void> | void;
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
  onMessageDeleted?: (
    ownerKey: string,
    message: MessengerDeletedMessage,
    repairPlan: DeletedMessagePointerRepairPlan,
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
  removeProjection?: typeof removeMessengerStreamProjection;
  cache?: MessengerRealtimeBackgroundCacheWriter;
}

export type MessengerRealtimeBackgroundCacheWriter = Partial<MessengerRealtimeCacheWriter>;

const log = createLogger("realtime:workspace-messenger");
// Bound transactions even when a caller requests larger REST pages.
const MAX_CREATED_MESSAGES_PER_BATCH = 100;

function isActiveCurrentOwner(
  context: WorkspaceRealtimeRuntimeContext,
  options: MessengerRealtimeActiveApplierOptions,
): boolean {
  if (context.surface !== "active") return false;
  if (context.signal?.aborted === true) return false;
  const messageStoreOwnerKey = useWorkspaceMessageStore.getState().ownerKey;
  if (messageStoreOwnerKey != null && messageStoreOwnerKey !== context.ownerKey) return false;

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
    eventType === "messages" ||
    eventType === "stream" ||
    eventType === "stream_binding" ||
    eventType === "topic" ||
    eventType === "folder" ||
    eventType === "folder_item" ||
    eventType === "file"
  );
}

function isNonMessengerRealtimeEvent(event: WorkspaceRealtimeEvent): boolean {
  return (
    event.type === "user" ||
    event.type === "external_account" ||
    event.type === "external_chat" ||
    event.type === "external_operation"
  );
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

function writeRealtimeCacheBestEffort(write: () => Promise<void> | void): Promise<void> | void {
  try {
    const result = write();
    if (result instanceof Promise) {
      return result.catch(() => undefined);
    }
  } catch {
    // Cache write failures must not stop realtime event application.
  }
}

function settleRealtimeCacheWrites(
  writes: readonly (Promise<void> | void)[],
): Promise<void> | void {
  const pending = writes.filter((write): write is Promise<void> => write instanceof Promise);
  if (pending.length > 0) return Promise.all(pending).then(() => undefined);
}

function writeRealtimeMessagePageCache(
  cache: MessengerRealtimeActiveCacheWriter | undefined,
  ownerKey: string,
  message: MessengerMessage,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  const writeConversationMessagePage = cache?.writeConversationMessagePage;
  if (cache?.writeCreatedMessages != null) {
    return writeRealtimeCacheBestEffort(() =>
      cache.writeCreatedMessages?.(ownerKey, [message], undefined, isWriteCurrent),
    );
  }
  if (writeConversationMessagePage == null) return;
  return settleRealtimeCacheWrites(
    conversationIdsForRealtimeMessage(message).map((conversationId) =>
      writeRealtimeCacheBestEffort(() =>
        writeConversationMessagePage(ownerKey, conversationId, {
          messages: [message],
          source: "realtime",
        }),
      ),
    ),
  );
}

function writeRealtimeCursorCache(
  cache: MessengerRealtimeActiveCacheWriter | undefined,
  ownerKey: string,
  epochVersion: number,
): Promise<void> | void {
  if (cache?.writeRealtimeCursor == null) return;
  return writeRealtimeCacheBestEffort(() => cache.writeRealtimeCursor?.(ownerKey, epochVersion));
}

function deleteRealtimeCachedMessage(
  cache: MessengerRealtimeActiveCacheWriter,
  ownerKey: string,
  message: MessengerDeletedMessage,
): Promise<void> | void {
  if (cache.deleteCachedMessage == null) return;

  return writeRealtimeCacheBestEffort(() =>
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
  const removedMessages: MessengerDeletedMessage[] = [];
  for (const message of Object.values(messageStore.messagesById)) {
    if (message.streamUuid !== streamUuid || message.topicUuid !== topicUuid) continue;
    removedMessages.push({
      uuid: message.uuid,
      streamUuid: message.streamUuid,
      topicUuid: message.topicUuid,
    });
    messageStore.removeMessage(message.uuid);
  }
  return removedMessages;
}

function applyMessageRealtimeEvent(
  event: MessengerMessageRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  activeCache: MessengerRealtimeActiveCacheWriter,
  options: MessengerRealtimeActiveApplierOptions,
): Promise<void> | void {
  const store = useMessengerStore.getState();
  const messageStore = useWorkspaceMessageStore.getState();

  if (event.kind === "message.deleted") {
    const deletedMessage = {
      uuid: event.message.uuid,
      streamUuid: event.message.stream_uuid,
      topicUuid: event.message.topic_uuid,
    };
    const pointerRepairPlan = captureDeletedMessagePointerRepair(ownerKey, deletedMessage);
    messageStore.removeMessage(event.message.uuid);
    store.clearMessagePointer(ownerKey, deletedMessage);
    const cacheWrite = deleteRealtimeCachedMessage(activeCache, ownerKey, deletedMessage);
    void writeRealtimeCacheBestEffort(() =>
      options.onMessageDeleted?.(ownerKey, deletedMessage, pointerRepairPlan, context),
    );
    return cacheWrite;
  }

  const message = applyMessengerReadBoundary(adaptMessengerMessage(event.message), ownerKey);
  const stream = store.streamsById[message.streamUuid] ?? null;
  const previousMessage = messageStore.messagesById[message.uuid];
  if (event.kind === "message.read") {
    messageStore.applyLiveKnownBodyMutation(message);
    const boundary = advanceMessengerReadBoundary({
      ownerKey,
      streamUuid: message.streamUuid,
      topicUuid: message.topicUuid,
      createdAt: message.createdAt,
      messageUuid: message.uuid,
      epochVersion: event.epoch_version,
    });
    messageStore.markMessagesReadUpTo(message.uuid, {
      conversationIds: conversationIdsForRealtimeMessage(message),
    });
    const boundaryWrite = activeCache.advanceReadBoundary?.(boundary);
    let messageWrite: Promise<void> | void = undefined;
    if (previousMessage != null && activeCache.patchCachedMessage != null) {
      messageWrite = writeRealtimeCacheBestEffort(() =>
        activeCache.patchCachedMessage?.(ownerKey, { ...message, read: true }),
      );
    }
    return settleRealtimeCacheWrites([boundaryWrite, messageWrite]);
  }
  if (event.kind === "message.updated") {
    messageStore.applyLiveKnownBodyMutation(message);
    let cacheWrite: Promise<void> | void = undefined;
    if (previousMessage != null && activeCache.patchCachedMessage != null) {
      cacheWrite = writeRealtimeCacheBestEffort(() =>
        activeCache.patchCachedMessage?.(ownerKey, message),
      );
    }
    if (
      previousMessage != null &&
      !areReactionAggregatesEqual(previousMessage.reactions, message.reactions) &&
      options.onMessageReactionAggregateUpdated != null
    ) {
      void writeRealtimeCacheBestEffort(() =>
        options.onMessageReactionAggregateUpdated?.(ownerKey, message),
      );
    }
    return cacheWrite;
  }

  messageStore.applyLiveCreatedMessage(message);
  settleMessengerOutgoingMessage(ownerKey, message);
  store.applyMessagePointer(ownerKey, message);
  const cacheWrite = writeRealtimeMessagePageCache(activeCache, ownerKey, message, () =>
    isActiveCurrentOwner(context, options),
  );
  if (
    context.notificationsEnabled === true &&
    options.onMessageCreated != null &&
    resolveMessengerMessageLiveEffectPolicy(message).liveSideEffectsEligible
  ) {
    void writeRealtimeCacheBestEffort(() =>
      options.onMessageCreated?.(ownerKey, message, stream, context),
    );
  }
  return cacheWrite;
}

function applyMessagesRealtimeEvent(
  event: MessengerMessagesRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): Promise<void> | void {
  useWorkspaceMessageStore.getState().markMessagesRead(event.messageUuids);
  return activeCache.markCachedMessagesRead?.(ownerKey, event.messageUuids);
}

function applyStreamRealtimeEvent(
  event: MessengerStreamRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): Promise<void> | void {
  const store = useMessengerStore.getState();

  if (event.kind === "stream.deleted") {
    return removeMessengerStreamProjection({
      ownerKey,
      streamUuid: event.stream.uuid,
      removeActiveProjection: true,
      deleteCachedStream: activeCache.deleteCachedStream,
    }).catch(() => undefined);
  }

  if (event.kind === "stream.created") {
    restoreMessengerStream(ownerKey, event.stream.uuid);
    useWorkspaceMessageStore.getState().restoreMessagesForStream(event.stream.uuid);
    restoreMessengerStreamCache(ownerKey, event.stream.uuid);
    restoreWorkspaceComposerDraftsForStream(ownerKey, event.stream.uuid);
  }
  const stream = adaptMessengerStream(event.stream);
  const previousFoldersById = store.foldersById;
  store.upsertStream(ownerKey, stream);
  const writes: (Promise<void> | void)[] = [];
  if (activeCache.upsertCachedStream != null) {
    writes.push(
      writeRealtimeCacheBestEffort(() => activeCache.upsertCachedStream?.(ownerKey, stream)),
    );
  }
  if (activeCache.upsertCachedFolder != null) {
    const nextStore = useMessengerStore.getState();
    for (const folderUuid of nextStore.folderIds) {
      const folder = nextStore.foldersById[folderUuid];
      if (folder == null || folder === previousFoldersById[folderUuid]) continue;
      writes.push(
        writeRealtimeCacheBestEffort(() => activeCache.upsertCachedFolder?.(ownerKey, folder)),
      );
    }
  }
  return settleRealtimeCacheWrites(writes);
}

function applyStreamBindingRealtimeEvent(
  event: MessengerStreamBindingRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): Promise<void> | void {
  if (event.kind === "stream_binding.deleted") {
    useMessengerStore.getState().removeStreamBinding(ownerKey, {
      uuid: event.stream_binding.uuid,
      streamUuid: event.stream_binding.stream_uuid,
    });
    if (activeCache.deleteCachedStreamBinding != null) {
      return writeRealtimeCacheBestEffort(() =>
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
    return writeRealtimeCacheBestEffort(() =>
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
    void writeRealtimeCacheBestEffort(() => options.onFileChanged?.(ownerKey, event));
  }
}

function applyTopicRealtimeEvent(
  event: MessengerTopicRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): Promise<void> | void {
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
    const writes = deletedMessages.map((deletedMessage) =>
      deleteRealtimeCachedMessage(activeCache, ownerKey, deletedMessage),
    );
    if (activeCache.deleteCachedTopic != null) {
      writes.push(
        writeRealtimeCacheBestEffort(() =>
          activeCache.deleteCachedTopic?.(ownerKey, event.topic.uuid, event.topic.stream_uuid),
        ),
      );
    }
    return settleRealtimeCacheWrites(writes);
  }

  const topic = adaptMessengerTopic(event.topic);
  store.upsertTopic(ownerKey, topic);
  if (activeCache.upsertCachedTopic != null) {
    return writeRealtimeCacheBestEffort(() => activeCache.upsertCachedTopic?.(ownerKey, topic));
  }
}

function applyFolderRealtimeEvent(
  event: MessengerFolderRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): Promise<void> | void {
  const store = useMessengerStore.getState();

  if (event.kind === "folder.deleted") {
    store.removeFolder(ownerKey, { uuid: event.folder.uuid });
    if (activeCache.deleteCachedFolder != null) {
      return writeRealtimeCacheBestEffort(() =>
        activeCache.deleteCachedFolder?.(ownerKey, event.folder.uuid),
      );
    }
    return;
  }

  const folder = adaptMessengerFolder(event.folder);
  store.applyFolderSnapshot(ownerKey, folder);
  if (activeCache.upsertCachedFolder != null) {
    return writeRealtimeCacheBestEffort(() => activeCache.upsertCachedFolder?.(ownerKey, folder));
  }
}

function applyFolderItemRealtimeEvent(
  event: MessengerFolderItemRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
): Promise<void> | void {
  useMessengerStore
    .getState()
    .removeFolderItem(
      ownerKey,
      { uuid: event.folder_item.uuid },
      { preserveFolderUnreadCount: true },
    );
  if (activeCache.deleteCachedFolderItem != null) {
    return writeRealtimeCacheBestEffort(() =>
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
): Promise<void> | void {
  switch (event.type) {
    case "message":
      return applyMessageRealtimeEvent(event, ownerKey, context, activeCache, options);
    case "messages":
      return applyMessagesRealtimeEvent(event, ownerKey, activeCache);
    case "stream":
      return applyStreamRealtimeEvent(event, ownerKey, activeCache);
    case "stream_binding":
      return applyStreamBindingRealtimeEvent(event, ownerKey, activeCache);
    case "topic":
      return applyTopicRealtimeEvent(event, ownerKey, activeCache);
    case "folder":
      return applyFolderRealtimeEvent(event, ownerKey, activeCache);
    case "folder_item":
      return applyFolderItemRealtimeEvent(event, ownerKey, activeCache);
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

async function applyRealtimeEventBatch(
  applier: WorkspaceRealtimeEventApplier,
  events: readonly WorkspaceRealtimeEvent[],
  context: WorkspaceRealtimeEventContext,
  applyCreated: (
    events: readonly Exclude<MessengerMessageRealtimeEvent, { kind: "message.deleted" }>[],
    epochVersion: number,
  ) => Promise<void>,
  isCurrent: () => boolean,
): Promise<void> {
  let created: Exclude<MessengerMessageRealtimeEvent, { kind: "message.deleted" }>[] = [];
  const flush = async (): Promise<void> => {
    const last = created.at(-1);
    if (last == null || !isCurrent()) return;
    const batch = created;
    created = [];
    await applyCreated(batch, last.epoch_version);
  };
  for (const event of events) {
    if (!isCurrent()) return;
    if (event.type === "message" && event.kind === "message.created") {
      created.push(event);
      if (created.length >= MAX_CREATED_MESSAGES_PER_BATCH) await flush();
    } else {
      await flush();
      if (!isCurrent()) return;
      await applier.applyEvent(event, context);
    }
  }
  await flush();
}

export function createMessengerRealtimeActiveApplier(
  options: MessengerRealtimeActiveApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  const activeCache = options.cache ?? messengerRealtimeActiveCache;
  const applier: WorkspaceRealtimeEventApplier = {
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

      const finishApplication = (): Promise<void> | void => {
        if (!isActiveCurrentOwner(context, options)) return;
        applyLightweightProjectionEvent(event, context);
        store.setRealtimeCursor(context.ownerKey, event.epoch_version);
        return writeRealtimeCursorCache(activeCache, context.ownerKey, event.epoch_version);
      };
      const cacheWrite = applySupportedRealtimeEvent(
        event,
        context.ownerKey,
        context,
        activeCache,
        options,
      );
      if (cacheWrite instanceof Promise) {
        return cacheWrite.then(finishApplication);
      }
      return finishApplication();
    },

    async applyEvents(events, context) {
      const writeCreatedMessages = activeCache.writeCreatedMessages;
      const isCurrent = () => isActiveCurrentOwner(context, options);
      if (
        writeCreatedMessages == null ||
        context.source !== "catch_up" ||
        context.notificationsEnabled === true
      ) {
        for (const event of events) {
          if (!isActiveCurrentOwner(context, options)) return;
          await applier.applyEvent(event, context);
        }
        return;
      }
      await applyRealtimeEventBatch(
        applier,
        events,
        context,
        async (created, epochVersion) => {
          const messages = created.map((event) =>
            applyMessengerReadBoundary(adaptMessengerMessage(event.message), context.ownerKey),
          );
          useWorkspaceMessageStore.getState().applyLiveCreatedMessages(messages);
          useMessengerStore.getState().applyMessagePointers(context.ownerKey, messages);
          for (const message of messages) settleMessengerOutgoingMessage(context.ownerKey, message);
          await writeRealtimeCacheBestEffort(() =>
            writeCreatedMessages(context.ownerKey, messages, epochVersion, isCurrent),
          );
          if (!isActiveCurrentOwner(context, options)) return;
          for (const event of created) applyLightweightProjectionEvent(event, context);
          useMessengerStore.getState().setRealtimeCursor(context.ownerKey, epochVersion);
        },
        isCurrent,
      );
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

    onTransportStateChange(state, context) {
      if (!isActiveCurrentOwner(context, options)) return;

      if (
        state.mode === "starting" ||
        state.mode === "catching_up" ||
        state.mode === "connecting" ||
        state.mode === "auth_refreshing" ||
        state.mode === "disconnecting" ||
        state.mode === "stopped" ||
        (state.mode === "reconnecting" && state.reason !== "catch_up_failed")
      ) {
        useMessengerStore
          .getState()
          .setRealtimeInitialSyncReady(context.ownerKey, context.owner.runtimeGeneration, false);
        return;
      }

      if (state.mode === "connected" || state.mode === "failed") {
        // "connected" starts only after the socket has applied events up to its ready frame.
        // A failed catch-up stays fail-open during its backoff, then blocks again when retry starts.
        useMessengerStore
          .getState()
          .setRealtimeInitialSyncReady(context.ownerKey, context.owner.runtimeGeneration, true);
      }
    },
  };
  return applier;
}

export function createMessengerRealtimeBackgroundApplier(
  options: MessengerRealtimeBackgroundApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  const backgroundCache: MessengerRealtimeCacheWriter = {
    ...messengerRealtimeBackgroundCache,
    ...options.cache,
    writeCreatedMessages:
      options.cache == null
        ? messengerRealtimeBackgroundCache.writeCreatedMessages
        : options.cache.writeCreatedMessages,
  };
  const applier: WorkspaceRealtimeEventApplier = {
    async applyEvent(event, context) {
      if (!isBackgroundCurrentOwner(context, options)) return;

      const store = useMessengerBackgroundProjectionStore.getState();
      if (isNonMessengerRealtimeEvent(event)) return;
      if (!isSupportedRealtimeEvent(event)) {
        store.recordSkippedEvent(context.ownerKey, event, "unsupported_event", context);
        return;
      }

      if (event.type === "message" && event.kind === "message.read") {
        const message = adaptMessengerMessage(event.message);
        advanceMessengerReadBoundary({
          ownerKey: context.ownerKey,
          streamUuid: message.streamUuid,
          topicUuid: message.topicUuid,
          createdAt: message.createdAt,
          messageUuid: message.uuid,
          epochVersion: event.epoch_version,
        });
      }

      if (event.type === "stream" && event.kind === "stream.created") {
        restoreMessengerStream(context.ownerKey, event.stream.uuid);
        restoreMessengerStreamCache(context.ownerKey, event.stream.uuid);
        restoreWorkspaceComposerDraftsForStream(context.ownerKey, event.stream.uuid);
      }

      const cacheStatus = await applyMessengerRealtimeEventToCache({
        event,
        ownerKey: context.ownerKey,
        writer: backgroundCache,
        isWriteCurrent: () => isBackgroundCurrentOwner(context, options),
      });
      if (!isBackgroundCurrentOwner(context, options)) return;

      if (cacheStatus === "deferred") {
        if (event.type === "file") {
          store.recordSkippedEvent(context.ownerKey, event, "background_apply_deferred", context);
        }
        return;
      }

      if (event.type === "message" && event.kind === "message.created") {
        settleMessengerOutgoingMessage(context.ownerKey, adaptMessengerMessage(event.message));
      }

      if (event.type === "stream" && event.kind === "stream.deleted") {
        await (options.removeProjection ?? removeMessengerStreamProjection)({
          ownerKey: context.ownerKey,
          streamUuid: event.stream.uuid,
          removeActiveProjection: false,
          isOwnerCurrent: () => isBackgroundCurrentOwner(context, options),
          deleteCachedStream: () => undefined,
        });
        if (!isBackgroundCurrentOwner(context, options)) return;
      }

      // Background state keeps notification data without writing into active messenger stores.
      if (isBackgroundLightweightEvent(event)) {
        store.recordAppliedEvent(context.ownerKey, event, context);
      }
    },

    async applyEvents(events, context) {
      const writeCreatedMessages = backgroundCache.writeCreatedMessages;
      if (writeCreatedMessages == null) {
        for (const event of events) {
          if (!isBackgroundCurrentOwner(context, options)) return;
          await applier.applyEvent(event, context);
        }
        return;
      }
      await applyRealtimeEventBatch(
        applier,
        events,
        context,
        async (created, epochVersion) => {
          const messages = created.map((event) =>
            applyMessengerReadBoundary(adaptMessengerMessage(event.message), context.ownerKey),
          );
          await writeCreatedMessages(context.ownerKey, messages, epochVersion, () =>
            isBackgroundCurrentOwner(context, options),
          );
          if (!isBackgroundCurrentOwner(context, options)) return;
          for (const event of created) {
            settleMessengerOutgoingMessage(context.ownerKey, adaptMessengerMessage(event.message));
            useMessengerBackgroundProjectionStore
              .getState()
              .recordAppliedEvent(context.ownerKey, event, context);
          }
        },
        () => isBackgroundCurrentOwner(context, options),
      );
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
  return applier;
}
