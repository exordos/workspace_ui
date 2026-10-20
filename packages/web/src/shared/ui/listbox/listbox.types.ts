import type { RefObject } from "react";

export interface ListboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export type ListboxSize = "default" | "compact";

export interface ListboxProps {
  id: string;
  anchorRef: RefObject<HTMLElement | null>;
  options: readonly ListboxOption[];
  value: string;
  activeValue: string | null;
  emptyText?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  onActiveChange?: (value: string) => void;
  onSelect: (value: string) => void;
  onClose: () => void;
}
