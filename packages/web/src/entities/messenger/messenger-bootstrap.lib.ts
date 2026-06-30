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
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUserDto,
} from "~/shared/api/messenger.types";
import { adaptMessengerBootstrapPayload } from "./messenger-adapters.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";

type MessengerBootstrapClientOptions = Pick<
  MessengerClientOptions,
  "baseUrl" | "devTargetOrigin" | "fetchImpl" | "projectId"
>;
type MessengerBootstrapClientCall<T> = (options: MessengerClientOptions) => Promise<T[]>;

// Bootstrap loads the project snapshot needed to draw the first chat shell.
export interface MessengerBootstrapClientDeps {
  getStreams?: MessengerBootstrapClientCall<WorkspaceMessengerStreamDto>;
  getTopics?: MessengerBootstrapClientCall<WorkspaceMessengerTopicDto>;
  getFolders?: MessengerBootstrapClientCall<WorkspaceMessengerFolderDto>;
  getUsers?: MessengerBootstrapClientCall<WorkspaceMessengerUserDto>;
}

export interface MessengerStoreApi {
  getState: () => Pick<
    MessengerStoreState,
    "startBootstrap" | "replaceBootstrapState" | "setBootstrapError"
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
  clientOptions?: MessengerBootstrapClientOptions;
  signal?: AbortSignal;
  store?: MessengerStoreApi;
}

function normalizeBootstrapError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Messenger bootstrap failed";
}

// Runtime checks stop old project responses from replacing the active project.
export async function bootstrapMessengerStore({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  client = {},
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

  const requestOptions: MessengerClientOptions = {
    ...clientOptions,
    accessToken: runtimeContext.accessToken,
    projectId: clientOptions?.projectId ?? runtimeContext.projectId,
    signal,
  };

  try {
    const [streams, topics, folders, users] = await Promise.all([
      (client.getStreams ?? defaultGetStreams)(requestOptions),
      (client.getTopics ?? defaultGetTopics)(requestOptions),
      (client.getFolders ?? defaultGetFolders)(requestOptions),
      (client.getUsers ?? defaultGetUsers)(requestOptions),
    ]);

    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const payload = adaptMessengerBootstrapPayload({
      streams,
      topics,
      folders,
      users,
    });
    store.getState().replaceBootstrapState(ownerKey, payload);
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
