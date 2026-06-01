export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerVariant = "accent" | "inherit";

export interface SpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  className?: string;
}
