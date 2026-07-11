import React, { useEffect, useMemo } from "react";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { ConnectExternalAccountDialog } from "~/features/connect-external-account/connect-external-account-dialog.ui";
import { useTranslation } from "~/i18n/i18n";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { Avatar } from "~/shared/ui/avatar";
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
  const accountOwnerKey = useExternalAccountStore((state) => state.ownerKey);
  const accountLoadStatus = useExternalAccountStore((state) => state.loadStatus);
  const runtimeOwnerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const visibleAccounts = accountOwnerKey === runtimeOwnerKey ? accounts : [];

  useEffect(() => {
    if (runtimeContext == null) return;
    void refreshExternalAccounts({ runtimeContext }).catch(() => undefined);
  }, [runtimeContext]);

  if (
    runtimeOwnerKey != null &&
    (accountOwnerKey !== runtimeOwnerKey || accountLoadStatus === "loading")
  ) {
    return <p className="text-[11px] text-text-muted">{t("connectExternalAccount.checking")}</p>;
  }

  if (visibleAccounts.length === 0) {
    return <p className="text-[11px] text-text-muted">{t("connectExternalAccount.noAccounts")}</p>;
  }

  return (
    <ul className="space-y-2">
      {visibleAccounts.map((account) => (
        <ExternalAccountCard key={account.uuid} account={account} />
      ))}
    </ul>
  );
};

function getDisplayName(account: ExternalAccount): string {
  return account.userInfo?.fullName ?? account.userInfo?.email ?? account.serverUrl;
}

function getInitials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return initials || "Z";
}

function getStatusLabel(
  account: ExternalAccount,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (account.accessStatus === "confirmed") {
    return t("connectExternalAccount.status.connected");
  }
  if (account.accessStatus === "invalid_credentials") {
    return t("connectExternalAccount.errors.invalidCredentials");
  }
  if (account.accessStatus === "unavailable") {
    return t("connectExternalAccount.errors.unavailable");
  }
  return t("connectExternalAccount.status.checking");
}

function getCompactStatusLabel(
  account: ExternalAccount,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (account.accessStatus === "confirmed") {
    return t("connectExternalAccount.status.connected");
  }
  if (account.accessStatus === "invalid_credentials") {
    return t("connectExternalAccount.errors.invalidCredentialsShort");
  }
  if (account.accessStatus === "unavailable") {
    return t("connectExternalAccount.errors.unavailableShort");
  }
  return t("connectExternalAccount.status.checkingShort");
}

function getStatusClassName(account: ExternalAccount): string {
  if (account.accessStatus === "confirmed") {
    return "bg-call-green/10 text-call-green";
  }
  if (account.accessStatus === "invalid_credentials" || account.accessStatus === "unavailable") {
    return "bg-notice-base/10 text-notice-base";
  }
  return "bg-accent/10 text-accent";
}

const ExternalAccountCard = React.memo<{ account: ExternalAccount }>(({ account }) => {
  const { t } = useTranslation();
  const displayName = getDisplayName(account);
  const avatarSrc = resolveAvatarUrl(account.userInfo?.avatarUrl, account.serverUrl);
  const statusLabel = getStatusLabel(account, t);
  const compactStatusLabel = getCompactStatusLabel(account, t);

  return (
    <li>
      <details className="open:border-accent/40 group overflow-hidden rounded-lg border border-border-subtle bg-card-bg transition-colors">
        <summary
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2.5 transition-colors hover:bg-bg-elevated"
          title={account.serverUrl}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar size="sm" src={avatarSrc} className="bg-accent/15 text-accent">
              {getInitials(displayName)}
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-text-primary">
                {displayName}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                {account.userInfo?.email ?? account.serverUrl}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {account.accessStatus !== "confirmed" && (
              <span
                className={`inline-flex max-w-24 truncate rounded-full px-2 py-0.5 text-[10px] font-medium sm:max-w-28 ${getStatusClassName(account)}`}
                title={statusLabel}
              >
                {compactStatusLabel}
              </span>
            )}
            <Icon
              name="chevron-right"
              size={14}
              className="text-text-muted transition-transform group-open:rotate-90"
            />
          </span>
        </summary>
        <div className="border-t border-border-subtle px-2.5 py-2.5 text-[11px] text-text-muted">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-text-muted">
                {t("connectExternalAccount.provider")}
              </span>
              <span className="mt-0.5 block truncate text-text-primary">
                {t(`connectExternalAccount.providers.${account.accountType}`)}
              </span>
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-text-muted">
                {t("connectExternalAccount.server")}
              </span>
              <span className="mt-0.5 block truncate text-text-primary">{account.serverUrl}</span>
            </div>
          </div>
          <div
            className={`mt-2 inline-flex items-center rounded-full px-2 py-1 ${getStatusClassName(account)}`}
          >
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
            {statusLabel}
          </div>
          {account.accessLastError != null && (
            <p className="mt-2 break-words text-notice-base">{account.accessLastError}</p>
          )}
        </div>
      </details>
    </li>
  );
});
