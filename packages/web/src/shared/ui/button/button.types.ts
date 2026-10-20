import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "neutral" | "danger";
export type ButtonAppearance = "filled" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonBehaviorProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  leadingIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

interface ButtonStyleProps {
  variant?: ButtonVariant;
  appearance?: ButtonAppearance;
  size?: ButtonSize;
}

export type ButtonProps = ButtonBehaviorProps & ButtonStyleProps;
