import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { formatHotkey } from "~/shared/lib/hotkeys";
import { buildShortcutHelpSections } from "./app-shortcuts-help.lib";

describe("app-shortcuts-help", () => {
  it("shows effective bindings and omits disabled actions", () => {
    const entries = buildShortcutHelpSections({
      "composer.editLastMessage": "Alt+U",
      "interface.help": null,
    }).flatMap((section) => section.entries);
    expect(entries).toContainEqual({
      label: t("hotkeys.actions.composer.editLastMessage"),
      combo: formatHotkey("Alt+U"),
    });
    expect(entries.some((entry) => entry.label === t("hotkeys.actions.interface.help"))).toBe(
      false,
    );
    expect(entries.some((entry) => entry.combo === formatHotkey("Escape"))).toBe(true);
  });
});
