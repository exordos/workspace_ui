import { useCallback, useEffect, useRef, useState } from "react";
import { refreshExternalAccounts as defaultRefreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
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

const REFRESH_RETRY_DELAY_MS = 500;
const MAX_REFRESH_ATTEMPTS = 10;

export interface DeleteExternalAccountClient {
  deleteExternalAccount?: (options: MessengerClientOptions, accountUuid: string) => Promise<void>;
  refreshExternalAccounts?: typeof defaultRefreshExternalAccounts;
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

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      signal.removeEventListener("abort", finish);
      clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = setTimeout(finish, REFRESH_RETRY_DELAY_MS);
    signal.addEventListener("abort", finish, { once: true });
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

    void (async () => {
      try {
        await (client.deleteExternalAccount ?? defaultDeleteExternalAccount)(
          buildMessengerRequestOptions(runtimeContext, undefined, controller.signal),
          accountUuid,
        );
        if (isInvalidated()) return;

        for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt += 1) {
          await (client.refreshExternalAccounts ?? defaultRefreshExternalAccounts)({
            runtimeContext,
            signal: controller.signal,
          });
          if (isInvalidated()) return;

          const state = useExternalAccountStore.getState();
          const accountStillExists =
            state.ownerKey !== ownerKey ||
            state.accounts.some((account) => account.uuid === accountUuid);
          if (!accountStillExists) {
            onCompleted?.();
            return;
          }
          await waitForRetry(controller.signal);
          if (isInvalidated()) return;
        }

        setError(true);
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
    client.refreshExternalAccounts,
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
