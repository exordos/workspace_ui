import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import { Select } from "~/shared/ui/select.ui";
import type {
  ConnectExternalAccountError,
  ConnectExternalAccountFormProps,
} from "./connect-external-account.types";

function errorText(error: ConnectExternalAccountError | null, providerName: string): string | null {
  if (error === "fill") return t("connectExternalAccount.errors.allFields");
  if (error === "duplicate") {
    return t("connectExternalAccount.errors.alreadyConnected", { provider: providerName });
  }
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
    editing = false,
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
    const providerName = t(`connectExternalAccount.providers.${draft.provider}`);
    const visibleError = errorText(error, providerName);
    const submitLabel = t(
      editing ? "connectExternalAccount.edit.save" : "connectExternalAccount.connect",
    );
    const providerField = (
      <FormField label={t("connectExternalAccount.provider")} htmlFor="external-account-provider">
        <Select
          id="external-account-provider"
          value={draft.provider}
          onValueChange={() => onProviderChange("zulip")}
          disabled={submitting || editing}
          options={[{ value: "zulip", label: t("connectExternalAccount.providers.zulip") }]}
        />
      </FormField>
    );

    if (duplicateZulip) {
      return (
        <div className="flex flex-col gap-4">
          {providerField}
          <div
            className="border-notice-base/40 bg-notice-base/10 rounded-lg border px-4 py-4 text-notice-base"
            role="alert"
          >
            <p className="text-sm font-semibold">
              {t("connectExternalAccount.errors.alreadyConnected", { provider: providerName })}
            </p>
            <p className="mt-1 text-sm">
              {t("connectExternalAccount.errors.alreadyConnectedHint", {
                provider: providerName,
              })}
            </p>
          </div>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {providerField}
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
            disabled={submitting}
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
            disabled={submitting}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </FormField>
        <FormField label={t("connectExternalAccount.apiKey")} htmlFor="external-account-api-key">
          <input
            id="external-account-api-key"
            type="password"
            required={!editing}
            autoComplete="new-password"
            placeholder={t("connectExternalAccount.apiKeyHint")}
            aria-describedby={editing ? "external-account-api-key-hint" : undefined}
            value={draft.apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
          {editing ? (
            <p id="external-account-api-key-hint" className="mt-1 text-xs text-text-muted">
              {t("connectExternalAccount.edit.apiKeyHint")}
            </p>
          ) : null}
        </FormField>
        {visibleError != null ? (
          <div
            className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base"
            role="alert"
          >
            {visibleError}
          </div>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t("connectExternalAccount.status.sending") : submitLabel}
        </Button>
      </form>
    );
  },
);
