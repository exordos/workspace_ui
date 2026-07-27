import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "~/entities/messenger/messenger-request-options.lib";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { getExternalChats } from "~/shared/api/messenger-external-chats.api";
import { isAbortError } from "~/shared/lib/abort-error";
import { adaptWorkspaceExternalChatDto } from "./external-chat-adapters.lib";
import { useExternalChatsStore } from "./external-chat.model";

export function externalChatScopeKey(
  runtimeContext: WorkspaceRuntimeContext,
  accountUuid: string,
): string {
  return `${workspaceRuntimeOwnerKey(runtimeContext)}:external-account:${accountUuid}`;
}

export async function loadExternalChats(options: {
  runtimeContext: WorkspaceRuntimeContext;
  accountUuid: string;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
}): Promise<"applied" | "stale" | "failed"> {
  const {
    runtimeContext,
    accountUuid,
    getRuntimeContext = () => runtimeContext,
    clientOptions,
    signal,
  } = options;
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) return "stale";
  const scopeKey = externalChatScopeKey(runtimeContext, accountUuid);
  const loadGeneration = useExternalChatsStore.getState().start(scopeKey, accountUuid);
  try {
    const dtos = await getExternalChats(
      buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
      accountUuid,
    );
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return "stale";
    }
    return useExternalChatsStore
      .getState()
      .replace(scopeKey, accountUuid, loadGeneration, dtos.map(adaptWorkspaceExternalChatDto))
      ? "applied"
      : "stale";
  } catch (error) {
    if (
      isAbortError(error) ||
      isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)
    ) {
      return "stale";
    }
    useExternalChatsStore
      .getState()
      .fail(
        scopeKey,
        accountUuid,
        loadGeneration,
        error instanceof Error ? error.message : "External chats loading failed",
      );
    return "failed";
  }
}
