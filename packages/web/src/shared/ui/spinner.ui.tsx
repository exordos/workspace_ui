import React from "react";
import type { SpinnerProps } from "./spinner.types";

const SIZE_CLASS: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

const VARIANT_CLASS: Record<NonNullable<SpinnerProps["variant"]>, string> = {
  accent: "border-border-subtle border-t-accent",
  inherit: "border-current border-t-transparent",
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = "lg",
  variant = "accent",
  className = "",
}) => (
  <span
    aria-hidden
    className={`inline-block animate-spin rounded-full border-2 ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`.trim()}
  />
);
