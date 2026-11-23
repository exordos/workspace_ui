import { restoreWorkspaceComposerDraftsForStream } from "~/applications/messenger/model/drafts/composer-draft.model";
import { useWorkspaceMessageStore } from "~/applications/messenger/model/messages/message.model";
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
  adaptMessengerStream,
  adaptMessengerStreamBinding,
  adaptMessengerTopic,
} from "../../model/chats/messenger-catalog-adapters.lib";
import { preserveConfirmedStreamKeySharing } from "../../model/chats/messenger-stream-key-sharing.lib";
import { restoreMessengerStream, useMessengerStore } from "../../model/chats/messenger.model";
import { acceptMessageDeletion } from "../../model/messages/messages-accept-deletion.lib";
import {
  acceptMessageRead,
  type ConfirmedMessageReadCache,
} from "../../model/messages/messages-accept-read.lib";
import { acceptServerMessages } from "../../model/messages/messages-accept-server.lib";
import { acceptMessageUpdate } from "../../model/messages/messages-accept-update.lib";
import { adaptMessengerMessage } from "../../model/messages/messenger-message-adapter.lib";
import {
  advanceMessengerReadBoundary,
  applyMessengerReadBoundary,
} from "../../model/messages/messenger-read-boundary.lib";
import { settleMessengerOutgoingMessage } from "../../model/messages/outgoing/messenger-outbox.model";
import {
  messengerRealtimeActiveCache,
  messengerRealtimeBackgroundCache,
  restoreMessengerStreamCache,
  type MessengerMessageCacheDeletion,
} from "../../model/messenger-cache.lib";
import { conversationIdForStream, conversationIdForTopic } from "../../model/messenger-ids.lib";
import { useMessengerBackgroundProjectionStore } from "./messenger-background-projection.model";
import { resolveMessengerMessageLiveEffectPolicy } from "./messenger-live-effects.lib";
import {
  applyMessengerRealtimeEventToCache,
  type MessengerRealtimeCacheWriter,
} from "./messenger-realtime-cache.lib";
import { removeMessengerStreamProjection } from "./messenger-stream-projection-cleanup.lib";
import type { DeletedMessagePointerRepairPlan } from "../../model/chats/messenger-deleted-message-pointer-repair.lib";
import type {
  MessengerConversationId,
  MessengerDeletedMessage,
  MessengerFolder,
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUuid,
} from "../../model/messenger.types";

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

// Message events can advance the cursor without projecting a superseded body.
interface GuardedRealtimeApplication {
  cacheWrite: Promise<void> | void; // Optional authoritative message cache write.
  shouldProject: () => boolean; // Whether the event's body is still current.
  currentRead?: () => boolean | undefined; // Read flag of the latest accepted update.
  currentPollUpdatedAt?: () => string | undefined; // Timestamp of the latest poll metadata.
}

type ActiveRealtimeApplication = Promise<void> | void | false | GuardedRealtimeApplication;

export interface MessengerRealtimeCacheConversationPage {
  messages: readonly MessengerMessage[];
  source: "realtime";
}

export interface MessengerRealtimeActiveCacheWriter extends ConfirmedMessageReadCache {
  writeCreatedMessages?: (
    ownerKey: string,
    messages: readonly MessengerMessage[],
    epochVersion: number | undefined,
    isWriteCurrent: () => boolean,
  ) => Promise<void> | void;
  deleteCachedMessage?: MessengerMessageCacheDeletion;
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
  writeRealtimeCursor?: (
    ownerKey: string,
    epochVersion: number,
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
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
    isCurrent: () => boolean,
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

// Reentrant publications can reach a newer epoch before a read's cache writes complete.
function writeConfirmedReadCursor(
  cache: MessengerRealtimeActiveCacheWriter,
  ownerKey: string,
  epochVersion: number,
  isCurrent: () => boolean,
): Promise<void> | void {
  const canWrite = () =>
    isCurrent() && (useMessengerStore.getState().lastEpochVersion ?? 0) <= epochVersion;
  if (!canWrite()) return;
  return writeRealtimeCacheBestEffort(() =>
    cache.writeRealtimeCursor?.(ownerKey, epochVersion, canWrite),
  );
}

// Rechecks bodies at IndexedDB commit and retains unaffected messages in the same epoch.
async function writeCurrentCreatedBatch(
  ownerKey: string,
  epochVersion: number,
  currentMessages: () => readonly MessengerMessage[],
  isCurrent: () => boolean,
  writeCreatedMessages: NonNullable<MessengerRealtimeActiveCacheWriter["writeCreatedMessages"]>,
): Promise<void> {
  let remaining = currentMessages();
  while (isCurrent()) {
    const messages = remaining;
    const isWriteCurrent = () => {
      if (!isCurrent() || remaining !== messages) return false;
      const current = new Set(currentMessages());
      const filtered = messages.filter((message) => current.has(message));
      if (filtered.length === messages.length) return true;
      remaining = filtered;
      return false;
    };
    await writeRealtimeCacheBestEffort(() =>
      writeCreatedMessages(ownerKey, messages, epochVersion, isWriteCurrent),
    );
    // A discarded transaction must still write the epoch, even if no bodies remain.
    if (remaining === messages) return;
  }
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

// Realtime waits for cache cleanup but starts catalog repair independently of the cursor.
function applyMessageDeletedRealtimeEvent(
  event: Extract<MessengerMessageRealtimeEvent, { kind: "message.deleted" }>,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  activeCache: MessengerRealtimeActiveCacheWriter,
  options: MessengerRealtimeActiveApplierOptions,
): ActiveRealtimeApplication {
  const accepted = acceptMessageDeletion({
    ownerKey,
    reported: {
      uuid: event.message.uuid,
      streamUuid: event.message.stream_uuid,
      topicUuid: event.message.topic_uuid,
    },
    isCurrent: () => isActiveCurrentOwner(context, options),
    store: useWorkspaceMessageStore,
    deleteCache: activeCache.deleteCachedMessage,
  });
  if (accepted.status === "stale-owner") return false;
  for (const plan of accepted.plans) {
    if (!accepted.isCurrent()) return false;
    void writeRealtimeCacheBestEffort(() =>
      options.onMessageDeleted?.(ownerKey, plan.message, plan, context, accepted.isCurrent),
    );
  }
  return { cacheWrite: accepted.cacheWrite, shouldProject: accepted.isCurrent };
}

// Applies a message event and tracks active projection work for its cursor.
function applyMessageRealtimeEvent(
  event: MessengerMessageRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  activeCache: MessengerRealtimeActiveCacheWriter,
  options: MessengerRealtimeActiveApplierOptions,
): ActiveRealtimeApplication {
  if (event.kind === "message.deleted")
    return applyMessageDeletedRealtimeEvent(event, ownerKey, context, activeCache, options);

  if (event.kind === "message.read") {
    const accepted = acceptMessageRead({
      kind: "boundary",
      ownerKey,
      boundary: {
        streamUuid: event.message.stream_uuid,
        topicUuid: event.message.topic_uuid,
        createdAt: event.message.created_at,
        messageUuid: event.message.uuid,
        epochVersion: event.epoch_version,
      },
      store: useWorkspaceMessageStore,
      cache: activeCache,
      isCurrent: () => isActiveCurrentOwner(context, options),
    });
    return accepted.status === "stale-owner"
      ? false
      : { cacheWrite: accepted.cacheWrite, shouldProject: accepted.isCurrent };
  }

  const store = useMessengerStore.getState();
  const message = applyMessengerReadBoundary(adaptMessengerMessage(event.message), ownerKey);
  const stream = store.streamsById[message.streamUuid] ?? null;
  if (event.kind === "message.updated") {
    const accepted = acceptMessageUpdate({
      source: "realtime",
      ownerKey,
      isCurrent: () => isActiveCurrentOwner(context, options),
      message,
      store: useWorkspaceMessageStore,
      patchCache: activeCache.patchCachedMessage,
    });
    if (accepted.status === "stale-owner") return false;
    const { eventMessage, previous, shouldProject, cacheWrite, currentRead, currentPollUpdatedAt } =
      accepted;
    if (
      eventMessage != null &&
      previous != null &&
      shouldProject() &&
      !areReactionAggregatesEqual(previous.reactions, eventMessage.reactions) &&
      options.onMessageReactionAggregateUpdated != null
    ) {
      void writeRealtimeCacheBestEffort(() =>
        options.onMessageReactionAggregateUpdated?.(ownerKey, eventMessage),
      );
    }
    return { cacheWrite, shouldProject, currentRead, currentPollUpdatedAt };
  }

  const isCurrent = () => isActiveCurrentOwner(context, options);
  const accepted = acceptServerMessages({
    source: "realtime",
    ownerKey,
    isCurrent,
    mode: "single",
    messages: [message],
    updatePointers: ([currentMessage], messagesById) => {
      if (currentMessage != null) store.applyMessagePointer(ownerKey, currentMessage, messagesById);
    },
  });
  if (accepted.status === "stale-owner") return false;
  const shouldProject = () => isCurrent() && accepted.currentMessages().length > 0;
  if (!shouldProject()) return { cacheWrite: undefined, shouldProject };

  const cacheWrite = writeRealtimeMessagePageCache(activeCache, ownerKey, message, shouldProject);
  if (
    shouldProject() &&
    context.notificationsEnabled === true &&
    options.onMessageCreated != null &&
    resolveMessengerMessageLiveEffectPolicy(message).liveSideEffectsEligible
  ) {
    void writeRealtimeCacheBestEffort(() =>
      options.onMessageCreated?.(ownerKey, message, stream, context),
    );
  }
  return { cacheWrite, shouldProject };
}

// A batch confirms exact UUIDs and never opens a topic read boundary.
function applyMessagesRealtimeEvent(
  event: MessengerMessagesRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  activeCache: MessengerRealtimeActiveCacheWriter,
  options: MessengerRealtimeActiveApplierOptions,
): ActiveRealtimeApplication {
  const accepted = acceptMessageRead({
    kind: "exact",
    ownerKey,
    messageUuids: event.messageUuids,
    store: useWorkspaceMessageStore,
    cache: activeCache,
    isCurrent: () => isActiveCurrentOwner(context, options),
  });
  return accepted.status === "stale-owner"
    ? false
    : { cacheWrite: accepted.cacheWrite, shouldProject: accepted.isCurrent };
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
  const snapshot = adaptMessengerStream(event.stream);
  const stream =
    event.kind === "stream.created"
      ? snapshot
      : preserveConfirmedStreamKeySharing(snapshot, store.streamsById[snapshot.uuid]);
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
  invalidateWorkspaceFileResourceCache(ownerKey, event.file.uuid, {
    notify: event.kind !== "file.deleted",
  });
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

// Направляет событие в его доменный обработчик и передаёт результат для завершения.
function applySupportedRealtimeEvent(
  event: MessengerRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  activeCache: MessengerRealtimeActiveCacheWriter,
  options: MessengerRealtimeActiveApplierOptions,
): ActiveRealtimeApplication {
  switch (event.type) {
    case "message":
      return applyMessageRealtimeEvent(event, ownerKey, context, activeCache, options);
    case "messages":
      return applyMessagesRealtimeEvent(event, ownerKey, context, activeCache, options);
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

  const projection = useMessengerBackgroundProjectionStore.getState();
  if (event.kind === "message.read") {
    const state = useWorkspaceMessageStore.getState();
    const uuid = event.message.uuid;
    const anchor = state.deletedMessageRevisionById[uuid] == null ? state.messagesById[uuid] : null;
    projection.recordAppliedEvent(context.ownerKey, event, context, anchor);
  } else {
    projection.recordAppliedEvent(context.ownerKey, event, context);
  }
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

      const applied = applySupportedRealtimeEvent(
        event,
        context.ownerKey,
        context,
        activeCache,
        options,
      );
      if (applied === false) return;
      const guarded = applied instanceof Promise ? undefined : applied;
      const isConfirmedRead = event.kind === "message.read" || event.kind === "messages.read";
      const isProjectionCurrent = () =>
        isActiveCurrentOwner(context, options) &&
        (!isConfirmedRead || guarded?.shouldProject() !== false);
      const finishApplication = (): Promise<void> | void => {
        if (!isProjectionCurrent()) return;
        const isMessageUpdate = event.type === "message" && event.kind === "message.updated";
        if (guarded?.shouldProject() !== false) {
          if (isMessageUpdate) {
            const read = guarded?.currentRead?.() ?? event.message.read;
            const updatedAt = guarded?.currentPollUpdatedAt?.() ?? event.message.updated_at;
            const projected =
              read === event.message.read && updatedAt === event.message.updated_at
                ? event
                : { ...event, message: { ...event.message, read, updated_at: updatedAt } };
            applyLightweightProjectionEvent(projected, context);
          } else {
            applyLightweightProjectionEvent(event, context);
          }
        }
        if (guarded != null && !isProjectionCurrent()) return;
        store.setRealtimeCursor(context.ownerKey, event.epoch_version);
        if (guarded != null && !isProjectionCurrent()) return;
        if (isConfirmedRead)
          return writeConfirmedReadCursor(
            activeCache,
            context.ownerKey,
            event.epoch_version,
            isProjectionCurrent,
          );
        if (isMessageUpdate || (event.type === "message" && event.kind === "message.deleted")) {
          const latestEpoch = useMessengerStore.getState().lastEpochVersion;
          if (latestEpoch != null && latestEpoch > event.epoch_version) return;
        }
        return writeRealtimeCursorCache(activeCache, context.ownerKey, event.epoch_version);
      };
      const cacheWrite = applied instanceof Promise ? applied : guarded?.cacheWrite;
      return cacheWrite instanceof Promise
        ? cacheWrite.then(finishApplication)
        : finishApplication();
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
          const accepted = acceptServerMessages({
            source: "realtime",
            ownerKey: context.ownerKey,
            isCurrent,
            mode: "batch",
            messages,
            updatePointers: (messages, messagesById) =>
              useMessengerStore
                .getState()
                .applyMessagePointers(context.ownerKey, messages, messagesById),
          });
          if (accepted.status === "stale-owner") return;

          await writeCurrentCreatedBatch(
            context.ownerKey,
            epochVersion,
            accepted.currentMessages,
            isCurrent,
            writeCreatedMessages,
          );
          if (!isActiveCurrentOwner(context, options)) return;
          const currentMessages = new Set(accepted.currentMessages());
          for (const [index, event] of created.entries()) {
            const message = messages[index];
            if (message == null || !currentMessages.has(message)) continue;
            applyLightweightProjectionEvent(event, context);
            if (!isCurrent()) return;
          }
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
