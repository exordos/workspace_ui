import type { ListboxOption, ListboxSize } from "~/shared/ui/listbox";
import type { AriaAttributes } from "react";

export type SelectOption = ListboxOption;

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
  size?: ListboxSize;
}
