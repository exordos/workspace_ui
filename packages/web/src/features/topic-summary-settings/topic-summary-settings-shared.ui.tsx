import React from "react";

export interface SwitchRowProps {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly description?: string;
  readonly onChange: (checked: boolean) => void;
}

export const SwitchRow = React.memo(function SwitchRow({
  checked,
  disabled,
  label,
  description,
  onChange,
}: SwitchRowProps) {
  return (
    <label className="hover:bg-bg-elevated/60 flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {description != null ? (
          <span className="mt-0.5 block text-xs text-text-muted">{description}</span>
        ) : null}
      </span>
      <span className="relative shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="peer-focus-visible:ring-accent/40 block h-5 w-9 rounded-full bg-border-subtle transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
});
