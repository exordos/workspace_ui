import { formatShortcut, getShortcutsByCategory } from "~/shared/lib/shortcuts";

export interface ShortcutHelpEntry {
  label: string;
  combo: string;
  when?: string;
}

export interface ShortcutHelpSection {
  category: string;
  entries: ShortcutHelpEntry[];
}

export function buildShortcutHelpSections(): ShortcutHelpSection[] {
  return Array.from(getShortcutsByCategory().entries()).map(([category, entries]) => ({
    category,
    entries: entries.map((entry) => ({
      label: entry.label,
      combo: formatShortcut(entry.key),
      when: entry.when,
    })),
  }));
}
