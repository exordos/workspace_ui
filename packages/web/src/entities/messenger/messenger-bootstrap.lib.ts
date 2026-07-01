import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getFolders as defaultGetFolders,
  getStreams as defaultGetStreams,
  getStreamTopics as defaultGetTopics,
  getUsers as defaultGetUsers,
} from "~/shared/api/messenger-client";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUserDto,
} from "~/shared/api/messenger.types";
import { adaptMessengerBootstrapPayload, adaptMessengerFolder } from "./messenger-adapters.lib";
import {
  readMessengerCatalogPayloadCache as defaultReadMessengerCatalogPayloadCache,
  writeMessengerCatalogPayloadCache as defaultWriteMessengerCatalogPayloadCache,
  writeMessengerFolderSnapshotCache as defaultWriteMessengerFolderSnapshotCache,
  type MessengerCatalogCachePayload,
} from "./messenger-cache.lib";
import { loadMessengerLastMessagesForSidebar } from "./messenger-last-messages-loader.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
type MessengerBootstrapClientCall<T> = (options: MessengerClientOptions) => Promise<T[]>;

// Load a minimal project snapshot for the new Workspace messenger path.
// This is not the old Zulip chat list: data goes directly into the separate messenger store.
export interface MessengerBootstrapClientDeps {
  getStreams?: MessengerBootstrapClientCall<WorkspaceMessengerStreamDto>;
  getTopics?: MessengerBootstrapClientCall<WorkspaceMessengerTopicDto>;
  getFolders?: MessengerBootstrapClientCall<WorkspaceMessengerFolderDto>;
  getUsers?: MessengerBootstrapClientCall<WorkspaceMessengerUserDto>;
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
  ) => Promise<void> | void;
  writeMessengerFolderSnapshotCache?: (
    ownerKey: string,
    folder: ReturnType<typeof adaptMessengerFolder>,
  ) => Promise<void> | void;
}

export interface MessengerStoreApi {
  getState: () => Pick<
    MessengerStoreState,
    | "startBootstrap"
    | "replaceBootstrapState"
    | "applyFolderSnapshot"
    | "setBootstrapError"
    | "streamIds"
    | "streamsById"
    | "topicIds"
    | "topicsById"
    | "conversationIds"
    | "conversationsById"
    | "setRealtimeCursor"
    | "ownerKey"
    | "isLoading"
  >;
}

export type MessengerBootstrapResult =
  | { status: "applied"; ownerKey: string }
  | { status: "skipped"; ownerKey: string | null; reason: "missing-context" | "stale-owner" }
  | { status: "failed"; ownerKey: string; error: string };

export interface BootstrapMessengerStoreOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerBootstrapClientDeps;
  cache?: MessengerBootstrapCacheDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
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

// Runtime checks are needed because orgs and projects can switch.
// If the user already moved to another project, the old API response must not be applied to the store.
export async function bootstrapMessengerStore({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  client = {},
  cache = {
    readMessengerCatalogPayloadCache: defaultReadMessengerCatalogPayloadCache,
    writeMessengerCatalogPayloadCache: defaultWriteMessengerCatalogPayloadCache,
    writeMessengerFolderSnapshotCache: defaultWriteMessengerFolderSnapshotCache,
  },
  clientOptions,
  signal,
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

  store.getState().startBootstrap(ownerKey);

  void (async () => {
    const cached = await (
      cache.readMessengerCatalogPayloadCache ?? defaultReadMessengerCatalogPayloadCache
    )(ownerKey);
    if (cached == null) return;
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) return;

    const currentState = store.getState();
    if (currentState.ownerKey !== ownerKey || !currentState.isLoading) return;

    currentState.replaceBootstrapState(ownerKey, cached.payload);
    if (cached.epochVersion != null) {
      store.getState().setRealtimeCursor(ownerKey, cached.epochVersion);
    }
  })();

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);

  try {
    // Streams and topics are needed first: they quickly build the base chat list.
    // Folders are loaded separately below, so a folder error does not break the whole sidebar.
    const [streams, topics, users] = await Promise.all([
      (client.getStreams ?? defaultGetStreams)(requestOptions),
      (client.getTopics ?? defaultGetTopics)(requestOptions),
      (client.getUsers ?? defaultGetUsers)(requestOptions),
    ]);

    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const payload = adaptMessengerBootstrapPayload({
      streams,
      topics,
      folders: [],
      users,
    });
    store.getState().replaceBootstrapState(ownerKey, payload);
    writeBootstrapCacheBestEffort(() =>
      (cache.writeMessengerCatalogPayloadCache ?? defaultWriteMessengerCatalogPayloadCache)(
        ownerKey,
        payload,
      ),
    );
    void loadMessengerLastMessagesForSidebar({
      runtimeContext,
      getRuntimeContext,
      client: { getMessagesByUuids: client.getMessagesByUuids },
      clientOptions,
      signal,
      store,
    });

    try {
      // Folders arrive as a separate user layer above streams.
      // Apply them as snapshots: when a folder arrives, update only that part.
      const folders = await (client.getFolders ?? defaultGetFolders)(requestOptions);
      if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
        return { status: "applied", ownerKey };
      }

      for (const folder of folders.map(adaptMessengerFolder)) {
        store.getState().applyFolderSnapshot(ownerKey, folder);
        writeBootstrapCacheBestEffort(() =>
          (cache.writeMessengerFolderSnapshotCache ?? defaultWriteMessengerFolderSnapshotCache)(
            ownerKey,
            folder,
          ),
        );
      }
    } catch (folderError) {
      if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
        return { status: "applied", ownerKey };
      }
      const message = normalizeBootstrapError(folderError);
      store.getState().setBootstrapError(ownerKey, message);
    }

    return { status: "applied", ownerKey };
  } catch (error) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const message = normalizeBootstrapError(error);
    store.getState().setBootstrapError(ownerKey, message);
    return { status: "failed", ownerKey, error: message };
  }
}
