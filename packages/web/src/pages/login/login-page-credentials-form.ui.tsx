import React from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";

export interface LoginPageCredentialsFormProps {
  username: string;
  password: string;
  loading: boolean;
  error: string | null;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export const LoginPageCredentialsForm = React.memo<LoginPageCredentialsFormProps>(
  function LoginPageCredentialsForm({
    username,
    password,
    loading,
    error,
    onUsernameChange,
    onPasswordChange,
    onSubmit,
  }) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label={t("auth.emailOrLogin")} htmlFor="username">
          <input
            id="username"
            type="text"
            autoComplete="username"
            placeholder={t("auth.emailOrLoginHint")}
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={loading}
          />
        </FormField>

        <FormField label={t("auth.password")} htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={loading}
          />
        </FormField>

        {error != null && error.length > 0 && (
          <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
            {error}
          </div>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? t("auth.loginLoading") : t("common.next")}
        </Button>
      </form>
    );
  },
);
