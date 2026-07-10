import type { MessengerRequestOptionsOverrides } from "~/entities/messenger/messenger-request-options.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import { type getExternalAccounts as defaultGetExternalAccounts } from "~/shared/api/messenger-external-accounts.api";
import { loadExternalAccounts } from "./external-account-loader.lib";
import { useExternalAccountStore } from "./external-account.model";

export interface ExternalAccountSyncOptions {
  runtimeContext: WorkspaceRuntimeContext;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: {
    getExternalAccounts?: (
      options: MessengerClientOptions,
    ) => ReturnType<typeof defaultGetExternalAccounts>;
  };
  signal?: AbortSignal;
}

export async function refreshExternalAccounts({
  runtimeContext,
  clientOptions,
  client = {},
  signal,
}: ExternalAccountSyncOptions): Promise<void> {
  const result = await loadExternalAccounts({
    runtimeContext,
    client,
    clientOptions,
    signal,
    store: useExternalAccountStore,
  });
  if (result.status === "failed") {
    throw new Error(result.error);
  }
}
