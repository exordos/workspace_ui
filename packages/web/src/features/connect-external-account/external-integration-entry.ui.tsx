import React, { useEffect, useState } from "react";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { ConfigureExternalChatsDialog } from "~/features/configure-external-chats/configure-external-chats-dialog.ui";
import { canConfigureExternalChats } from "~/features/configure-external-chats/configure-external-chats.lib";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { ConnectExternalAccountDialog } from "./connect-external-account-dialog.ui";
import { DeleteExternalAccountDialog } from "./delete-external-account-dialog.ui";

function integrationStatusText(account: ExternalAccount | null): string {
  if (account == null) return t("connectExternalAccount.servicesHint");
  if (account.liveReady) return t("connectExternalAccount.status.connected");
  return t(`connectExternalAccount.status.${account.status}`);
}

export const ExternalIntegrationEntry = React.memo<{
  runtimeContext: WorkspaceRuntimeContext | null;
}>(function ExternalIntegrationEntry({ runtimeContext }) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const account = useExternalAccountStore((state) => {
    if (runtimeContext == null || state.ownerKey !== workspaceRuntimeOwnerKey(runtimeContext)) {
      return null;
    }
    return state.accounts.find((item) => item.provider === "zulip") ?? null;
  });

  useEffect(() => {
    if (runtimeContext == null) return;
    void refreshExternalAccounts({ runtimeContext }).catch(() => undefined);
  }, [runtimeContext]);

  const statusText = integrationStatusText(account);
  let actionText = t("connectExternalAccount.connect");
  if (account != null) {
    actionText =
      account.status === "auth_required" || account.status === "degraded"
        ? t("connectExternalAccount.reconnect")
        : t("connectExternalAccount.manage");
  }

  return (
    <li className="flex min-h-[170px] flex-col justify-between rounded-xl border border-border-subtle bg-card-bg p-4">
      <div className="space-y-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-subtle bg-bg">
          <Icon name="links" size={22} className="text-accent" />
        </span>
        <div>
          <h2 className="text-sm font-medium text-text-primary">
            {t("connectExternalAccount.servicesTitle")}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{statusText}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={runtimeContext == null}
          className="inline-flex w-fit rounded-md bg-accent px-2.5 py-1 text-xs text-on-accent disabled:opacity-50"
        >
          {actionText}
        </button>
        {account != null ? (
          <>
            {runtimeContext != null && canConfigureExternalChats(account) ? (
              <button
                type="button"
                onClick={() => setChatsOpen(true)}
                className="inline-flex w-fit rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-primary"
              >
                {account.settings.selectionMode === "all"
                  ? t("configureExternalChats.automaticAction")
                  : t("configureExternalChats.action")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={runtimeContext == null}
              className="border-danger/30 hover:bg-danger/10 inline-flex w-fit rounded-md border px-2.5 py-1 text-xs text-danger disabled:opacity-50"
            >
              {t("connectExternalAccount.delete.action")}
            </button>
          </>
        ) : null}
      </div>
      <ConnectExternalAccountDialog
        open={open}
        onOpenChange={setOpen}
        runtimeContext={runtimeContext}
        reconnectAccount={
          account?.status === "auth_required" || account?.status === "degraded" ? account : null
        }
      />
      <DeleteExternalAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        runtimeContext={runtimeContext}
        accountUuid={account?.uuid ?? null}
      />
      {runtimeContext != null && account != null && canConfigureExternalChats(account) ? (
        <ConfigureExternalChatsDialog
          open={chatsOpen}
          onOpenChange={setChatsOpen}
          runtimeContext={runtimeContext}
          account={account}
        />
      ) : null}
    </li>
  );
});
