import React, { useCallback, useEffect, useMemo, useState } from "react";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { ConfigureExternalChatsDialog } from "~/features/configure-external-chats/configure-external-chats-dialog.ui";
import { ConfigureExternalChatsOnboardingStep } from "~/features/configure-external-chats/configure-external-chats-onboarding-step.ui";
import { canConfigureExternalChats } from "~/features/configure-external-chats/configure-external-chats.lib";
import { ConnectExternalAccountDialog } from "~/features/connect-external-account/connect-external-account-dialog.ui";
import { DeleteExternalAccountDialog } from "~/features/connect-external-account/delete-external-account-dialog.ui";
import { useTranslation } from "~/i18n/i18n";
import ZulipExternalAccountIcon from "~/shared/assets/icons/zulip-external-account.svg?react";
import { Button } from "~/shared/ui/button";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";

function renderChatsOnboardingStep(
  runtimeContext: WorkspaceRuntimeContext,
  account: ExternalAccount,
): React.ReactNode {
  return <ConfigureExternalChatsOnboardingStep runtimeContext={runtimeContext} account={account} />;
}

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
      renderChatsStep={renderChatsOnboardingStep}
    />
  );
};

function compactStatusLabel(
  account: ExternalAccount,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (account.liveReady) return t("connectExternalAccount.status.connectedShort");
  return t(`connectExternalAccount.status.${account.status}`);
}

/** Compact provider row from the connected external-accounts Figma block. */
const ExternalAccountRow = React.memo<{
  account: ExternalAccount;
  runtimeContext: WorkspaceRuntimeContext;
}>(({ account, runtimeContext }) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canReconnect = account.status === "auth_required" || account.status === "degraded";
  const canConfigureChats = canConfigureExternalChats(account);
  const providerLabel = t(`connectExternalAccount.providers.${account.provider}`);

  const openReconnect = useCallback(() => {
    setMenuOpen(false);
    setReconnectOpen(true);
  }, []);
  const openChats = useCallback(() => {
    setMenuOpen(false);
    setChatsOpen(true);
  }, []);
  const openDelete = useCallback(() => {
    setMenuOpen(false);
    setDeleteOpen(true);
  }, []);
  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [];
    if (canConfigureChats) {
      items.push({
        type: "action",
        key: "configure-chats",
        icon: "settings",
        label: t("configureExternalChats.action"),
        onSelect: openChats,
      });
    }
    if (canReconnect) {
      items.push({
        type: "action",
        key: "reconnect",
        icon: "build",
        label: t("connectExternalAccount.reconnect"),
        onSelect: openReconnect,
      });
    }
    if (items.length > 0) items.push({ type: "separator", key: "danger-separator" });
    items.push({
      type: "action",
      key: "delete",
      icon: "delete",
      danger: true,
      label: t("connectExternalAccount.delete.action"),
      onSelect: openDelete,
    });
    return items;
  }, [canConfigureChats, canReconnect, openChats, openDelete, openReconnect, t]);

  return (
    <li className="min-w-0" data-testid="external-account-row">
      <div className="flex h-10 min-w-0 items-center gap-3 rounded-lg">
        <ZulipExternalAccountIcon className="h-10 w-10 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <span className="truncate text-sm leading-4 text-text-primary">
            {account.settings.email}
          </span>
          <span className="truncate text-xs leading-5">
            <span className="text-text-primary">{providerLabel}</span>
            <span className="text-text-muted"> · {compactStatusLabel(account, t)}</span>
          </span>
        </div>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          trigger={
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={t("externalAccounts.actions")}
              data-testid="external-account-actions"
            >
              <Icon name="more" size={24} className="text-current" />
            </button>
          }
          items={menuItems}
          contentVariant="narrow"
          contentProps={{ sideOffset: 4, align: "end" }}
        />
      </div>
      {account.safeError != null ? (
        <p className="mt-1 break-words pl-[52px] text-xs text-notice-base">{account.safeError}</p>
      ) : null}

      <ConnectExternalAccountDialog
        open={reconnectOpen}
        onOpenChange={setReconnectOpen}
        runtimeContext={runtimeContext}
        reconnectAccount={account}
        renderChatsStep={renderChatsOnboardingStep}
      />
      {canConfigureChats ? (
        <ConfigureExternalChatsDialog
          open={chatsOpen}
          onOpenChange={setChatsOpen}
          runtimeContext={runtimeContext}
          account={account}
        />
      ) : null}
      <DeleteExternalAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        runtimeContext={runtimeContext}
        accountUuid={account.uuid}
      />
    </li>
  );
});

export const RightPanelExternalAccountsList: React.FC<{
  onConnect: () => void;
}> = ({ onConnect }) => {
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
  const accountsLoading =
    runtimeOwnerKey != null &&
    (accountOwnerKey !== runtimeOwnerKey || accountLoadStatus === "loading");

  useEffect(() => {
    if (runtimeContext == null) return;
    void refreshExternalAccounts({ runtimeContext }).catch(() => undefined);
  }, [runtimeContext]);

  return (
    <section
      className="w-full rounded-lg border border-white/10 p-2"
      data-testid="connected-external-accounts-list"
    >
      <div className="flex flex-col gap-5">
        <p className="text-xs leading-4 text-text-muted">{t("externalAccounts.connected")}</p>
        {accountsLoading || runtimeContext == null || visibleAccounts.length === 0 ? (
          <p className="text-xs leading-4 text-text-muted">
            {accountsLoading
              ? t("connectExternalAccount.checking")
              : t("connectExternalAccount.noAccounts")}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="external-account-rows">
            {visibleAccounts.map((account) => (
              <ExternalAccountRow
                key={account.uuid}
                account={account}
                runtimeContext={runtimeContext}
              />
            ))}
          </ul>
        )}
        <p className="text-xs leading-4 text-text-muted">{t("externalAccounts.connectedHint")}</p>
        <Button
          type="button"
          variant="neutral"
          size="md"
          fullWidth
          className="h-9 bg-card-bg-active px-2 text-accent hover:bg-card-bg-active hover:ring-0"
          onClick={onConnect}
          aria-label={t("connectExternalAccount.connectService")}
          data-testid="connect-external-account-trigger"
          leadingIcon={<Icon name="add" size={20} className="text-current" />}
        >
          {t("connectExternalAccount.connectService")}
        </Button>
      </div>
    </section>
  );
};
