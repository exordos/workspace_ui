import React from "react";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { ZulipExternalAccountCard } from "~/features/connect-external-account/zulip-external-account-card.ui";
import { ExternalIntegrationAdminPanel } from "~/features/external-integration-admin/external-integration-admin.ui";
import { ManageExternalAccount } from "~/features/manage-external-account/manage-external-account.ui";

export interface ExternalAccountSettingsProps {
  runtimeContext: WorkspaceRuntimeContext;
}

export const ExternalAccountSettings = React.memo<ExternalAccountSettingsProps>(
  function ExternalAccountSettings({ runtimeContext }) {
    const accounts = useExternalAccountStore((state) => state.accounts);
    const ownerKey = useExternalAccountStore((state) => state.ownerKey);
    const runtimeOwnerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const zulipAccount =
      ownerKey === runtimeOwnerKey
        ? (accounts.find((account) => account.accountType === "zulip") ?? null)
        : null;

    return (
      <>
        <ZulipExternalAccountCard runtimeContext={runtimeContext} />
        {zulipAccount != null && (
          <ManageExternalAccount
            key={`${zulipAccount.uuid}:${zulipAccount.revision}`}
            runtimeContext={runtimeContext}
            account={zulipAccount}
          />
        )}
        <ExternalIntegrationAdminPanel runtimeContext={runtimeContext} />
      </>
    );
  },
);
