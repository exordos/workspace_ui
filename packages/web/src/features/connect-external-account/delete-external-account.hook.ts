import { useCallback, useEffect, useRef, useState } from "react";
import { toWorkspaceExternalAccountCacheProfile } from "~/entities/external-account/external-account-adapters.lib";
import { markExternalAccountLocallyDeleted } from "~/entities/external-account/external-account-realtime-applier.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import { externalChatScopeKey } from "~/entities/external-chat/external-chat-loader.lib";
import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { removeMessengerStreamProjections } from "~/entities/messenger/messenger-stream-projection-cleanup.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { deleteExternalAccount as defaultDeleteExternalAccount } from "~/shared/api/messenger-external-accounts.api";
import type { MessengerClientOptions } from "~/shared/api/messenger-transport.internal";
import { isAbortError } from "~/shared/lib/abort-error";
import { replaceWorkspaceExternalAccountCache } from "~/shared/lib/workspace-external-account-cache-db";

export interface DeleteExternalAccountClient {
  deleteExternalAccount?: (options: MessengerClientOptions, accountUuid: string) => Promise<void>;
}

export interface UseDeleteExternalAccountOptions {
  open: boolean;
  runtimeContext: WorkspaceRuntimeContext | null;
  accountUuid: string | null;
  onCompleted?: () => void;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: DeleteExternalAccountClient;
}

export interface UseDeleteExternalAccountResult {
  deleting: boolean;
  error: boolean;
  remove: () => void;
  reset: () => void;
}

function removeKnownStreamProjections(
  ownerKey: string,
  streamUuids: readonly string[],
  isOwnerCurrent: () => boolean,
): Promise<void> {
  return removeMessengerStreamProjections({
    ownerKey,
    streamUuids,
    removeActiveProjection: true,
    isOwnerCurrent,
  });
}

export function useDeleteExternalAccount({
  open,
  runtimeContext,
  accountUuid,
  onCompleted,
  getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
  client = {},
}: UseDeleteExternalAccountOptions): UseDeleteExternalAccountResult {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const runtimeOwnerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);

  useEffect(() => {
    if (open) return;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, [open]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [accountUuid, runtimeOwnerKey],
  );

  const remove = useCallback(() => {
    if (!open || runtimeContext == null || accountUuid == null || deleting) return;

    const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
    if (requestContext == null) return;
    const ownerKey = workspaceRuntimeOwnerKey(requestContext);
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setDeleting(true);
    setError(false);

    const isInvalidated = () =>
      isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, controller.signal);
    const chatScopeKey = externalChatScopeKey(runtimeContext, accountUuid);
    const externalChatsState = useExternalChatsStore.getState();
    const knownProjectionStreamUuids =
      externalChatsState.scopeKey === chatScopeKey &&
      externalChatsState.externalAccountUuid === accountUuid
        ? externalChatsState.chats
            .filter(
              (chat) =>
                chat.projectId === runtimeContext.projectId && chat.projectionStreamUuid != null,
            )
            .map((chat) => chat.projectionStreamUuid)
            .filter((streamUuid): streamUuid is string => streamUuid != null)
        : [];

    void (async () => {
      try {
        await (client.deleteExternalAccount ?? defaultDeleteExternalAccount)(
          buildMessengerRequestOptions(runtimeContext, undefined, controller.signal),
          accountUuid,
        );
        if (isInvalidated()) return;

        markExternalAccountLocallyDeleted(ownerKey, accountUuid);
        const accountStore = useExternalAccountStore.getState();
        accountStore.removeAccountForOwner(ownerKey, accountUuid);
        useExternalChatsStore.getState().clearAccount(chatScopeKey, accountUuid);
        await removeKnownStreamProjections(
          ownerKey,
          knownProjectionStreamUuids,
          () => !isInvalidated(),
        );
        if (isInvalidated()) return;

        const nextAccountState = useExternalAccountStore.getState();
        if (nextAccountState.ownerKey === ownerKey) {
          await replaceWorkspaceExternalAccountCache(
            ownerKey,
            nextAccountState.accounts.map(toWorkspaceExternalAccountCacheProfile),
            () => !isInvalidated() && useExternalAccountStore.getState().ownerKey === ownerKey,
          );
        }
        if (isInvalidated()) return;
        onCompleted?.();
      } catch (requestError) {
        if (!isAbortError(requestError) && !isInvalidated()) {
          setError(true);
        }
      } finally {
        if (!isInvalidated()) {
          setDeleting(false);
        }
      }
    })();
  }, [
    accountUuid,
    client.deleteExternalAccount,
    deleting,
    getRuntimeContext,
    onCompleted,
    open,
    runtimeContext,
  ]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setDeleting(false);
    setError(false);
  }, []);

  return { deleting, error, remove, reset };
}
