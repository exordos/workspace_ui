import { useState } from "react";
import { t, useTranslation } from "~/i18n/i18n";
import { CompactTextField } from "~/shared/ui/compact-text-field";
import { DateTimePicker } from "~/shared/ui/date-time-picker";

export function PollToggle({
  label,
  hint,
  checked,
  onChange,
}: Readonly<{
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}>) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        <span className="block text-xs text-text-secondary">{hint}</span>
      </span>
      <span className="relative mt-1 shrink-0">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <span className="peer-focus-visible:ring-accent/40 pointer-events-none block h-[18px] w-[30px] rounded-full bg-border-subtle transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-3" />
      </span>
    </label>
  );
}

export function PollDeadline({
  value,
  enabled,
  invalid,
  onValueChange,
  onEnabledChange,
  compact = false,
}: Readonly<{
  value: Date | null;
  enabled: boolean;
  invalid: boolean;
  onValueChange: (value: Date) => void;
  onEnabledChange: (enabled: boolean) => void;
  compact?: boolean;
}>) {
  const [expanded, setExpanded] = useState(false);
  const { locale } = useTranslation();
  return (
    <div className="space-y-2 text-sm text-text-primary">
      <div className="font-semibold">{t("pollForm.closeDate")}</div>
      {compact && enabled && value && (
        <CompactTextField>
          <button
            type="button"
            className="h-full w-full text-left text-xs"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
              value,
            )}
          </button>
        </CompactTextField>
      )}
      <button
        type="button"
        className="text-sm text-accent hover:underline"
        onClick={() => {
          onEnabledChange(!enabled);
          setExpanded(!enabled);
        }}
      >
        {enabled ? t("pollForm.removeDate") : t("pollForm.setDate")}
      </button>
      {enabled && (!compact || expanded || !value) && (
        <>
          <DateTimePicker
            value={value}
            onValueChange={onValueChange}
            aria-label={t("pollForm.closeDate")}
          />
          {invalid && <span className="block text-xs text-danger">{t("pollForm.futureDate")}</span>}
        </>
      )}
    </div>
  );
}
