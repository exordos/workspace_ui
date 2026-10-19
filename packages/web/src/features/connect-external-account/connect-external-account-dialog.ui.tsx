import React, { useCallback } from "react";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogCancelButton } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";
import { ConnectExternalAccountForm } from "./connect-external-account-form.ui";
import { useConnectExternalAccount } from "./connect-external-account.hook";
import type { ConnectExternalAccountDialogProps } from "./connect-external-account.types";

function lifecycleText(account: ExternalAccount): string {
  if (account.liveReady) return t("connectExternalAccount.status.connected");
  return t(`connectExternalAccount.status.${account.status}`);
}

const AccountLifecycle = React.memo<{
  account: ExternalAccount;
  onReset: () => void;
}>(({ account, onReset }) => {
  const needsCredentials = account.status === "auth_required" || account.status === "degraded";
  const isError = needsCredentials || account.status === "degraded";
  return (
    <div
      className={`rounded-lg border px-3 py-3 text-sm ${
        isError
          ? "border-notice-base/20 bg-notice-base/10 text-notice-base"
          : "border-border-subtle bg-bg text-text-primary"
      }`}
      role={isError ? "alert" : "status"}
    >
      <p className="font-medium">{lifecycleText(account)}</p>
      {account.safeError != null ? (
        <p className="mt-1 break-words text-xs">{account.safeError}</p>
      ) : null}
      {needsCredentials ? (
        <Button
          type="button"
          variant="neutral"
          appearance="ghost"
          className="mt-3"
          onClick={onReset}
        >
          {t("connectExternalAccount.reenterCredentials")}
        </Button>
      ) : null}
    </div>
  );
});

export const ConnectExternalAccountDialog = React.memo<ConnectExternalAccountDialogProps>(
  function ConnectExternalAccountDialog({
    open,
    onOpenChange,
    runtimeContext,
    reconnectAccount = null,
    editAccount = null,
  }) {
    const handleCompleted = useCallback(() => onOpenChange(false), [onOpenChange]);
    const vm = useConnectExternalAccount({
      open,
      runtimeContext,
      reconnectAccount,
      editAccount,
      onCompleted: handleCompleted,
    });
    const showForm =
      vm.phase === "credentials" &&
      (vm.lifecycleAccount == null || vm.lifecycleAccount.status === "auth_required");
    const showLifecycle = vm.lifecycleAccount != null && vm.phase !== "automaticDone";
    let title = t("connectExternalAccount.title");
    let description = t("connectExternalAccount.description");
    if (vm.phase === "automaticDone") {
      title = t("connectExternalAccount.done.title");
      description = t("connectExternalAccount.done.description");
    } else if (editAccount != null) {
      title = t("connectExternalAccount.edit.title");
      description = t("connectExternalAccount.edit.description");
    } else if (vm.reconnecting) {
      title = t("connectExternalAccount.reconnectTitle");
    }

    return (
      <AppDialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        positionClassName="top-1/2 -translate-y-1/2"
        maxWidthClassName="max-w-lg"
        footer={
          vm.phase === "automaticDone" ? (
            <DialogCancelButton onClick={() => onOpenChange(false)}>
              {t("connectExternalAccount.done.action")}
            </DialogCancelButton>
          ) : undefined
        }
      >
        {showLifecycle ? (
          <div className="mb-4">
            <AccountLifecycle account={vm.lifecycleAccount!} onReset={vm.resetCredentials} />
          </div>
        ) : null}
        {vm.phase === "checking" && vm.lifecycleAccount == null ? (
          <div
            className="rounded-lg border border-border-subtle bg-bg px-3 py-3 text-sm text-text-primary"
            role="status"
          >
            {t(
              vm.reconnecting
                ? "connectExternalAccount.status.connecting"
                : "connectExternalAccount.status.saving",
            )}
          </div>
        ) : null}
        {showForm ? (
          <ConnectExternalAccountForm
            editing={editAccount != null}
            draft={vm.draft}
            duplicateZulip={vm.duplicateZulip}
            submitting={vm.submitting}
            error={vm.error}
            onProviderChange={vm.setProvider}
            onServerUrlChange={vm.setServerUrl}
            onEmailChange={vm.setEmail}
            onApiKeyChange={vm.setApiKey}
            onSubmit={vm.submit}
          />
        ) : null}
        {vm.phase === "automaticDone" ? (
          <div
            className="border-accent/30 rounded-lg border bg-accent-soft px-4 py-4 text-sm text-text-primary"
            role="status"
          >
            {t("connectExternalAccount.done.message")}
          </div>
        ) : null}
      </AppDialog>
    );
  },
);
