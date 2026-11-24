import { loadWorkspaceComposerDrafts } from "~/applications/messenger/model/drafts/composer-draft-loader.lib";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type {
  WorkspaceRuntimeContext,
  WorkspaceRuntimeRequestContext,
} from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getFolders as defaultGetFolders,
  getStreams as defaultGetStreams,
  getStreamTopics as defaultGetTopics,
} from "~/shared/api/messenger-client";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import { isAbortError } from "~/shared/lib/abort-error";
import {
  adaptMessengerBootstrapPayload,
  adaptMessengerFolder,
} from "../../model/chats/messenger-catalog-adapters.lib";
import { useMessengerStore } from "../../model/chats/messenger.model";
import {
  loadMessengerLastMessagesForSidebar,
  primeMessengerLastMessagesFromCache,
  type MessengerLastMessagesCacheDeps,
} from "../../model/messages/history/messenger-last-messages-loader.lib";
import {
  createMessengerCatalogCacheReconcileFence as defaultCreateMessengerCatalogCacheReconcileFence,
  replaceMessengerFolderSnapshotsCache as defaultReplaceMessengerFolderSnapshotsCache,
  readMessengerCatalogPayloadCache as defaultReadMessengerCatalogPayloadCache,
  writeMessengerCatalogPayloadCache as defaultWriteMessengerCatalogPayloadCache,
  type MessengerCatalogPayloadCacheWriteOptions,
  type MessengerCatalogCachePayload,
} from "../../model/messenger-cache.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "../../model/messenger-request-options.lib";
import type { MessengerStoreState } from "../../model/chats/messenger.model";
import type { MessengerFolder, MessengerStream } from "../../model/messenger.types";
type MessengerBootstrapClientCall<T> = (options: MessengerClientOptions) => Promise<T[]>;

// Load a minimal project snapshot for the new Workspace messenger path.
// This is not the old Zulip chat list: data goes directly into the separate messenger store.
export interface MessengerBootstrapClientDeps {
  getStreams?: MessengerBootstrapClientCall<WorkspaceMessengerStreamDto>;
  getTopics?: MessengerBootstrapClientCall<WorkspaceMessengerTopicDto>;
  getFolders?: MessengerBootstrapClientCall<WorkspaceMessengerFolderDto>;
  getMessagesByUuids?: (
    options: MessengerClientOptions,
    messageUuids: string[],
  ) => Promise<WorkspaceMessengerMessageDto[]>;
}

export interface MessengerBootstrapCacheDeps {
  readMessengerCatalogPayloadCache?: (
    ownerKey: string,
  ) => Promise<MessengerCatalogCachePayload | null>;
  writeMessengerCatalogPayloadCache?: (
    ownerKey: string,
    payload: ReturnType<typeof adaptMessengerBootstrapPayload>,
    options?: MessengerCatalogPayloadCacheWriteOptions,
  ) => Promise<void> | void;
  replaceMessengerFolderSnapshotsCache?: (
    ownerKey: string,
    folders: ReturnType<typeof adaptMessengerFolder>[],
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
  createMessengerCatalogCacheReconcileFence?: () => number;
}

export interface MessengerStoreApi {
  getState: () => Pick<
    MessengerStoreState,
    | "startBootstrap"
    | "finishBootstrapSilently"
    | "replaceBootstrapState"
    | "replaceFolderSnapshots"
    | "setBootstrapError"
    | "streamIds"
    | "streamsById"
    | "topicIds"
    | "topicsById"
    | "conversationIds"
    | "conversationsById"
    | "folderIds"
    | "foldersById"
    | "setRealtimeCursor"
    | "ownerKey"
    | "isLoading"
    | "bootstrapRequestVersion"
  >;
}

export type MessengerBootstrapResult =
  | { status: "applied"; ownerKey: string }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "superseded" | "aborted";
    }
  | { status: "failed"; ownerKey: string; error: string };

export interface BootstrapMessengerStoreOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerBootstrapClientDeps;
  cache?: MessengerBootstrapCacheDeps;
  lastMessagesCache?: MessengerLastMessagesCacheDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  loadDrafts?: boolean;
  restoreCache?: boolean; // The session coordinator can restore separately before choosing its cursor.
  // Replacing a realtime cursor requires every catalog request to succeed.
  requireCompleteSnapshot?: boolean;
  beforeServerRefresh?: () => Promise<void>;
  onStreamsConfirmed?: (streams: readonly MessengerStream[]) => void; // Reconcile skipped membership history on a gap.
  store?: MessengerStoreApi;
}

function normalizeBootstrapError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Messenger bootstrap failed";
}

function writeBootstrapCacheBestEffort(write: () => Promise<void> | void): void {
  try {
    const result = write();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Cache failures must not block Workspace bootstrap.
  }
}

function currentFolders(
  state: Pick<MessengerStoreState, "folderIds" | "foldersById">,
): MessengerFolder[] {
  return state.folderIds
    .map((folderId) => state.foldersById[folderId])
    .filter((folder): folder is MessengerFolder => folder != null);
}

interface BootstrapFoldersOptions {
  requestContext: WorkspaceRuntimeRequestContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  client: MessengerBootstrapClientDeps;
  cache: MessengerBootstrapCacheDeps;
  requestOptions: MessengerClientOptions;
  signal?: AbortSignal;
  ownerKey: string;
  store: MessengerStoreApi;
  isCurrentBootstrap: () => boolean;
  requireCompleteSnapshot: boolean;
  onComplete: (folders: MessengerFolder[]) => void;
}

async function loadBootstrapFolders({
  requestContext,
  getRuntimeContext,
  client,
  cache,
  requestOptions,
  signal,
  ownerKey,
  store,
  isCurrentBootstrap,
  requireCompleteSnapshot,
  onComplete,
}: BootstrapFoldersOptions): Promise<MessengerBootstrapResult | null> {
  try {
    const folders = await (client.getFolders ?? defaultGetFolders)(requestOptions);
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return requireCompleteSnapshot
        ? { status: "skipped", ownerKey, reason: "stale-owner" }
        : { status: "applied", ownerKey };
    }
    if (!isCurrentBootstrap()) {
      return { status: "skipped", ownerKey, reason: "superseded" };
    }

    const adaptedFolders = folders.map(adaptMessengerFolder);
    store.getState().replaceFolderSnapshots(ownerKey, adaptedFolders);
    if (requireCompleteSnapshot) {
      onComplete(adaptedFolders);
    } else {
      writeBootstrapCacheBestEffort(() =>
        (cache.replaceMessengerFolderSnapshotsCache ?? defaultReplaceMessengerFolderSnapshotsCache)(
          ownerKey,
          adaptedFolders,
          () =>
            isCurrentBootstrap() &&
            !isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
        ),
      );
    }
    return null;
  } catch (folderError) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return requireCompleteSnapshot
        ? { status: "skipped", ownerKey, reason: "stale-owner" }
        : { status: "applied", ownerKey };
    }
    if (!isCurrentBootstrap()) {
      return { status: "skipped", ownerKey, reason: "superseded" };
    }
    if (isAbortError(folderError)) {
      return requireCompleteSnapshot
        ? { status: "skipped", ownerKey, reason: "aborted" }
        : { status: "applied", ownerKey };
    }
    const message = normalizeBootstrapError(folderError);
    store.getState().setBootstrapError(ownerKey, message);
    return requireCompleteSnapshot ? { status: "failed", ownerKey, error: message } : null;
  }
}

// Runtime checks are needed because orgs and projects can switch.
// If the user already moved to another project, the old API response must not be applied to the store.
export async function bootstrapMessengerStore({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  client = {},
  cache = {
    readMessengerCatalogPayloadCache: defaultReadMessengerCatalogPayloadCache,
    replaceMessengerFolderSnapshotsCache: defaultReplaceMessengerFolderSnapshotsCache,
    writeMessengerCatalogPayloadCache: defaultWriteMessengerCatalogPayloadCache,
  },
  lastMessagesCache,
  clientOptions,
  signal,
  loadDrafts = true,
  restoreCache = true,
  requireCompleteSnapshot = false,
  beforeServerRefresh,
  onStreamsConfirmed,
  store = useMessengerStore,
}: BootstrapMessengerStoreOptions): Promise<MessengerBootstrapResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const bootstrapRequestVersion = store.getState().startBootstrap(ownerKey);
  const isCurrentBootstrap = (): boolean => {
    const state = store.getState();
    return state.ownerKey === ownerKey && state.bootstrapRequestVersion === bootstrapRequestVersion;
  };
  const finishCurrentBootstrapSilently = (): void => {
    if (isCurrentBootstrap()) store.getState().finishBootstrapSilently(ownerKey);
  };
  const currentBootstrapSkipResult = (): MessengerBootstrapResult | null => {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      finishCurrentBootstrapSilently();
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }
    if (!isCurrentBootstrap()) {
      return { status: "skipped", ownerKey, reason: "superseded" };
    }
    return null;
  };
  const isWriteCurrent = (): boolean =>
    isCurrentBootstrap() &&
    !isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal);
  const loadLastMessagesForCurrentSidebar = (revalidateCached = false): void => {
    void loadMessengerLastMessagesForSidebar({
      runtimeContext,
      getRuntimeContext: () => (isCurrentBootstrap() ? getRuntimeContext() : null),
      client: { getMessagesByUuids: client.getMessagesByUuids },
      cache: lastMessagesCache,
      revalidateCached,
      clientOptions,
      signal,
      store,
    });
  };

  let hasFreshCatalog = false;
  let bootstrapError: string | null = null;
  const restoreCachedCatalog = async () => {
    const cached = await (
      cache.readMessengerCatalogPayloadCache ?? defaultReadMessengerCatalogPayloadCache
    )(ownerKey);
    if (cached == null) return;
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) return;

    if (!isCurrentBootstrap() || hasFreshCatalog) return;

    await primeMessengerLastMessagesFromCache({
      ownerKey,
      payload: cached.payload,
      cache: lastMessagesCache,
      isCurrent: () => isWriteCurrent() && !hasFreshCatalog,
    });
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) return;

    const stateAfterMessageHydrate = store.getState();
    if (!isCurrentBootstrap() || hasFreshCatalog) {
      return;
    }

    stateAfterMessageHydrate.replaceBootstrapState(ownerKey, cached.payload);
    // A failed refresh must not prevent late cache hydration or hide its error.
    if (bootstrapError != null) {
      store.getState().setBootstrapError(ownerKey, bootstrapError);
    }
    if (cached.epochVersion != null) {
      store.getState().setRealtimeCursor(ownerKey, cached.epochVersion);
    }
    loadLastMessagesForCurrentSidebar();
  };
  if (restoreCache) void restoreCachedCatalog().catch(() => undefined);

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const catalogReconcileFence = (
    cache.createMessengerCatalogCacheReconcileFence ??
    defaultCreateMessengerCatalogCacheReconcileFence
  )();

  // Drafts have no realtime events. This bootstrap request fills the shared
  // composer store; entering a chat must not start another list request.
  if (loadDrafts) {
    void loadWorkspaceComposerDrafts({
      runtimeContext,
      getRuntimeContext,
      signal,
      resumePending: true,
    }).catch(() => undefined);
  }

  try {
    await beforeServerRefresh?.();
    const skipBeforeRefresh = currentBootstrapSkipResult();
    if (skipBeforeRefresh != null) return skipBeforeRefresh;

    // Streams and topics are needed first: they quickly build the base chat list.
    // Folders are loaded separately below, so a folder error does not break the whole sidebar.
    const [streams, topics] = await Promise.all([
      (client.getStreams ?? defaultGetStreams)(requestOptions),
      (client.getTopics ?? defaultGetTopics)(requestOptions),
    ]);

    const skipAfterCatalogLoad = currentBootstrapSkipResult();
    if (skipAfterCatalogLoad != null) return skipAfterCatalogLoad;

    const payloadWithoutFolders = adaptMessengerBootstrapPayload({
      streams,
      topics,
      folders: [],
    });
    onStreamsConfirmed?.(payloadWithoutFolders.streams);
    hasFreshCatalog = true;
    const preservedFolders = currentFolders(store.getState());
    store.getState().replaceBootstrapState(ownerKey, {
      ...payloadWithoutFolders,
      folders: preservedFolders,
    });
    const writeCatalog =
      cache.writeMessengerCatalogPayloadCache ?? defaultWriteMessengerCatalogPayloadCache;
    if (!requireCompleteSnapshot) {
      writeBootstrapCacheBestEffort(() =>
        writeCatalog(ownerKey, payloadWithoutFolders, {
          mode: "reconcile",
          reconcileFence: catalogReconcileFence,
          reconcileFolders: false,
          isWriteCurrent,
        }),
      );
    }
    loadLastMessagesForCurrentSidebar(true);

    // Folders arrive as a separate user layer above streams.
    const folderResult = await loadBootstrapFolders({
      requestContext,
      getRuntimeContext,
      client,
      cache,
      requestOptions,
      signal,
      ownerKey,
      store,
      isCurrentBootstrap,
      requireCompleteSnapshot,
      onComplete: (folders) => {
        writeBootstrapCacheBestEffort(() =>
          writeCatalog(
            ownerKey,
            { ...payloadWithoutFolders, folders },
            {
              mode: "reconcile",
              reconcileFence: catalogReconcileFence,
              reconcileFolders: true,
              completeCatalog: true,
              isWriteCurrent,
            },
          ),
        );
      },
    });
    if (folderResult != null) return folderResult;

    return currentBootstrapSkipResult() ?? { status: "applied", ownerKey };
  } catch (error) {
    const skipAfterFailure = currentBootstrapSkipResult();
    if (skipAfterFailure != null) return skipAfterFailure;
    if (isAbortError(error)) {
      finishCurrentBootstrapSilently();
      return { status: "skipped", ownerKey, reason: "aborted" };
    }

    const message = normalizeBootstrapError(error);
    bootstrapError = message;
    store.getState().setBootstrapError(ownerKey, message);
    return { status: "failed", ownerKey, error: message };
  }
}
