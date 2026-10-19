import type { ListboxOption, ListboxSize } from "./listbox.types";

export const LISTBOX_CONTROL_CLASS =
  "flex w-full min-w-0 items-center gap-2 rounded-lg border border-border-subtle bg-text-field-bg text-sm text-text-primary transition-colors hover:border-text-muted focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50";

export const LISTBOX_CONTROL_SIZE_CLASS: Record<ListboxSize, string> = {
  default: "h-10 px-3",
  compact: "h-8 px-2.5",
};

export function getListboxOptionId(listId: string, value: string): string {
  return `${listId}-${encodeURIComponent(value)}`;
}

export function moveActiveListboxOption(
  options: readonly ListboxOption[],
  activeValue: string | null,
  direction: 1 | -1,
): string | null {
  const enabled = options.filter((option) => !option.disabled);
  const index = enabled.findIndex((option) => option.value === activeValue);
  const initialIndex = direction === 1 ? 0 : enabled.length - 1;
  const nextIndex = index < 0 ? initialIndex : index + direction;
  return enabled[Math.max(0, Math.min(enabled.length - 1, nextIndex))]?.value ?? null;
}
