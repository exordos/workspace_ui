import { t } from "~/i18n/i18n";
import {
  HOTKEYS,
  FIXED_HOTKEYS,
  formatHotkey,
  getHotkeyBinding,
  type HotkeyOverrides,
} from "~/shared/lib/hotkeys";

export interface ShortcutHelpEntry {
  label: string;
  combo: string;
}

export interface ShortcutHelpSection {
  category: string;
  entries: ShortcutHelpEntry[];
}

export function buildShortcutHelpSections(overrides: HotkeyOverrides = {}): ShortcutHelpSection[] {
  const sections: ShortcutHelpSection[] = ["navigation", "interface", "composer"].map(
    (category) => ({
      category: t(`hotkeys.${category}`),
      entries: HOTKEYS.filter((item) => item.category === category).flatMap((item) => {
        const binding = getHotkeyBinding(item.id, overrides);
        return binding == null ? [] : [{ label: t(item.labelKey), combo: formatHotkey(binding) }];
      }),
    }),
  );
  sections.push({
    category: t("hotkeys.fixedTitle"),
    entries: FIXED_HOTKEYS.map((item) => ({
      label: t(item.labelKey),
      combo: formatHotkey(item.binding),
    })),
  });
  return sections;
}
