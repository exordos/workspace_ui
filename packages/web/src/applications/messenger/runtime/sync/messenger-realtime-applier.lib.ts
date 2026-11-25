import { restoreWorkspaceComposerDraftsForStream } from "~/applications/messenger/model/drafts/composer-draft.model";
import { getWorkspaceMessageStoreForOwner } from "~/applications/messenger/model/messages/message.model";
import { WorkspaceRealtimeParticipantNotReadyError } from "~/platform/realtime/workspace-realtime-applier.lib";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeContext,
  WorkspaceRealtimeRuntimeOwner,
  WorkspaceRealtimeSkipReason,
  WorkspaceRealtimeSkippedEvent,
} from "~/platform/realtime/workspace-realtime-runtime.lib";
import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { invalidateWorkspaceFileResourceCache } from "~/shared/lib/workspace-file-loader.lib";
import {
  adaptMessengerFolder,
  adaptMessengerStream,
  adaptMessengerStreamBinding,
  adaptMessengerTopic,
} from "../../model/chats/messenger-catalog-adapters.lib";
import { preserveConfirmedStreamKeySharing } from "../../model/chats/messenger-stream-key-sharing.lib";
import {
  getMessengerStoreForOwner,
  restoreMessengerStream,
} from "../../model/chats/messenger.model";
import { acceptMessageDeletion } from "../../model/messages/messages-accept-deletion.lib";
import {
  acceptMessageRead,
  type ConfirmedMessageReadCache,
} from "../../model/messages/messages-accept-read.lib";
import { acceptServerMessages } from "../../model/messages/messages-accept-server.lib";
import { acceptMessageUpdate } from "../../model/messages/messages-accept-update.lib";
import { adaptMessengerMessage } from "../../model/messages/messenger-message-adapter.lib";
import { applyMessengerReadBoundary } from "../../model/messages/messenger-read-boundary.lib";
import {
  messengerRealtimeCache,
  restoreMessengerStreamCache,
  type MessengerMessageCacheDeletion,
} from "../../model/messenger-cache.lib";
import { conversationIdForStream, conversationIdForTopic } from "../../model/messenger-ids.lib";
import { useMessengerBackgroundProjectionStore } from "./messenger-background-projection.model";
import { resolveMessengerMessageLiveEffectPolicy } from "./messenger-live-effects.lib";
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

type RealtimeApplication = Promise<void> | void | false | GuardedRealtimeApplication;

export interface MessengerRealtimeCacheConversationPage {
  messages: readonly MessengerMessage[];
  source: "realtime";
}

export interface MessengerRealtimeCacheWriter extends ConfirmedMessageReadCache {
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
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  upsertCachedStream?: (
    ownerKey: string,
    stream: MessengerStream,
    options?: { shouldApply?: () => boolean },
  ) => Promise<void> | void;
  deleteCachedStream?: (
    ownerKey: string,
    streamUuid: MessengerUuid,
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  upsertCachedStreamBindings?: (
    ownerKey: string,
    streamBindings: readonly MessengerStreamBinding[],
    options?: { shouldApply?: () => boolean },
  ) => Promise<void> | void;
  deleteCachedStreamBinding?: (
    ownerKey: string,
    streamBindingUuid: MessengerUuid,
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  upsertCachedTopic?: (
    ownerKey: string,
    topic: MessengerTopic,
    options?: { shouldApply?: () => boolean },
  ) => Promise<void> | void;
  deleteCachedTopic?: (
    ownerKey: string,
    topicUuid: MessengerUuid,
    streamUuid: MessengerUuid,
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  upsertCachedFolder?: (
    ownerKey: string,
    folder: MessengerFolder,
    options?: { shouldApply?: () => boolean },
  ) => Promise<void> | void;
  deleteCachedFolder?: (
    ownerKey: string,
    folderUuid: MessengerUuid,
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  deleteCachedFolderItem?: (
    ownerKey: string,
    folderItemUuid: MessengerUuid,
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  writeRealtimeCursor?: (
    ownerKey: string,
    epochVersion: number,
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
}

export interface MessengerRealtimeApplierOptions {
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  getModel?: (ownerKey: string) => MessengerRealtimeOwnerModel | null;
  requireOwnerCatalog?: boolean; // Reject Messenger mutations until this owner has its mandatory catalog.
  cache?: MessengerRealtimeCacheWriter;
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
    context: WorkspaceRealtimeEventContext,
  ) => void | Promise<void>;
  onFileChanged?: (ownerKey: string, event: MessengerFileRealtimeEvent) => void | Promise<void>;
}

// Each application call retains the two stores of one authorized incarnation.
interface MessengerRealtimeOwnerModel {
  catalog: NonNullable<ReturnType<typeof getMessengerStoreForOwner>>;
  messages: NonNullable<ReturnType<typeof getWorkspaceMessageStoreForOwner>>;
}

const log = createLogger("realtime:workspace-messenger");
// Bound transactions even when a caller requests larger REST pages.
const MAX_CREATED_MESSAGES_PER_BATCH = 100;

function readOwnerModel(ownerKey: string): MessengerRealtimeOwnerModel | null {
  const catalog = getMessengerStoreForOwner(ownerKey);
  const messages = getWorkspaceMessageStoreForOwner(ownerKey);
  return catalog == null || messages == null ? null : { catalog, messages };
}

function isOwnerContextCurrent(
  context: WorkspaceRealtimeRuntimeContext,
  options: MessengerRealtimeApplierOptions,
): boolean {
  // The key does not include credentials or incarnation. Both are fenced by the runtime.
  return context.signal?.aborted !== true && (options.isOwnerCurrent?.(context.owner) ?? true);
}

function isOwnerModelCurrent(
  context: WorkspaceRealtimeRuntimeContext,
  options: MessengerRealtimeApplierOptions,
  model: MessengerRealtimeOwnerModel,
): boolean {
  if (!isOwnerContextCurrent(context, options)) return false;
  const messageOwnerKey = model.messages.getState().ownerKey;
  return messageOwnerKey == null || messageOwnerKey === context.ownerKey;
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

function isNotificationProjectionEvent(event: WorkspaceRealtimeEvent): boolean {
  // Bindings and protected file resources have no role in the notification projection.
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
  cache: MessengerRealtimeCacheWriter | undefined,
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
        writeConversationMessagePage(
          ownerKey,
          conversationId,
          {
            messages: [message],
            source: "realtime",
          },
          isWriteCurrent,
        ),
      ),
    ),
  );
}

function writeRealtimeCursorCache(
  cache: MessengerRealtimeCacheWriter | undefined,
  ownerKey: string,
  epochVersion: number,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  if (cache?.writeRealtimeCursor == null) return;
  return writeRealtimeCacheBestEffort(() =>
    cache.writeRealtimeCursor?.(ownerKey, epochVersion, isWriteCurrent),
  );
}

// Reentrant publications can reach a newer epoch before a read's cache writes complete.
function writeConfirmedReadCursor(
  model: MessengerRealtimeOwnerModel,
  cache: MessengerRealtimeCacheWriter,
  ownerKey: string,
  epochVersion: number,
  isCurrent: () => boolean,
): Promise<void> | void {
  const canWrite = () =>
    isCurrent() && (model.catalog.getState().lastEpochVersion ?? 0) <= epochVersion;
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
  writeCreatedMessages: NonNullable<MessengerRealtimeCacheWriter["writeCreatedMessages"]>,
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
  cache: MessengerRealtimeCacheWriter,
  ownerKey: string,
  message: MessengerDeletedMessage,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  if (cache.deleteCachedMessage == null) return;

  return writeRealtimeCacheBestEffort(() =>
    cache.deleteCachedMessage?.(
      ownerKey,
      message.uuid,
      conversationIdsForDeletedRealtimeMessage(message),
      { allMemberships: false, isWriteCurrent },
    ),
  );
}

function removeTopicMessagesFromWorkspaceStore(
  messages: MessengerRealtimeOwnerModel["messages"],
  streamUuid: string,
  topicUuid: string,
): MessengerDeletedMessage[] {
  const messageStore = messages.getState();
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
  model: MessengerRealtimeOwnerModel,
  event: Extract<MessengerMessageRealtimeEvent, { kind: "message.deleted" }>,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  cache: MessengerRealtimeCacheWriter,
  options: MessengerRealtimeApplierOptions,
): RealtimeApplication {
  const accepted = acceptMessageDeletion({
    ownerKey,
    reported: {
      uuid: event.message.uuid,
      streamUuid: event.message.stream_uuid,
      topicUuid: event.message.topic_uuid,
    },
    isCurrent: () => isOwnerModelCurrent(context, options, model),
    store: model.messages,
    deleteCache: cache.deleteCachedMessage,
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
  model: MessengerRealtimeOwnerModel,
  event: MessengerMessageRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  cache: MessengerRealtimeCacheWriter,
  options: MessengerRealtimeApplierOptions,
): RealtimeApplication {
  if (event.kind === "message.deleted")
    return applyMessageDeletedRealtimeEvent(model, event, ownerKey, context, cache, options);

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
      store: model.messages,
      cache: cache,
      isCurrent: () => isOwnerModelCurrent(context, options, model),
    });
    return accepted.status === "stale-owner"
      ? false
      : { cacheWrite: accepted.cacheWrite, shouldProject: accepted.isCurrent };
  }

  const store = model.catalog.getState();
  const message = applyMessengerReadBoundary(adaptMessengerMessage(event.message), ownerKey);
  const stream = store.streamsById[message.streamUuid] ?? null;
  if (event.kind === "message.updated") {
    const accepted = acceptMessageUpdate({
      source: "realtime",
      ownerKey,
      isCurrent: () => isOwnerModelCurrent(context, options, model),
      message,
      store: model.messages,
      patchCache: cache.patchCachedMessage,
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
        options.onMessageReactionAggregateUpdated?.(ownerKey, eventMessage, context),
      );
    }
    return { cacheWrite, shouldProject, currentRead, currentPollUpdatedAt };
  }

  const isCurrent = () => isOwnerModelCurrent(context, options, model);
  const accepted = acceptServerMessages({
    source: "realtime",
    ownerKey,
    isCurrent,
    mode: "single",
    messages: [message],
    store: model.messages,
    updatePointers: ([currentMessage], messagesById) => {
      if (currentMessage != null) store.applyMessagePointer(ownerKey, currentMessage, messagesById);
    },
  });
  if (accepted.status === "stale-owner") return false;
  const shouldProject = () => isCurrent() && accepted.currentMessages().length > 0;
  if (!shouldProject()) return { cacheWrite: undefined, shouldProject };

  const cacheWrite = writeRealtimeMessagePageCache(cache, ownerKey, message, shouldProject);
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
  model: MessengerRealtimeOwnerModel,
  event: MessengerMessagesRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  cache: MessengerRealtimeCacheWriter,
  options: MessengerRealtimeApplierOptions,
): RealtimeApplication {
  const accepted = acceptMessageRead({
    kind: "exact",
    ownerKey,
    messageUuids: event.messageUuids,
    store: model.messages,
    cache: cache,
    isCurrent: () => isOwnerModelCurrent(context, options, model),
  });
  return accepted.status === "stale-owner"
    ? false
    : { cacheWrite: accepted.cacheWrite, shouldProject: accepted.isCurrent };
}

function applyStreamRealtimeEvent(
  model: MessengerRealtimeOwnerModel,
  event: MessengerStreamRealtimeEvent,
  ownerKey: string,
  cache: MessengerRealtimeCacheWriter,
  isCurrent: () => boolean,
): Promise<void> | void {
  const store = model.catalog.getState();

  if (event.kind === "stream.deleted") {
    return removeMessengerStreamProjection({
      ownerKey,
      streamUuid: event.stream.uuid,
      deleteCachedStream: cache.deleteCachedStream,
      isOwnerCurrent: isCurrent,
    }).catch(() => undefined);
  }

  if (event.kind === "stream.created") {
    restoreMessengerStream(ownerKey, event.stream.uuid);
    model.messages.getState().restoreMessagesForStream(event.stream.uuid);
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
  if (cache.upsertCachedStream != null) {
    writes.push(
      writeRealtimeCacheBestEffort(() =>
        cache.upsertCachedStream?.(ownerKey, stream, { shouldApply: isCurrent }),
      ),
    );
  }
  if (cache.upsertCachedFolder != null) {
    const nextStore = model.catalog.getState();
    for (const folderUuid of nextStore.folderIds) {
      const folder = nextStore.foldersById[folderUuid];
      if (folder == null || folder === previousFoldersById[folderUuid]) continue;
      writes.push(
        writeRealtimeCacheBestEffort(() =>
          cache.upsertCachedFolder?.(ownerKey, folder, { shouldApply: isCurrent }),
        ),
      );
    }
  }
  return settleRealtimeCacheWrites(writes);
}

function applyStreamBindingRealtimeEvent(
  model: MessengerRealtimeOwnerModel,
  event: MessengerStreamBindingRealtimeEvent,
  ownerKey: string,
  cache: MessengerRealtimeCacheWriter,
  isCurrent: () => boolean,
): Promise<void> | void {
  if (event.kind === "stream_binding.deleted") {
    model.catalog.getState().removeStreamBinding(ownerKey, {
      uuid: event.stream_binding.uuid,
      streamUuid: event.stream_binding.stream_uuid,
    });
    if (cache.deleteCachedStreamBinding != null) {
      return writeRealtimeCacheBestEffort(() =>
        cache.deleteCachedStreamBinding?.(ownerKey, event.stream_binding.uuid, isCurrent),
      );
    }
    return;
  }

  const bindings =
    event.kind === "stream_binding.updated"
      ? [adaptMessengerStreamBinding(event.stream_binding)]
      : event.stream_bindings.map(adaptMessengerStreamBinding);
  model.catalog.getState().upsertStreamBindings(ownerKey, bindings);
  if (cache.upsertCachedStreamBindings != null) {
    return writeRealtimeCacheBestEffort(() =>
      cache.upsertCachedStreamBindings?.(ownerKey, bindings, { shouldApply: isCurrent }),
    );
  }
}

function applyFileRealtimeEvent(
  event: MessengerFileRealtimeEvent,
  ownerKey: string,
  options: MessengerRealtimeApplierOptions,
): void {
  invalidateWorkspaceFileResourceCache(ownerKey, event.file.uuid, {
    notify: event.kind !== "file.deleted",
  });
  if (options.onFileChanged != null) {
    void writeRealtimeCacheBestEffort(() => options.onFileChanged?.(ownerKey, event));
  }
}

function applyTopicRealtimeEvent(
  model: MessengerRealtimeOwnerModel,
  event: MessengerTopicRealtimeEvent,
  ownerKey: string,
  cache: MessengerRealtimeCacheWriter,
  isCurrent: () => boolean,
): Promise<void> | void {
  const store = model.catalog.getState();

  if (event.kind === "topic.deleted") {
    const deletedMessages = removeTopicMessagesFromWorkspaceStore(
      model.messages,
      event.topic.stream_uuid,
      event.topic.uuid,
    );
    store.removeTopic(ownerKey, {
      uuid: event.topic.uuid,
      streamUuid: event.topic.stream_uuid,
    });
    const writes = deletedMessages.map((deletedMessage) =>
      deleteRealtimeCachedMessage(cache, ownerKey, deletedMessage, isCurrent),
    );
    if (cache.deleteCachedTopic != null) {
      writes.push(
        writeRealtimeCacheBestEffort(() =>
          cache.deleteCachedTopic?.(ownerKey, event.topic.uuid, event.topic.stream_uuid, isCurrent),
        ),
      );
    }
    return settleRealtimeCacheWrites(writes);
  }

  const topic = adaptMessengerTopic(event.topic);
  store.upsertTopic(ownerKey, topic);
  if (cache.upsertCachedTopic != null) {
    return writeRealtimeCacheBestEffort(() =>
      cache.upsertCachedTopic?.(ownerKey, topic, { shouldApply: isCurrent }),
    );
  }
}

function applyFolderRealtimeEvent(
  model: MessengerRealtimeOwnerModel,
  event: MessengerFolderRealtimeEvent,
  ownerKey: string,
  cache: MessengerRealtimeCacheWriter,
  isCurrent: () => boolean,
): Promise<void> | void {
  const store = model.catalog.getState();

  if (event.kind === "folder.deleted") {
    store.removeFolder(ownerKey, { uuid: event.folder.uuid });
    if (cache.deleteCachedFolder != null) {
      return writeRealtimeCacheBestEffort(() =>
        cache.deleteCachedFolder?.(ownerKey, event.folder.uuid, isCurrent),
      );
    }
    return;
  }

  const folder = adaptMessengerFolder(event.folder);
  store.applyFolderSnapshot(ownerKey, folder);
  if (cache.upsertCachedFolder != null) {
    return writeRealtimeCacheBestEffort(() =>
      cache.upsertCachedFolder?.(ownerKey, folder, { shouldApply: isCurrent }),
    );
  }
}

function applyFolderItemRealtimeEvent(
  model: MessengerRealtimeOwnerModel,
  event: MessengerFolderItemRealtimeEvent,
  ownerKey: string,
  cache: MessengerRealtimeCacheWriter,
  isCurrent: () => boolean,
): Promise<void> | void {
  model.catalog
    .getState()
    .removeFolderItem(
      ownerKey,
      { uuid: event.folder_item.uuid },
      { preserveFolderUnreadCount: true },
    );
  if (cache.deleteCachedFolderItem != null) {
    return writeRealtimeCacheBestEffort(() =>
      cache.deleteCachedFolderItem?.(ownerKey, event.folder_item.uuid, isCurrent),
    );
  }
}

// Направляет событие в его доменный обработчик и передаёт результат для завершения.
function applySupportedRealtimeEvent(
  model: MessengerRealtimeOwnerModel,
  event: MessengerRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  cache: MessengerRealtimeCacheWriter,
  options: MessengerRealtimeApplierOptions,
): RealtimeApplication {
  const isCurrent = () => isOwnerModelCurrent(context, options, model);
  switch (event.type) {
    case "message":
      return applyMessageRealtimeEvent(model, event, ownerKey, context, cache, options);
    case "messages":
      return applyMessagesRealtimeEvent(model, event, ownerKey, context, cache, options);
    case "stream":
      return applyStreamRealtimeEvent(model, event, ownerKey, cache, isCurrent);
    case "stream_binding":
      return applyStreamBindingRealtimeEvent(model, event, ownerKey, cache, isCurrent);
    case "topic":
      return applyTopicRealtimeEvent(model, event, ownerKey, cache, isCurrent);
    case "folder":
      return applyFolderRealtimeEvent(model, event, ownerKey, cache, isCurrent);
    case "folder_item":
      return applyFolderItemRealtimeEvent(model, event, ownerKey, cache, isCurrent);
    case "file":
      applyFileRealtimeEvent(event, ownerKey, options);
      break;
  }
}

function applyLightweightProjectionEvent(
  model: MessengerRealtimeOwnerModel,
  event: MessengerRealtimeEvent,
  context: WorkspaceRealtimeEventContext,
): void {
  if (!isNotificationProjectionEvent(event)) {
    return;
  }

  const projection = useMessengerBackgroundProjectionStore.getState();
  if (event.kind === "message.read") {
    const state = model.messages.getState();
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

export function createMessengerRealtimeApplier(
  options: MessengerRealtimeApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  const cache = options.cache ?? messengerRealtimeCache;
  const getModel = options.getModel ?? readOwnerModel;
  const requireOwnerCatalog = options.requireOwnerCatalog ?? true;
  const applier: WorkspaceRealtimeEventApplier = {
    applyEvent(event, context) {
      const { ownerKey } = context;
      if (isNonMessengerRealtimeEvent(event) || !isOwnerContextCurrent(context, options)) return;

      const model = getModel(ownerKey);
      const store = model?.catalog.getState();
      if (
        requireOwnerCatalog &&
        isSupportedRealtimeEvent(event) &&
        event.type !== "file" &&
        (store?.ownerKey !== ownerKey ||
          store.lastLoadedAt == null ||
          model?.messages.getState().ownerKey !== ownerKey)
      ) {
        throw new WorkspaceRealtimeParticipantNotReadyError("messenger");
      }
      if (model == null || store == null || !isOwnerModelCurrent(context, options, model)) return;
      if (!isSupportedRealtimeEvent(event)) {
        log.warn("Skipped unsupported workspace realtime event", {
          ownerKey: context.ownerKey,
          kind: eventKind(event),
          epochVersion: event.epoch_version,
        });
        // The catalog tracks skips for its owner. Transport commits the durable cursor.
        store.markRealtimeEventSkipped(context.ownerKey, event.epoch_version, "unsupported_event");
        return;
      }

      const applied = applySupportedRealtimeEvent(
        model,
        event,
        context.ownerKey,
        context,
        cache,
        options,
      );
      if (applied === false) return;
      const guarded = applied instanceof Promise ? undefined : applied;
      const isConfirmedRead = event.kind === "message.read" || event.kind === "messages.read";
      const isProjectionCurrent = () =>
        isOwnerModelCurrent(context, options, model) &&
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
            applyLightweightProjectionEvent(model, projected, context);
          } else {
            applyLightweightProjectionEvent(model, event, context);
          }
        }
        if (guarded != null && !isProjectionCurrent()) return;
        store.setRealtimeCursor(context.ownerKey, event.epoch_version);
        if (guarded != null && !isProjectionCurrent()) return;
        if (isConfirmedRead)
          return writeConfirmedReadCursor(
            model,
            cache,
            context.ownerKey,
            event.epoch_version,
            isProjectionCurrent,
          );
        if (isMessageUpdate || (event.type === "message" && event.kind === "message.deleted")) {
          const latestEpoch = model.catalog.getState().lastEpochVersion;
          if (latestEpoch != null && latestEpoch > event.epoch_version) return;
        }
        return writeRealtimeCursorCache(
          cache,
          context.ownerKey,
          event.epoch_version,
          isProjectionCurrent,
        );
      };
      const cacheWrite = applied instanceof Promise ? applied : guarded?.cacheWrite;
      return cacheWrite instanceof Promise
        ? cacheWrite.then(finishApplication)
        : finishApplication();
    },

    async applyEvents(events, context) {
      const { ownerKey } = context;
      const writeCreatedMessages = cache.writeCreatedMessages;
      const model = getModel(ownerKey);
      if (
        requireOwnerCatalog ||
        model == null ||
        writeCreatedMessages == null ||
        context.source !== "catch_up" ||
        context.notificationsEnabled === true
      ) {
        for (const event of events) {
          if (!isOwnerContextCurrent(context, options)) return;
          await applier.applyEvent(event, context);
        }
        return;
      }
      const isCurrent = () => isOwnerModelCurrent(context, options, model);
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
            store: model.messages,
            updatePointers: (messages, messagesById) =>
              model.catalog
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
          if (!isOwnerModelCurrent(context, options, model)) return;
          const currentMessages = new Set(accepted.currentMessages());
          for (const [index, event] of created.entries()) {
            const message = messages[index];
            if (message == null || !currentMessages.has(message)) continue;
            applyLightweightProjectionEvent(model, event, context);
            if (!isCurrent()) return;
          }
          model.catalog.getState().setRealtimeCursor(context.ownerKey, epochVersion);
        },
        isCurrent,
      );
    },

    skipEvent(event, reason: WorkspaceRealtimeSkipReason, context) {
      const { ownerKey } = context;
      const model = getModel(ownerKey);
      if (model == null || !isOwnerModelCurrent(context, options, model)) return;

      if (reason === "unsupported_event") {
        log.warn("Skipped unsupported workspace realtime event", {
          ownerKey: context.ownerKey,
          epochVersion: skippedEpoch(event),
        });
      }

      model.catalog
        .getState()
        .markRealtimeEventSkipped(context.ownerKey, skippedEpoch(event), reason);
    },

    onTransportStateChange(state, context) {
      const { ownerKey } = context;
      const model = getModel(ownerKey);
      if (model == null || !isOwnerModelCurrent(context, options, model)) return;

      if (
        state.mode === "starting" ||
        state.mode === "catching_up" ||
        state.mode === "connecting" ||
        state.mode === "auth_refreshing" ||
        state.mode === "disconnecting" ||
        state.mode === "stopped" ||
        (state.mode === "reconnecting" && state.reason !== "catch_up_failed")
      ) {
        model.catalog
          .getState()
          .setRealtimeInitialSyncReady(context.ownerKey, context.owner.runtimeGeneration, false);
        return;
      }

      if (state.mode === "connected" || state.mode === "failed") {
        // "connected" starts only after the socket has applied events up to its ready frame.
        // A failed catch-up stays fail-open during its backoff, then blocks again when retry starts.
        model.catalog
          .getState()
          .setRealtimeInitialSyncReady(context.ownerKey, context.owner.runtimeGeneration, true);
      }
    },
  };
  return applier;
}
