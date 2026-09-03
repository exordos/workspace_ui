import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { normalizeMessengerFolderSystemType } from "./messenger-folder-system-type.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import {
  clearWorkspaceStreamUnreadReclassification,
  clearWorkspaceStreamUnreadReclassificationsForOwner,
  consumeWorkspaceStreamUnreadReclassification,
  inheritWorkspaceStreamNotificationTransition,
} from "./messenger-notification-mode.lib";
import { clearMessengerReadBoundariesForOwner } from "./messenger-read-boundary.lib";
import type {
  MessengerBootstrapPayload,
  MessengerConversation,
  MessengerConversationId,
  MessengerDeletedFolder,
  MessengerDeletedFolderItem,
  MessengerDeletedMessage,
  MessengerDeletedStream,
  MessengerDeletedTopic,
  MessengerFolder,
  MessengerFolderItem,
  MessengerMessage,
  MessengerSkippedRealtimeEvent,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

const EMPTY_STREAMS_BY_ID: Record<MessengerUuid, MessengerStream> = {};
const EMPTY_STREAM_BINDINGS_BY_ID: Record<MessengerUuid, MessengerStreamBinding> = {};
const EMPTY_STREAM_BINDING_IDS_BY_STREAM_ID: Record<MessengerUuid, MessengerUuid[]> = {};
const EMPTY_TOPICS_BY_ID: Record<MessengerUuid, MessengerTopic> = {};
const EMPTY_CONVERSATIONS_BY_ID: Record<MessengerConversationId, MessengerConversation> = {};
const EMPTY_FOLDERS_BY_ID: Record<MessengerUuid, MessengerFolder> = {};
const EMPTY_IDS: string[] = [];
const EMPTY_CONVERSATIONS: MessengerConversation[] = [];
const EMPTY_FOLDERS: MessengerFolder[] = [];
const EMPTY_SKIPPED_REALTIME_EVENTS: MessengerSkippedRealtimeEvent[] = [];
const removedStreamUuidsByOwnerKey = new Map<string, Set<MessengerUuid>>();
let lastBootstrapRequestVersion = 0;
let lastCatalogMutationRevision = 0;

function nextCatalogMutationRevision(): number {
  lastCatalogMutationRevision = Math.max(lastCatalogMutationRevision + 1, Date.now());
  return lastCatalogMutationRevision;
}

interface MessengerCatalogEntityMutation {
  revision: number;
  authoritativeRevision: number;
  unreadRevision: number;
  freshnessRevision: number;
  reclassificationRevision: number;
}

interface MessengerCatalogMutations {
  revision: number;
  streamsById: Map<MessengerUuid, MessengerCatalogEntityMutation>;
  topicsById: Map<MessengerUuid, MessengerCatalogEntityMutation>;
}

const catalogMutationsByOwnerKey = new Map<string, MessengerCatalogMutations>();
interface MessengerCatalogSnapshotCoverage {
  streamsById: Map<MessengerUuid, number>;
  topicsById: Map<MessengerUuid, number>;
}
const catalogSnapshotCoverageByOwnerKey = new Map<string, MessengerCatalogSnapshotCoverage>();
interface MessengerUnreadProjectionCoverage {
  streamRevision: number;
  topicRevision: number;
}
const unreadProjectionCoverageByOwnerKey = new Map<
  string,
  Map<MessengerUuid, MessengerUnreadProjectionCoverage>
>();

function clearMessengerCatalogRuntimeCoverage(ownerKey: string): void {
  catalogMutationsByOwnerKey.delete(ownerKey);
  catalogSnapshotCoverageByOwnerKey.delete(ownerKey);
  unreadProjectionCoverageByOwnerKey.delete(ownerKey);
}

type MessengerFreshnessState = Pick<
  MessengerDomainData,
  "streamsById" | "topicsById" | "conversationsById"
>;

export interface MessengerDeletedMessagePointerTargets {
  stream: boolean;
  topic: boolean;
  streamConversation: boolean;
  topicConversation: boolean;
}

export interface MessengerDeletedMessagePointerReplacements {
  stream: MessengerMessage | null;
  topic: MessengerMessage | null;
}

export interface MessengerCatalogMutationOptions {
  kind?: "authoritative" | "derived" | "freshness" | "reclassification" | "transient";
}

export interface MessengerBootstrapInstallOptions {
  catalogMutationFence?: number;
  coversCatalogMutationFence?: boolean;
}

// Store keeps Workspace data separate from old Zulip stores.
// This matters for migration: the new backend must not adapt to the old source of truth.
// This store is scoped by ownerKey so several accounts/projects can coexist safely.
export interface MessengerDomainData {
  streamsById: Record<MessengerUuid, MessengerStream>;
  streamIds: MessengerUuid[];
  streamBindingsById: Record<MessengerUuid, MessengerStreamBinding>;
  streamBindingIds: MessengerUuid[];
  streamBindingIdsByStreamId: Record<MessengerUuid, MessengerUuid[]>;
  streamBindingsLoadedByStreamId: Record<MessengerUuid, true>;
  topicsById: Record<MessengerUuid, MessengerTopic>;
  topicIds: MessengerUuid[];
  conversationsById: Record<MessengerConversationId, MessengerConversation>;
  conversationIds: MessengerConversationId[];
  foldersById: Record<MessengerUuid, MessengerFolder>;
  folderIds: MessengerUuid[];
  lastEpochVersion: number | null;
  skippedRealtimeEvents: MessengerSkippedRealtimeEvent[];
}

export interface MessengerStoreState extends MessengerDomainData {
  ownerKey: string | null;
  isLoading: boolean;
  error: string | null;
  lastLoadedAt: number | null;
  bootstrapRequestVersion: number;
  realtimeReadyOwnerKey: string | null;
  realtimeReadyRuntimeGeneration: number | null;

  startBootstrap: (ownerKey: string) => number;
  finishBootstrapSilently: (ownerKey: string) => void;
  replaceBootstrapState: (
    ownerKey: string,
    payload: MessengerBootstrapPayload,
    options?: MessengerBootstrapInstallOptions,
  ) => void;
  replaceFolderSnapshots: (
    ownerKey: string,
    folders: MessengerFolder[],
    options?: MessengerBootstrapInstallOptions,
  ) => void;
  upsertStream: (
    ownerKey: string,
    stream: MessengerStream,
    options?: MessengerCatalogMutationOptions,
  ) => void;
  removeStream: (ownerKey: string, stream: MessengerDeletedStream) => void;
  upsertStreamBindings: (ownerKey: string, bindings: MessengerStreamBinding[]) => void;
  replaceStreamBindingsForStream: (
    ownerKey: string,
    streamUuid: MessengerUuid,
    bindings: MessengerStreamBinding[],
  ) => void;
  markStreamBindingsLoaded: (ownerKey: string, streamUuid: MessengerUuid) => void;
  removeStreamBinding: (
    ownerKey: string,
    binding: Pick<MessengerStreamBinding, "uuid" | "streamUuid">,
  ) => void;
  upsertTopic: (
    ownerKey: string,
    topic: MessengerTopic,
    options?: MessengerCatalogMutationOptions,
  ) => void;
  removeTopic: (ownerKey: string, topic: MessengerDeletedTopic) => void;
  applyMessagePointer: (ownerKey: string, message: MessengerMessage) => void;
  clearMessagePointer: (ownerKey: string, message: MessengerDeletedMessage) => void;
  applyFolderSnapshot: (ownerKey: string, folder: MessengerFolder) => void;
  removeFolder: (ownerKey: string, folder: MessengerDeletedFolder) => void;
  upsertFolderItem: (ownerKey: string, folderItem: MessengerFolderItem) => void;
  removeFolderItem: (
    ownerKey: string,
    folderItem: MessengerDeletedFolderItem,
    options?: MessengerFolderItemRemovalOptions,
  ) => void;
  setRealtimeInitialSyncReady: (
    ownerKey: string,
    runtimeGeneration: number,
    ready: boolean,
  ) => void;
  setRealtimeCursor: (ownerKey: string, epochVersion: number) => void;
  markRealtimeEventSkipped: (ownerKey: string, epochVersion: number, reason: string) => void;
  setBootstrapError: (ownerKey: string, error: string) => void;
  clear: () => void;
}

export interface MessengerFolderItemRemovalOptions {
  preserveFolderUnreadCount?: boolean;
}

function createEmptyMessengerData(): MessengerDomainData {
  return {
    streamsById: EMPTY_STREAMS_BY_ID,
    streamIds: EMPTY_IDS,
    streamBindingsById: EMPTY_STREAM_BINDINGS_BY_ID,
    streamBindingIds: EMPTY_IDS,
    streamBindingIdsByStreamId: EMPTY_STREAM_BINDING_IDS_BY_STREAM_ID,
    streamBindingsLoadedByStreamId: {},
    topicsById: EMPTY_TOPICS_BY_ID,
    topicIds: EMPTY_IDS,
    conversationsById: EMPTY_CONVERSATIONS_BY_ID,
    conversationIds: EMPTY_IDS,
    foldersById: EMPTY_FOLDERS_BY_ID,
    folderIds: EMPTY_IDS,
    lastEpochVersion: null,
    skippedRealtimeEvents: EMPTY_SKIPPED_REALTIME_EVENTS,
  };
}

function removedStreamsForOwner(ownerKey: string): Set<MessengerUuid> {
  const existing = removedStreamUuidsByOwnerKey.get(ownerKey);
  if (existing != null) return existing;
  const created = new Set<MessengerUuid>();
  removedStreamUuidsByOwnerKey.set(ownerKey, created);
  return created;
}

function catalogMutationsForOwner(ownerKey: string): MessengerCatalogMutations {
  const existing = catalogMutationsByOwnerKey.get(ownerKey);
  if (existing != null) return existing;
  const created: MessengerCatalogMutations = {
    revision: lastCatalogMutationRevision,
    streamsById: new Map(),
    topicsById: new Map(),
  };
  catalogMutationsByOwnerKey.set(ownerKey, created);
  return created;
}

function recordCatalogMutation(
  ownerKey: string,
  entity: "stream" | "topic",
  uuid: MessengerUuid,
  kind: "authoritative" | "derived" | "freshness" | "reclassification",
): void {
  const revision = nextCatalogMutationRevision();
  const mutations = catalogMutationsForOwner(ownerKey);
  mutations.revision = revision;
  const target = entity === "stream" ? mutations.streamsById : mutations.topicsById;
  const previous = target.get(uuid);
  target.set(uuid, {
    revision,
    authoritativeRevision:
      kind === "authoritative" ? revision : (previous?.authoritativeRevision ?? 0),
    unreadRevision: kind === "derived" ? revision : (previous?.unreadRevision ?? 0),
    freshnessRevision: kind === "freshness" ? revision : (previous?.freshnessRevision ?? 0),
    reclassificationRevision:
      kind === "reclassification" ? revision : (previous?.reclassificationRevision ?? 0),
  });
}

export function createMessengerCatalogMutationFence(ownerKey: string): number {
  const revision = nextCatalogMutationRevision();
  catalogMutationsForOwner(ownerKey).revision = revision;
  return revision;
}

export function createMessengerPendingUnreadProjectionRevision(ownerKey: string): number {
  const revision = nextCatalogMutationRevision();
  const mutations = catalogMutationsForOwner(ownerKey);
  mutations.revision = revision;
  return revision;
}

export function recordMessengerUnreadProjectionCoverage(
  ownerKey: string,
  messageUuid: MessengerUuid,
  revision: number,
  components: { stream: boolean; topic: boolean },
): void {
  const ownerCoverage =
    unreadProjectionCoverageByOwnerKey.get(ownerKey) ??
    new Map<MessengerUuid, MessengerUnreadProjectionCoverage>();
  unreadProjectionCoverageByOwnerKey.set(ownerKey, ownerCoverage);
  const previous = ownerCoverage.get(messageUuid);
  ownerCoverage.set(messageUuid, {
    streamRevision: components.stream
      ? Math.max(previous?.streamRevision ?? 0, revision)
      : (previous?.streamRevision ?? 0),
    topicRevision: components.topic
      ? Math.max(previous?.topicRevision ?? 0, revision)
      : (previous?.topicRevision ?? 0),
  });
}

export function clearMessengerUnreadProjectionCoverage(
  ownerKey: string,
  messageUuid: MessengerUuid,
  revision: number,
): void {
  const ownerCoverage = unreadProjectionCoverageByOwnerKey.get(ownerKey);
  const previous = ownerCoverage?.get(messageUuid);
  if (ownerCoverage == null || previous == null) return;
  const next = {
    streamRevision: previous.streamRevision <= revision ? 0 : previous.streamRevision,
    topicRevision: previous.topicRevision <= revision ? 0 : previous.topicRevision,
  };
  if (next.streamRevision === 0 && next.topicRevision === 0) {
    ownerCoverage.delete(messageUuid);
    if (ownerCoverage.size === 0) unreadProjectionCoverageByOwnerKey.delete(ownerKey);
    return;
  }
  ownerCoverage.set(messageUuid, next);
}

function catalogSnapshotCoverageForOwner(ownerKey: string): MessengerCatalogSnapshotCoverage {
  const existing = catalogSnapshotCoverageByOwnerKey.get(ownerKey);
  if (existing != null) return existing;
  const created: MessengerCatalogSnapshotCoverage = {
    streamsById: new Map(),
    topicsById: new Map(),
  };
  catalogSnapshotCoverageByOwnerKey.set(ownerKey, created);
  return created;
}

function recordCatalogSnapshotCoverage(
  ownerKey: string,
  payload: MessengerBootstrapPayload,
  fence: number,
): void {
  const coverage = catalogSnapshotCoverageForOwner(ownerKey);
  for (const stream of payload.streams) {
    coverage.streamsById.set(
      stream.uuid,
      Math.max(coverage.streamsById.get(stream.uuid) ?? 0, fence),
    );
  }
  for (const topic of payload.topics) {
    coverage.topicsById.set(topic.uuid, Math.max(coverage.topicsById.get(topic.uuid) ?? 0, fence));
  }
}

export function messengerPendingUnreadProjectionCoverage(
  ownerKey: string,
  messageUuid: MessengerUuid,
  streamUuid: MessengerUuid,
  topicUuid: MessengerUuid,
  revision: number,
): { stream: boolean; topic: boolean } {
  const mutations = catalogMutationsByOwnerKey.get(ownerKey);
  const coverage = catalogSnapshotCoverageByOwnerKey.get(ownerKey);
  const projectionCoverage = unreadProjectionCoverageByOwnerKey.get(ownerKey)?.get(messageUuid);
  const streamMutation = mutations?.streamsById.get(streamUuid);
  const topicMutation = mutations?.topicsById.get(topicUuid);
  // unreadRevision remains an entity-level bootstrap merge fence. It cannot
  // prove that this particular message's durable delta was already projected:
  // a later realtime event for a different message may have produced it.
  return {
    stream:
      (streamMutation?.authoritativeRevision ?? 0) >= revision ||
      (projectionCoverage?.streamRevision ?? 0) >= revision ||
      (coverage?.streamsById.get(streamUuid) ?? 0) >= revision,
    topic:
      (topicMutation?.authoritativeRevision ?? 0) >= revision ||
      (projectionCoverage?.topicRevision ?? 0) >= revision ||
      (coverage?.topicsById.get(topicUuid) ?? 0) >= revision,
  };
}

export function markMessengerStreamRemoved(ownerKey: string, streamUuid: MessengerUuid): void {
  removedStreamsForOwner(ownerKey).add(streamUuid);
}

export function restoreMessengerStream(ownerKey: string, streamUuid: MessengerUuid): void {
  removedStreamUuidsByOwnerKey.get(ownerKey)?.delete(streamUuid);
}

function withoutRemovedStreamProjections(
  ownerKey: string,
  payload: MessengerBootstrapPayload,
): MessengerBootstrapPayload {
  const removedStreamUuids = removedStreamUuidsByOwnerKey.get(ownerKey);
  if (removedStreamUuids == null || removedStreamUuids.size === 0) return payload;
  return {
    streams: payload.streams.filter((stream) => !removedStreamUuids.has(stream.uuid)),
    streamBindings: payload.streamBindings.filter(
      (binding) => !removedStreamUuids.has(binding.streamUuid),
    ),
    topics: payload.topics.filter((topic) => !removedStreamUuids.has(topic.streamUuid)),
    conversations: payload.conversations.filter(
      (conversation) => !removedStreamUuids.has(conversation.streamUuid),
    ),
    folders: payload.folders.map((folder) =>
      removeDeletedStreamItemsFromFolder(folder, removedStreamUuids),
    ),
  };
}

function createInitialState(): Omit<
  MessengerStoreState,
  | "startBootstrap"
  | "finishBootstrapSilently"
  | "replaceBootstrapState"
  | "replaceFolderSnapshots"
  | "upsertStream"
  | "removeStream"
  | "upsertStreamBindings"
  | "replaceStreamBindingsForStream"
  | "markStreamBindingsLoaded"
  | "removeStreamBinding"
  | "upsertTopic"
  | "removeTopic"
  | "applyMessagePointer"
  | "clearMessagePointer"
  | "applyFolderSnapshot"
  | "removeFolder"
  | "upsertFolderItem"
  | "removeFolderItem"
  | "setRealtimeInitialSyncReady"
  | "setRealtimeCursor"
  | "markRealtimeEventSkipped"
  | "setBootstrapError"
  | "clear"
> {
  return {
    ownerKey: null,
    isLoading: false,
    error: null,
    lastLoadedAt: null,
    bootstrapRequestVersion: 0,
    realtimeReadyOwnerKey: null,
    realtimeReadyRuntimeGeneration: null,
    ...createEmptyMessengerData(),
  };
}

function nextBootstrapRequestVersion(): number {
  lastBootstrapRequestVersion += 1;
  return lastBootstrapRequestVersion;
}

function appendUniqueId<TId extends string>(ids: TId[], id: TId): TId[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function removeId<TId extends string>(ids: TId[], id: TId): TId[] {
  return ids.filter((item) => item !== id);
}

function projectStreamUnreadIntoFolders(
  foldersById: Readonly<Record<MessengerUuid, MessengerFolder>>,
  stream: Pick<
    MessengerStream,
    "uuid" | "unreadCount" | "activeUnreadCount" | "passiveUnreadCount"
  >,
): Record<MessengerUuid, MessengerFolder> {
  let nextFoldersById: Record<MessengerUuid, MessengerFolder> | null = null;
  const activeUnreadCount = stream.activeUnreadCount ?? stream.unreadCount;
  const passiveUnreadCount = stream.passiveUnreadCount ?? 0;

  for (const [folderUuid, folder] of Object.entries(foldersById)) {
    let nextItems: MessengerFolderItem[] | null = null;
    let unreadDelta = 0;

    for (const [index, item] of folder.items.entries()) {
      if (item.streamUuid !== stream.uuid) continue;
      if (
        item.unreadCount === stream.unreadCount &&
        (item.activeUnreadCount ?? item.unreadCount) === activeUnreadCount &&
        (item.passiveUnreadCount ?? 0) === passiveUnreadCount
      ) {
        continue;
      }

      nextItems ??= [...folder.items];
      nextItems[index] = {
        ...item,
        unreadCount: stream.unreadCount,
        activeUnreadCount,
        passiveUnreadCount,
      };
      unreadDelta += activeUnreadCount - (item.activeUnreadCount ?? item.unreadCount);
    }

    if (nextItems == null) continue;
    nextFoldersById ??= { ...foldersById };
    nextFoldersById[folderUuid] = {
      ...folder,
      unreadCount: Math.max(0, folder.unreadCount + unreadDelta),
      items: nextItems,
    };
  }

  return nextFoldersById ?? foldersById;
}

function compareIsoDateStrings(a: string | null | undefined, b: string | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a.localeCompare(b);
}

function isMessageFreshForContainer(
  message: MessengerMessage,
  currentLastMessageUuid: MessengerUuid | null | undefined,
  containerUpdatedAt?: string,
): boolean {
  if (currentLastMessageUuid == null) return true;
  if (currentLastMessageUuid === message.uuid) return true;
  return (
    containerUpdatedAt == null || compareIsoDateStrings(message.createdAt, containerUpdatedAt) >= 0
  );
}

function applyMessageFreshness(
  state: MessengerFreshnessState,
  message: MessengerMessage,
): MessengerFreshnessState {
  let nextStreamsById = state.streamsById;
  let nextTopicsById = state.topicsById;
  let nextConversationsById = state.conversationsById;

  const stream = state.streamsById[message.streamUuid];
  if (
    stream != null &&
    isMessageFreshForContainer(message, stream.lastMessageUuid, stream.updatedAt)
  ) {
    const nextStream = {
      ...stream,
      lastMessageUuid: message.uuid,
      updatedAt:
        compareIsoDateStrings(message.createdAt, stream.updatedAt) > 0
          ? message.createdAt
          : stream.updatedAt,
    };
    inheritWorkspaceStreamNotificationTransition(stream, nextStream);
    nextStreamsById = {
      ...nextStreamsById,
      [stream.uuid]: nextStream,
    };
  }

  const topic = state.topicsById[message.topicUuid];
  if (
    topic != null &&
    isMessageFreshForContainer(message, topic.lastMessageUuid, topic.updatedAt)
  ) {
    nextTopicsById = {
      ...nextTopicsById,
      [topic.uuid]: {
        ...topic,
        lastMessageUuid: message.uuid,
        updatedAt:
          compareIsoDateStrings(message.createdAt, topic.updatedAt) > 0
            ? message.createdAt
            : topic.updatedAt,
      },
    };
  }

  const streamConversationId = conversationIdForStream(message.streamUuid);
  const streamConversation = state.conversationsById[streamConversationId];
  if (
    streamConversation != null &&
    isMessageFreshForContainer(message, streamConversation.lastMessageUuid)
  ) {
    nextConversationsById = {
      ...nextConversationsById,
      [streamConversationId]: {
        ...streamConversation,
        lastMessageUuid: message.uuid,
      },
    };
  }

  const topicConversation = state.conversationsById[message.conversationId];
  if (
    topicConversation != null &&
    isMessageFreshForContainer(message, topicConversation.lastMessageUuid)
  ) {
    nextConversationsById = {
      ...nextConversationsById,
      [message.conversationId]: {
        ...topicConversation,
        lastMessageUuid: message.uuid,
      },
    };
  }

  return {
    streamsById: nextStreamsById,
    topicsById: nextTopicsById,
    conversationsById: nextConversationsById,
  };
}

function clearDeletedMessageFreshness(
  state: Pick<MessengerDomainData, "streamsById" | "topicsById" | "conversationsById">,
  message: MessengerDeletedMessage,
): Pick<MessengerDomainData, "streamsById" | "topicsById" | "conversationsById"> {
  let nextStreamsById = state.streamsById;
  let nextTopicsById = state.topicsById;
  let nextConversationsById = state.conversationsById;

  const stream = state.streamsById[message.streamUuid];
  if (stream?.lastMessageUuid === message.uuid) {
    const nextStream = {
      ...stream,
      lastMessageUuid: null,
    };
    inheritWorkspaceStreamNotificationTransition(stream, nextStream);
    nextStreamsById = {
      ...nextStreamsById,
      [stream.uuid]: nextStream,
    };
  }

  const topic = state.topicsById[message.topicUuid];
  if (topic?.lastMessageUuid === message.uuid) {
    nextTopicsById = {
      ...nextTopicsById,
      [topic.uuid]: {
        ...topic,
        lastMessageUuid: null,
      },
    };
  }

  const streamConversationId = conversationIdForStream(message.streamUuid);
  const streamConversation = state.conversationsById[streamConversationId];
  if (streamConversation?.lastMessageUuid === message.uuid) {
    nextConversationsById = {
      ...nextConversationsById,
      [streamConversationId]: {
        ...streamConversation,
        lastMessageUuid: null,
      },
    };
  }

  const topicConversationId = conversationIdForTopic(message.streamUuid, message.topicUuid);
  const topicConversation = state.conversationsById[topicConversationId];
  if (topicConversation?.lastMessageUuid === message.uuid) {
    nextConversationsById = {
      ...nextConversationsById,
      [topicConversationId]: {
        ...topicConversation,
        lastMessageUuid: null,
      },
    };
  }

  return {
    streamsById: nextStreamsById,
    topicsById: nextTopicsById,
    conversationsById: nextConversationsById,
  };
}

function rebuildFolderWithItems(
  folder: MessengerFolder,
  items: MessengerFolderItem[],
  options?: { preserveUnreadCount?: boolean },
): MessengerFolder {
  return {
    ...folder,
    items,
    // For realtime folder_item.deleted, the backend does not send a new folder counter.
    // Keep the Folder DTO as source of truth until the next folder.updated snapshot.
    unreadCount:
      options?.preserveUnreadCount === true
        ? folder.unreadCount
        : items.reduce((total, item) => total + (item.activeUnreadCount ?? item.unreadCount), 0),
  };
}

function removeDeletedStreamItemsFromFolder(
  folder: MessengerFolder,
  removedStreamUuids: ReadonlySet<MessengerUuid> | undefined,
): MessengerFolder {
  if (removedStreamUuids == null || removedStreamUuids.size === 0) return folder;
  const items = folder.items.filter((item) => !removedStreamUuids.has(item.streamUuid));
  return items.length === folder.items.length ? folder : rebuildFolderWithItems(folder, items);
}

function conversationFromStream(stream: MessengerStream): MessengerConversation {
  return {
    id: conversationIdForStream(stream.uuid),
    streamUuid: stream.uuid,
    title: stream.name,
    audience: stream.audience,
    isPrivate: stream.isPrivate,
    unreadCount: stream.unreadCount,
    activeUnreadCount: stream.activeUnreadCount,
    passiveUnreadCount: stream.passiveUnreadCount,
    isArchived: stream.isArchived,
    directUserUuid: stream.directUserUuid,
    lastMessageUuid: stream.lastMessageUuid,
    notificationMode: stream.notificationMode,
  };
}

// Topic conversations inherit stream-level audience and archive context.
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
    activeUnreadCount: topic.activeUnreadCount,
    passiveUnreadCount: topic.passiveUnreadCount,
    isArchived: stream.isArchived,
    directUserUuid: stream.directUserUuid,
    lastMessageUuid: topic.lastMessageUuid,
    notificationMode: topic.notificationMode,
    isDone: topic.isDone,
    isDefaultTopic: topic.isDefault,
  };
}

function upsertConversation(
  state: Pick<MessengerDomainData, "conversationsById" | "conversationIds">,
  conversation: MessengerConversation,
): Pick<MessengerDomainData, "conversationsById" | "conversationIds"> {
  return {
    conversationsById: {
      ...state.conversationsById,
      [conversation.id]: conversation,
    },
    conversationIds: appendUniqueId(state.conversationIds, conversation.id),
  };
}

type MessengerStreamBindingsUpsertState = Pick<
  MessengerDomainData,
  | "streamBindingsById"
  | "streamBindingIds"
  | "streamBindingIdsByStreamId"
  | "streamsById"
  | "topicIds"
  | "topicsById"
  | "conversationsById"
  | "conversationIds"
>;

function applyStreamBindingUpserts(
  state: MessengerStreamBindingsUpsertState,
  bindings: MessengerStreamBinding[],
): Pick<
  MessengerDomainData,
  | "streamBindingsById"
  | "streamBindingIds"
  | "streamBindingIdsByStreamId"
  | "conversationsById"
  | "conversationIds"
> {
  const nextStreamBindingsById = { ...state.streamBindingsById };
  let nextStreamBindingIds = state.streamBindingIds;
  const nextStreamBindingIdsByStreamId = { ...state.streamBindingIdsByStreamId };
  let nextConversationsById = state.conversationsById;
  let nextConversationIds = state.conversationIds;

  for (const binding of bindings) {
    const previous = nextStreamBindingsById[binding.uuid];
    if (previous != null && previous.streamUuid !== binding.streamUuid) {
      nextStreamBindingIdsByStreamId[previous.streamUuid] = removeId(
        nextStreamBindingIdsByStreamId[previous.streamUuid] ?? EMPTY_IDS,
        binding.uuid,
      );
    }

    nextStreamBindingsById[binding.uuid] = binding;
    nextStreamBindingIds = appendUniqueId(nextStreamBindingIds, binding.uuid);
    nextStreamBindingIdsByStreamId[binding.streamUuid] = appendUniqueId(
      nextStreamBindingIdsByStreamId[binding.streamUuid] ?? EMPTY_IDS,
      binding.uuid,
    );

    const stream = state.streamsById[binding.streamUuid];
    if (stream == null) continue;

    // stream_binding shows that the current user can see the stream.
    // The binding event must revive the chat surface even if the stream snapshot was already in store.
    let conversationState = upsertConversation(
      {
        conversationsById: nextConversationsById,
        conversationIds: nextConversationIds,
      },
      conversationFromStream(stream),
    );
    for (const topicId of state.topicIds) {
      const topic = state.topicsById[topicId];
      if (topic?.streamUuid !== stream.uuid) continue;
      conversationState = upsertConversation(
        conversationState,
        conversationFromTopic(topic, stream),
      );
    }
    nextConversationsById = conversationState.conversationsById;
    nextConversationIds = conversationState.conversationIds;
  }

  return {
    streamBindingsById: nextStreamBindingsById,
    streamBindingIds: nextStreamBindingIds,
    streamBindingIdsByStreamId: nextStreamBindingIdsByStreamId,
    conversationsById: nextConversationsById,
    conversationIds: nextConversationIds,
  };
}

// Bootstrap builds indexes once, then realtime actions update them incrementally.
function buildMessengerDomainData(payload: MessengerBootstrapPayload): MessengerDomainData {
  const streamsById: Record<MessengerUuid, MessengerStream> = {};
  const streamIds: MessengerUuid[] = [];
  const streamBindingsById: Record<MessengerUuid, MessengerStreamBinding> = {};
  const streamBindingIds: MessengerUuid[] = [];
  const streamBindingIdsByStreamId: Record<MessengerUuid, MessengerUuid[]> = {};
  const topicsById: Record<MessengerUuid, MessengerTopic> = {};
  const topicIds: MessengerUuid[] = [];
  const conversationsById: Record<MessengerConversationId, MessengerConversation> = {};
  const conversationIds: MessengerConversationId[] = [];
  const foldersById: Record<MessengerUuid, MessengerFolder> = {};
  const folderIds: MessengerUuid[] = [];

  for (const stream of payload.streams) {
    streamsById[stream.uuid] = stream;
    streamIds.push(stream.uuid);
  }

  for (const binding of payload.streamBindings) {
    streamBindingsById[binding.uuid] = binding;
    streamBindingIds.push(binding.uuid);
    streamBindingIdsByStreamId[binding.streamUuid] = appendUniqueId(
      streamBindingIdsByStreamId[binding.streamUuid] ?? EMPTY_IDS,
      binding.uuid,
    );
  }

  for (const topic of payload.topics) {
    topicsById[topic.uuid] = topic;
    topicIds.push(topic.uuid);
  }

  for (const conversation of payload.conversations) {
    conversationsById[conversation.id] = conversation;
    conversationIds.push(conversation.id);
  }

  for (const folder of payload.folders) {
    foldersById[folder.uuid] = normalizeMessengerFolderSystemType(folder);
    folderIds.push(folder.uuid);
  }

  return {
    streamsById,
    streamIds,
    streamBindingsById,
    streamBindingIds,
    streamBindingIdsByStreamId,
    streamBindingsLoadedByStreamId: {},
    topicsById,
    topicIds,
    conversationsById,
    conversationIds,
    foldersById,
    folderIds,
    lastEpochVersion: null,
    skippedRealtimeEvents: EMPTY_SKIPPED_REALTIME_EVENTS,
  };
}

function mergePostFenceCatalogMutations(
  ownerKey: string,
  current: MessengerStoreState,
  incoming: MessengerDomainData,
  fence: number,
): MessengerDomainData {
  const mutations = catalogMutationsByOwnerKey.get(ownerKey);
  if (mutations == null || mutations.revision <= fence) {
    return {
      ...incoming,
      lastEpochVersion: current.lastEpochVersion,
      skippedRealtimeEvents: current.skippedRealtimeEvents,
    };
  }

  const streamsById = { ...incoming.streamsById };
  let streamIds = [...incoming.streamIds];
  const topicsById = { ...incoming.topicsById };
  let topicIds = [...incoming.topicIds];
  const changedStreamUuids = new Set<MessengerUuid>();
  const changedTopicUuids = new Set<MessengerUuid>();

  for (const [streamUuid, mutation] of mutations.streamsById) {
    if (mutation.revision <= fence) continue;
    changedStreamUuids.add(streamUuid);
    const currentStream = current.streamsById[streamUuid];
    const incomingStream = streamsById[streamUuid];
    if (currentStream == null) {
      delete streamsById[streamUuid];
      streamIds = removeId(streamIds, streamUuid);
      continue;
    }

    streamsById[streamUuid] =
      incomingStream == null || mutation.authoritativeRevision > fence
        ? currentStream
        : {
            ...incomingStream,
            ...(mutation.unreadRevision > fence
              ? {
                  unreadCount: currentStream.unreadCount,
                  activeUnreadCount: currentStream.activeUnreadCount,
                  passiveUnreadCount: currentStream.passiveUnreadCount,
                }
              : {}),
            ...(mutation.freshnessRevision > fence
              ? {
                  lastMessageUuid: currentStream.lastMessageUuid,
                  updatedAt:
                    compareIsoDateStrings(currentStream.updatedAt, incomingStream.updatedAt) > 0
                      ? currentStream.updatedAt
                      : incomingStream.updatedAt,
                }
              : {}),
            ...(mutation.reclassificationRevision > fence
              ? {
                  notificationMode: currentStream.notificationMode,
                  activeUnreadCount: currentStream.activeUnreadCount,
                  passiveUnreadCount: currentStream.passiveUnreadCount,
                }
              : {}),
          };
    streamIds = appendUniqueId(streamIds, streamUuid);
  }

  for (const [topicUuid, mutation] of mutations.topicsById) {
    if (mutation.revision <= fence) continue;
    changedTopicUuids.add(topicUuid);
    const currentTopic = current.topicsById[topicUuid];
    const incomingTopic = topicsById[topicUuid];
    if (currentTopic == null) {
      delete topicsById[topicUuid];
      topicIds = removeId(topicIds, topicUuid);
      continue;
    }

    topicsById[topicUuid] =
      incomingTopic == null || mutation.authoritativeRevision > fence
        ? currentTopic
        : {
            ...incomingTopic,
            ...(mutation.unreadRevision > fence
              ? {
                  unreadCount: currentTopic.unreadCount,
                  activeUnreadCount: currentTopic.activeUnreadCount,
                  passiveUnreadCount: currentTopic.passiveUnreadCount,
                }
              : {}),
            ...(mutation.freshnessRevision > fence
              ? {
                  lastMessageUuid: currentTopic.lastMessageUuid,
                  updatedAt:
                    compareIsoDateStrings(currentTopic.updatedAt, incomingTopic.updatedAt) > 0
                      ? currentTopic.updatedAt
                      : incomingTopic.updatedAt,
                }
              : {}),
            ...(mutation.reclassificationRevision > fence
              ? {
                  notificationMode: currentTopic.notificationMode,
                  activeUnreadCount: currentTopic.activeUnreadCount,
                  passiveUnreadCount: currentTopic.passiveUnreadCount,
                }
              : {}),
          };
    topicIds = appendUniqueId(topicIds, topicUuid);
  }

  // A mode update can finish while the stream counters are present but topic
  // metadata is still loading. Reclassify each previously missing topic as an
  // older fenced bootstrap supplies it, instead of leaving the aggregate
  // stream badge in its pre-update bucket.
  for (const topicUuid of topicIds) {
    if (current.topicsById[topicUuid] != null) continue;
    const topic = topicsById[topicUuid];
    if (topic == null) continue;
    const stream = streamsById[topic.streamUuid];
    if (stream == null) continue;
    const deferredReclassification = consumeWorkspaceStreamUnreadReclassification(
      ownerKey,
      topic.streamUuid,
      topic.notificationMode,
      topic.unreadCount,
    );
    if (deferredReclassification == null) continue;

    const nextStream = {
      ...stream,
      activeUnreadCount: Math.max(
        0,
        (stream.activeUnreadCount ?? stream.unreadCount - (stream.passiveUnreadCount ?? 0)) +
          deferredReclassification.activeDelta,
      ),
      passiveUnreadCount: Math.max(
        0,
        (stream.passiveUnreadCount ?? 0) + deferredReclassification.passiveDelta,
      ),
    };
    inheritWorkspaceStreamNotificationTransition(stream, nextStream);
    streamsById[stream.uuid] = nextStream;
    topicsById[topicUuid] = {
      ...topic,
      activeUnreadCount: deferredReclassification.activeUnreadCount,
      passiveUnreadCount: deferredReclassification.passiveUnreadCount,
    };
    changedStreamUuids.add(stream.uuid);
    changedTopicUuids.add(topicUuid);
    recordCatalogMutation(ownerKey, "stream", stream.uuid, "reclassification");
    recordCatalogMutation(ownerKey, "topic", topicUuid, "reclassification");
  }

  let conversationsById = { ...incoming.conversationsById };
  let conversationIds = [...incoming.conversationIds];
  for (const streamUuid of changedStreamUuids) {
    const streamConversationId = conversationIdForStream(streamUuid);
    const stream = streamsById[streamUuid];
    if (stream == null) {
      delete conversationsById[streamConversationId];
      conversationIds = removeId(conversationIds, streamConversationId);
      continue;
    }
    const conversationState = upsertConversation(
      { conversationsById, conversationIds },
      conversationFromStream(stream),
    );
    conversationsById = conversationState.conversationsById;
    conversationIds = conversationState.conversationIds;
    for (const topicUuid of topicIds) {
      const topic = topicsById[topicUuid];
      if (topic?.streamUuid !== streamUuid) continue;
      const topicConversationState = upsertConversation(
        { conversationsById, conversationIds },
        conversationFromTopic(topic, stream),
      );
      conversationsById = topicConversationState.conversationsById;
      conversationIds = topicConversationState.conversationIds;
    }
  }
  for (const topicUuid of changedTopicUuids) {
    const topic = topicsById[topicUuid];
    const fallbackStreamUuid = incoming.topicsById[topicUuid]?.streamUuid;
    if (topic == null) {
      if (fallbackStreamUuid != null) {
        const conversationId = conversationIdForTopic(fallbackStreamUuid, topicUuid);
        delete conversationsById[conversationId];
        conversationIds = removeId(conversationIds, conversationId);
      }
      continue;
    }
    const stream = streamsById[topic.streamUuid];
    if (stream == null) continue;
    const conversationState = upsertConversation(
      { conversationsById, conversationIds },
      conversationFromTopic(topic, stream),
    );
    conversationsById = conversationState.conversationsById;
    conversationIds = conversationState.conversationIds;
  }

  let foldersById = incoming.foldersById;
  for (const streamUuid of changedStreamUuids) {
    const stream = streamsById[streamUuid];
    if (stream != null) foldersById = projectStreamUnreadIntoFolders(foldersById, stream);
  }

  return {
    ...incoming,
    streamsById,
    streamIds,
    topicsById,
    topicIds,
    conversationsById,
    conversationIds,
    foldersById,
    lastEpochVersion: current.lastEpochVersion,
    skippedRealtimeEvents: current.skippedRealtimeEvents,
  };
}

export const useMessengerStore = create<MessengerStoreState>((set) => ({
  ...createInitialState(),

  startBootstrap(ownerKey) {
    const bootstrapRequestVersion = nextBootstrapRequestVersion();
    logStoreAction("messenger", "startBootstrap", { ownerKey, bootstrapRequestVersion });
    set((state) => {
      if (state.ownerKey === ownerKey) {
        return {
          isLoading: true,
          error: null,
          bootstrapRequestVersion,
        };
      }

      if (state.ownerKey != null) {
        clearMessengerCatalogRuntimeCoverage(state.ownerKey);
        clearWorkspaceStreamUnreadReclassificationsForOwner(state.ownerKey);
      }

      return {
        ...createEmptyMessengerData(),
        ownerKey,
        isLoading: true,
        error: null,
        lastLoadedAt: null,
        bootstrapRequestVersion,
        realtimeReadyOwnerKey:
          state.realtimeReadyOwnerKey === ownerKey ? state.realtimeReadyOwnerKey : null,
        realtimeReadyRuntimeGeneration:
          state.realtimeReadyOwnerKey === ownerKey ? state.realtimeReadyRuntimeGeneration : null,
      };
    });
    return bootstrapRequestVersion;
  },

  finishBootstrapSilently(ownerKey) {
    logStoreAction("messenger", "finishBootstrapSilently", { ownerKey });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      return {
        isLoading: false,
        error: null,
      };
    });
  },

  replaceBootstrapState(ownerKey, payload, options) {
    logStoreAction("messenger", "replaceBootstrapState", {
      ownerKey,
      streams: payload.streams.length,
      streamBindings: payload.streamBindings.length,
      topics: payload.topics.length,
      conversations: payload.conversations.length,
      folders: payload.folders.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (options?.coversCatalogMutationFence === true && options.catalogMutationFence != null) {
        recordCatalogSnapshotCoverage(ownerKey, payload, options.catalogMutationFence);
      }
      const safePayload = withoutRemovedStreamProjections(ownerKey, payload);
      const incomingDomainData = buildMessengerDomainData(safePayload);
      const nextDomainData =
        options?.catalogMutationFence == null
          ? incomingDomainData
          : mergePostFenceCatalogMutations(
              ownerKey,
              state,
              incomingDomainData,
              options.catalogMutationFence,
            );
      const streamBindingsState =
        safePayload.streamBindings.length > 0
          ? {
              streamBindingsById: nextDomainData.streamBindingsById,
              streamBindingIds: nextDomainData.streamBindingIds,
              streamBindingIdsByStreamId: nextDomainData.streamBindingIdsByStreamId,
              streamBindingsLoadedByStreamId: {},
            }
          : {
              streamBindingsById: state.streamBindingsById,
              streamBindingIds: state.streamBindingIds,
              streamBindingIdsByStreamId: state.streamBindingIdsByStreamId,
              streamBindingsLoadedByStreamId: state.streamBindingsLoadedByStreamId,
            };

      return {
        ...nextDomainData,
        ...streamBindingsState,
        ownerKey,
        isLoading: false,
        error: null,
        lastLoadedAt: Date.now(),
      };
    });
  },

  replaceFolderSnapshots(ownerKey, folders, options) {
    logStoreAction("messenger", "replaceFolderSnapshots", {
      ownerKey,
      folders: folders.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const removedStreamUuids = removedStreamUuidsByOwnerKey.get(ownerKey);
      const foldersById: Record<MessengerUuid, MessengerFolder> = {};
      const folderIds: MessengerUuid[] = [];
      for (const folder of folders) {
        const normalizedFolder = normalizeMessengerFolderSystemType(folder);
        foldersById[folder.uuid] = removeDeletedStreamItemsFromFolder(
          normalizedFolder,
          removedStreamUuids,
        );
        folderIds.push(folder.uuid);
      }

      let nextFoldersById = foldersById;
      const mutationFence = options?.catalogMutationFence;
      const mutations = catalogMutationsByOwnerKey.get(ownerKey);
      if (mutationFence != null && mutations != null && mutations.revision > mutationFence) {
        for (const [streamUuid, mutation] of mutations.streamsById) {
          if (
            mutation.unreadRevision <= mutationFence &&
            mutation.authoritativeRevision <= mutationFence &&
            mutation.reclassificationRevision <= mutationFence
          ) {
            continue;
          }
          const stream = state.streamsById[streamUuid];
          if (stream != null) {
            nextFoldersById = projectStreamUnreadIntoFolders(nextFoldersById, stream);
          }
        }
      }

      return {
        foldersById: nextFoldersById,
        folderIds,
      };
    });
  },

  upsertStream(ownerKey, stream, options) {
    logStoreAction("messenger", "upsertStream", { ownerKey, streamUuid: stream.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (removedStreamsForOwner(ownerKey).has(stream.uuid)) return state;
      if (options?.kind !== "transient") {
        recordCatalogMutation(ownerKey, "stream", stream.uuid, options?.kind ?? "authoritative");
      }
      if (options?.kind == null || options.kind === "authoritative") {
        clearWorkspaceStreamUnreadReclassification(ownerKey, stream.uuid);
      }

      let conversationState = upsertConversation(state, conversationFromStream(stream));
      for (const topicId of state.topicIds) {
        const topic = state.topicsById[topicId];
        if (topic?.streamUuid !== stream.uuid) continue;
        conversationState = upsertConversation(
          conversationState,
          conversationFromTopic(topic, stream),
        );
      }

      return {
        streamsById: {
          ...state.streamsById,
          [stream.uuid]: stream,
        },
        streamIds: appendUniqueId(state.streamIds, stream.uuid),
        foldersById: projectStreamUnreadIntoFolders(state.foldersById, stream),
        ...conversationState,
      };
    });
  },

  removeStream(ownerKey, stream) {
    logStoreAction("messenger", "removeStream", { ownerKey, streamUuid: stream.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      markMessengerStreamRemoved(ownerKey, stream.uuid);
      clearWorkspaceStreamUnreadReclassification(ownerKey, stream.uuid);
      recordCatalogMutation(ownerKey, "stream", stream.uuid, "authoritative");

      const nextStreamsById = { ...state.streamsById };
      delete nextStreamsById[stream.uuid];

      const removedTopicIds = state.topicIds.filter(
        (topicId) => state.topicsById[topicId]?.streamUuid === stream.uuid,
      );
      const nextTopicsById = { ...state.topicsById };
      for (const topicId of removedTopicIds) {
        delete nextTopicsById[topicId];
      }

      const removedConversationIds = [
        conversationIdForStream(stream.uuid),
        ...removedTopicIds.map((topicId) => conversationIdForTopic(stream.uuid, topicId)),
      ];
      const nextConversationsById = { ...state.conversationsById };
      for (const conversationId of removedConversationIds) {
        delete nextConversationsById[conversationId];
      }

      const removedBindingIds = state.streamBindingIdsByStreamId[stream.uuid] ?? EMPTY_IDS;
      const nextStreamBindingsById = { ...state.streamBindingsById };
      for (const bindingId of removedBindingIds) {
        delete nextStreamBindingsById[bindingId];
      }
      const nextStreamBindingIdsByStreamId = { ...state.streamBindingIdsByStreamId };
      delete nextStreamBindingIdsByStreamId[stream.uuid];
      const nextStreamBindingsLoadedByStreamId = { ...state.streamBindingsLoadedByStreamId };
      delete nextStreamBindingsLoadedByStreamId[stream.uuid];
      let nextFoldersById = state.foldersById;
      for (const folderId of state.folderIds) {
        const folder = state.foldersById[folderId];
        if (folder == null) continue;
        const nextItems = folder.items.filter((item) => item.streamUuid !== stream.uuid);
        if (nextItems.length === folder.items.length) continue;
        if (nextFoldersById === state.foldersById) {
          nextFoldersById = { ...state.foldersById };
        }
        nextFoldersById[folderId] = rebuildFolderWithItems(folder, nextItems);
      }
      return {
        streamsById: nextStreamsById,
        streamIds: removeId(state.streamIds, stream.uuid),
        topicsById: nextTopicsById,
        topicIds: state.topicIds.filter((topicId) => !removedTopicIds.includes(topicId)),
        conversationsById: nextConversationsById,
        conversationIds: state.conversationIds.filter(
          (conversationId) => !removedConversationIds.includes(conversationId),
        ),
        streamBindingsById: nextStreamBindingsById,
        streamBindingIds: state.streamBindingIds.filter(
          (bindingId) => !removedBindingIds.includes(bindingId),
        ),
        streamBindingIdsByStreamId: nextStreamBindingIdsByStreamId,
        streamBindingsLoadedByStreamId: nextStreamBindingsLoadedByStreamId,
        foldersById: nextFoldersById,
      };
    });
  },

  upsertStreamBindings(ownerKey, bindings) {
    logStoreAction("messenger", "upsertStreamBindings", { ownerKey, bindings: bindings.length });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const removedStreamUuids = removedStreamUuidsByOwnerKey.get(ownerKey);
      return applyStreamBindingUpserts(
        state,
        removedStreamUuids == null
          ? bindings
          : bindings.filter((binding) => !removedStreamUuids.has(binding.streamUuid)),
      );
    });
  },

  replaceStreamBindingsForStream(ownerKey, streamUuid, bindings) {
    logStoreAction("messenger", "replaceStreamBindingsForStream", {
      ownerKey,
      streamUuid,
      bindings: bindings.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (removedStreamsForOwner(ownerKey).has(streamUuid)) return state;

      // Realtime-события добавляют bindings через upsert, а backend full load
      // приходит как снимок stream-а. Здесь удаляем только устаревшие bindings
      // этого streamUuid и не трогаем участников других каналов.
      const snapshotBindingIds = new Set(bindings.map((binding) => binding.uuid));
      const previousBindingIds = state.streamBindingIdsByStreamId[streamUuid] ?? EMPTY_IDS;
      const removedBindingIds = previousBindingIds.filter(
        (bindingId) => !snapshotBindingIds.has(bindingId),
      );
      const nextStreamBindingsById = { ...state.streamBindingsById };
      for (const bindingId of removedBindingIds) {
        delete nextStreamBindingsById[bindingId];
      }

      const nextState = applyStreamBindingUpserts(
        {
          ...state,
          streamBindingsById: nextStreamBindingsById,
          streamBindingIds: state.streamBindingIds.filter(
            (bindingId) => !removedBindingIds.includes(bindingId),
          ),
          streamBindingIdsByStreamId: {
            ...state.streamBindingIdsByStreamId,
            [streamUuid]: previousBindingIds.filter((bindingId) =>
              snapshotBindingIds.has(bindingId),
            ),
          },
        },
        bindings,
      );

      return {
        ...nextState,
        streamBindingsLoadedByStreamId: {
          ...state.streamBindingsLoadedByStreamId,
          [streamUuid]: true,
        },
      };
    });
  },

  markStreamBindingsLoaded(ownerKey, streamUuid) {
    logStoreAction("messenger", "markStreamBindingsLoaded", { ownerKey, streamUuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (removedStreamsForOwner(ownerKey).has(streamUuid)) return state;
      if (state.streamBindingsLoadedByStreamId[streamUuid] === true) return state;

      return {
        streamBindingsLoadedByStreamId: {
          ...state.streamBindingsLoadedByStreamId,
          [streamUuid]: true,
        },
      };
    });
  },

  removeStreamBinding(ownerKey, binding) {
    logStoreAction("messenger", "removeStreamBinding", {
      ownerKey,
      bindingUuid: binding.uuid,
      streamUuid: binding.streamUuid,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      // После DELETE backend не рассылает всем участникам отдельное
      // stream_bindings.deleted событие, поэтому инициатор чистит свой локальный
      // список сразу после успешного ответа API.
      const previous = state.streamBindingsById[binding.uuid];
      const streamUuid = previous?.streamUuid ?? binding.streamUuid;
      const streamBindingIds = state.streamBindingIdsByStreamId[streamUuid] ?? EMPTY_IDS;
      if (previous == null && !streamBindingIds.includes(binding.uuid)) return state;

      const nextStreamBindingsById = { ...state.streamBindingsById };
      delete nextStreamBindingsById[binding.uuid];

      return {
        streamBindingsById: nextStreamBindingsById,
        streamBindingIds: removeId(state.streamBindingIds, binding.uuid),
        streamBindingIdsByStreamId: {
          ...state.streamBindingIdsByStreamId,
          [streamUuid]: removeId(streamBindingIds, binding.uuid),
        },
      };
    });
  },

  upsertTopic(ownerKey, topic, options) {
    logStoreAction("messenger", "upsertTopic", { ownerKey, topicUuid: topic.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (removedStreamsForOwner(ownerKey).has(topic.streamUuid)) return state;
      if (options?.kind !== "transient") {
        recordCatalogMutation(ownerKey, "topic", topic.uuid, options?.kind ?? "authoritative");
      }

      const previous = state.topicsById[topic.uuid];
      const currentStream = state.streamsById[topic.streamUuid];
      const deferredReclassification =
        currentStream == null || previous != null
          ? null
          : consumeWorkspaceStreamUnreadReclassification(
              ownerKey,
              topic.streamUuid,
              topic.notificationMode,
              topic.unreadCount,
            );
      const nextTopic =
        deferredReclassification == null
          ? topic
          : {
              ...topic,
              activeUnreadCount: deferredReclassification.activeUnreadCount,
              passiveUnreadCount: deferredReclassification.passiveUnreadCount,
            };
      let nextStreamsById = state.streamsById;
      let nextFoldersById = state.foldersById;
      let stream = currentStream;
      if (currentStream != null && deferredReclassification != null) {
        stream = {
          ...currentStream,
          activeUnreadCount: Math.max(
            0,
            (currentStream.activeUnreadCount ??
              currentStream.unreadCount - (currentStream.passiveUnreadCount ?? 0)) +
              deferredReclassification.activeDelta,
          ),
          passiveUnreadCount: Math.max(
            0,
            (currentStream.passiveUnreadCount ?? 0) + deferredReclassification.passiveDelta,
          ),
        };
        inheritWorkspaceStreamNotificationTransition(currentStream, stream);
        nextStreamsById = { ...state.streamsById, [stream.uuid]: stream };
        nextFoldersById = projectStreamUnreadIntoFolders(state.foldersById, stream);
        recordCatalogMutation(ownerKey, "stream", stream.uuid, "reclassification");
        recordCatalogMutation(ownerKey, "topic", topic.uuid, "reclassification");
      }

      let nextConversationsById = state.conversationsById;
      let nextConversationIds = state.conversationIds;

      if (previous != null && previous.streamUuid !== topic.streamUuid) {
        const previousConversationId = conversationIdForTopic(previous.streamUuid, topic.uuid);
        nextConversationsById = { ...nextConversationsById };
        delete nextConversationsById[previousConversationId];
        nextConversationIds = removeId(nextConversationIds, previousConversationId);
      }

      if (stream != null) {
        const streamConversationState = upsertConversation(
          {
            conversationsById: nextConversationsById,
            conversationIds: nextConversationIds,
          },
          conversationFromStream(stream),
        );
        const conversationState = upsertConversation(
          {
            conversationsById: streamConversationState.conversationsById,
            conversationIds: streamConversationState.conversationIds,
          },
          conversationFromTopic(nextTopic, stream),
        );
        nextConversationsById = conversationState.conversationsById;
        nextConversationIds = conversationState.conversationIds;
      }

      return {
        streamsById: nextStreamsById,
        topicsById: {
          ...state.topicsById,
          [topic.uuid]: nextTopic,
        },
        topicIds: appendUniqueId(state.topicIds, topic.uuid),
        conversationsById: nextConversationsById,
        conversationIds: nextConversationIds,
        foldersById: nextFoldersById,
      };
    });
  },

  removeTopic(ownerKey, topic) {
    logStoreAction("messenger", "removeTopic", { ownerKey, topicUuid: topic.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      recordCatalogMutation(ownerKey, "topic", topic.uuid, "authoritative");

      const nextTopicsById = { ...state.topicsById };
      delete nextTopicsById[topic.uuid];
      const conversationId = conversationIdForTopic(topic.streamUuid, topic.uuid);
      const nextConversationsById = { ...state.conversationsById };
      delete nextConversationsById[conversationId];
      return {
        topicsById: nextTopicsById,
        topicIds: removeId(state.topicIds, topic.uuid),
        conversationsById: nextConversationsById,
        conversationIds: removeId(state.conversationIds, conversationId),
      };
    });
  },

  applyMessagePointer(ownerKey, message) {
    logStoreAction("messenger", "applyMessagePointer", { ownerKey, messageUuid: message.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (removedStreamsForOwner(ownerKey).has(message.streamUuid)) return state;
      const nextState = applyMessageFreshness(state, message);
      if (nextState.streamsById !== state.streamsById) {
        recordCatalogMutation(ownerKey, "stream", message.streamUuid, "freshness");
      }
      if (nextState.topicsById !== state.topicsById) {
        recordCatalogMutation(ownerKey, "topic", message.topicUuid, "freshness");
      }
      return nextState;
    });
  },

  clearMessagePointer(ownerKey, message) {
    logStoreAction("messenger", "clearMessagePointer", { ownerKey, messageUuid: message.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      const nextState = clearDeletedMessageFreshness(state, message);
      if (nextState.streamsById !== state.streamsById) {
        recordCatalogMutation(ownerKey, "stream", message.streamUuid, "freshness");
      }
      if (nextState.topicsById !== state.topicsById) {
        recordCatalogMutation(ownerKey, "topic", message.topicUuid, "freshness");
      }
      return nextState;
    });
  },

  applyFolderSnapshot(ownerKey, folder) {
    logStoreAction("messenger", "applyFolderSnapshot", { ownerKey, folderUuid: folder.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      const removedStreamUuids = removedStreamUuidsByOwnerKey.get(ownerKey);
      const normalizedFolder = normalizeMessengerFolderSystemType(folder);
      const safeFolder = removeDeletedStreamItemsFromFolder(normalizedFolder, removedStreamUuids);

      return {
        foldersById: {
          ...state.foldersById,
          [folder.uuid]: safeFolder,
        },
        folderIds: appendUniqueId(state.folderIds, folder.uuid),
      };
    });
  },

  removeFolder(ownerKey, folder) {
    logStoreAction("messenger", "removeFolder", { ownerKey, folderUuid: folder.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextFoldersById = { ...state.foldersById };
      delete nextFoldersById[folder.uuid];

      return {
        foldersById: nextFoldersById,
        folderIds: removeId(state.folderIds, folder.uuid),
      };
    });
  },

  upsertFolderItem(ownerKey, folderItem) {
    logStoreAction("messenger", "upsertFolderItem", {
      ownerKey,
      folderItemUuid: folderItem.uuid,
      folderUuid: folderItem.folderUuid,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (removedStreamsForOwner(ownerKey).has(folderItem.streamUuid)) return state;
      if (state.foldersById[folderItem.folderUuid] == null) return state;

      const nextFoldersById = { ...state.foldersById };
      let didChange = false;

      for (const folderId of state.folderIds) {
        const folder = state.foldersById[folderId];
        if (folder == null) continue;

        if (folder.uuid === folderItem.folderUuid) {
          const existingIndex = folder.items.findIndex((item) => item.uuid === folderItem.uuid);
          const nextItems =
            existingIndex === -1
              ? [...folder.items, folderItem]
              : folder.items.map((item) => (item.uuid === folderItem.uuid ? folderItem : item));

          nextFoldersById[folderId] = rebuildFolderWithItems(folder, nextItems);
          didChange = true;
          continue;
        }

        const nextItems = folder.items.filter((item) => item.uuid !== folderItem.uuid);
        if (nextItems.length === folder.items.length) continue;

        nextFoldersById[folderId] = rebuildFolderWithItems(folder, nextItems);
        didChange = true;
      }

      return didChange ? { foldersById: nextFoldersById } : state;
    });
  },

  removeFolderItem(ownerKey, folderItem, options) {
    logStoreAction("messenger", "removeFolderItem", {
      ownerKey,
      folderItemUuid: folderItem.uuid,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextFoldersById = { ...state.foldersById };
      let didChange = false;
      for (const folderId of state.folderIds) {
        const folder = state.foldersById[folderId];
        if (folder == null) continue;

        const nextItems = folder.items.filter((item) => item.uuid !== folderItem.uuid);
        if (nextItems.length === folder.items.length) continue;

        nextFoldersById[folderId] = rebuildFolderWithItems(folder, nextItems, {
          preserveUnreadCount: options?.preserveFolderUnreadCount,
        });
        didChange = true;
      }

      return didChange ? { foldersById: nextFoldersById } : state;
    });
  },

  setRealtimeInitialSyncReady(ownerKey, runtimeGeneration, ready) {
    logStoreAction("messenger", "setRealtimeInitialSyncReady", {
      ownerKey,
      runtimeGeneration,
      ready,
    });
    set((state) => {
      if (ready) {
        if (
          state.realtimeReadyOwnerKey === ownerKey &&
          state.realtimeReadyRuntimeGeneration === runtimeGeneration
        ) {
          return state;
        }
        return {
          realtimeReadyOwnerKey: ownerKey,
          realtimeReadyRuntimeGeneration: runtimeGeneration,
        };
      }
      if (state.realtimeReadyOwnerKey !== ownerKey) return state;
      return {
        realtimeReadyOwnerKey: null,
        realtimeReadyRuntimeGeneration: null,
      };
    });
  },

  setRealtimeCursor(ownerKey, epochVersion) {
    logStoreAction("messenger", "setRealtimeCursor", { ownerKey, epochVersion });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (state.lastEpochVersion != null && state.lastEpochVersion >= epochVersion) return state;

      return {
        lastEpochVersion: epochVersion,
      };
    });
  },

  markRealtimeEventSkipped(ownerKey, epochVersion, reason) {
    logStoreAction("messenger", "markRealtimeEventSkipped", { ownerKey, epochVersion, reason });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const lastEpochVersion =
        state.lastEpochVersion == null
          ? epochVersion
          : Math.max(state.lastEpochVersion, epochVersion);

      return {
        lastEpochVersion,
        skippedRealtimeEvents: [
          ...state.skippedRealtimeEvents,
          {
            epochVersion,
            reason,
          },
        ],
      };
    });
  },

  setBootstrapError(ownerKey, error) {
    logStoreAction("messenger", "setBootstrapError", { ownerKey, error });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      return {
        isLoading: false,
        error,
      };
    });
  },

  clear() {
    logStoreAction("messenger", "clear", {});
    set((state) => {
      if (state.ownerKey != null) {
        removedStreamUuidsByOwnerKey.delete(state.ownerKey);
        clearMessengerReadBoundariesForOwner(state.ownerKey);
        clearMessengerCatalogRuntimeCoverage(state.ownerKey);
        clearWorkspaceStreamUnreadReclassificationsForOwner(state.ownerKey);
      }
      return {
        ...createInitialState(),
        bootstrapRequestVersion: nextBootstrapRequestVersion(),
      };
    });
  },
}));

export function applyDeletedMessagePointerRepair(
  ownerKey: string,
  message: MessengerDeletedMessage,
  targets: MessengerDeletedMessagePointerTargets,
  replacements: MessengerDeletedMessagePointerReplacements,
): void {
  logStoreAction("messenger", "applyDeletedMessagePointerRepair", {
    ownerKey,
    messageUuid: message.uuid,
  });
  useMessengerStore.setState((state) => {
    if (state.ownerKey !== ownerKey) return state;
    if (removedStreamsForOwner(ownerKey).has(message.streamUuid)) return state;

    const streamReplacement =
      replacements.stream?.streamUuid === message.streamUuid ? replacements.stream : null;
    const topicReplacement =
      replacements.topic?.streamUuid === message.streamUuid &&
      replacements.topic.topicUuid === message.topicUuid
        ? replacements.topic
        : null;
    let nextStreamsById = state.streamsById;
    let nextTopicsById = state.topicsById;
    let nextConversationsById = state.conversationsById;

    const stream = state.streamsById[message.streamUuid];
    if (
      targets.stream &&
      stream != null &&
      stream.lastMessageUuid == null &&
      streamReplacement != null
    ) {
      nextStreamsById = {
        ...nextStreamsById,
        [stream.uuid]: { ...stream, lastMessageUuid: streamReplacement.uuid },
      };
    }

    const topic = state.topicsById[message.topicUuid];
    if (
      targets.topic &&
      topic != null &&
      topic.lastMessageUuid == null &&
      topicReplacement != null
    ) {
      nextTopicsById = {
        ...nextTopicsById,
        [topic.uuid]: { ...topic, lastMessageUuid: topicReplacement.uuid },
      };
    }

    const streamConversationId = conversationIdForStream(message.streamUuid);
    const streamConversation = state.conversationsById[streamConversationId];
    if (
      targets.streamConversation &&
      streamConversation != null &&
      streamConversation.lastMessageUuid == null &&
      streamReplacement != null
    ) {
      nextConversationsById = {
        ...nextConversationsById,
        [streamConversationId]: {
          ...streamConversation,
          lastMessageUuid: streamReplacement.uuid,
        },
      };
    }

    const topicConversationId = conversationIdForTopic(message.streamUuid, message.topicUuid);
    const topicConversation = state.conversationsById[topicConversationId];
    if (
      targets.topicConversation &&
      topicConversation != null &&
      topicConversation.lastMessageUuid == null &&
      topicReplacement != null
    ) {
      nextConversationsById = {
        ...nextConversationsById,
        [topicConversationId]: {
          ...topicConversation,
          lastMessageUuid: topicReplacement.uuid,
        },
      };
    }

    return {
      streamsById: nextStreamsById,
      topicsById: nextTopicsById,
      conversationsById: nextConversationsById,
    };
  });
}

let sidebarConversationCacheIds = EMPTY_IDS;
let sidebarConversationCacheMap = EMPTY_CONVERSATIONS_BY_ID;
let sidebarConversationCacheResult = EMPTY_CONVERSATIONS;
let foldersCacheIds = EMPTY_IDS;
let foldersCacheMap = EMPTY_FOLDERS_BY_ID;
let foldersCacheResult = EMPTY_FOLDERS;

export function selectMessengerSidebarConversations(
  state: MessengerStoreState,
): MessengerConversation[] {
  if (state.conversationIds.length === 0) return EMPTY_CONVERSATIONS;
  if (
    state.conversationIds === sidebarConversationCacheIds &&
    state.conversationsById === sidebarConversationCacheMap
  ) {
    return sidebarConversationCacheResult;
  }

  const conversations = state.conversationIds
    .map((conversationId) => state.conversationsById[conversationId])
    .filter((conversation): conversation is MessengerConversation => conversation != null);

  sidebarConversationCacheIds = state.conversationIds;
  sidebarConversationCacheMap = state.conversationsById;
  sidebarConversationCacheResult = conversations;
  return conversations;
}

export function selectMessengerFolders(state: MessengerStoreState): MessengerFolder[] {
  if (state.folderIds.length === 0) return EMPTY_FOLDERS;
  if (state.folderIds === foldersCacheIds && state.foldersById === foldersCacheMap) {
    return foldersCacheResult;
  }

  const folders = state.folderIds
    .map((folderId) => state.foldersById[folderId])
    .filter((folder): folder is MessengerFolder => folder != null);

  foldersCacheIds = state.folderIds;
  foldersCacheMap = state.foldersById;
  foldersCacheResult = folders;
  return folders;
}
