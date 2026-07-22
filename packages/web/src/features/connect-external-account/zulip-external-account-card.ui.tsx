import React, { useCallback, useState } from "react";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { ConnectExternalAccountForm } from "./connect-external-account-form.ui";
import { useConnectExternalAccount } from "./connect-external-account.hook";

export interface ZulipExternalAccountCardProps {
  runtimeContext: WorkspaceRuntimeContext | null;
}

function accountStatusLabel(
  loadingAccounts: boolean,
  account: ReturnType<typeof useConnectExternalAccount>["accounts"][number] | null,
): string {
  if (loadingAccounts) return t("connectExternalAccount.status.checking");
  if (account == null) return t("connectExternalAccount.notConnected");
  return t(`connectExternalAccount.accountStatus.${account.status}`);
}

export const ZulipExternalAccountCard = React.memo<ZulipExternalAccountCardProps>(
  function ZulipExternalAccountCard({ runtimeContext }) {
    const [formOpen, setFormOpen] = useState(false);
    const [saved, setSaved] = useState(false);
    const handleCompleted = useCallback(() => {
      setFormOpen(false);
      setSaved(true);
    }, []);
    const vm = useConnectExternalAccount({
      open: true,
      runtimeContext,
      onCompleted: handleCompleted,
    });
    const account = vm.accounts.find((candidate) => candidate.accountType === "zulip") ?? null;
    const statusLabel = accountStatusLabel(vm.loadingAccounts, account);

    return (
      <section
        className="rounded-xl border border-border-subtle bg-card-bg p-4"
        data-testid="zulip-external-account-card"
      >
        <header className="flex items-start gap-3 border-b border-border-subtle pb-3">
          <Icon name="links" size={20} className="mt-0.5 shrink-0 text-icon-base" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                {t("connectExternalAccount.cardTitle")}
              </h2>
              <span className="border-accent/35 bg-accent/10 rounded-sm border px-1.5 py-0.5 text-xs font-semibold text-text-secondary">
                {t("connectExternalAccount.providers.zulip")}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-secondary" role="status">
              {statusLabel}
            </p>
            {account?.safeError != null && (
              <p className="mt-1 text-xs text-notice-base">{account.safeError}</p>
            )}
          </div>
        </header>

        {account != null && (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-text-muted">{t("connectExternalAccount.server")}</dt>
              <dd className="truncate text-text-primary" title={account.serverUrl}>
                {account.serverUrl}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-text-muted">{t("connectExternalAccount.email")}</dt>
              <dd className="truncate text-text-primary" title={account.email}>
                {account.email}
              </dd>
            </div>
          </dl>
        )}

        {formOpen && account == null && (
          <div className="mt-4">
            <ConnectExternalAccountForm
              draft={vm.draft}
              accounts={vm.accounts}
              submitting={vm.submitting}
              error={vm.error}
              onProviderChange={vm.setProvider}
              onServerUrlChange={vm.setServerUrl}
              onEmailChange={vm.setEmail}
              onApiKeyChange={vm.setApiKey}
              onSubmit={vm.submit}
            />
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              disabled={vm.submitting}
              className="mt-2 min-h-9 w-full rounded-lg border border-border-subtle px-3 text-sm text-text-secondary disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
          </div>
        )}

        {!formOpen && account == null && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSaved(false);
                setFormOpen(true);
              }}
              disabled={vm.loadingAccounts || runtimeContext == null}
              className="min-h-11 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("connectExternalAccount.add")}
            </button>
            {saved && <p className="text-sm text-accent">{t("connectExternalAccount.saved")}</p>}
          </div>
        )}
      </section>
    );
  },
);
