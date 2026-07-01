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
import { loadMessengerLastMessagesForSidebar } from "./messenger-last-messages-loader.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
type MessengerBootstrapClientCall<T> = (options: MessengerClientOptions) => Promise<T[]>;

// Загружаем минимальный снимок проекта для новой ветки Workspace-мессенджера.
// Это не старый Zulip-список чатов: данные сразу кладутся в отдельный messenger store.
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
    | "messagesById"
    | "upsertMessage"
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

// Проверки runtime нужны из-за переключения организаций и проектов.
// Если пользователь уже ушёл в другой проект, старый ответ API нельзя применять в store.
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

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);

  try {
    // Потоки и темы нужны первыми: из них можно быстро собрать базовый список чатов.
    // Папки догружаем ниже отдельно, чтобы ошибка папок не ломала весь сайдбар.
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
    void loadMessengerLastMessagesForSidebar({
      runtimeContext,
      getRuntimeContext,
      client: { getMessagesByUuids: client.getMessagesByUuids },
      clientOptions,
      signal,
      store,
    });

    try {
      // Папки приходят как отдельный пользовательский слой поверх потоков.
      // Поэтому применяем их снимками: пришла папка - обновили только её часть.
      const folders = await (client.getFolders ?? defaultGetFolders)(requestOptions);
      if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
        return { status: "applied", ownerKey };
      }

      for (const folder of folders.map(adaptMessengerFolder)) {
        store.getState().applyFolderSnapshot(ownerKey, folder);
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
