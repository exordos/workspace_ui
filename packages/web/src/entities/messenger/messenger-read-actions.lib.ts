import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { WorkspaceOptimisticMessageReadChange } from "~/entities/message/message.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import { markStreamRead as defaultMarkStreamRead } from "~/shared/api/messenger-streams.api";
import { markStreamTopicRead as defaultMarkStreamTopicRead } from "~/shared/api/messenger-topics.api";
import type {
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { adaptMessengerStream, adaptMessengerTopic } from "./messenger-adapters.lib";
import {
  markMessengerCachedMessagesRead,
  upsertMessengerStreamCache,
  upsertMessengerTopicCache,
} from "./messenger-cache.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type {
  MessengerConversationId,
  MessengerFolder,
  MessengerStream,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

const log = createLogger("messenger-read-actions");

export interface RunWorkspaceStreamReadOptions {
  streamUuid: MessengerUuid;
}

export interface RunWorkspaceTopicReadOptions {
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
}

export type WorkspaceReadActionResult =
  | { status: "applied"; ownerKey: string }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "in-flight";
    };

interface WorkspaceReadActionClient {
  markStreamRead?: (
    options: MessengerClientOptions,
    streamUuid: string,
  ) => Promise<WorkspaceMessengerStreamDto>;
  markStreamTopicRead?: (
    options: MessengerClientOptions,
    topicUuid: string,
  ) => Promise<WorkspaceMessengerTopicDto>;
}

interface WorkspaceReadActionCache {
  markCachedMessagesRead?: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
    conversationIds?: readonly MessengerConversationId[],
  ) => Promise<void> | void;
  upsertCachedStream?: (ownerKey: string, stream: MessengerStream) => Promise<void> | void;
  upsertCachedTopic?: (ownerKey: string, topic: MessengerTopic) => Promise<void> | void;
}

export interface WorkspaceReadActionDeps {
  runtimeContext?: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: WorkspaceReadActionClient;
  cache?: WorkspaceReadActionCache;
  signal?: AbortSignal;
}

interface OptimisticCatalogReadChange {
  ownerKey: string;
  previousStream: MessengerStream;
  projectedStream: MessengerStream;
  previousTopics: readonly MessengerTopic[];
  projectedTopics: readonly MessengerTopic[];
  folderChanges: readonly OptimisticFolderReadChange[];
}

interface OptimisticFolderReadChange {
  previousFolder: MessengerFolder;
  projectedFolder: MessengerFolder;
}

const defaultCache: WorkspaceReadActionCache = {
  markCachedMessagesRead: markMessengerCachedMessagesRead,
  upsertCachedStream: upsertMessengerStreamCache,
  upsertCachedTopic: upsertMessengerTopicCache,
};

const activeReadActions = new Set<string>();

function readActionKey(
  ownerKey: string,
  streamUuid: MessengerUuid,
  runtimeGeneration: number,
): string {
  return `${ownerKey}\u0000${streamUuid}\u0000${runtimeGeneration}`;
}

function currentRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

function captureReadAction(deps: WorkspaceReadActionDeps): {
  runtimeContext: WorkspaceRuntimeContext;
  ownerKey: string;
  isStale: () => boolean;
} | null {
  const runtimeContext =
    deps.runtimeContext ?? deps.getRuntimeContext?.() ?? currentRuntimeContext();
  if (runtimeContext == null) return null;
  const getRuntimeContext = deps.getRuntimeContext ?? currentRuntimeContext;
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) return null;

  return {
    runtimeContext,
    ownerKey: workspaceRuntimeOwnerKey(requestContext),
    isStale: () =>
      isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, deps.signal),
  };
}

function beginOptimisticCatalogRead(
  ownerKey: string,
  scope: RunWorkspaceStreamReadOptions | RunWorkspaceTopicReadOptions,
): OptimisticCatalogReadChange | null {
  const store = useMessengerStore.getState();
  if (store.ownerKey !== ownerKey) return null;
  const previousStream = store.streamsById[scope.streamUuid];
  if (previousStream == null) return null;

  const topicUuid = "topicUuid" in scope ? scope.topicUuid : null;
  const previousTopics =
    topicUuid == null
      ? store.topicIds
          .map((id) => store.topicsById[id])
          .filter((topic): topic is MessengerTopic => topic?.streamUuid === scope.streamUuid)
      : [store.topicsById[topicUuid]].filter(
          (topic): topic is MessengerTopic => topic?.streamUuid === scope.streamUuid,
        );
  if (topicUuid != null && previousTopics.length === 0) return null;

  const unreadDelta =
    topicUuid == null ? previousStream.unreadCount : (previousTopics[0]?.unreadCount ?? 0);
  const activeUnreadDelta =
    topicUuid == null
      ? (previousStream.activeUnreadCount ?? previousStream.unreadCount)
      : (previousTopics[0]?.activeUnreadCount ?? previousTopics[0]?.unreadCount ?? 0);
  const passiveUnreadDelta =
    topicUuid == null
      ? (previousStream.passiveUnreadCount ?? 0)
      : (previousTopics[0]?.passiveUnreadCount ?? 0);
  const projectedTopics = previousTopics.map((topic) =>
    topic.unreadCount === 0 &&
    (topic.activeUnreadCount ?? 0) === 0 &&
    (topic.passiveUnreadCount ?? 0) === 0
      ? topic
      : { ...topic, unreadCount: 0, activeUnreadCount: 0, passiveUnreadCount: 0 },
  );
  const projectedStream =
    unreadDelta === 0 && activeUnreadDelta === 0 && passiveUnreadDelta === 0
      ? previousStream
      : {
          ...previousStream,
          unreadCount: Math.max(0, previousStream.unreadCount - unreadDelta),
          activeUnreadCount: Math.max(
            0,
            (previousStream.activeUnreadCount ?? previousStream.unreadCount) - activeUnreadDelta,
          ),
          passiveUnreadCount: Math.max(
            0,
            (previousStream.passiveUnreadCount ?? 0) - passiveUnreadDelta,
          ),
        };

  const previousFoldersById = store.foldersById;
  for (const projectedTopic of projectedTopics) {
    store.upsertTopic(ownerKey, projectedTopic);
  }
  store.upsertStream(ownerKey, projectedStream);
  const projectedFoldersById = useMessengerStore.getState().foldersById;
  const folderChanges = store.folderIds.flatMap((folderUuid) => {
    const previousFolder = previousFoldersById[folderUuid];
    const projectedFolder = projectedFoldersById[folderUuid];
    return previousFolder != null && projectedFolder != null && previousFolder !== projectedFolder
      ? [{ previousFolder, projectedFolder }]
      : [];
  });

  return {
    ownerKey,
    previousStream,
    projectedStream,
    previousTopics,
    projectedTopics,
    folderChanges,
  };
}

function restoreFoldersAfterStreamUpsert(
  ownerKey: string,
  folderChanges: readonly OptimisticFolderReadChange[],
  foldersBeforeUpsert: Readonly<Record<MessengerUuid, MessengerFolder>>,
  mode: "rollback" | "response",
): void {
  const store = useMessengerStore.getState();
  if (store.ownerKey !== ownerKey) return;

  for (const change of folderChanges) {
    const folderBeforeUpsert = foldersBeforeUpsert[change.previousFolder.uuid];
    if (folderBeforeUpsert == null) continue;
    if (mode === "rollback" && folderBeforeUpsert === change.projectedFolder) {
      store.applyFolderSnapshot(ownerKey, change.previousFolder);
      continue;
    }
    if (folderBeforeUpsert !== change.projectedFolder) {
      store.applyFolderSnapshot(ownerKey, folderBeforeUpsert);
    }
  }
}

function rollbackOptimisticCatalogRead(change: OptimisticCatalogReadChange): void {
  const store = useMessengerStore.getState();
  if (store.ownerKey !== change.ownerKey) return;

  if (store.streamsById[change.previousStream.uuid] === change.projectedStream) {
    const foldersBeforeUpsert = store.foldersById;
    store.upsertStream(change.ownerKey, change.previousStream);
    restoreFoldersAfterStreamUpsert(
      change.ownerKey,
      change.folderChanges,
      foldersBeforeUpsert,
      "rollback",
    );
  }
  for (let index = 0; index < change.previousTopics.length; index += 1) {
    const previousTopic = change.previousTopics[index];
    const projectedTopic = change.projectedTopics[index];
    if (
      previousTopic != null &&
      projectedTopic != null &&
      store.topicsById[previousTopic.uuid] === projectedTopic
    ) {
      store.upsertTopic(change.ownerKey, previousTopic);
    }
  }
}

function rollbackOptimisticRead(
  catalogChange: OptimisticCatalogReadChange,
  messageChange: WorkspaceOptimisticMessageReadChange,
): void {
  rollbackOptimisticCatalogRead(catalogChange);
  useWorkspaceMessageStore.getState().rollbackOptimisticMessagesRead(messageChange);
}

async function writeReadCacheBestEffort(
  writes: readonly (() => Promise<void> | void)[],
): Promise<void> {
  try {
    await Promise.all(writes.map(async (write) => write()));
  } catch (error) {
    log.warn("Could not persist read state", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

export async function runWorkspaceStreamRead(
  options: RunWorkspaceStreamReadOptions,
  deps: WorkspaceReadActionDeps = {},
): Promise<WorkspaceReadActionResult> {
  const action = captureReadAction(deps);
  if (action == null) return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const actionKey = readActionKey(
    action.ownerKey,
    options.streamUuid,
    action.runtimeContext.runtimeGeneration,
  );
  if (activeReadActions.has(actionKey)) {
    return { status: "skipped", ownerKey: action.ownerKey, reason: "in-flight" };
  }
  activeReadActions.add(actionKey);
  try {
    const catalogChange = beginOptimisticCatalogRead(action.ownerKey, options);
    if (catalogChange == null)
      return { status: "skipped", ownerKey: action.ownerKey, reason: "missing-context" };
    const messageChange = useWorkspaceMessageStore.getState().beginOptimisticMessagesRead({
      streamUuid: options.streamUuid,
    });

    let dto: WorkspaceMessengerStreamDto;
    try {
      dto = await (deps.client?.markStreamRead ?? defaultMarkStreamRead)(
        buildMessengerRequestOptions(action.runtimeContext, deps.clientOptions, deps.signal),
        options.streamUuid,
      );
    } catch (error) {
      rollbackOptimisticRead(catalogChange, messageChange);
      throw error;
    }
    if (action.isStale()) {
      rollbackOptimisticRead(catalogChange, messageChange);
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
    }

    const stream = adaptMessengerStream(dto);
    const currentStore = useMessengerStore.getState();
    const canApplyResponse =
      currentStore.ownerKey === action.ownerKey &&
      currentStore.streamsById[options.streamUuid] === catalogChange.projectedStream;
    if (canApplyResponse) {
      const foldersBeforeUpsert = currentStore.foldersById;
      currentStore.upsertStream(action.ownerKey, stream);
      restoreFoldersAfterStreamUpsert(
        action.ownerKey,
        catalogChange.folderChanges,
        foldersBeforeUpsert,
        "response",
      );
    }
    const cache = deps.cache ?? defaultCache;
    await writeReadCacheBestEffort([
      () =>
        cache.markCachedMessagesRead?.(
          action.ownerKey,
          messageChange.projectedMessages.map((message) => message.uuid),
          [conversationIdForStream(options.streamUuid)],
        ),
      ...(canApplyResponse ? [() => cache.upsertCachedStream?.(action.ownerKey, stream)] : []),
    ]);
    return { status: "applied", ownerKey: action.ownerKey };
  } finally {
    activeReadActions.delete(actionKey);
  }
}

export async function runWorkspaceTopicRead(
  options: RunWorkspaceTopicReadOptions,
  deps: WorkspaceReadActionDeps = {},
): Promise<WorkspaceReadActionResult> {
  const action = captureReadAction(deps);
  if (action == null) return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const actionKey = readActionKey(
    action.ownerKey,
    options.streamUuid,
    action.runtimeContext.runtimeGeneration,
  );
  if (activeReadActions.has(actionKey)) {
    return { status: "skipped", ownerKey: action.ownerKey, reason: "in-flight" };
  }
  activeReadActions.add(actionKey);
  try {
    const catalogChange = beginOptimisticCatalogRead(action.ownerKey, options);
    if (catalogChange == null)
      return { status: "skipped", ownerKey: action.ownerKey, reason: "missing-context" };
    const messageChange = useWorkspaceMessageStore.getState().beginOptimisticMessagesRead({
      streamUuid: options.streamUuid,
      topicUuid: options.topicUuid,
    });

    let dto: WorkspaceMessengerTopicDto;
    try {
      dto = await (deps.client?.markStreamTopicRead ?? defaultMarkStreamTopicRead)(
        buildMessengerRequestOptions(action.runtimeContext, deps.clientOptions, deps.signal),
        options.topicUuid,
      );
    } catch (error) {
      rollbackOptimisticRead(catalogChange, messageChange);
      throw error;
    }
    if (action.isStale()) {
      rollbackOptimisticRead(catalogChange, messageChange);
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
    }

    const topic = adaptMessengerTopic(dto);
    const currentStore = useMessengerStore.getState();
    const projectedTopic = catalogChange.projectedTopics[0];
    const canApplyResponse =
      projectedTopic != null &&
      currentStore.ownerKey === action.ownerKey &&
      currentStore.topicsById[options.topicUuid] === projectedTopic;
    if (canApplyResponse) {
      currentStore.upsertTopic(action.ownerKey, topic);
    }
    const cache = deps.cache ?? defaultCache;
    await writeReadCacheBestEffort([
      () =>
        cache.markCachedMessagesRead?.(
          action.ownerKey,
          messageChange.projectedMessages.map((message) => message.uuid),
          [conversationIdForTopic(options.streamUuid, options.topicUuid)],
        ),
      ...(canApplyResponse ? [() => cache.upsertCachedTopic?.(action.ownerKey, topic)] : []),
    ]);
    return { status: "applied", ownerKey: action.ownerKey };
  } finally {
    activeReadActions.delete(actionKey);
  }
}
