import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import type {
  ConnectExternalAccountError,
  ConnectExternalAccountFormProps,
} from "./connect-external-account.types";

function errorText(error: ConnectExternalAccountError | null): string | null {
  if (error === "fill") return t("connectExternalAccount.errors.allFields");
  if (error === "duplicate") return t("connectExternalAccount.errors.alreadyConnected");
  if (error === "invalid-url") return t("connectExternalAccount.errors.serverUrlInvalid");
  if (error === "invalid") return t("connectExternalAccount.errors.invalidCredentials");
  if (error === "unavailable") return t("connectExternalAccount.errors.unavailable");
  if (error === "forbidden") return t("connectExternalAccount.errors.forbidden");
  if (error === "conflict") return t("connectExternalAccount.errors.changed");
  if (error === "connect") return t("connectExternalAccount.errors.requestFailed");
  return null;
}

export const ConnectExternalAccountForm = React.memo<ConnectExternalAccountFormProps>(
  function ConnectExternalAccountForm({
    draft,
    duplicateZulip,
    submitting,
    error,
    onProviderChange,
    onServerUrlChange,
    onEmailChange,
    onApiKeyChange,
    onSubmit,
  }) {
    const handleSubmit = useCallback(
      (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit();
      },
      [onSubmit],
    );
    const visibleError = errorText(error);

    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label={t("connectExternalAccount.provider")} htmlFor="external-account-provider">
          <select
            id="external-account-provider"
            value={draft.provider}
            onChange={(event) => onProviderChange(event.target.value as "zulip")}
            disabled={submitting}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          >
            <option value="zulip">{t("connectExternalAccount.providers.zulip")}</option>
          </select>
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
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </FormField>
        <FormField label={t("connectExternalAccount.email")} htmlFor="external-account-email">
          <input
            id="external-account-email"
            type="email"
            required
            autoComplete="username"
            placeholder={t("connectExternalAccount.emailHint")}
            value={draft.email}
            onChange={(event) => onEmailChange(event.target.value)}
            disabled={submitting || duplicateZulip}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </FormField>
        <FormField label={t("connectExternalAccount.apiKey")} htmlFor="external-account-api-key">
          <input
            id="external-account-api-key"
            type="password"
            required
            autoComplete="new-password"
            placeholder={t("connectExternalAccount.apiKeyHint")}
            value={draft.apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            disabled={submitting || duplicateZulip}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </FormField>
        {visibleError != null ? (
          <div
            className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base"
            role="alert"
          >
            {visibleError}
          </div>
        ) : null}
        {duplicateZulip ? (
          <p className="text-xs text-text-muted">
            {t("connectExternalAccount.errors.alreadyConnectedHint")}
          </p>
        ) : null}
        <Button type="submit" disabled={duplicateZulip || submitting} className="w-full">
          {submitting
            ? t("connectExternalAccount.status.sending")
            : t("connectExternalAccount.connect")}
        </Button>
      </form>
    );
  },
);
