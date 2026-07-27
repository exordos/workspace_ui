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
        <Button type="button" variant="ghost" className="mt-3" onClick={onReset}>
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
    renderChatsStep,
  }) {
    const handleCompleted = useCallback(() => onOpenChange(false), [onOpenChange]);
    const vm = useConnectExternalAccount({
      open,
      runtimeContext,
      reconnectAccount,
      hasChatsStep: renderChatsStep != null,
      onCompleted: handleCompleted,
    });
    const showForm =
      vm.phase === "credentials" &&
      (vm.lifecycleAccount == null || vm.lifecycleAccount.status === "auth_required");
    const showLifecycle =
      vm.lifecycleAccount != null && vm.phase !== "chats" && vm.phase !== "automaticDone";
    const title =
      vm.phase === "chats"
        ? t("connectExternalAccount.chatsStep.title")
        : vm.phase === "automaticDone"
          ? t("connectExternalAccount.done.title")
          : vm.reconnecting
            ? t("connectExternalAccount.reconnectTitle")
            : t("connectExternalAccount.title");
    const description =
      vm.phase === "chats"
        ? t("connectExternalAccount.chatsStep.description")
        : vm.phase === "automaticDone"
          ? t("connectExternalAccount.done.description")
          : t("connectExternalAccount.description");

    return (
      <AppDialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        positionClassName="top-1/2 -translate-y-1/2"
        maxWidthClassName={vm.phase === "chats" ? "max-w-2xl" : "max-w-lg"}
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
            {t("connectExternalAccount.status.connecting")}
          </div>
        ) : null}
        {showForm ? (
          <ConnectExternalAccountForm
            draft={vm.draft}
            duplicateZulip={vm.duplicateZulip}
            submitting={vm.submitting}
            error={vm.error}
            showSyncSettings={!vm.reconnecting}
            onProviderChange={vm.setProvider}
            onServerUrlChange={vm.setServerUrl}
            onEmailChange={vm.setEmail}
            onApiKeyChange={vm.setApiKey}
            onSelectionModeChange={vm.setSelectionMode}
            onHistoryDepthChange={vm.setHistoryDepth}
            onSubmit={vm.submit}
          />
        ) : null}
        {vm.phase === "chats" && runtimeContext != null && vm.lifecycleAccount != null
          ? renderChatsStep?.(runtimeContext, vm.lifecycleAccount)
          : null}
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
