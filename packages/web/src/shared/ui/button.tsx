import React from "react";
import { Spinner } from "./spinner.ui";
import type { ButtonProps, ButtonSize, ButtonTone, ButtonVariant } from "./button.types";

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  // text-on-accent — palette label on accent fill
  // hover:bg-accent/90 — fade fill only (opacity on the whole control washes the label)
  primary: "bg-accent font-semibold text-on-accent hover:bg-accent/90",
  ghost: "bg-transparent text-text-muted hover:bg-bg-elevated/60 hover:text-text-primary",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-4 text-sm leading-5",
};

const toneClasses: Record<ButtonTone, string> = {
  accent:
    "bg-accent font-semibold text-on-accent hover:bg-accent/90 active:bg-accent/80 disabled:hover:bg-accent disabled:active:bg-accent",
  neutral:
    "border border-transparent bg-card-bg-active leading-5 text-sm text-text-primary hover:border-border-subtle hover:bg-bg-elevated hover:ring-1 hover:ring-border-subtle active:border-accent-soft active:bg-card-bg active:ring-2 active:ring-accent-soft disabled:border-transparent disabled:bg-card-bg-active disabled:hover:border-transparent disabled:hover:bg-card-bg-active disabled:hover:ring-0 disabled:active:border-transparent disabled:active:bg-card-bg-active disabled:active:ring-0",
  danger:
    "bg-danger font-semibold text-white hover:bg-danger/90 active:bg-danger/80 disabled:hover:bg-danger disabled:active:bg-danger",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className = "",
    disabled,
    fullWidth = false,
    leadingIcon,
    loading = false,
    size = "md",
    tone,
    variant,
    "aria-busy": ariaBusy,
    ...rest
  },
  ref,
) {
  const hasLeadingContent = loading || leadingIcon != null;
  const usesLegacyVariant = tone == null && size !== "lg";
  const styleClasses = usesLegacyVariant
    ? variantClasses[variant ?? "primary"]
    : toneClasses[tone ?? "accent"];
  const buttonClassName = [
    BASE,
    styleClasses,
    sizeClasses[size],
    hasLeadingContent ? "gap-1.5" : null,
    fullWidth ? "w-full" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      ref={ref}
      className={buttonClassName}
      disabled={loading ? true : disabled}
      aria-busy={loading ? true : ariaBusy}
      // Opt out of app.styles.css icon-only preset: that selector matches svg+text
      // (text nodes are ignored by :has(> *:not(svg))) and forces text-icon-base gray.
      data-icon-hover="custom"
    >
      {loading ? <Spinner size="sm" variant="inherit" /> : leadingIcon}
      {children}
    </button>
  );
});

Button.displayName = "Button";
