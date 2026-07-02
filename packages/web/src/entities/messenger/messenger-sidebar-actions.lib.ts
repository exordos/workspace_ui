import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import {
  createFolderItem as defaultCreateFolderItem,
  deleteFolderItem as defaultDeleteFolderItem,
  pinFolderItem as defaultPinFolderItem,
  unpinFolderItem as defaultUnpinFolderItem,
} from "~/shared/api/messenger-folders.api";
import { updateStreamNotifications as defaultUpdateStreamNotifications } from "~/shared/api/messenger-streams.api";
import {
  createStreamTopic as defaultCreateStreamTopic,
  renameStreamTopic as defaultRenameStreamTopic,
  setStreamTopicNotificationMode as defaultSetStreamTopicNotificationMode,
  toggleStreamTopicDone as defaultToggleStreamTopicDone,
} from "~/shared/api/messenger-topics.api";
import type {
  WorkspaceMessengerCreateFolderItemRequestBody,
  WorkspaceMessengerCreateTopicRequestBody,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerStreamNotificationRequestBody,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerTopicNotificationMode,
  WorkspaceMessengerTopicNotificationRequestBody,
  WorkspaceMessengerUpdateTopicRequestBody,
} from "~/shared/api/messenger.types";
import {
  adaptMessengerFolderItem,
  adaptMessengerStream,
  adaptMessengerTopic,
} from "./messenger-adapters.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type {
  MessengerFolderItem,
  MessengerStream,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

export interface MessengerSidebarActionClientDeps {
  updateStreamNotifications?: (
    options: MessengerClientOptions,
    streamUuid: string,
    body: WorkspaceMessengerStreamNotificationRequestBody,
  ) => Promise<WorkspaceMessengerStreamDto>;
  createStreamTopic?: (
    options: MessengerClientOptions,
    body: WorkspaceMessengerCreateTopicRequestBody,
  ) => Promise<WorkspaceMessengerTopicDto>;
  renameStreamTopic?: (
    options: MessengerClientOptions,
    topicUuid: string,
    body: WorkspaceMessengerUpdateTopicRequestBody,
  ) => Promise<WorkspaceMessengerTopicDto>;
  toggleStreamTopicDone?: (
    options: MessengerClientOptions,
    topicUuid: string,
  ) => Promise<WorkspaceMessengerTopicDto>;
  setStreamTopicNotificationMode?: (
    options: MessengerClientOptions,
    topicUuid: string,
    body: WorkspaceMessengerTopicNotificationRequestBody,
  ) => Promise<WorkspaceMessengerTopicDto>;
  createFolderItem?: (
    options: MessengerClientOptions,
    body: WorkspaceMessengerCreateFolderItemRequestBody,
  ) => Promise<WorkspaceMessengerFolderItemDto>;
  deleteFolderItem?: (options: MessengerClientOptions, folderItemUuid: string) => Promise<void>;
  pinFolderItem?: (
    options: MessengerClientOptions,
    folderItemUuid: string,
  ) => Promise<WorkspaceMessengerFolderItemDto>;
  unpinFolderItem?: (
    options: MessengerClientOptions,
    folderItemUuid: string,
  ) => Promise<WorkspaceMessengerFolderItemDto>;
}

export interface MessengerSidebarActionStoreApi {
  getState: () => Pick<
    MessengerStoreState,
    | "ownerKey"
    | "streamsById"
    | "upsertStream"
    | "upsertTopic"
    | "upsertFolderItem"
    | "removeFolderItem"
  >;
}

export interface MessengerSidebarActionBaseOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: MessengerSidebarActionClientDeps;
  signal?: AbortSignal;
  store?: MessengerSidebarActionStoreApi;
}

export interface MessengerSidebarActionSkippedResult {
  status: "skipped";
  ownerKey: string | null;
  reason: "missing-context" | "stale-owner";
}

export type MessengerStreamActionResult =
  | { status: "applied"; ownerKey: string; stream: MessengerStream }
  | MessengerSidebarActionSkippedResult;

export type MessengerTopicActionResult =
  | { status: "applied"; ownerKey: string; topic: MessengerTopic }
  | MessengerSidebarActionSkippedResult;

export type MessengerFolderItemActionResult =
  | { status: "applied"; ownerKey: string; folderItem: MessengerFolderItem | null }
  | MessengerSidebarActionSkippedResult;

export interface UpdateMessengerStreamNotificationModeOptions extends MessengerSidebarActionBaseOptions {
  streamUuid: MessengerUuid;
  notificationMode: WorkspaceMessengerStreamNotificationMode;
}

export interface CreateMessengerTopicOptions extends MessengerSidebarActionBaseOptions {
  streamUuid: MessengerUuid;
  name: string;
}

export interface RenameMessengerTopicOptions extends MessengerSidebarActionBaseOptions {
  topicUuid: MessengerUuid;
  name: string;
}

export interface ToggleMessengerTopicDoneOptions extends MessengerSidebarActionBaseOptions {
  topicUuid: MessengerUuid;
}

export interface SetMessengerTopicNotificationModeOptions extends MessengerSidebarActionBaseOptions {
  topicUuid: MessengerUuid;
  notificationMode: WorkspaceMessengerTopicNotificationMode;
}

export interface CreateMessengerFolderItemOptions extends MessengerSidebarActionBaseOptions {
  folderUuid: MessengerUuid;
  streamUuid: MessengerUuid;
  chatType: WorkspaceMessengerCreateFolderItemRequestBody["chat_type"];
  orderIndex?: number | null;
}

export interface DeleteMessengerFolderItemOptions extends MessengerSidebarActionBaseOptions {
  folderItemUuid: MessengerUuid;
}

export interface PinMessengerFolderItemOptions extends MessengerSidebarActionBaseOptions {
  folderItemUuid: MessengerUuid;
}

export interface RunWorkspaceStreamNotificationUpdateOptions {
  streamUuid: MessengerUuid;
  notificationMode: WorkspaceMessengerStreamNotificationMode;
}

export interface RunWorkspaceCreateTopicRequestOptions {
  streamUuid: MessengerUuid;
  name?: string;
}

export interface RunWorkspaceTopicRenameRequestOptions {
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  name?: string;
}

export interface RunWorkspaceTopicDoneToggleOptions {
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  done: boolean;
}

export interface RunWorkspaceTopicNotificationUpdateOptions {
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  notificationMode: WorkspaceMessengerTopicNotificationMode;
}

export interface RunWorkspaceFolderAssignmentToggleOptions {
  folderUuid: MessengerUuid;
  folderItemUuid: MessengerUuid | null;
  streamUuid: MessengerUuid;
  chatType: WorkspaceMessengerCreateFolderItemRequestBody["chat_type"];
  assigned: boolean;
}

export interface RunWorkspaceFolderItemPinToggleOptions {
  folderUuid: MessengerUuid;
  folderItemUuid: MessengerUuid;
  streamUuid: MessengerUuid;
  pinned: boolean;
}

function captureSidebarAction(
  runtimeContext: WorkspaceRuntimeContext,
  getRuntimeContext: WorkspaceRuntimeContextGetter,
  signal: AbortSignal | undefined,
): { ownerKey: string; isStale: () => boolean } | { ownerKey: null; isStale: () => boolean } {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { ownerKey: null, isStale: () => true };
  }

  return {
    ownerKey: workspaceRuntimeOwnerKey(requestContext),
    isStale: () => isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
  };
}

function getCurrentRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

function currentRuntimeActionOptions(): Pick<
  MessengerSidebarActionBaseOptions,
  "runtimeContext" | "getRuntimeContext"
> | null {
  const runtimeContext = getCurrentRuntimeContext();
  if (runtimeContext == null) return null;
  return {
    runtimeContext,
    getRuntimeContext: getCurrentRuntimeContext,
  };
}

function skippedMissingContext(): MessengerSidebarActionSkippedResult {
  return { status: "skipped", ownerKey: null, reason: "missing-context" };
}

function normalizeActionName(name: string | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : null;
}

interface StreamNotificationOptimisticEntry {
  confirmedStream: MessengerStream;
  pendingModesByRequestId: Map<number, WorkspaceMessengerStreamNotificationMode>;
  latestProjectedStream: MessengerStream | null;
}

interface StreamNotificationOptimisticRequest {
  key: string;
  requestId: number;
  ownerKey: string;
  streamUuid: MessengerUuid;
  entry: StreamNotificationOptimisticEntry;
}

const streamNotificationOptimisticEntries = new Map<string, StreamNotificationOptimisticEntry>();
let nextStreamNotificationOptimisticRequestId = 1;

function streamNotificationOptimisticKey(ownerKey: string, streamUuid: MessengerUuid): string {
  return `${ownerKey}:stream-notifications:${streamUuid}`;
}

function latestPendingStreamNotificationMode(
  entry: StreamNotificationOptimisticEntry,
): WorkspaceMessengerStreamNotificationMode | null {
  let latestMode: WorkspaceMessengerStreamNotificationMode | null = null;
  for (const mode of entry.pendingModesByRequestId.values()) {
    latestMode = mode;
  }
  return latestMode;
}

function upsertStreamNotificationProjection(
  store: MessengerSidebarActionStoreApi,
  ownerKey: string,
  stream: MessengerStream,
  notificationMode: WorkspaceMessengerStreamNotificationMode,
): MessengerStream | null {
  const state = store.getState();
  if (state.ownerKey !== ownerKey) return null;

  const projectedStream = {
    ...stream,
    notificationMode,
  };
  state.upsertStream(ownerKey, projectedStream);
  return projectedStream;
}

function isLatestStreamNotificationProjectionCurrent(
  store: MessengerSidebarActionStoreApi,
  request: StreamNotificationOptimisticRequest,
  entry: StreamNotificationOptimisticEntry,
): boolean {
  const state = store.getState();
  return (
    state.ownerKey === request.ownerKey &&
    entry.latestProjectedStream != null &&
    state.streamsById[request.streamUuid] === entry.latestProjectedStream
  );
}

function beginOptimisticStreamNotificationMode(
  store: MessengerSidebarActionStoreApi,
  ownerKey: string,
  streamUuid: MessengerUuid,
  notificationMode: WorkspaceMessengerStreamNotificationMode,
): StreamNotificationOptimisticRequest | null {
  const state = store.getState();
  if (state.ownerKey !== ownerKey) return null;

  const currentStream = state.streamsById[streamUuid];
  if (currentStream == null) return null;

  const key = streamNotificationOptimisticKey(ownerKey, streamUuid);
  const existingEntry = streamNotificationOptimisticEntries.get(key);
  const currentEntry =
    existingEntry?.latestProjectedStream === currentStream ? existingEntry : undefined;
  if (currentEntry == null) {
    streamNotificationOptimisticEntries.delete(key);
  }
  if (currentEntry == null && currentStream.notificationMode === notificationMode) return null;

  const entry =
    currentEntry ??
    ({
      confirmedStream: currentStream,
      pendingModesByRequestId: new Map<number, WorkspaceMessengerStreamNotificationMode>(),
      latestProjectedStream: null,
    } satisfies StreamNotificationOptimisticEntry);
  streamNotificationOptimisticEntries.set(key, entry);

  const requestId = nextStreamNotificationOptimisticRequestId;
  nextStreamNotificationOptimisticRequestId += 1;
  entry.pendingModesByRequestId.set(requestId, notificationMode);

  entry.latestProjectedStream = upsertStreamNotificationProjection(
    store,
    ownerKey,
    currentStream,
    notificationMode,
  );
  return {
    key,
    requestId,
    ownerKey,
    streamUuid,
    entry,
  };
}

function finishOptimisticStreamNotificationRequest(
  store: MessengerSidebarActionStoreApi,
  request: StreamNotificationOptimisticRequest | null,
  outcome: "failed" | "stale" | { confirmedStream: MessengerStream },
): void {
  if (request == null) return;

  const entry = streamNotificationOptimisticEntries.get(request.key);
  if (entry == null || entry !== request.entry) return;

  entry.pendingModesByRequestId.delete(request.requestId);

  if (outcome !== "failed" && outcome !== "stale") {
    entry.confirmedStream = outcome.confirmedStream;
  }

  if (entry.pendingModesByRequestId.size === 0) {
    streamNotificationOptimisticEntries.delete(request.key);
    if (isLatestStreamNotificationProjectionCurrent(store, request, entry)) {
      store.getState().upsertStream(request.ownerKey, entry.confirmedStream);
    }
    return;
  }

  if (outcome === "stale") return;

  const latestPendingMode = latestPendingStreamNotificationMode(entry);
  if (latestPendingMode == null) return;
  if (!isLatestStreamNotificationProjectionCurrent(store, request, entry)) return;

  entry.latestProjectedStream = upsertStreamNotificationProjection(
    store,
    request.ownerKey,
    entry.confirmedStream,
    latestPendingMode,
  );
}

export async function updateMessengerStreamNotificationMode({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  streamUuid,
  notificationMode,
}: UpdateMessengerStreamNotificationModeOptions): Promise<MessengerStreamActionResult> {
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const optimisticRequest = beginOptimisticStreamNotificationMode(
    store,
    action.ownerKey,
    streamUuid,
    notificationMode,
  );
  let dto: WorkspaceMessengerStreamDto;
  try {
    dto = await (client.updateStreamNotifications ?? defaultUpdateStreamNotifications)(
      buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
      streamUuid,
      { notification_mode: notificationMode },
    );
  } catch (error) {
    finishOptimisticStreamNotificationRequest(store, optimisticRequest, "failed");
    throw error;
  }
  if (action.isStale()) {
    finishOptimisticStreamNotificationRequest(store, optimisticRequest, "stale");
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  }

  const stream = adaptMessengerStream(dto);
  if (optimisticRequest == null) {
    store.getState().upsertStream(action.ownerKey, stream);
  } else {
    finishOptimisticStreamNotificationRequest(store, optimisticRequest, {
      confirmedStream: stream,
    });
  }
  return { status: "applied", ownerKey: action.ownerKey, stream };
}

export async function createMessengerTopic({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  streamUuid,
  name,
}: CreateMessengerTopicOptions): Promise<MessengerTopicActionResult> {
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (client.createStreamTopic ?? defaultCreateStreamTopic)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    { stream_uuid: streamUuid, name },
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const topic = adaptMessengerTopic(dto);
  store.getState().upsertTopic(action.ownerKey, topic);
  return { status: "applied", ownerKey: action.ownerKey, topic };
}

export async function renameMessengerTopic({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  topicUuid,
  name,
}: RenameMessengerTopicOptions): Promise<MessengerTopicActionResult> {
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (client.renameStreamTopic ?? defaultRenameStreamTopic)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    topicUuid,
    { name },
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const topic = adaptMessengerTopic(dto);
  store.getState().upsertTopic(action.ownerKey, topic);
  return { status: "applied", ownerKey: action.ownerKey, topic };
}

export async function toggleMessengerTopicDone({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  topicUuid,
}: ToggleMessengerTopicDoneOptions): Promise<MessengerTopicActionResult> {
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (client.toggleStreamTopicDone ?? defaultToggleStreamTopicDone)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    topicUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const topic = adaptMessengerTopic(dto);
  store.getState().upsertTopic(action.ownerKey, topic);
  return { status: "applied", ownerKey: action.ownerKey, topic };
}

export async function setMessengerTopicNotificationMode({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  topicUuid,
  notificationMode,
}: SetMessengerTopicNotificationModeOptions): Promise<MessengerTopicActionResult> {
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (
    client.setStreamTopicNotificationMode ?? defaultSetStreamTopicNotificationMode
  )(buildMessengerRequestOptions(runtimeContext, clientOptions, signal), topicUuid, {
    notification_mode: notificationMode,
  });
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const topic = adaptMessengerTopic(dto);
  store.getState().upsertTopic(action.ownerKey, topic);
  return { status: "applied", ownerKey: action.ownerKey, topic };
}

export async function createMessengerFolderItem({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  folderUuid,
  streamUuid,
  chatType,
  orderIndex,
}: CreateMessengerFolderItemOptions): Promise<MessengerFolderItemActionResult> {
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const body: WorkspaceMessengerCreateFolderItemRequestBody = {
    folder_uuid: folderUuid,
    stream_uuid: streamUuid,
    chat_type: chatType,
    ...(orderIndex !== undefined ? { order_index: orderIndex } : {}),
  };
  const dto = await (client.createFolderItem ?? defaultCreateFolderItem)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    body,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const folderItem = adaptMessengerFolderItem(dto);
  store.getState().upsertFolderItem(action.ownerKey, folderItem);
  return { status: "applied", ownerKey: action.ownerKey, folderItem };
}

export async function deleteMessengerFolderItem({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  folderItemUuid,
}: DeleteMessengerFolderItemOptions): Promise<MessengerFolderItemActionResult> {
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  await (client.deleteFolderItem ?? defaultDeleteFolderItem)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    folderItemUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  store.getState().removeFolderItem(action.ownerKey, { uuid: folderItemUuid });
  return { status: "applied", ownerKey: action.ownerKey, folderItem: null };
}

export async function pinMessengerFolderItem({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  folderItemUuid,
}: PinMessengerFolderItemOptions): Promise<MessengerFolderItemActionResult> {
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (client.pinFolderItem ?? defaultPinFolderItem)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    folderItemUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const folderItem = adaptMessengerFolderItem(dto);
  store.getState().upsertFolderItem(action.ownerKey, folderItem);
  return { status: "applied", ownerKey: action.ownerKey, folderItem };
}

export async function unpinMessengerFolderItem(
  options: PinMessengerFolderItemOptions,
): Promise<MessengerFolderItemActionResult> {
  const {
    runtimeContext,
    getRuntimeContext = () => runtimeContext,
    clientOptions,
    client = {},
    signal,
    store = useMessengerStore,
    folderItemUuid,
  } = options;
  const action = captureSidebarAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (client.unpinFolderItem ?? defaultUnpinFolderItem)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    folderItemUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const folderItem = adaptMessengerFolderItem(dto);
  store.getState().upsertFolderItem(action.ownerKey, folderItem);
  return { status: "applied", ownerKey: action.ownerKey, folderItem };
}

export async function runWorkspaceStreamNotificationUpdate(
  options: RunWorkspaceStreamNotificationUpdateOptions,
): Promise<MessengerStreamActionResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  if (runtimeOptions == null) return skippedMissingContext();
  return updateMessengerStreamNotificationMode({
    ...runtimeOptions,
    streamUuid: options.streamUuid,
    notificationMode: options.notificationMode,
  });
}

export async function runWorkspaceCreateTopicRequest(
  options: RunWorkspaceCreateTopicRequestOptions,
): Promise<MessengerTopicActionResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  const name = normalizeActionName(options.name);
  if (runtimeOptions == null || name == null) return skippedMissingContext();
  return createMessengerTopic({
    ...runtimeOptions,
    streamUuid: options.streamUuid,
    name,
  });
}

export async function runWorkspaceTopicRenameRequest(
  options: RunWorkspaceTopicRenameRequestOptions,
): Promise<MessengerTopicActionResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  const name = normalizeActionName(options.name);
  if (runtimeOptions == null || name == null) return skippedMissingContext();
  return renameMessengerTopic({
    ...runtimeOptions,
    topicUuid: options.topicUuid,
    name,
  });
}

export async function runWorkspaceTopicDoneToggle(
  options: RunWorkspaceTopicDoneToggleOptions,
): Promise<MessengerTopicActionResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  if (runtimeOptions == null) return skippedMissingContext();
  return toggleMessengerTopicDone({
    ...runtimeOptions,
    topicUuid: options.topicUuid,
  });
}

export async function runWorkspaceTopicNotificationUpdate(
  options: RunWorkspaceTopicNotificationUpdateOptions,
): Promise<MessengerTopicActionResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  if (runtimeOptions == null) return skippedMissingContext();
  return setMessengerTopicNotificationMode({
    ...runtimeOptions,
    topicUuid: options.topicUuid,
    notificationMode: options.notificationMode,
  });
}

export async function runWorkspaceFolderAssignmentToggle(
  options: RunWorkspaceFolderAssignmentToggleOptions,
): Promise<MessengerFolderItemActionResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  if (runtimeOptions == null) return skippedMissingContext();
  if (options.assigned) {
    return createMessengerFolderItem({
      ...runtimeOptions,
      folderUuid: options.folderUuid,
      streamUuid: options.streamUuid,
      chatType: options.chatType,
    });
  }
  if (options.folderItemUuid == null) return skippedMissingContext();
  return deleteMessengerFolderItem({
    ...runtimeOptions,
    folderItemUuid: options.folderItemUuid,
  });
}

export async function runWorkspaceFolderItemPinToggle(
  options: RunWorkspaceFolderItemPinToggleOptions,
): Promise<MessengerFolderItemActionResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  if (runtimeOptions == null) return skippedMissingContext();
  const action = options.pinned ? pinMessengerFolderItem : unpinMessengerFolderItem;
  return action({
    ...runtimeOptions,
    folderItemUuid: options.folderItemUuid,
  });
}
