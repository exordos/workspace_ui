import React, { useCallback, useEffect, useState } from "react";
import {
  fetchZulipExternalAccount,
  saveZulipExternalAccount,
  unlinkZulipExternalAccount,
} from "~/features/external-accounts/external-accounts.api";
import type {
  SaveExternalAccountErrorKind,
  ZulipExternalAccount,
} from "~/features/external-accounts/external-accounts.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { SectionLabel } from "~/shared/ui/section-label.ui";

export interface ZulipExternalAccountCardProps {
  compact?: boolean;
}

function mapSaveError(kind: SaveExternalAccountErrorKind): string {
  if (kind === "forbidden") return t("settings.externalAccountForbidden");
  if (kind === "conflict") return t("settings.externalAccountConflict");
  if (kind === "invalid") return t("settings.externalAccountInvalid");
  return t("settings.externalAccountSaveError");
}

export const ZulipExternalAccountCard: React.FC<ZulipExternalAccountCardProps> = ({
  compact = false,
}) => {
  const [account, setAccount] = useState<ZulipExternalAccount | null>(null);
  const [login, setLogin] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchZulipExternalAccount({ signal: controller.signal })
      .then((nextAccount) => {
        if (controller.signal.aborted) return;
        setAccount(nextAccount);
        setLogin(nextAccount?.accountSettings.login ?? "");
        setServerUrl(nextAccount?.accountSettings.serverUrl ?? "");
        setToken("");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(t("settings.externalAccountLoadError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => {
      controller.abort();
    };
  }, []);

  const handleSave = useCallback(() => {
    if (isSaving || isUnlinking) return;
    const trimmedLogin = login.trim();
    const trimmedServerUrl = serverUrl.trim();
    const trimmedToken = token.trim();
    if (trimmedLogin.length === 0 || trimmedServerUrl.length === 0 || trimmedToken.length === 0) {
      setError(t("settings.externalAccountRequired"));
      setSuccess(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    void saveZulipExternalAccount({
      uuid: account?.uuid,
      login: trimmedLogin,
      serverUrl: trimmedServerUrl,
      token: trimmedToken,
    })
      .then((result) => {
        if (!result.ok) {
          setError(mapSaveError(result.kind));
          return;
        }
        setAccount(result.account);
        setLogin(result.account.accountSettings.login);
        setServerUrl(result.account.accountSettings.serverUrl);
        setToken("");
        setIsFormOpen(false);
        setSuccess(t("settings.externalAccountSaved"));
      })
      .catch(() => {
        setError(t("settings.externalAccountSaveError"));
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [account?.uuid, isSaving, isUnlinking, login, serverUrl, token]);

  const handleUnlink = useCallback(() => {
    const accountUuid = account?.uuid;
    if (accountUuid == null || isSaving || isUnlinking) return;

    setIsUnlinking(true);
    setError(null);
    setSuccess(null);
    void unlinkZulipExternalAccount(accountUuid)
      .then((result) => {
        if (!result.ok) {
          setError(mapSaveError(result.kind));
          return;
        }
        setAccount(null);
        setLogin("");
        setServerUrl("");
        setToken("");
        setIsFormOpen(false);
        setSuccess(t("settings.externalAccountUnlinked"));
      })
      .catch(() => {
        setError(t("settings.externalAccountUnlinkError"));
      })
      .finally(() => {
        setIsUnlinking(false);
      });
  }, [account?.uuid, isSaving, isUnlinking]);

  const statusLabel =
    account == null
      ? t("settings.externalAccountNotConnected")
      : t("settings.externalAccountConnected");
  const saveLabel =
    account == null ? t("settings.externalAccountAdd") : t("settings.externalAccountUpdate");
  const cardClassName = compact
    ? "rounded-lg border border-border-subtle bg-bg-elevated p-3"
    : "rounded-xl border border-border-subtle bg-card-bg p-4";
  const formClassName = compact ? "mt-4 grid gap-3" : "mt-4 grid gap-3 sm:grid-cols-2";
  const tokenLabelClassName = compact ? "block min-w-0" : "block min-w-0 sm:col-span-2";
  const buttonClassName = [
    "inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50",
    compact ? "w-full justify-center" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const unlinkButtonClassName = [
    "inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-notice-base transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50",
    compact ? "w-full justify-center" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClassName}>
      <header className="flex items-start gap-3 border-b border-border-subtle pb-3">
        <Icon name="links" size={20} className="mt-0.5 shrink-0 text-icon-base" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("settings.externalMessengerAccounts")}
          </h2>
          <p className="mt-1 text-xs text-text-secondary">{statusLabel}</p>
        </div>
      </header>
      {isFormOpen && (
        <div className={formClassName}>
          <label className="block min-w-0">
            <SectionLabel className="mb-1">{t("settings.zulipServerUrl")}</SectionLabel>
            <input
              type="url"
              value={serverUrl}
              onChange={(event) => {
                setServerUrl(event.target.value);
                setError(null);
                setSuccess(null);
              }}
              disabled={isLoading || isSaving || isUnlinking}
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={t("settings.zulipServerUrlPlaceholder")}
              aria-label={t("settings.zulipServerUrl")}
            />
          </label>
          <label className="block min-w-0">
            <SectionLabel className="mb-1">{t("settings.zulipLogin")}</SectionLabel>
            <input
              type="email"
              value={login}
              onChange={(event) => {
                setLogin(event.target.value);
                setError(null);
                setSuccess(null);
              }}
              disabled={isLoading || isSaving || isUnlinking}
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t("settings.zulipLogin")}
            />
          </label>
          <label className={tokenLabelClassName}>
            <SectionLabel className="mb-1">{t("settings.zulipToken")}</SectionLabel>
            <input
              type="password"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setError(null);
                setSuccess(null);
              }}
              disabled={isLoading || isSaving || isUnlinking}
              autoComplete="off"
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={account == null ? "" : t("settings.zulipTokenPlaceholder")}
              aria-label={t("settings.zulipToken")}
            />
          </label>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isFormOpen ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || isSaving || isUnlinking}
            className={buttonClassName}
          >
            <Icon name="check" size={16} className="text-current" />
            {isSaving ? t("settings.externalAccountSaving") : saveLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsFormOpen(true);
              setError(null);
              setSuccess(null);
            }}
            disabled={isLoading || isUnlinking}
            className={buttonClassName}
          >
            <Icon name="plus" size={16} className="text-current" />
            {saveLabel}
          </button>
        )}
        {account != null && (
          <button
            type="button"
            onClick={handleUnlink}
            disabled={isLoading || isSaving || isUnlinking}
            className={unlinkButtonClassName}
          >
            <Icon name="delete" size={16} className="text-current" />
            {isUnlinking
              ? t("settings.externalAccountUnlinking")
              : t("settings.externalAccountUnlink")}
          </button>
        )}
        {isLoading && (
          <p className="text-sm text-text-muted">{t("settings.externalAccountLoading")}</p>
        )}
        {success != null && <p className="text-sm text-accent">{success}</p>}
        {error != null && <p className="text-sm text-notice-base">{error}</p>}
      </div>
    </div>
  );
};
