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
import { getExternalAccounts as defaultGetExternalAccounts } from "~/shared/api/messenger-external-accounts.api";
import type { MessengerClientOptions } from "~/shared/api/messenger-transport.internal";
import { isAbortError } from "~/shared/lib/abort-error";
import {
  readWorkspaceExternalAccountCache,
  replaceWorkspaceExternalAccountCache,
} from "~/shared/lib/workspace-external-account-cache-db";
import {
  adaptCachedExternalAccount,
  adaptWorkspaceExternalAccountDto,
  toWorkspaceExternalAccountCacheProfile,
} from "./external-account-adapters.lib";
import { useExternalAccountsStore } from "./external-account.model";
import type { ExternalAccountsStoreState } from "./external-account.model";

export interface ExternalAccountsStoreApi {
  getState: () => Pick<
    ExternalAccountsStoreState,
    | "ownerKey"
    | "loadGeneration"
    | "startOwnerSync"
    | "replaceAccountsForOwner"
    | "setLoadStatusForOwner"
  >;
}

export interface ExternalAccountClientDeps {
  getExternalAccounts?: (
    options: MessengerClientOptions,
  ) => Promise<Awaited<ReturnType<typeof defaultGetExternalAccounts>>>;
}

export type LoadExternalAccountsResult =
  | { status: "applied"; ownerKey: string }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "aborted";
    }
  | { status: "failed"; ownerKey: string; error: string };

export interface LoadExternalAccountsOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: ExternalAccountClientDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  store?: ExternalAccountsStoreApi;
}

function normalizeExternalAccountsError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "External accounts loading failed";
}

function invalidatedRequestReason(signal?: AbortSignal): "aborted" | "stale-owner" {
  return signal?.aborted === true ? "aborted" : "stale-owner";
}

export async function loadExternalAccounts({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  client = {},
  clientOptions,
  signal,
  store = useExternalAccountsStore,
}: LoadExternalAccountsOptions): Promise<LoadExternalAccountsResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: invalidatedRequestReason(signal) };
  }

  const loadGeneration = store.getState().startOwnerSync(ownerKey);
  const cachedAccounts = await readWorkspaceExternalAccountCache(ownerKey);
  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: invalidatedRequestReason(signal) };
  }
  if (cachedAccounts.length > 0) {
    if (
      !store
        .getState()
        .replaceAccountsForOwner(
          ownerKey,
          cachedAccounts.map(adaptCachedExternalAccount),
          Date.now(),
          loadGeneration,
        )
    ) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }
  }

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);

  try {
    const dtos = await (client.getExternalAccounts ?? defaultGetExternalAccounts)(requestOptions);
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: invalidatedRequestReason(signal) };
    }

    const accounts = dtos.map((dto) => adaptWorkspaceExternalAccountDto(dto));
    if (!store.getState().replaceAccountsForOwner(ownerKey, accounts, Date.now(), loadGeneration)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }
    if (store.getState().ownerKey === ownerKey) {
      await replaceWorkspaceExternalAccountCache(
        ownerKey,
        accounts.map(toWorkspaceExternalAccountCacheProfile),
        () =>
          store.getState().ownerKey === ownerKey &&
          store.getState().loadGeneration === loadGeneration &&
          !isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
      );
    }
    return { status: "applied", ownerKey };
  } catch (error) {
    const aborted = isAbortError(error) || signal?.aborted === true;
    if (
      aborted ||
      isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)
    ) {
      return { status: "skipped", ownerKey, reason: aborted ? "aborted" : "stale-owner" };
    }

    const message = normalizeExternalAccountsError(error);
    store.getState().setLoadStatusForOwner(ownerKey, "error", message);
    return { status: "failed", ownerKey, error: message };
  }
}
