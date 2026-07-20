import React from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";

interface LoginPageOtpFormProps {
  otpCode: string;
  loading: boolean;
  error: string | null;
  onOtpCodeChange: (value: string) => void;
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
}

export const LoginPageOtpForm = React.memo<LoginPageOtpFormProps>(function LoginPageOtpForm({
  otpCode,
  loading,
  error,
  onOtpCodeChange,
  onSubmit,
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField label={t("auth.otpCode")} htmlFor="otpCode">
        <input
          id="otpCode"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          value={otpCode}
          onChange={(event) => onOtpCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-text-primary placeholder:tracking-[0.35em] placeholder:text-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          disabled={loading}
          autoFocus
        />
      </FormField>

      {error != null && error.length > 0 && (
        <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
          {error}
        </div>
      )}

      <Button type="submit" disabled={loading || otpCode.length !== 6} className="w-full">
        {loading ? t("auth.loginLoading") : t("auth.confirmOtp")}
      </Button>
    </form>
  );
});
