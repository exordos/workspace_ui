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

const ExternalAccountCard = React.memo<{
  account: ExternalAccount;
  runtimeContext: WorkspaceRuntimeContext;
}>(({ account, runtimeContext }) => {
  const { t } = useTranslation();
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Few accounts is common: show actions immediately; user can still collapse via chevron
  const [cardOpen, setCardOpen] = useState(true);
  const canReconnect = account.status === "auth_required" || account.status === "degraded";
  const canConfigureChats = canConfigureExternalChats(account);
  return (
    <li>
      <details
        className="group overflow-hidden rounded-lg border border-border-subtle bg-card-bg"
        open={cardOpen}
        onToggle={(event) => {
          setCardOpen(event.currentTarget.open);
        }}
      >
        <summary
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2.5 hover:bg-bg-elevated"
          title={account.settings.serverUrl}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="bg-accent/15 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-accent">
              Z
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-text-primary">
                {account.settings.email}
              </span>
              <span className="block truncate text-[11px] text-text-muted">
                {account.settings.serverUrl}
              </span>
            </span>
          </span>
          <Icon
            name="chevron-right"
            size={14}
            className="shrink-0 text-text-muted transition-transform group-open:rotate-90"
          />
        </summary>
        <div className="border-t border-border-subtle px-2.5 py-2.5 text-[11px]">
          <span
            className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 ${statusClass(account)}`}
          >
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
            {statusLabel(account, t)}
          </span>
          {account.safeError != null ? (
            <p className="mt-2 break-words text-notice-base">{account.safeError}</p>
          ) : null}
          {canReconnect ? (
            <button
              type="button"
              onClick={() => setReconnectOpen(true)}
              className="mt-2 rounded-md border border-border-subtle px-2 py-1 text-text-primary hover:bg-bg-elevated"
            >
              {t("connectExternalAccount.reconnect")}
            </button>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            {canConfigureChats ? (
              <button
                type="button"
                onClick={() => setChatsOpen(true)}
                className="whitespace-nowrap rounded-md border border-border-subtle px-2 py-1 text-text-primary hover:bg-bg-elevated"
              >
                {account.settings.selectionMode === "all"
                  ? t("configureExternalChats.automaticAction")
                  : t("configureExternalChats.compactAction")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="hover:bg-danger/90 whitespace-nowrap rounded-md border border-danger bg-danger px-2 py-1 text-white"
            >
              {t("connectExternalAccount.delete.shortAction")}
            </button>
          </div>
        </div>
      </details>
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
    return <p className="text-[11px] text-text-muted">{t("connectExternalAccount.checking")}</p>;
  }
  if (runtimeContext == null || visibleAccounts.length === 0) {
    return <p className="text-[11px] text-text-muted">{t("connectExternalAccount.noAccounts")}</p>;
  }
  return (
    <ul className="space-y-2">
      {visibleAccounts.map((account) => (
        <ExternalAccountCard key={account.uuid} account={account} runtimeContext={runtimeContext} />
      ))}
    </ul>
  );
};
