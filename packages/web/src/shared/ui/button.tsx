import React from "react";
import type { ButtonSize, ButtonProps, ButtonVariant } from "./button.types";

const base =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed";

const variantClasses: Record<ButtonVariant, string> = {
  // text-on-accent — palette label on accent fill
  // hover:bg-accent/90 — fade fill only (opacity on the whole control washes the label)
  primary: "bg-accent font-semibold text-on-accent hover:bg-accent/90",
  ghost: "bg-transparent text-text-muted hover:bg-bg-elevated/60 hover:text-text-primary",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}) => {
  return (
    <button
      className={`${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
      // Opt out of app.styles.css icon-only preset: that selector matches svg+text
      // (text nodes are ignored by :has(> *:not(svg))) and forces text-icon-base gray.
      data-icon-hover="custom"
    >
      {children}
    </button>
  );
};
