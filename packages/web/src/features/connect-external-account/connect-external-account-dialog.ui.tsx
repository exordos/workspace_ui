import React from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogCancelButton } from "~/shared/ui/app-dialog.ui";
import { ConnectExternalAccountForm } from "./connect-external-account-form.ui";
import { useConnectExternalAccount } from "./connect-external-account.hook";
import type { ConnectExternalAccountDialogProps } from "./connect-external-account.types";

export const ConnectExternalAccountDialog = React.memo<ConnectExternalAccountDialogProps>(
  function ConnectExternalAccountDialog({ open, onOpenChange, runtimeContext }) {
    const vm = useConnectExternalAccount({
      open,
      runtimeContext,
      onCompleted: () => onOpenChange(false),
    });

    return (
      <AppDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("connectExternalAccount.title")}
        description={t("connectExternalAccount.description")}
        positionClassName="top-1/2 -translate-y-1/2"
        maxWidthClassName="max-w-lg"
        footer={
          <DialogCancelButton onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </DialogCancelButton>
        }
      >
        <div className="mb-4 rounded-lg border border-border-subtle bg-bg px-3 py-2">
          <p className="text-xs font-medium text-text-primary">
            {t("connectExternalAccount.connectedAccounts")}
          </p>
          {vm.loadingAccounts ? (
            <p className="mt-1 text-xs text-text-muted">
              {t("connectExternalAccount.status.checking")}
            </p>
          ) : vm.accounts.length === 0 ? (
            <p className="mt-1 text-xs text-text-muted">{t("connectExternalAccount.noAccounts")}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {vm.accounts.map((account) => (
                <li key={account.uuid} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-[10px] font-bold text-on-accent">
                      Z
                    </span>
                    <span className="truncate text-text-primary" title={account.serverUrl}>
                      {account.serverUrl}
                    </span>
                  </span>
                  <span className="shrink-0 text-text-muted">
                    {account.accessStatus === "confirmed"
                      ? t("connectExternalAccount.status.connected")
                      : account.accessStatus === "invalid_credentials"
                        ? t("connectExternalAccount.errors.invalidCredentials")
                        : account.accessStatus === "unavailable"
                          ? t("connectExternalAccount.errors.unavailable")
                          : t("connectExternalAccount.status.checking")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {vm.duplicateZulip ? (
          <p className="text-sm text-text-muted">
            {t("connectExternalAccount.errors.alreadyConnectedHint")}
          </p>
        ) : (
          <ConnectExternalAccountForm
            draft={vm.draft}
            accounts={vm.accounts}
            submitting={vm.submitting}
            error={vm.error}
            onProviderChange={vm.setProvider}
            onServerUrlChange={vm.setServerUrl}
            onLoginChange={vm.setLogin}
            onTokenChange={vm.setToken}
            onSubmit={vm.submit}
          />
        )}
      </AppDialog>
    );
  },
);
