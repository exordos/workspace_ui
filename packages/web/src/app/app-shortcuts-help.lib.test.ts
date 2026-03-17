import { describe, expect, it } from "vitest";
import { formatShortcut } from "~/shared/lib/shortcuts";
import { buildShortcutHelpSections } from "./app-shortcuts-help.lib";

describe("app-shortcuts-help", () => {
  it("builds non-empty sections from shortcut catalog", () => {
    const sections = buildShortcutHelpSections();
    expect(sections.length).toBeGreaterThan(0);
  });

  it("contains interface help shortcut entry with formatted combo", () => {
    const sections = buildShortcutHelpSections();
    const interfaceSection = sections.find((section) => section.category === "Interface");
    expect(interfaceSection).toBeDefined();

    const helpEntry = interfaceSection?.entries.find(
      (entry) => entry.label === "Keyboard shortcuts help",
    );
    expect(helpEntry).toBeDefined();
    expect(helpEntry?.combo).toBe(formatShortcut("mod+/"));
  });
});
