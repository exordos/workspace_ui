import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost";
export type ButtonTone = "accent" | "neutral" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonBehaviorProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  leadingIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

interface LegacyButtonStyleProps {
  variant?: ButtonVariant;
  appearance?: never;
  tone?: never;
  size?: Exclude<ButtonSize, "lg">;
}

interface SemanticButtonStyleProps {
  variant?: never;
  tone?: ButtonTone;
  size?: ButtonSize;
}

export type ButtonProps = ButtonBehaviorProps & (LegacyButtonStyleProps | SemanticButtonStyleProps);
