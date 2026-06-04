import React from "react";
import { t } from "~/i18n/i18n";
import { isValidEmail } from "~/shared/lib/validation";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";
import { Icon } from "~/shared/ui/icon";

export interface LoginPageCredentialsFormProps {
  username: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export const LoginPageCredentialsForm = React.memo<LoginPageCredentialsFormProps>(
  function LoginPageCredentialsForm({
    username,
    password,
    showPassword,
    loading,
    error,
    onUsernameChange,
    onPasswordChange,
    onToggleShowPassword,
    onSubmit,
  }) {
    // Password step uses the same email validator as login submission
    const canShowPasswordStep = isValidEmail(username);

    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label={t("auth.email")} htmlFor="username">
          <input
            id="username"
            type="email"
            autoComplete="email"
            placeholder={t("auth.emailHint")}
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={loading}
          />
        </FormField>

        <div className={canShowPasswordStep ? "flex flex-col gap-4" : "hidden"}>
          <FormField label={t("auth.password")} htmlFor="password">
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 pr-10 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={loading}
              />
              <button
                type="button"
                onClick={onToggleShowPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                <Icon name={showPassword ? "close" : "profile"} size={18} />
              </button>
            </div>
          </FormField>

          {error != null && error.length > 0 && (
            <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("auth.loginLoading") : t("auth.login")}
          </Button>
        </div>
      </form>
    );
  },
);
