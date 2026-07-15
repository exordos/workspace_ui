import React, { useEffect, useState } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { SectionLabel } from "~/shared/ui/section-label.ui";
import { subscribeExternalAccountUpdates } from "./external-account-realtime.lib";
import {
  fetchCalendarExternalAccount,
  fetchMailExternalAccount,
  saveCalendarExternalAccount,
  saveMailExternalAccount,
  unlinkGroupwareExternalAccount,
} from "./external-accounts.api";
import { useProviderCatalog } from "./provider-catalog.hook";
import { ProviderSelect } from "./provider-select.ui";
import type {
  CalendarExternalAccount,
  ExternalAccountAccessStatus,
  MailExternalAccount,
} from "./external-accounts.types";

const inputClass =
  "w-full rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-50";
const buttonClass =
  "inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary hover:bg-bg disabled:opacity-50";

function statusText(status: ExternalAccountAccessStatus | undefined): string {
  if (status === "confirmed") return t("settings.groupwareConnected");
  if (status === "pending") return t("settings.groupwarePending");
  if (status === "invalid_credentials") return t("settings.groupwareInvalidCredentials");
  if (status === "unavailable") return t("settings.groupwareUnavailable");
  return t("settings.groupwareNotConnected");
}

function CardHeader({
  icon,
  title,
  status,
}: {
  icon: "mail" | "calendar";
  title: string;
  status?: ExternalAccountAccessStatus;
}) {
  return (
    <header className="flex items-start gap-3 border-b border-border-subtle pb-3">
      <Icon name={icon} size={20} className="mt-0.5 shrink-0 text-icon-base" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-xs text-text-secondary">{statusText(status)}</p>
      </div>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <SectionLabel className="mb-1">{label}</SectionLabel>
      {children}
    </label>
  );
}

export function MailExternalAccountCard(): React.ReactElement {
  const [account, setAccount] = useState<MailExternalAccount | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [providerUuid, setProviderUuid] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerCatalog = useProviderCatalog("mail");

  useEffect(() => {
    let controller: AbortController | null = null;
    const loadAccount = (hydrateForm: boolean) => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      void fetchMailExternalAccount(requestController.signal).then((value) => {
        if (requestController.signal.aborted || value == null) return;
        setAccount(value);
        if (!hydrateForm) return;
        setEmail(value.email);
        setUsername(value.email);
        setImapHost(value.imapHost);
        setImapPort(value.imapPort);
        setSmtpHost(value.smtpHost);
        setSmtpPort(value.smtpPort);
        setProviderUuid(value.providerUuid);
      });
    };
    loadAccount(true);
    const unsubscribe = subscribeExternalAccountUpdates(() => loadAccount(false));
    return () => {
      controller?.abort();
      unsubscribe();
    };
  }, []);

  const save = () => {
    if (saving) return;
    if (
      providerUuid === "" ||
      [email, username, password, imapHost, smtpHost].some((value) => value.trim() === "")
    ) {
      setError(t("settings.groupwareRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    void saveMailExternalAccount({
      uuid: account?.uuid,
      providerUuid,
      email,
      username,
      password,
      imapHost,
      imapPort,
      imapSecurity: "tls",
      smtpHost,
      smtpPort,
      smtpSecurity: "tls",
    }).then((result) => {
      setSaving(false);
      if (!result.ok) {
        setError(t("settings.groupwareSaveError"));
        return;
      }
      setAccount(result.account);
      setPassword("");
      setFormOpen(false);
    });
  };

  const unlink = () => {
    if (account == null || saving) return;
    setSaving(true);
    void unlinkGroupwareExternalAccount(account.uuid).then((result) => {
      setSaving(false);
      if (!result.ok) {
        setError(t("settings.groupwareUnlinkError"));
        return;
      }
      setAccount(null);
      setFormOpen(false);
    });
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-card-bg p-4">
      <CardHeader icon="mail" title={t("settings.mailAccount")} status={account?.accessStatus} />
      {formOpen && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ProviderSelect
            providers={providerCatalog.providers}
            value={providerUuid}
            disabled={saving || providerCatalog.loading}
            failed={providerCatalog.failed}
            onChange={setProviderUuid}
          />
          <Field label={t("common.email")}>
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t("settings.groupwareUsername")}>
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label={t("settings.imapHost")}>
            <input
              className={inputClass}
              value={imapHost}
              onChange={(e) => setImapHost(e.target.value)}
            />
          </Field>
          <Field label={t("settings.imapPort")}>
            <input
              className={inputClass}
              type="number"
              value={imapPort}
              onChange={(e) => setImapPort(Number(e.target.value))}
            />
          </Field>
          <Field label={t("settings.smtpHost")}>
            <input
              className={inputClass}
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
            />
          </Field>
          <Field label={t("settings.smtpPort")}>
            <input
              className={inputClass}
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(Number(e.target.value))}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("settings.groupwarePassword")}>
              <input
                className={inputClass}
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={account == null ? "" : t("auth.passwordPlaceholder")}
              />
            </Field>
          </div>
        </div>
      )}
      {account?.accessLastError != null && (
        <p className="mt-3 text-xs text-notice-base">{account.accessLastError}</p>
      )}
      {error != null && <p className="mt-3 text-xs text-notice-base">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {formOpen ? (
          <button type="button" className={buttonClass} disabled={saving} onClick={save}>
            {t("common.save")}
          </button>
        ) : (
          <button
            type="button"
            className={buttonClass}
            disabled={saving}
            onClick={() => setFormOpen(true)}
          >
            {account == null ? t("common.add") : t("common.edit")}
          </button>
        )}
        {account != null && (
          <button type="button" className={buttonClass} disabled={saving} onClick={unlink}>
            {t("settings.groupwareUnlink")}
          </button>
        )}
      </div>
    </div>
  );
}

export function CalendarExternalAccountCard(): React.ReactElement {
  const [account, setAccount] = useState<CalendarExternalAccount | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [providerUuid, setProviderUuid] = useState("");
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerCatalog = useProviderCatalog("calendar");

  useEffect(() => {
    let controller: AbortController | null = null;
    const loadAccount = (hydrateForm: boolean) => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      void fetchCalendarExternalAccount(requestController.signal).then((value) => {
        if (requestController.signal.aborted || value == null) return;
        setAccount(value);
        if (!hydrateForm) return;
        setServerUrl(value.serverUrl);
        setProviderUuid(value.providerUuid);
      });
    };
    loadAccount(true);
    const unsubscribe = subscribeExternalAccountUpdates(() => loadAccount(false));
    return () => {
      controller?.abort();
      unsubscribe();
    };
  }, []);

  const save = () => {
    if (saving) return;
    if (
      providerUuid === "" ||
      [serverUrl, username, password].some((value) => value.trim() === "")
    ) {
      setError(t("settings.groupwareRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    void saveCalendarExternalAccount({
      uuid: account?.uuid,
      providerUuid,
      serverUrl,
      username,
      password,
    }).then((result) => {
      setSaving(false);
      if (!result.ok) {
        setError(t("settings.groupwareSaveError"));
        return;
      }
      setAccount(result.account);
      setPassword("");
      setFormOpen(false);
    });
  };

  const unlink = () => {
    if (account == null || saving) return;
    setSaving(true);
    void unlinkGroupwareExternalAccount(account.uuid).then((result) => {
      setSaving(false);
      if (!result.ok) {
        setError(t("settings.groupwareUnlinkError"));
        return;
      }
      setAccount(null);
      setFormOpen(false);
    });
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-card-bg p-4">
      <CardHeader
        icon="calendar"
        title={t("settings.calendarAccount")}
        status={account?.accessStatus}
      />
      {formOpen && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ProviderSelect
            providers={providerCatalog.providers}
            value={providerUuid}
            disabled={saving || providerCatalog.loading}
            failed={providerCatalog.failed}
            onChange={setProviderUuid}
          />
          <div className="sm:col-span-2">
            <Field label={t("settings.caldavUrl")}>
              <input
                className={inputClass}
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </Field>
          </div>
          <Field label={t("settings.groupwareUsername")}>
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label={t("settings.groupwarePassword")}>
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={account == null ? "" : t("auth.passwordPlaceholder")}
            />
          </Field>
        </div>
      )}
      {account?.accessLastError != null && (
        <p className="mt-3 text-xs text-notice-base">{account.accessLastError}</p>
      )}
      {error != null && <p className="mt-3 text-xs text-notice-base">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {formOpen ? (
          <button type="button" className={buttonClass} disabled={saving} onClick={save}>
            {t("common.save")}
          </button>
        ) : (
          <button
            type="button"
            className={buttonClass}
            disabled={saving}
            onClick={() => setFormOpen(true)}
          >
            {account == null ? t("common.add") : t("common.edit")}
          </button>
        )}
        {account != null && (
          <button type="button" className={buttonClass} disabled={saving} onClick={unlink}>
            {t("settings.groupwareUnlink")}
          </button>
        )}
      </div>
    </div>
  );
}
