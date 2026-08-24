import React from "react";
import { Icon } from "~/shared/ui/icon";

type WorkspaceMessageSelectionControlProps = Readonly<{
  checked: boolean;
  label: string;
  descriptionId?: string;
  onChange: (checked: boolean) => void;
}>;

/**
 * Message selection control with a small visual checkbox and a larger hit area.
 * The native input remains the source of truth for keyboard and screen-reader behavior.
 */
export function WorkspaceMessageSelectionControl({
  checked,
  label,
  descriptionId,
  onChange,
}: WorkspaceMessageSelectionControlProps): React.ReactElement {
  // A one-line bubble is 36px tall (20px line + 16px vertical padding).
  // The 2px bottom inset centers this 32px hit area there and keeps it bottom-anchored on taller bubbles.
  return (
    <label
      className="mb-0.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center"
      data-workspace-message-selection-control="true"
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        aria-describedby={descriptionId}
        className="peer sr-only"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="flex h-4 w-4 items-center justify-center rounded border border-text-muted text-bg transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent-soft"
        data-workspace-message-selection-visual="true"
      >
        {checked ? <Icon name="check" size={12} /> : null}
      </span>
    </label>
  );
}
