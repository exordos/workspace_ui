import React, { useCallback, useState } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import type { MailSignInDialogProps } from "./mail-sign-in.types";

export const MailSignInDialog: React.FC<MailSignInDialogProps> = ({
  open,
  email,
  signingIn,
  error,
  onEmailChange,
  onSubmit,
}) => {
  const [password, setPassword] = useState("");

  const handleOpenChange = useCallback(() => {
    /* Auth gate — dialog stays open until sign-in succeeds */
  }, []);

  const submitAuth = useCallback(() => {
    if (password.length === 0 || email.length === 0) return;
    onSubmit(password);
  }, [email.length, onSubmit, password]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      submitAuth();
    },
    [submitAuth],
  );

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t("mail.signIn")}
      description={t("mail.signInHint")}
      footer={
        <DialogPrimaryButton
          type="button"
          onClick={submitAuth}
          isSubmitting={signingIn}
          disabled={password.length === 0 || email.length === 0}
        >
          {t("mail.signIn")}
        </DialogPrimaryButton>
      }
    >
      <form id="mail-auth-form" onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("common.email")}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("mail.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
            autoComplete="current-password"
            required
          />
        </label>
        {error != null && error.length > 0 ? (
          <p className="text-sm text-notice-base" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </AppDialog>
  );
};
