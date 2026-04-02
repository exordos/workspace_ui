import { describe, expect, it } from "vitest";
import { resolveLayoutRightPanelTitle } from "./layout-right-drawer-title.lib";

describe("resolveLayoutRightPanelTitle", () => {
  const tr = (key: string) => `t:${key}`;

  it("returns settings label for settings mode", () => {
    expect(resolveLayoutRightPanelTitle("settings", "Chat", tr)).toBe("t:settings.settings");
  });

  it("returns context title for info mode", () => {
    expect(resolveLayoutRightPanelTitle("info", "Engineering", tr)).toBe("Engineering");
  });
});
