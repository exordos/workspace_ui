import { restoreWorkspaceComposerDraftsForStream } from "~/entities/composer-draft/composer-draft.model";
import { compareWorkspaceMessages } from "~/entities/message/message-workspace-order.lib";
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
import {
  inheritWorkspaceStreamNotificationTransition,
  isWorkspaceTopicEffectivelyMuted,
  resolveWorkspaceStreamCounterNotificationMode,
} from "./messenger-notification-mode.lib";
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
import {
  clearMessengerUnreadProjectionCoverage,
  createMessengerPendingUnreadProjectionRevision,
  messengerPendingUnreadProjectionCoverage,
  recordMessengerUnreadProjectionCoverage,
  restoreMessengerStream,
  useMessengerStore,
} from "./messenger.model";
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
  advanceReadBoundary?: (
    boundary: MessengerReadBoundary,
    mutationRevision?: number,
  ) => Promise<void | readonly MessengerMessage[]> | void;
  queuePendingUnreadProjection?: (
    ownerKey: string,
    message: MessengerMessage,
    operation: "increment" | "decrement",
    mutationRevision: number,
  ) => Promise<void> | void;
  readPendingUnreadProjections?: (ownerKey: string) => Promise<
    readonly {
      message: MessengerMessage;
      operation: "increment" | "decrement";
      delta: -1 | 0 | 1;
      mutationRevision: number;
    }[]
  >;
  completePendingUnreadProjections?: (
    ownerKey: string,
    projections: readonly { messageUuid: MessengerUuid; mutationRevision: number }[],
  ) => Promise<void> | void;
  cancelPendingUnreadIncrement?: (
    ownerKey: string,
    messageUuid: MessengerUuid,
  ) => Promise<void> | void;
  verifyPendingUnreadProjection?: (
    ownerKey: string,
    stream: MessengerStream,
    topic: MessengerTopic,
    folders: readonly MessengerFolder[],
  ) => Promise<boolean>;
  markCachedMessagesRead?: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
    mutationRevision?: number,
    projectionMessages?: readonly MessengerMessage[],
  ) => Promise<readonly MessengerUuid[] | void> | readonly MessengerUuid[] | void;
  readCachedMessages?: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
  ) => Promise<MessengerMessage[]>;
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
  writeConversationMessagePageWithUnreadProjection?: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    page: MessengerRealtimeCacheConversationPage,
    mutationRevision: number,
  ) => Promise<void> | void;
  persistPendingUnreadProjection?: (
    ownerKey: string,
    message: MessengerMessage,
    operation: "increment" | "decrement",
    mutationRevision: number,
    stream: MessengerStream,
    topic: MessengerTopic,
    folders: readonly MessengerFolder[],
    isWriteCurrent: () => boolean,
  ) => Promise<boolean> | boolean;
  upsertCachedStream?: (ownerKey: string, stream: MessengerStream) => Promise<void> | void;
  upsertCachedStreamGuarded?: (
    ownerKey: string,
    stream: MessengerStream,
    isWriteCurrent: () => boolean,
  ) => Promise<void> | void;
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
  upsertCachedTopicGuarded?: (
    ownerKey: string,
    topic: MessengerTopic,
    isWriteCurrent: () => boolean,
  ) => Promise<void> | void;
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

function activeReadMessageUuidsCoveredBy(
  messagesById: Record<MessengerUuid, MessengerMessage>,
  boundaryMessage: MessengerMessage,
): Set<MessengerUuid> {
  const messageUuids = new Set<MessengerUuid>();
  for (const message of Object.values(messagesById)) {
    if (
      message.read &&
      message.streamUuid === boundaryMessage.streamUuid &&
      message.topicUuid === boundaryMessage.topicUuid &&
      compareWorkspaceMessages(message, boundaryMessage) <= 0
    ) {
      messageUuids.add(message.uuid);
    }
  }
  return messageUuids;
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

function runRealtimeCacheWrite(write: () => Promise<void> | void): Promise<void> | void {
  try {
    const result = write();
    return result instanceof Promise ? result.catch(() => undefined) : undefined;
  } catch {
    return;
  }
}

function waitForRealtimeCacheWrites(
  writes: readonly (Promise<void> | void)[],
): Promise<void> | void {
  const pending = writes.filter((write): write is Promise<void> => write instanceof Promise);
  return pending.length === 0 ? undefined : Promise.all(pending).then(() => undefined);
}

function writeRealtimeMessagePageCache(
  cache: MessengerRealtimeActiveCacheWriter | undefined,
  ownerKey: string,
  message: MessengerMessage,
  unreadProjectionRevision?: number,
): Promise<void> | void {
  const conversationIds = conversationIdsForRealtimeMessage(message);
  const page = { messages: [message], source: "realtime" as const };
  if (unreadProjectionRevision != null) {
    const writeWithProjection = cache?.writeConversationMessagePageWithUnreadProjection;
    if (writeWithProjection == null) return;
    return Promise.all(
      conversationIds.map((conversationId) =>
        Promise.resolve().then(() =>
          writeWithProjection(ownerKey, conversationId, page, unreadProjectionRevision),
        ),
      ),
    ).then(() => undefined);
  }

  const writeConversationMessagePage = cache?.writeConversationMessagePage;
  if (writeConversationMessagePage == null) return;
  writeRealtimeCacheBestEffort(async () => {
    await Promise.all(
      conversationIds.map((conversationId) =>
        Promise.resolve(writeConversationMessagePage(ownerKey, conversationId, page)),
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

const realtimeUnreadCacheQueues = new WeakMap<
  MessengerRealtimeActiveCacheWriter,
  Map<string, Promise<void>>
>();
const pendingUnreadProjectionFlushQueues = new WeakMap<
  MessengerRealtimeActiveCacheWriter,
  Map<string, Promise<void>>
>();
interface PendingUnreadProjectionSubscription {
  isWriteCurrent: () => boolean;
  unsubscribe: () => void;
}
const pendingUnreadProjectionSubscriptions = new WeakMap<
  MessengerRealtimeActiveCacheWriter,
  Map<string, PendingUnreadProjectionSubscription>
>();

function queueRealtimeCatalogCacheWrite(
  cache: MessengerRealtimeActiveCacheWriter,
  ownerKey: string,
  isWriteCurrent: () => boolean,
  operation: () => unknown,
): Promise<void> | void {
  const queueKey = ownerKey;
  const queues = realtimeUnreadCacheQueues.get(cache) ?? new Map<string, Promise<void>>();
  realtimeUnreadCacheQueues.set(cache, queues);

  const write = (): Promise<void> | void => {
    if (!isWriteCurrent()) return;
    try {
      const result = operation();
      return result instanceof Promise
        ? result.then(
            () => undefined,
            () => undefined,
          )
        : undefined;
    } catch {
      // Cache write failures must not stop realtime event application.
      return;
    }
  };

  const previous = queues.get(queueKey);
  if (previous == null) {
    const first = write();
    if (!(first instanceof Promise)) return;
    queues.set(queueKey, first);
    void first.finally(() => {
      if (queues.get(queueKey) === first) queues.delete(queueKey);
    });
    return first;
  }

  const next = previous.then(write, write).then(() => undefined);
  queues.set(queueKey, next);
  void next.finally(() => {
    if (queues.get(queueKey) === next) queues.delete(queueKey);
  });
  return next;
}

function queueRealtimeCatalogCacheProjection(
  cache: MessengerRealtimeActiveCacheWriter,
  ownerKey: string,
  stream: MessengerStream | null,
  topic: MessengerTopic | null,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  if (
    cache.upsertCachedStream == null &&
    cache.upsertCachedStreamGuarded == null &&
    cache.upsertCachedTopic == null &&
    cache.upsertCachedTopicGuarded == null
  ) {
    return;
  }
  return queueRealtimeCatalogCacheWrite(cache, ownerKey, isWriteCurrent, () => {
    const persist = (operation: () => Promise<void> | void): Promise<void> | void => {
      try {
        const result = operation();
        return result instanceof Promise ? result.catch(() => undefined) : undefined;
      } catch {
        // The other catalog row can still be persisted independently.
        return;
      }
    };
    let streamWrite: Promise<void> | void = undefined;
    if (stream != null && cache.upsertCachedStreamGuarded != null) {
      streamWrite = persist(() =>
        cache.upsertCachedStreamGuarded?.(ownerKey, stream, isWriteCurrent),
      );
    } else if (stream != null && cache.upsertCachedStream != null) {
      streamWrite = persist(() => cache.upsertCachedStream?.(ownerKey, stream));
    }
    const persistTopic = (): Promise<void> | void => {
      if (!isWriteCurrent()) return;
      if (topic != null && cache.upsertCachedTopicGuarded != null) {
        return persist(() => cache.upsertCachedTopicGuarded?.(ownerKey, topic, isWriteCurrent));
      }
      if (topic != null && cache.upsertCachedTopic != null) {
        return persist(() => cache.upsertCachedTopic?.(ownerKey, topic));
      }
    };
    return streamWrite instanceof Promise ? streamWrite.then(persistTopic) : persistTopic();
  });
}

function adjustRealtimeUnreadCounters(
  ownerKey: string,
  message: MessengerMessage,
  delta: -1 | 1,
  activeCache: MessengerRealtimeActiveCacheWriter,
  isWriteCurrent: () => boolean,
  stageWhenUnavailable = true,
  mutationRevision?: number,
  components: { stream: boolean; topic: boolean } = { stream: true, topic: true },
): Promise<void> | void {
  if (message.isOwn) return;
  const operation = delta === 1 ? "increment" : "decrement";
  const pendingRevision =
    mutationRevision ?? createMessengerPendingUnreadProjectionRevision(ownerKey);

  const store = useMessengerStore.getState();
  const stream = store.streamsById[message.streamUuid];
  const topic = store.topicsById[message.topicUuid];
  // Active/passive classification needs both levels: a topic can override a
  // muted stream, while a default topic inherits it. An incomplete bootstrap
  // is reconciled by the authoritative catalog instead of guessing here.
  if (stream == null || topic == null || !isWriteCurrent()) {
    if (!stageWhenUnavailable) return;
    return activeCache.queuePendingUnreadProjection?.(
      ownerKey,
      message,
      operation,
      pendingRevision,
    );
  }

  const passive = isWorkspaceTopicEffectivelyMuted(
    topic.notificationMode,
    resolveWorkspaceStreamCounterNotificationMode(stream),
  );
  const adjust = <T extends MessengerStream | MessengerTopic>(value: T): T => ({
    ...value,
    unreadCount: Math.max(0, value.unreadCount + delta),
    activeUnreadCount: Math.max(
      0,
      (value.activeUnreadCount ?? value.unreadCount - (value.passiveUnreadCount ?? 0)) +
        (passive ? 0 : delta),
    ),
    passiveUnreadCount: Math.max(0, (value.passiveUnreadCount ?? 0) + (passive ? delta : 0)),
  });

  const nextStream = components.stream ? adjust(stream) : stream;
  const nextTopic = components.topic ? adjust(topic) : topic;
  if (components.stream) {
    inheritWorkspaceStreamNotificationTransition(stream, nextStream);
    store.upsertStream(ownerKey, nextStream, { kind: "derived" });
  }
  if (components.topic) store.upsertTopic(ownerKey, nextTopic, { kind: "derived" });
  recordMessengerUnreadProjectionCoverage(ownerKey, message.uuid, pendingRevision, components);
  const persistProjection = (): Promise<void> | void => {
    const current = useMessengerStore.getState();
    const projectedStream = current.streamsById[message.streamUuid] ?? nextStream;
    const projectedTopic = current.topicsById[message.topicUuid] ?? nextTopic;
    const projectedFolders = current.folderIds.flatMap((folderUuid) => {
      const folder = current.foldersById[folderUuid];
      return folder?.items.some((item) => item.streamUuid === message.streamUuid) ? [folder] : [];
    });
    if (activeCache.persistPendingUnreadProjection != null) {
      return queueRealtimeCatalogCacheWrite(activeCache, ownerKey, isWriteCurrent, () =>
        activeCache.persistPendingUnreadProjection?.(
          ownerKey,
          message,
          operation,
          pendingRevision,
          projectedStream,
          projectedTopic,
          projectedFolders,
          isWriteCurrent,
        ),
      );
    }
    return queueRealtimeCatalogCacheProjection(
      activeCache,
      ownerKey,
      projectedStream,
      projectedTopic,
      isWriteCurrent,
    );
  };
  if (!stageWhenUnavailable || activeCache.queuePendingUnreadProjection == null) {
    return persistProjection();
  }
  const stage = activeCache.queuePendingUnreadProjection(
    ownerKey,
    message,
    operation,
    pendingRevision,
  );
  return stage instanceof Promise ? stage.then(persistProjection) : persistProjection();
}

function disarmPendingUnreadProjectionFlush(
  activeCache: MessengerRealtimeActiveCacheWriter,
  ownerKey: string,
): void {
  const subscriptions = pendingUnreadProjectionSubscriptions.get(activeCache);
  const subscription = subscriptions?.get(ownerKey);
  subscription?.unsubscribe();
  subscriptions?.delete(ownerKey);
}

function armPendingUnreadProjectionFlush(
  activeCache: MessengerRealtimeActiveCacheWriter,
  ownerKey: string,
  isWriteCurrent: () => boolean,
): void {
  const subscriptions =
    pendingUnreadProjectionSubscriptions.get(activeCache) ??
    new Map<string, PendingUnreadProjectionSubscription>();
  pendingUnreadProjectionSubscriptions.set(activeCache, subscriptions);
  const existing = subscriptions.get(ownerKey);
  if (existing != null) {
    existing.isWriteCurrent = isWriteCurrent;
    return;
  }

  const subscription: PendingUnreadProjectionSubscription = {
    isWriteCurrent,
    unsubscribe: () => undefined,
  };
  subscription.unsubscribe = useMessengerStore.subscribe(() => {
    const currentGuard = subscription.isWriteCurrent;
    void Promise.resolve(flushPendingUnreadProjections(ownerKey, activeCache, currentGuard)).catch(
      () => undefined,
    );
  });
  subscriptions.set(ownerKey, subscription);
}

async function runPendingUnreadProjectionFlush(
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
  isWriteCurrent: () => boolean,
): Promise<void> {
  const pending = await activeCache.readPendingUnreadProjections?.(ownerKey);
  if (pending == null) return;
  if (pending.length === 0) {
    disarmPendingUnreadProjectionFlush(activeCache, ownerKey);
    return;
  }
  if (!isWriteCurrent()) return;

  const eligible = pending.filter(({ message }) => {
    const store = useMessengerStore.getState();
    return (
      store.ownerKey === ownerKey &&
      store.streamsById[message.streamUuid] != null &&
      store.topicsById[message.topicUuid] != null
    );
  });
  if (eligible.length === 0) {
    armPendingUnreadProjectionFlush(activeCache, ownerKey, isWriteCurrent);
    return;
  }

  // Coverage must describe state from before this replay batch. Mutations from
  // an earlier row in the same batch are not proof that a later row was applied.
  const eligibleWithCoverage = eligible.map((projection) => ({
    ...projection,
    coverage: messengerPendingUnreadProjectionCoverage(
      ownerKey,
      projection.message.uuid,
      projection.message.streamUuid,
      projection.message.topicUuid,
      projection.mutationRevision,
    ),
  }));
  const writes: Promise<void>[] = [];
  for (const { message, operation, delta, mutationRevision, coverage } of eligibleWithCoverage) {
    const components = { stream: !coverage.stream, topic: !coverage.topic };
    const current = useMessengerStore.getState();
    const currentStream = current.streamsById[message.streamUuid] ?? null;
    const currentTopic = current.topicsById[message.topicUuid] ?? null;
    const currentFolders = current.folderIds.flatMap((folderUuid) => {
      const folder = current.foldersById[folderUuid];
      return folder?.items.some((item) => item.streamUuid === message.streamUuid) ? [folder] : [];
    });
    let write: Promise<void> | void;
    if (delta !== 0 && (components.stream || components.topic)) {
      write = adjustRealtimeUnreadCounters(
        ownerKey,
        message,
        delta,
        activeCache,
        isWriteCurrent,
        false,
        mutationRevision,
        components,
      );
    } else if (
      activeCache.persistPendingUnreadProjection != null &&
      currentStream != null &&
      currentTopic != null
    ) {
      write = queueRealtimeCatalogCacheWrite(activeCache, ownerKey, isWriteCurrent, () =>
        activeCache.persistPendingUnreadProjection?.(
          ownerKey,
          message,
          operation,
          mutationRevision,
          currentStream,
          currentTopic,
          currentFolders,
          isWriteCurrent,
        ),
      );
    } else {
      write = queueRealtimeCatalogCacheProjection(
        activeCache,
        ownerKey,
        currentStream,
        currentTopic,
        isWriteCurrent,
      );
    }
    if (write instanceof Promise) writes.push(write);
  }
  await Promise.all(writes);
  if (!isWriteCurrent()) return;
  const verificationResults = await Promise.all(
    eligibleWithCoverage.map(async ({ message, mutationRevision }) => {
      const current = useMessengerStore.getState();
      const stream = current.streamsById[message.streamUuid];
      const topic = current.topicsById[message.topicUuid];
      if (stream == null || topic == null) return null;
      const folders = current.folderIds.flatMap((folderUuid) => {
        const folder = current.foldersById[folderUuid];
        return folder?.items.some((item) => item.streamUuid === message.streamUuid) ? [folder] : [];
      });
      const durable =
        activeCache.verifyPendingUnreadProjection == null ||
        (await activeCache.verifyPendingUnreadProjection(ownerKey, stream, topic, folders));
      return durable ? { messageUuid: message.uuid, mutationRevision } : null;
    }),
  );
  const verifiedProjections = verificationResults.filter(
    (projection): projection is { messageUuid: MessengerUuid; mutationRevision: number } =>
      projection != null,
  );
  if (!isWriteCurrent()) return;
  await activeCache.completePendingUnreadProjections?.(ownerKey, verifiedProjections);
  for (const projection of verifiedProjections) {
    clearMessengerUnreadProjectionCoverage(
      ownerKey,
      projection.messageUuid,
      projection.mutationRevision,
    );
  }
  if (verifiedProjections.length === pending.length) {
    disarmPendingUnreadProjectionFlush(activeCache, ownerKey);
  } else {
    armPendingUnreadProjectionFlush(activeCache, ownerKey, isWriteCurrent);
  }
}

function flushPendingUnreadProjections(
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  if (
    activeCache.readPendingUnreadProjections == null ||
    activeCache.completePendingUnreadProjections == null
  ) {
    return;
  }

  const queues =
    pendingUnreadProjectionFlushQueues.get(activeCache) ?? new Map<string, Promise<void>>();
  pendingUnreadProjectionFlushQueues.set(activeCache, queues);
  const previous = queues.get(ownerKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => runPendingUnreadProjectionFlush(ownerKey, activeCache, isWriteCurrent));
  queues.set(ownerKey, next);
  void next.finally(() => {
    if (queues.get(ownerKey) === next) queues.delete(ownerKey);
  });
  return next;
}

function deleteRealtimeCachedMessage(
  cache: MessengerRealtimeActiveCacheWriter,
  ownerKey: string,
  message: MessengerDeletedMessage,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  if (cache.deleteCachedMessage == null) return;
  return queueRealtimeCatalogCacheWrite(cache, ownerKey, isWriteCurrent, () =>
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
  const isWriteCurrent = (): boolean => isActiveCurrentOwner(context, options);

  if (event.kind === "message.deleted") {
    const previousMessage = messageStore.messagesById[event.message.uuid];
    const deletedMessage = {
      uuid: event.message.uuid,
      streamUuid: event.message.stream_uuid,
      topicUuid: event.message.topic_uuid,
    };
    const finishDeletion = (cachedMessage?: MessengerMessage): Promise<void> | void => {
      const unreadMessage = previousMessage ?? cachedMessage;
      const unreadProjection =
        unreadMessage != null && !unreadMessage.read && !unreadMessage.isOwn
          ? adjustRealtimeUnreadCounters(ownerKey, unreadMessage, -1, activeCache, isWriteCurrent)
          : undefined;
      const pointerRepairPlan = captureDeletedMessagePointerRepair(ownerKey, deletedMessage);
      messageStore.removeMessage(event.message.uuid);
      store.clearMessagePointer(ownerKey, deletedMessage);
      const deleteWrite = deleteRealtimeCachedMessage(
        activeCache,
        ownerKey,
        deletedMessage,
        isWriteCurrent,
      );
      const pendingIncrementCancellation =
        unreadMessage == null
          ? activeCache.cancelPendingUnreadIncrement?.(ownerKey, deletedMessage.uuid)
          : undefined;
      writeRealtimeCacheBestEffort(() =>
        options.onMessageDeleted?.(ownerKey, deletedMessage, pointerRepairPlan, context),
      );
      return waitForRealtimeCacheWrites([
        unreadProjection,
        deleteWrite,
        pendingIncrementCancellation,
      ]);
    };

    if (previousMessage == null && activeCache.readCachedMessages != null) {
      const finishCachedDeletion = (
        cachedMessages: readonly MessengerMessage[] = [],
      ): Promise<void> | void => {
        if (!isWriteCurrent()) return;
        const cachedMessage = cachedMessages.find(
          (candidate) =>
            candidate.uuid === deletedMessage.uuid &&
            candidate.streamUuid === deletedMessage.streamUuid &&
            candidate.topicUuid === deletedMessage.topicUuid,
        );
        const currentMessage =
          useWorkspaceMessageStore.getState().messagesById[deletedMessage.uuid];
        return finishDeletion(currentMessage ?? cachedMessage);
      };
      return activeCache
        .readCachedMessages(ownerKey, [deletedMessage.uuid])
        .then(finishCachedDeletion, () => finishCachedDeletion());
    }
    return finishDeletion();
  }

  const incomingMessage = applyMessengerReadBoundary(
    adaptMessengerMessage(event.message),
    ownerKey,
  );
  const stream = store.streamsById[incomingMessage.streamUuid] ?? null;
  const previousMessage = messageStore.messagesById[incomingMessage.uuid];
  // Read state is monotonic. Provider delivery updates and duplicate creates can
  // carry the original unread snapshot after a newer read transition.
  const message =
    previousMessage?.read === true ? { ...incomingMessage, read: true } : incomingMessage;
  if (event.kind === "message.read") {
    const readProjectionRevision = createMessengerPendingUnreadProjectionRevision(ownerKey);
    const decrementedMessageUuids = activeReadMessageUuidsCoveredBy(
      messageStore.messagesById,
      message,
    );
    if (decrementedMessageUuids.size > 0) {
      const current = useMessengerStore.getState();
      const currentStream = current.streamsById[message.streamUuid];
      const currentTopic = current.topicsById[message.topicUuid];
      for (const messageUuid of decrementedMessageUuids) {
        recordMessengerUnreadProjectionCoverage(ownerKey, messageUuid, readProjectionRevision, {
          stream: currentStream != null,
          topic: currentTopic != null,
        });
      }
    }
    const projectionWrites: Promise<void>[] = [];
    const directlyProjectedMessages: MessengerMessage[] = [];
    const projectUnreadMessage = (unreadMessage: MessengerMessage): void => {
      if (decrementedMessageUuids.has(unreadMessage.uuid)) return;
      decrementedMessageUuids.add(unreadMessage.uuid);
      directlyProjectedMessages.push(unreadMessage);
      const write = adjustRealtimeUnreadCounters(
        ownerKey,
        unreadMessage,
        -1,
        activeCache,
        isWriteCurrent,
        true,
        readProjectionRevision,
      );
      if (write instanceof Promise) projectionWrites.push(write);
    };
    if (previousMessage != null && !previousMessage.read) {
      projectUnreadMessage(previousMessage);
    } else if (previousMessage != null) {
      // A local optimistic read can lead the durable cache. Do not project the
      // same message again if the boundary transaction still returns its stale row.
      decrementedMessageUuids.add(previousMessage.uuid);
    }
    messageStore.applyLiveKnownBodyMutation(message);
    const boundary = advanceMessengerReadBoundary({
      ownerKey,
      streamUuid: message.streamUuid,
      topicUuid: message.topicUuid,
      createdAt: message.createdAt,
      messageUuid: message.uuid,
      epochVersion: event.epoch_version,
    });
    const additionallyReadMessages = messageStore.markMessagesReadUpTo(message.uuid, {
      conversationIds: conversationIdsForRealtimeMessage(message),
    });
    for (const additionallyReadMessage of additionallyReadMessages) {
      projectUnreadMessage(additionallyReadMessage);
    }
    if (previousMessage != null && activeCache.patchCachedMessage != null) {
      writeRealtimeCacheBestEffort(() =>
        activeCache.patchCachedMessage?.(ownerKey, { ...message, read: true }),
      );
    }
    const finishBoundary = (
      cachedMessages: readonly MessengerMessage[] = [],
    ): Promise<void> | void => {
      const pendingWrites: Promise<void>[] = [];
      const messagesToStage = new Map(
        directlyProjectedMessages.map((projectedMessage) => [
          projectedMessage.uuid,
          projectedMessage,
        ]),
      );
      for (const cachedMessage of cachedMessages) {
        if (!cachedMessage.read && !cachedMessage.isOwn) {
          messagesToStage.set(cachedMessage.uuid, cachedMessage);
        }
      }
      for (const cachedMessage of messagesToStage.values()) {
        if (activeCache.queuePendingUnreadProjection != null) {
          const write = activeCache.queuePendingUnreadProjection(
            ownerKey,
            cachedMessage,
            "decrement",
            readProjectionRevision,
          );
          if (write instanceof Promise) pendingWrites.push(write);
        } else if (isWriteCurrent()) {
          projectUnreadMessage(cachedMessage);
        }
      }
      const writes = [...projectionWrites, ...pendingWrites];
      const finishWrites = (): Promise<void> | void =>
        flushPendingUnreadProjections(ownerKey, activeCache, isWriteCurrent);
      return writes.length === 0
        ? finishWrites()
        : Promise.all(writes)
            .then(finishWrites)
            .then(() => undefined);
    };
    const boundaryWrite = activeCache.advanceReadBoundary?.(boundary, readProjectionRevision);
    return boundaryWrite instanceof Promise
      ? boundaryWrite.then((cachedMessages) => finishBoundary(cachedMessages ?? []))
      : finishBoundary();
  }
  if (event.kind === "message.updated") {
    const finishUpdate = (cachedMessage?: MessengerMessage): Promise<void> | void => {
      const knownMessage = previousMessage ?? cachedMessage;
      const updatedMessage =
        knownMessage?.read === true ? { ...incomingMessage, read: true } : incomingMessage;
      const unreadProjection =
        knownMessage != null && !knownMessage.read && updatedMessage.read
          ? adjustRealtimeUnreadCounters(ownerKey, knownMessage, -1, activeCache, isWriteCurrent)
          : undefined;
      messageStore.applyLiveKnownBodyMutation(updatedMessage);
      const patchWrite =
        knownMessage != null && activeCache.patchCachedMessage != null
          ? runRealtimeCacheWrite(() => activeCache.patchCachedMessage?.(ownerKey, updatedMessage))
          : undefined;
      if (
        previousMessage != null &&
        !areReactionAggregatesEqual(previousMessage.reactions, updatedMessage.reactions) &&
        options.onMessageReactionAggregateUpdated != null
      ) {
        writeRealtimeCacheBestEffort(() =>
          options.onMessageReactionAggregateUpdated?.(ownerKey, updatedMessage),
        );
      }
      return waitForRealtimeCacheWrites([unreadProjection, patchWrite]);
    };

    if (previousMessage == null && activeCache.readCachedMessages != null) {
      const finishCachedUpdate = (
        cachedMessages: readonly MessengerMessage[] = [],
      ): Promise<void> | void => {
        if (!isWriteCurrent()) return;
        const currentMessage = useWorkspaceMessageStore.getState().messagesById[message.uuid];
        return finishUpdate(
          currentMessage ?? cachedMessages.find((candidate) => candidate.uuid === message.uuid),
        );
      };
      return activeCache
        .readCachedMessages(ownerKey, [message.uuid])
        .then(finishCachedUpdate, () => finishCachedUpdate());
    }
    return finishUpdate();
  }

  // message.created is the first per-recipient proof that the conversation is
  // unread. Stream/topic counter events are not guaranteed to accompany it,
  // so project this known delta immediately and let later snapshots reconcile totals.
  const finishCreation = (cachedMessage?: MessengerMessage): Promise<void> | void => {
    const isNewMessage = previousMessage == null && cachedMessage == null;
    const createdMessage =
      previousMessage?.read === true || cachedMessage?.read === true
        ? { ...incomingMessage, read: true }
        : incomingMessage;
    const shouldProjectUnread = isNewMessage && !createdMessage.read && !createdMessage.isOwn;
    const unreadProjectionRevision = shouldProjectUnread
      ? createMessengerPendingUnreadProjectionRevision(ownerKey)
      : undefined;
    const atomicallyStagesUnread =
      unreadProjectionRevision != null &&
      activeCache.writeConversationMessagePageWithUnreadProjection != null;
    const messageCacheWrite = writeRealtimeMessagePageCache(
      activeCache,
      ownerKey,
      createdMessage,
      atomicallyStagesUnread ? unreadProjectionRevision : undefined,
    );
    messageStore.applyLiveCreatedMessage(createdMessage);
    store.applyMessagePointer(ownerKey, createdMessage);
    if (
      isNewMessage &&
      context.notificationsEnabled === true &&
      options.onMessageCreated != null &&
      resolveMessengerMessageLiveEffectPolicy(createdMessage).liveSideEffectsEligible
    ) {
      writeRealtimeCacheBestEffort(() =>
        options.onMessageCreated?.(ownerKey, createdMessage, stream, context),
      );
    }
    const projectAndFlush = (atomicWriteSucceeded: boolean): Promise<void> | void => {
      const unreadProjection =
        shouldProjectUnread && unreadProjectionRevision != null
          ? adjustRealtimeUnreadCounters(
              ownerKey,
              createdMessage,
              1,
              activeCache,
              isWriteCurrent,
              !(atomicallyStagesUnread && atomicWriteSucceeded),
              unreadProjectionRevision,
            )
          : undefined;
      const flush = (): Promise<void> | void =>
        flushPendingUnreadProjections(ownerKey, activeCache, isWriteCurrent);
      return unreadProjection instanceof Promise ? unreadProjection.then(flush) : flush();
    };
    return messageCacheWrite instanceof Promise
      ? messageCacheWrite.then(
          () => projectAndFlush(true),
          () => projectAndFlush(false),
        )
      : projectAndFlush(false);
  };

  if (
    previousMessage == null &&
    !message.read &&
    !message.isOwn &&
    activeCache.readCachedMessages != null
  ) {
    const finishCachedCreation = (
      cachedMessages: readonly MessengerMessage[] = [],
    ): Promise<void> | void => {
      if (!isWriteCurrent()) return;
      const currentMessage = useWorkspaceMessageStore.getState().messagesById[message.uuid];
      return finishCreation(
        currentMessage ?? cachedMessages.find((candidate) => candidate.uuid === message.uuid),
      );
    };
    return activeCache
      .readCachedMessages(ownerKey, [message.uuid])
      .then(finishCachedCreation, () => finishCachedCreation());
  }
  return finishCreation();
}

async function applyMessagesRealtimeEvent(
  event: MessengerMessagesRealtimeEvent,
  ownerKey: string,
  context: WorkspaceRealtimeEventContext,
  activeCache: MessengerRealtimeActiveCacheWriter,
  options: MessengerRealtimeActiveApplierOptions,
): Promise<void> {
  const isWriteCurrent = (): boolean => isActiveCurrentOwner(context, options);
  const uniqueMessageUuids = [...new Set(event.messageUuids)];
  const initialMessagesById = useWorkspaceMessageStore.getState().messagesById;
  const missingMessageUuids = uniqueMessageUuids.filter(
    (messageUuid) => initialMessagesById[messageUuid] == null,
  );
  let cachedMessages: MessengerMessage[] = [];

  if (missingMessageUuids.length > 0 && activeCache.readCachedMessages != null) {
    try {
      cachedMessages = await activeCache.readCachedMessages(ownerKey, missingMessageUuids);
    } catch {
      // The read event still updates known state if its optional cache lookup fails.
    }
  }
  if (!isWriteCurrent()) return;

  const messageStore = useWorkspaceMessageStore.getState();
  const cachedMessagesById = new Map(cachedMessages.map((message) => [message.uuid, message]));
  const unreadMessages = uniqueMessageUuids.flatMap((messageUuid) => {
    const message = messageStore.messagesById[messageUuid] ?? cachedMessagesById.get(messageUuid);
    return message != null && !message.read && !message.isOwn ? [message] : [];
  });
  const mutationRevision = createMessengerPendingUnreadProjectionRevision(ownerKey);
  const alreadyReadMessages = uniqueMessageUuids.flatMap((messageUuid) => {
    const message = messageStore.messagesById[messageUuid];
    return message != null && message.read && !message.isOwn ? [message] : [];
  });
  if (alreadyReadMessages.length > 0) {
    // A local optimistic read can lead its cached body. The cache transaction
    // may therefore discover and stage a decrement that active state already
    // contains; record coverage so replay persists the current counters without
    // applying that stale row a second time.
    const current = useMessengerStore.getState();
    for (const message of alreadyReadMessages) {
      recordMessengerUnreadProjectionCoverage(ownerKey, message.uuid, mutationRevision, {
        stream: current.streamsById[message.streamUuid] != null,
        topic: current.topicsById[message.topicUuid] != null,
      });
    }
  }
  let stagedProjectionMessageUuids: readonly MessengerUuid[] | void = undefined;
  if (activeCache.markCachedMessagesRead != null) {
    stagedProjectionMessageUuids = await activeCache.markCachedMessagesRead(
      ownerKey,
      uniqueMessageUuids,
      mutationRevision,
      unreadMessages,
    );
  } else {
    await Promise.all(
      unreadMessages.map((message) =>
        Promise.resolve(
          activeCache.queuePendingUnreadProjection?.(
            ownerKey,
            message,
            "decrement",
            mutationRevision,
          ),
        ),
      ),
    );
  }
  if (!isWriteCurrent()) return;

  // Change active read flags before counters so a concurrent optimistic action
  // cannot observe the old unread state after this batch starts committing.
  messageStore.markMessagesRead(uniqueMessageUuids);
  const messagesWithStagedProjection =
    stagedProjectionMessageUuids == null
      ? unreadMessages
      : unreadMessages.filter((message) => stagedProjectionMessageUuids.includes(message.uuid));
  const projectionWrites = messagesWithStagedProjection.map((message) =>
    adjustRealtimeUnreadCounters(
      ownerKey,
      message,
      -1,
      activeCache,
      isWriteCurrent,
      false,
      mutationRevision,
    ),
  );

  await Promise.all(projectionWrites.map((write) => Promise.resolve(write)));
}

function applyStreamRealtimeEvent(
  event: MessengerStreamRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  const store = useMessengerStore.getState();

  if (event.kind === "stream.deleted") {
    void removeMessengerStreamProjection({
      ownerKey,
      streamUuid: event.stream.uuid,
      removeActiveProjection: true,
      deleteCachedStream: () => undefined,
    }).catch(() => undefined);
    if (activeCache.deleteCachedStream != null) {
      return queueRealtimeCatalogCacheWrite(activeCache, ownerKey, isWriteCurrent, () =>
        activeCache.deleteCachedStream?.(ownerKey, event.stream.uuid),
      );
    }
    return;
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
  const catalogWrite = queueRealtimeCatalogCacheProjection(
    activeCache,
    ownerKey,
    stream,
    null,
    isWriteCurrent,
  );
  const folderWrites: (Promise<void> | void)[] = [];
  if (activeCache.upsertCachedFolder != null) {
    const nextStore = useMessengerStore.getState();
    for (const folderUuid of nextStore.folderIds) {
      const folder = nextStore.foldersById[folderUuid];
      if (folder == null || folder === previousFoldersById[folderUuid]) continue;
      folderWrites.push(
        queueRealtimeCatalogCacheWrite(activeCache, ownerKey, isWriteCurrent, () =>
          activeCache.upsertCachedFolder?.(ownerKey, folder),
        ),
      );
    }
  }
  return waitForRealtimeCacheWrites([catalogWrite, ...folderWrites]);
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
  isWriteCurrent: () => boolean,
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
    const messageDeleteWrites = deletedMessages.map((deletedMessage) =>
      deleteRealtimeCachedMessage(activeCache, ownerKey, deletedMessage, isWriteCurrent),
    );
    if (activeCache.deleteCachedTopic != null) {
      const topicDeleteWrite = queueRealtimeCatalogCacheWrite(
        activeCache,
        ownerKey,
        isWriteCurrent,
        () => activeCache.deleteCachedTopic?.(ownerKey, event.topic.uuid, event.topic.stream_uuid),
      );
      return waitForRealtimeCacheWrites([...messageDeleteWrites, topicDeleteWrite]);
    }
    return waitForRealtimeCacheWrites(messageDeleteWrites);
  }

  const topic = adaptMessengerTopic(event.topic);
  store.upsertTopic(ownerKey, topic);
  return queueRealtimeCatalogCacheProjection(activeCache, ownerKey, null, topic, isWriteCurrent);
}

function applyFolderRealtimeEvent(
  event: MessengerFolderRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  const store = useMessengerStore.getState();

  if (event.kind === "folder.deleted") {
    store.removeFolder(ownerKey, { uuid: event.folder.uuid });
    if (activeCache.deleteCachedFolder != null) {
      return queueRealtimeCatalogCacheWrite(activeCache, ownerKey, isWriteCurrent, () =>
        activeCache.deleteCachedFolder?.(ownerKey, event.folder.uuid),
      );
    }
    return;
  }

  const folder = adaptMessengerFolder(event.folder);
  store.applyFolderSnapshot(ownerKey, folder);
  if (activeCache.upsertCachedFolder != null) {
    return queueRealtimeCatalogCacheWrite(activeCache, ownerKey, isWriteCurrent, () =>
      activeCache.upsertCachedFolder?.(ownerKey, folder),
    );
  }
}

function applyFolderItemRealtimeEvent(
  event: MessengerFolderItemRealtimeEvent,
  ownerKey: string,
  activeCache: MessengerRealtimeActiveCacheWriter,
  isWriteCurrent: () => boolean,
): Promise<void> | void {
  useMessengerStore
    .getState()
    .removeFolderItem(
      ownerKey,
      { uuid: event.folder_item.uuid },
      { preserveFolderUnreadCount: true },
    );
  if (activeCache.deleteCachedFolderItem != null) {
    return queueRealtimeCatalogCacheWrite(activeCache, ownerKey, isWriteCurrent, () =>
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
  const isWriteCurrent = (): boolean => isActiveCurrentOwner(context, options);
  switch (event.type) {
    case "message":
      return applyMessageRealtimeEvent(event, ownerKey, context, activeCache, options);
    case "messages":
      return applyMessagesRealtimeEvent(event, ownerKey, context, activeCache, options);
    case "stream":
      return applyStreamRealtimeEvent(event, ownerKey, activeCache, isWriteCurrent);
    case "stream_binding":
      applyStreamBindingRealtimeEvent(event, ownerKey, activeCache);
      break;
    case "topic":
      return applyTopicRealtimeEvent(event, ownerKey, activeCache, isWriteCurrent);
    case "folder":
      return applyFolderRealtimeEvent(event, ownerKey, activeCache, isWriteCurrent);
    case "folder_item":
      return applyFolderItemRealtimeEvent(event, ownerKey, activeCache, isWriteCurrent);
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
      if (!isActiveCurrentOwner(context, options)) return "stale";

      const store = useMessengerStore.getState();
      if (isNonMessengerRealtimeEvent(event)) return "applied";
      if (!isSupportedRealtimeEvent(event)) {
        log.warn("Skipped unsupported workspace realtime event", {
          ownerKey: context.ownerKey,
          kind: eventKind(event),
          epochVersion: event.epoch_version,
        });
        // Unknown events also move the visible realtime cursor; the durable cursor is moved by transport.
        store.markRealtimeEventSkipped(context.ownerKey, event.epoch_version, "unsupported_event");
        return "applied";
      }

      const finishApplication = (): "applied" | "stale" => {
        if (!isActiveCurrentOwner(context, options)) return "stale";
        applyLightweightProjectionEvent(event, context);
        store.setRealtimeCursor(context.ownerKey, event.epoch_version);
        writeRealtimeCursorCache(activeCache, context.ownerKey, event.epoch_version);
        return "applied";
      };
      const cacheWrite = applySupportedRealtimeEvent(
        event,
        context.ownerKey,
        context,
        activeCache,
        options,
      );
      const finishPendingProjection = (): Promise<void> | void => {
        const messageMetadataMissing =
          event.type === "message" &&
          (store.streamsById[event.message.stream_uuid] == null ||
            store.topicsById[event.message.topic_uuid] == null);
        if (
          event.type !== "stream" &&
          event.type !== "topic" &&
          event.type !== "messages" &&
          !(event.type === "message" && (event.kind === "message.read" || messageMetadataMissing))
        ) {
          return;
        }
        return flushPendingUnreadProjections(context.ownerKey, activeCache, () =>
          isActiveCurrentOwner(context, options),
        );
      };
      if (cacheWrite instanceof Promise) {
        return cacheWrite.then(finishPendingProjection).then(finishApplication);
      }
      const pendingProjection = finishPendingProjection();
      if (pendingProjection instanceof Promise) {
        return pendingProjection.then(finishApplication);
      }
      finishApplication();
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
        void Promise.resolve(
          flushPendingUnreadProjections(context.ownerKey, activeCache, () =>
            isActiveCurrentOwner(context, options),
          ),
        ).catch(() => undefined);
      }
    },
  };
}

export function createMessengerRealtimeBackgroundApplier(
  options: MessengerRealtimeBackgroundApplierOptions = {},
): WorkspaceRealtimeEventApplier {
  const backgroundCache: MessengerRealtimeCacheWriter = {
    ...messengerRealtimeBackgroundCache,
    ...options.cache,
  };
  return {
    async applyEvent(event, context) {
      if (!isBackgroundCurrentOwner(context, options)) return "stale";

      const store = useMessengerBackgroundProjectionStore.getState();
      if (isNonMessengerRealtimeEvent(event)) return "applied";
      if (!isSupportedRealtimeEvent(event)) {
        store.recordSkippedEvent(context.ownerKey, event, "unsupported_event", context);
        return "applied";
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
      if (!isBackgroundCurrentOwner(context, options)) return "stale";

      if (cacheStatus === "deferred") {
        if (event.type === "file") {
          store.recordSkippedEvent(context.ownerKey, event, "background_apply_deferred", context);
        }
        return "applied";
      }

      if (event.type === "stream" && event.kind === "stream.deleted") {
        await (options.removeProjection ?? removeMessengerStreamProjection)({
          ownerKey: context.ownerKey,
          streamUuid: event.stream.uuid,
          removeActiveProjection: false,
          isOwnerCurrent: () => isBackgroundCurrentOwner(context, options),
          deleteCachedStream: () => undefined,
        });
        if (!isBackgroundCurrentOwner(context, options)) return "stale";
      }

      // Background state keeps notification data without writing into active messenger stores.
      if (isBackgroundLightweightEvent(event)) {
        store.recordAppliedEvent(context.ownerKey, event, context);
      }
      return "applied";
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
