import type { AriaAttributes, InputHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps extends AriaAttributes {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  size?: "default" | "compact";
}

export interface InputSelectorProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "size" | "children"
> {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  searchable?: boolean;
  invalid?: boolean;
  emptyText?: string;
  inputClassName?: string;
  size?: "default" | "compact";
}
