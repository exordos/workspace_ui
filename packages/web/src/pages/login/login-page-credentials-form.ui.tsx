import React from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";

export interface LoginPageCredentialsFormProps {
  realm: string;
  username: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
  onRealmChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRealmBlur: () => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const LoginPageCredentialsForm = React.memo<LoginPageCredentialsFormProps>(
  function LoginPageCredentialsForm({
    realm,
    username,
    password,
    showPassword,
    loading,
    error,
    onRealmChange,
    onUsernameChange,
    onPasswordChange,
    onRealmBlur,
    onToggleShowPassword,
    onSubmit,
  }) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="realm" className="mb-1.5 block text-sm font-medium text-text-primary">
            {t("auth.zulipServerUrl")}
          </label>
          <input
            id="realm"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder={t("auth.zulipServerUrlHint")}
            value={realm}
            onChange={(e) => onRealmChange(e.target.value)}
            onBlur={onRealmBlur}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-text-primary">
            {t("auth.email")}
          </label>
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
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-text-primary">
            {t("auth.password")}
          </label>
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
        </div>

        {error != null && error.length > 0 && (
          <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
            {error}
          </div>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? t("auth.loginLoading") : t("auth.login")}
        </Button>
      </form>
    );
  },
);
