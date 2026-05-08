import type { KeyboardEventHandler } from "react";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  type?: "search" | "text";
  clearable?: boolean;
  onClear?: () => void;
  iconPosition?: "left" | "right";
  size?: "sm" | "md";
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}
