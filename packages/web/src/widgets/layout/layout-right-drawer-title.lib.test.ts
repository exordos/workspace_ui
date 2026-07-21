import { describe, expect, it } from "vitest";
import { resolveLayoutRightPanelTitle } from "./layout-right-drawer-title.lib";

describe("resolveLayoutRightPanelTitle", () => {
  const tr = (key: string) => `t:${key}`;

  it("returns account label for settings and user-menu modes", () => {
    expect(resolveLayoutRightPanelTitle("settings", tr)).toBe("t:nav.account");
    expect(resolveLayoutRightPanelTitle("user-menu", tr)).toBe("t:nav.account");
  });

  it("returns app version label for about mode", () => {
    expect(resolveLayoutRightPanelTitle("about", tr)).toBe("t:settings.appVersion");
  });

  it("returns select-build label for builds mode", () => {
    expect(resolveLayoutRightPanelTitle("builds", tr)).toBe("t:settings.selectBuild");
  });

  it("returns channel info label for info mode without kind", () => {
    expect(resolveLayoutRightPanelTitle("info", tr)).toBe("t:info.channelInfo");
  });

  it("returns channel info label for channel kind", () => {
    expect(resolveLayoutRightPanelTitle("info", tr, "channel")).toBe("t:info.channelInfo");
  });

  it("returns information label for direct/private and user profile kinds", () => {
    expect(resolveLayoutRightPanelTitle("info", tr, "directPrivate")).toBe("t:info.information");
    expect(resolveLayoutRightPanelTitle("info", tr, "userProfile")).toBe("t:info.information");
  });
});
