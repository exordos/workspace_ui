import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import "./checkbox.css";

export interface CheckboxIndicatorProps {
  checked: boolean;
  size?: 16 | 20;
  tone?: "accent" | "success";
  disabled?: boolean;
  className?: string;
}

/** Decorative state for a parent control that already owns its interaction and label. */
export function CheckboxIndicator({
  checked,
  size = 16,
  tone = "accent",
  disabled = false,
  className = "",
}: Readonly<CheckboxIndicatorProps>) {
  return (
    <span
      aria-hidden="true"
      className={`checkbox-indicator ${className}`.trim()}
      data-state={checked ? "checked" : "unchecked"}
      data-size={size}
      data-tone={tone}
      data-disabled={disabled || undefined}
      style={{ width: size, height: size }}
    >
      {checked && (
        <svg viewBox="0 0 16 16" fill="none" className="h-full w-full" aria-hidden="true">
          <path
            d="M4.8 8 7 10.4 11.2 5.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

export type CheckboxProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "size" | "children" | "checked" | "defaultChecked"
> &
  CheckboxIndicatorProps;

/** A controlled native checkbox; labels and larger hit areas belong to the caller. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, size = 16, tone = "accent", disabled = false, className = "", ...props },
  ref,
) {
  return (
    <span className={`checkbox relative inline-flex shrink-0 align-middle ${className}`.trim()}>
      <input
        {...props}
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="checkbox-input absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
      <CheckboxIndicator checked={checked} size={size} tone={tone} disabled={disabled} />
    </span>
  );
});
