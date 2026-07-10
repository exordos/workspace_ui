import React, { useEffect, useMemo } from "react";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { ConnectExternalAccountDialog } from "~/features/connect-external-account/connect-external-account-dialog.ui";
import { useTranslation } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";

export const RightPanelConnectExternalAccountDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  return (
    <ConnectExternalAccountDialog
      open={open}
      onOpenChange={onOpenChange}
      runtimeContext={runtimeContext}
    />
  );
};

export const RightPanelExternalAccountsList: React.FC = () => {
  const { t } = useTranslation();
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const accounts = useExternalAccountStore((state) => state.accounts);

  useEffect(() => {
    if (runtimeContext == null) return;
    void refreshExternalAccounts({ runtimeContext }).catch(() => undefined);
  }, [runtimeContext]);

  if (accounts.length === 0) {
    return <p className="text-[11px] text-text-muted">{t("connectExternalAccount.noAccounts")}</p>;
  }

  return (
    <ul className="space-y-1">
      {accounts.map((account) => (
        <li key={account.uuid}>
          <details className="group rounded-md hover:bg-bg-elevated">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-2 px-1.5 py-1 text-xs"
              title={account.serverUrl}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-[10px] font-bold text-on-accent">
                  Z
                </span>
                <span className="truncate text-text-primary">{account.serverUrl}</span>
              </span>
              <Icon
                name="chevron-right"
                size={13}
                className="text-text-muted transition-transform group-open:rotate-90"
              />
            </summary>
            <div className="px-8 pb-2 text-[11px] text-text-muted">
              <div>
                {account.accessStatus === "confirmed"
                  ? t("connectExternalAccount.status.connected")
                  : account.accessStatus === "invalid_credentials"
                    ? t("connectExternalAccount.errors.invalidCredentials")
                    : account.accessStatus === "unavailable"
                      ? t("connectExternalAccount.errors.unavailable")
                      : t("connectExternalAccount.status.checking")}
              </div>
              {account.accessLastError != null && <div>{account.accessLastError}</div>}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
};

export const ExternalAccountConnectActionIcon: React.FC = () => (
  <Icon name="plus" size={14} className="text-current" />
);
