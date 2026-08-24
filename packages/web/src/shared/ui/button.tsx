import React from "react";
import { Spinner } from "./spinner.ui";
import type { ButtonAppearance, ButtonProps, ButtonSize, ButtonVariant } from "./button.types";

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm leading-5",
  lg: "h-10 px-4 text-sm leading-5",
};

const appearanceClasses: Record<ButtonAppearance, Record<ButtonVariant, string>> = {
  filled: {
    primary:
      "bg-accent font-semibold text-on-accent hover:bg-accent/90 active:bg-accent/80 disabled:hover:bg-accent disabled:active:bg-accent",
    neutral:
      "border border-transparent bg-card-bg-active text-text-primary hover:border-border-subtle hover:bg-bg-elevated hover:ring-1 hover:ring-border-subtle active:border-accent-soft active:bg-card-bg active:ring-2 active:ring-accent-soft disabled:border-transparent disabled:bg-card-bg-active disabled:hover:border-transparent disabled:hover:bg-card-bg-active disabled:hover:ring-0 disabled:active:border-transparent disabled:active:bg-card-bg-active disabled:active:ring-0",
    danger:
      "bg-danger font-semibold text-white hover:bg-danger/90 active:bg-danger/80 disabled:hover:bg-danger disabled:active:bg-danger",
  },
  outline: {
    primary:
      "border border-accent bg-transparent text-accent hover:bg-accent/10 active:bg-accent/15",
    neutral:
      "border border-border-subtle bg-transparent text-text-primary hover:bg-bg-elevated active:bg-card-bg",
    danger:
      "border border-danger/30 bg-transparent text-danger hover:bg-danger/10 active:bg-danger/15",
  },
  ghost: {
    primary: "bg-transparent text-accent hover:bg-accent/10 active:bg-accent/15",
    neutral: "bg-transparent text-text-muted hover:bg-bg-elevated/60 hover:text-text-primary",
    danger: "bg-transparent text-danger hover:bg-danger/10 active:bg-danger/15",
  },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className = "",
    disabled,
    fullWidth = false,
    leadingIcon,
    loading = false,
    appearance = "filled",
    size = "md",
    variant = "primary",
    "aria-busy": ariaBusy,
    ...rest
  },
  ref,
) {
  const hasLeadingContent = loading || leadingIcon != null;
  const styleClasses = appearanceClasses[appearance][variant];
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
