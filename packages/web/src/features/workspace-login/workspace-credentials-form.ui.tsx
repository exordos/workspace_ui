import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field";

export interface WorkspaceCredentialsFormProps {
  username: string;
  password: string;
  loading: boolean;
  error: string | null;
  fieldIdPrefix?: string;
  focusPassword?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export const WorkspaceCredentialsForm = React.memo<WorkspaceCredentialsFormProps>(
  function WorkspaceCredentialsForm({
    username,
    password,
    loading,
    error,
    fieldIdPrefix,
    focusPassword,
    submitLabel = t("common.next"),
    submitDisabled = false,
    onUsernameChange,
    onPasswordChange,
    onSubmit,
  }) {
    const usernameId = fieldIdPrefix == null ? "username" : `${fieldIdPrefix}-username`;
    const passwordId = fieldIdPrefix == null ? "password" : `${fieldIdPrefix}-password`;
    const focusPasswordInput = useCallback(
      (input: HTMLInputElement | null) => {
        if (focusPassword) input?.focus();
      },
      [focusPassword],
    );

    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label={t("auth.emailOrLogin")} htmlFor={usernameId}>
          <input
            id={usernameId}
            type="text"
            autoComplete="username"
            placeholder={t("auth.emailOrLoginHint")}
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={loading}
          />
        </FormField>

        <FormField label={t("auth.password")} htmlFor={passwordId}>
          <input
            id={passwordId}
            ref={focusPasswordInput}
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
          <div
            role="alert"
            className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base"
          >
            {error}
          </div>
        )}

        <Button type="submit" disabled={loading || submitDisabled} className="w-full">
          {loading ? t("auth.loginLoading") : submitLabel}
        </Button>
      </form>
    );
  },
);
