import React, { useEffect, useMemo, useState } from "react";
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

function statusLabel(account: ExternalAccount, t: ReturnType<typeof useTranslation>["t"]): string {
  if (account.liveReady) return t("connectExternalAccount.status.connected");
  return t(`connectExternalAccount.status.${account.status}`);
}

function statusClass(account: ExternalAccount): string {
  if (account.liveReady) return "bg-call-green/10 text-call-green";
  if (account.status === "auth_required" || account.status === "degraded") {
    return "bg-notice-base/10 text-notice-base";
  }
  return "bg-accent/10 text-accent";
}

/** Flat account card: identity + status + actions always visible (no nested accordion). */
const ExternalAccountCard = React.memo<{
  account: ExternalAccount;
  runtimeContext: WorkspaceRuntimeContext;
}>(({ account, runtimeContext }) => {
  const { t } = useTranslation();
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canReconnect = account.status === "auth_required" || account.status === "degraded";
  const canConfigureChats = canConfigureExternalChats(account);
  const providerLabel = t(`connectExternalAccount.providers.${account.provider}`);

  return (
    <li
      className="bg-bg-elevated/40 rounded-lg border border-border-subtle p-3"
      data-testid="external-account-card"
    >
      <div className="flex items-start gap-2.5">
        <span
          className="bg-accent/15 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold text-accent"
          aria-hidden
        >
          {providerLabel.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium leading-5 text-text-primary">
              {account.settings.email}
            </span>
            <span
              className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${statusClass(account)}`}
            >
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              {statusLabel(account, t)}
            </span>
          </div>
          <p
            className="mt-0.5 truncate text-xs leading-4 text-text-muted"
            title={account.settings.serverUrl}
          >
            {providerLabel} · {account.settings.serverUrl}
          </p>
          {account.safeError != null ? (
            <p className="mt-1.5 break-words text-xs text-notice-base">{account.safeError}</p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap gap-2">
            {canReconnect ? (
              <button
                type="button"
                onClick={() => setReconnectOpen(true)}
                className="inline-flex items-center rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-on-accent transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t("connectExternalAccount.reconnect")}
              </button>
            ) : null}
            {canConfigureChats ? (
              <button
                type="button"
                onClick={() => setChatsOpen(true)}
                className="inline-flex items-center rounded-md border border-border-subtle bg-bg px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {account.settings.selectionMode === "all"
                  ? t("configureExternalChats.automaticAction")
                  : t("configureExternalChats.compactAction")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="border-danger/30 hover:bg-danger/10 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              {t("connectExternalAccount.delete.shortAction")}
            </button>
          </div>
        </div>
      </div>

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
    return (
      <p
        className="px-1 text-center text-xs text-text-muted"
        data-testid="connected-external-accounts-list"
      >
        {t("connectExternalAccount.checking")}
      </p>
    );
  }
  if (runtimeContext == null || visibleAccounts.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border-subtle px-3 py-4 text-center"
        data-testid="connected-external-accounts-list"
      >
        <p className="text-xs leading-4 text-text-muted">
          {t("connectExternalAccount.noAccounts")}
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="connected-external-accounts-list">
      {visibleAccounts.map((account) => (
        <ExternalAccountCard key={account.uuid} account={account} runtimeContext={runtimeContext} />
      ))}
    </ul>
  );
};
