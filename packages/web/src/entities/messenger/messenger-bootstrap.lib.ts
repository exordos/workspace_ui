import { loadWorkspaceComposerDrafts } from "~/entities/composer-draft/composer-draft-loader.lib";
import {
  applyBootstrapUsers,
  hydrateUsersFromCache,
  markUsersSyncError,
} from "~/entities/user/user-sync.lib";
import type { UserCacheDeps, UserSyncClientDeps } from "~/entities/user/user-sync.lib";
import { useUsersStore } from "~/entities/user/user.model";
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
import { getUsers as defaultGetUsers } from "~/shared/api/workspace-client";
import { isAbortError } from "~/shared/lib/abort-error";
import { adaptMessengerBootstrapPayload, adaptMessengerFolder } from "./messenger-adapters.lib";
import {
  createMessengerCatalogCacheReconcileFence as defaultCreateMessengerCatalogCacheReconcileFence,
  replaceMessengerFolderSnapshotsCache as defaultReplaceMessengerFolderSnapshotsCache,
  readMessengerCatalogPayloadCache as defaultReadMessengerCatalogPayloadCache,
  writeMessengerCatalogPayloadCache as defaultWriteMessengerCatalogPayloadCache,
  type MessengerCatalogPayloadCacheWriteOptions,
  type MessengerCatalogCachePayload,
} from "./messenger-cache.lib";
import {
  loadMessengerLastMessagesForSidebar,
  primeMessengerLastMessagesFromCache,
  type MessengerLastMessagesCacheDeps,
} from "./messenger-last-messages-loader.lib";
import {
  buildMessengerRequestOptions,
  buildWorkspaceRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerFolder } from "./messenger.types";
type MessengerBootstrapClientCall<T> = (options: MessengerClientOptions) => Promise<T[]>;
type BootstrapUsers = Awaited<ReturnType<NonNullable<UserSyncClientDeps["getUsers"]>>>;
type BootstrapUsersResult =
  | { status: "fulfilled"; value: BootstrapUsers }
  | { status: "rejected"; reason: unknown };

// Load a minimal project snapshot for the new Workspace messenger path.
// This is not the old Zulip chat list: data goes directly into the separate messenger store.
export interface MessengerBootstrapClientDeps {
  getStreams?: MessengerBootstrapClientCall<WorkspaceMessengerStreamDto>;
  getTopics?: MessengerBootstrapClientCall<WorkspaceMessengerTopicDto>;
  getFolders?: MessengerBootstrapClientCall<WorkspaceMessengerFolderDto>;
  getUsers?: UserSyncClientDeps["getUsers"];
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
  store?: MessengerStoreApi;
  userCache?: Pick<UserCacheDeps, "readUsersCache" | "replaceUsersCache">;
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
}: BootstrapFoldersOptions): Promise<MessengerBootstrapResult | null> {
  try {
    const folders = await (client.getFolders ?? defaultGetFolders)(requestOptions);
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "applied", ownerKey };
    }
    if (!isCurrentBootstrap()) {
      return { status: "skipped", ownerKey, reason: "superseded" };
    }

    const adaptedFolders = folders.map(adaptMessengerFolder);
    store.getState().replaceFolderSnapshots(ownerKey, adaptedFolders);
    writeBootstrapCacheBestEffort(() =>
      (cache.replaceMessengerFolderSnapshotsCache ?? defaultReplaceMessengerFolderSnapshotsCache)(
        ownerKey,
        adaptedFolders,
      ),
    );
    return null;
  } catch (folderError) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "applied", ownerKey };
    }
    if (!isCurrentBootstrap()) {
      return { status: "skipped", ownerKey, reason: "superseded" };
    }
    if (isAbortError(folderError)) {
      return { status: "applied", ownerKey };
    }
    const message = normalizeBootstrapError(folderError);
    store.getState().setBootstrapError(ownerKey, message);
    return null;
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
  store = useMessengerStore,
  userCache,
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
  useUsersStore.getState().startOwnerSync(ownerKey);
  void hydrateUsersFromCache({
    ownerKey,
    requestContext,
    getRuntimeContext,
    signal,
    cache: userCache,
  });
  const loadLastMessagesForCurrentSidebar = (): void => {
    void loadMessengerLastMessagesForSidebar({
      runtimeContext,
      getRuntimeContext,
      client: { getMessagesByUuids: client.getMessagesByUuids },
      cache: lastMessagesCache,
      clientOptions,
      signal,
      store,
    });
  };

  void (async () => {
    const cached = await (
      cache.readMessengerCatalogPayloadCache ?? defaultReadMessengerCatalogPayloadCache
    )(ownerKey);
    if (cached == null) return;
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) return;

    const currentState = store.getState();
    if (!isCurrentBootstrap() || !currentState.isLoading) return;

    await primeMessengerLastMessagesFromCache({
      ownerKey,
      payload: cached.payload,
      cache: lastMessagesCache,
    });
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) return;

    const stateAfterMessageHydrate = store.getState();
    if (!isCurrentBootstrap() || !stateAfterMessageHydrate.isLoading) {
      return;
    }

    stateAfterMessageHydrate.replaceBootstrapState(ownerKey, cached.payload);
    if (cached.epochVersion != null) {
      store.getState().setRealtimeCursor(ownerKey, cached.epochVersion);
    }
    loadLastMessagesForCurrentSidebar();
  })();

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const workspaceRequestOptions = buildWorkspaceRequestOptions(
    runtimeContext,
    clientOptions,
    signal,
  );
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
    // Streams and topics are needed first: they quickly build the base chat list.
    // Folders are loaded separately below, so a folder error does not break the whole sidebar.
    const usersRequest: Promise<BootstrapUsersResult> = (client.getUsers ?? defaultGetUsers)(
      workspaceRequestOptions,
    ).then(
      (value) => ({ status: "fulfilled", value }),
      (reason: unknown) => ({ status: "rejected", reason }),
    );
    const [streams, topics, usersResult] = await Promise.all([
      (client.getStreams ?? defaultGetStreams)(requestOptions),
      (client.getTopics ?? defaultGetTopics)(requestOptions),
      usersRequest,
    ]);

    const skipAfterCatalogLoad = currentBootstrapSkipResult();
    if (skipAfterCatalogLoad != null) return skipAfterCatalogLoad;

    if (usersResult.status === "fulfilled") {
      const usersSyncResult = applyBootstrapUsers(usersResult.value, {
        ownerKey,
        requestContext,
        getRuntimeContext,
        signal,
        cache: userCache,
      });
      if (usersSyncResult.status === "skipped") {
        finishCurrentBootstrapSilently();
        return { status: "skipped", ownerKey, reason: "stale-owner" };
      }
    } else {
      markUsersSyncError(usersResult.reason, {
        ownerKey,
        requestContext,
        getRuntimeContext,
        signal,
      });
    }

    const payloadWithoutFolders = adaptMessengerBootstrapPayload({
      streams,
      topics,
      folders: [],
    });
    await primeMessengerLastMessagesFromCache({
      ownerKey,
      payload: payloadWithoutFolders,
      cache: lastMessagesCache,
    });
    const skipAfterMessageHydrate = currentBootstrapSkipResult();
    if (skipAfterMessageHydrate != null) return skipAfterMessageHydrate;

    const preservedFolders = currentFolders(store.getState());
    store.getState().replaceBootstrapState(ownerKey, {
      ...payloadWithoutFolders,
      folders: preservedFolders,
    });
    writeBootstrapCacheBestEffort(() =>
      (cache.writeMessengerCatalogPayloadCache ?? defaultWriteMessengerCatalogPayloadCache)(
        ownerKey,
        payloadWithoutFolders,
        {
          mode: "reconcile",
          reconcileFence: catalogReconcileFence,
          reconcileFolders: false,
        },
      ),
    );
    loadLastMessagesForCurrentSidebar();

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
    });
    if (folderResult != null) return folderResult;

    return { status: "applied", ownerKey };
  } catch (error) {
    const skipAfterFailure = currentBootstrapSkipResult();
    if (skipAfterFailure != null) return skipAfterFailure;
    if (isAbortError(error)) {
      finishCurrentBootstrapSilently();
      return { status: "skipped", ownerKey, reason: "aborted" };
    }

    const message = normalizeBootstrapError(error);
    store.getState().setBootstrapError(ownerKey, message);
    return { status: "failed", ownerKey, error: message };
  }
}
