import type { ListboxOption, ListboxSize } from "~/shared/ui/listbox";
import type { InputHTMLAttributes } from "react";

export interface InputSelectorProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "size" | "children"
> {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ListboxOption[];
  searchable?: boolean;
  invalid?: boolean;
  emptyText?: string;
  inputClassName?: string;
  size?: ListboxSize;
}
