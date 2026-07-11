import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import type { ConnectExternalAccountFormProps } from "./connect-external-account.types";

function ExternalProviderBadge() {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-on-accent"
      aria-hidden="true"
    >
      Z
    </span>
  );
}

function errorText(error: string | null): string | null {
  if (error === "fill") return t("connectExternalAccount.errors.allFields");
  if (error === "duplicate") return t("connectExternalAccount.errors.alreadyConnected");
  if (error === "invalid-url") return t("connectExternalAccount.errors.serverUrlInvalid");
  if (error === "invalid") return t("connectExternalAccount.errors.invalidCredentials");
  if (error === "unavailable") return t("connectExternalAccount.errors.unavailable");
  if (error === "connect") return t("connectExternalAccount.errors.requestFailed");
  return null;
}

export const ConnectExternalAccountForm = React.memo<ConnectExternalAccountFormProps>(
  function ConnectExternalAccountForm({
    draft,
    accounts,
    submitting,
    error,
    onProviderChange,
    onServerUrlChange,
    onLoginChange,
    onTokenChange,
    onSubmit,
  }) {
    const handleSubmit = useCallback(
      (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit();
      },
      [onSubmit],
    );
    const duplicateZulip = accounts.some((account) => account.accountType === "zulip");
    const visibleError = errorText(error);

    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label={t("connectExternalAccount.provider")} htmlFor="external-account-provider">
          <div className="flex items-center gap-2">
            <ExternalProviderBadge />
            <select
              id="external-account-provider"
              value={draft.provider}
              onChange={(event) => onProviderChange(event.target.value as "zulip")}
              disabled={submitting}
              className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary outline-none focus:border-transparent focus:ring-2 focus:ring-accent disabled:opacity-60"
            >
              <option value="zulip">{t("connectExternalAccount.providers.zulip")}</option>
            </select>
          </div>
        </FormField>

        <FormField
          label={t("connectExternalAccount.serverUrl")}
          htmlFor="external-account-server-url"
        >
          <input
            id="external-account-server-url"
            type="url"
            required
            autoComplete="url"
            placeholder={t("connectExternalAccount.serverUrlHint")}
            value={draft.serverUrl}
            onChange={(event) => onServerUrlChange(event.target.value)}
            disabled={submitting || duplicateZulip}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </FormField>

        <FormField label={t("connectExternalAccount.login")} htmlFor="external-account-login">
          <input
            id="external-account-login"
            type="text"
            required
            autoComplete="username"
            placeholder={t("connectExternalAccount.loginHint")}
            value={draft.login}
            onChange={(event) => onLoginChange(event.target.value)}
            disabled={submitting || duplicateZulip}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </FormField>

        <FormField label={t("connectExternalAccount.token")} htmlFor="external-account-token">
          <input
            id="external-account-token"
            type="password"
            required
            autoComplete="new-password"
            placeholder={t("connectExternalAccount.tokenHint")}
            value={draft.token}
            onChange={(event) => onTokenChange(event.target.value)}
            disabled={submitting || duplicateZulip}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </FormField>

        {visibleError != null && (
          <div
            className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base"
            role="alert"
          >
            {visibleError}
          </div>
        )}

        {duplicateZulip && (
          <p className="text-xs text-text-muted">
            {t("connectExternalAccount.errors.alreadyConnectedHint")}
          </p>
        )}

        <Button type="submit" disabled={duplicateZulip || submitting} className="w-full">
          {submitting
            ? t("connectExternalAccount.status.connecting")
            : t("connectExternalAccount.connect")}
        </Button>
      </form>
    );
  },
);
