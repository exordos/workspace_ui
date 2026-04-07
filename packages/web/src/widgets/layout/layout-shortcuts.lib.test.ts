import { describe, expect, it } from "vitest";
import { resolveShortcutPanelToggle } from "./layout-shortcuts.lib";

describe("layout-shortcuts", () => {
  it("toggles panel in chat section", () => {
    expect(resolveShortcutPanelToggle(true, "chat")).toBe(false);
    expect(resolveShortcutPanelToggle(false, "chat")).toBe(true);
  });

  it("keeps panel state unchanged outside chat section", () => {
    expect(resolveShortcutPanelToggle(true, "calendar")).toBe(true);
    expect(resolveShortcutPanelToggle(false, "mail")).toBe(false);
    expect(resolveShortcutPanelToggle(true, "calls")).toBe(true);
  });
});
