import React, { useCallback } from "react";
import type { ExternalAccountHistoryDepth } from "~/entities/external-account/external-account.types";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import type {
  ConnectExternalAccountError,
  ConnectExternalAccountFormProps,
} from "./connect-external-account.types";

const HISTORY_DEPTH_OPTIONS: readonly ExternalAccountHistoryDepth[] = [
  "new",
  "7_days",
  "30_days",
  "90_days",
  "all",
];

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
    draft,
    duplicateZulip,
    submitting,
    error,
    onProviderChange,
    onServerUrlChange,
    onEmailChange,
    onApiKeyChange,
    onSelectionModeChange,
    onHistoryDepthChange,
    showSyncSettings,
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
    const providerField = (
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
            required
            autoComplete="new-password"
            placeholder={t("connectExternalAccount.apiKeyHint")}
            value={draft.apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </FormField>
        {showSyncSettings ? (
          <>
            <fieldset disabled={submitting}>
              <legend className="text-sm font-medium text-text-primary">
                {t("connectExternalAccount.selectionMode.title")}
              </legend>
              <p className="mt-1 text-xs text-text-muted">
                {t("connectExternalAccount.selectionMode.description")}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(["explicit", "all"] as const).map((value) => (
                  <label
                    key={value}
                    className={`focus-within:ring-accent/40 cursor-pointer rounded-lg border px-3 py-2 text-sm focus-within:ring-2 ${
                      draft.selectionMode === value
                        ? "border-accent/50 bg-accent-soft text-accent"
                        : "border-border-subtle bg-bg text-text-primary"
                    }`}
                  >
                    <input
                      type="radio"
                      name="external-account-selection-mode"
                      value={value}
                      checked={draft.selectionMode === value}
                      onChange={() => onSelectionModeChange(value)}
                      className="mr-2"
                    />
                    {t(`connectExternalAccount.selectionMode.options.${value}`)}
                  </label>
                ))}
              </div>
              {draft.selectionMode === "all" ? (
                <p className="mt-2 text-xs text-text-muted">
                  {t("connectExternalAccount.selectionMode.allHint")}
                </p>
              ) : null}
            </fieldset>

            <fieldset disabled={submitting}>
              <legend className="text-sm font-medium text-text-primary">
                {t("connectExternalAccount.historyDepth.title")}
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {HISTORY_DEPTH_OPTIONS.map((value) => (
                  <label
                    key={value}
                    className={`focus-within:ring-accent/40 cursor-pointer rounded-md border px-2 py-2 text-center text-xs focus-within:ring-2 ${
                      draft.historyDepth === value
                        ? "border-accent/50 bg-accent-soft text-accent"
                        : "border-border-subtle bg-bg text-text-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="external-account-history-depth"
                      value={value}
                      checked={draft.historyDepth === value}
                      onChange={() => onHistoryDepthChange(value)}
                      className="sr-only"
                    />
                    {t(`configureExternalChats.historyDepth.options.${value}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}
        {visibleError != null ? (
          <div
            className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base"
            role="alert"
          >
            {visibleError}
          </div>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting
            ? t("connectExternalAccount.status.sending")
            : t("connectExternalAccount.connect")}
        </Button>
      </form>
    );
  },
);
