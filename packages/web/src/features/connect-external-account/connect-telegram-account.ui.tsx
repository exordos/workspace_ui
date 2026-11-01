import { QRCodeSVG } from "qrcode.react";
import React, { useCallback, useMemo } from "react";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field";
import { Select } from "~/shared/ui/select";
import { useConnectTelegramAccount } from "./connect-telegram-account.hook";

export const ConnectTelegramAccount = React.memo<{
  runtimeContext: WorkspaceRuntimeContext | null;
  account: ExternalAccount | null;
  onChooseZulip: () => void;
}>(({ runtimeContext, account, onChooseZulip }) => {
  const vm = useConnectTelegramAccount(runtimeContext, account);
  const { setPassword, submitPassword: sendPassword, connect: startConnection } = vm;
  const providerOptions = useMemo(
    () => [
      { value: "zulip", label: t("connectExternalAccount.providers.zulip") },
      { value: "telegram", label: t("connectExternalAccount.providers.telegram") },
    ],
    [],
  );
  const changeProvider = useCallback(
    (value: string) => {
      if (value === "zulip") onChooseZulip();
    },
    [onChooseZulip],
  );
  const changePassword = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
    [setPassword],
  );
  const submitPassword = useCallback(
    (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      void sendPassword();
    },
    [sendPassword],
  );
  const connect = useCallback(() => void startConnection(), [startConnection]);
  const dialogs = vm.snapshot?.dialogs ?? [];
  const imported = dialogs.reduce((sum, dialog) => sum + dialog.imported_messages, 0);
  const finished = dialogs.length > 0 && dialogs.every((dialog) => dialog.history_done);
  return (
    <div className="flex flex-col gap-4" data-testid="telegram-connection">
      {account == null ? (
        <FormField label={t("connectExternalAccount.provider")} htmlFor="telegram-provider">
          <Select
            id="telegram-provider"
            value="telegram"
            options={providerOptions}
            onValueChange={changeProvider}
          />
        </FormField>
      ) : null}
      {vm.error || vm.snapshot?.error_code ? (
        <p role="alert" className="text-sm text-notice-base">
          {t("connectExternalAccount.telegram.failed")}
        </p>
      ) : null}
      {vm.snapshot == null ||
      vm.snapshot.state === "disconnected" ||
      vm.snapshot.state === "expired" ? (
        <>
          <p className="text-sm text-text-muted">
            {t("connectExternalAccount.telegram.description")}
          </p>
          <Button type="button" disabled={vm.busy || runtimeContext == null} onClick={connect}>
            {t("connectExternalAccount.telegram.connect")}
          </Button>
        </>
      ) : null}
      {vm.snapshot?.state === "starting" ? (
        <p role="status">{t("connectExternalAccount.telegram.starting")}</p>
      ) : null}
      {vm.snapshot?.state === "qr_pending" ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-text-muted">{t("connectExternalAccount.telegram.scan")}</p>
          {vm.snapshot.qr_url ? (
            <div className="rounded-lg bg-white p-4" data-testid="telegram-login-qr">
              <QRCodeSVG value={vm.snapshot.qr_url} size={224} />
            </div>
          ) : (
            <p role="status">{t("connectExternalAccount.telegram.starting")}</p>
          )}
        </div>
      ) : null}
      {vm.snapshot?.state === "password_required" ? (
        <form onSubmit={submitPassword} className="flex flex-col gap-4">
          <FormField
            label={t("connectExternalAccount.telegram.password")}
            htmlFor="telegram-password"
          >
            <input
              id="telegram-password"
              type="password"
              autoComplete="current-password"
              value={vm.password}
              onChange={changePassword}
              className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-text-primary"
            />
          </FormField>
          <Button type="submit" disabled={vm.busy || vm.password.length === 0}>
            {t("connectExternalAccount.telegram.continue")}
          </Button>
        </form>
      ) : null}
      {vm.snapshot?.state === "authorized" ? (
        <>
          <p className="text-sm text-text-muted">
            {t("connectExternalAccount.telegram.automaticImport")}
          </p>
          <p role="status" className="text-sm text-text-muted">
            {t(
              finished
                ? "connectExternalAccount.telegram.finished"
                : "connectExternalAccount.telegram.progress",
              { count: imported },
            )}
          </p>
        </>
      ) : null}
    </div>
  );
});
