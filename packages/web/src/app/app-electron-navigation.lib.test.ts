import { describe, expect, it } from "vitest";
import { TRAY_MESSENGER_OPEN_ROUTE } from "~/shared/lib/last-messenger-route.lib";
import { resolveElectronTrayNavigation } from "./app-electron-navigation.lib";

describe("resolveElectronTrayNavigation", () => {
  it("maps slash-prefixed routes to navigate actions", () => {
    expect(resolveElectronTrayNavigation("/stream/general")).toEqual({
      type: "navigate",
      route: "/stream/general",
    });
    expect(resolveElectronTrayNavigation("/calendar")).toEqual({
      type: "navigate",
      route: "/calendar",
    });
    expect(resolveElectronTrayNavigation("/mail")).toEqual({
      type: "navigate",
      route: "/mail",
    });
  });

  it("normalizes routes without leading slash and trims whitespace", () => {
    expect(resolveElectronTrayNavigation("stream/general")).toEqual({
      type: "navigate",
      route: "/stream/general",
    });
    expect(resolveElectronTrayNavigation("  /calendar  ")).toEqual({
      type: "navigate",
      route: "/calendar",
    });
  });

  it("maps tray messenger sentinel to open-messenger", () => {
    expect(resolveElectronTrayNavigation(TRAY_MESSENGER_OPEN_ROUTE)).toEqual({
      type: "open-messenger",
    });
  });

  it("maps tray messenger sentinel without leading slash", () => {
    expect(resolveElectronTrayNavigation("open/messenger")).toEqual({
      type: "open-messenger",
    });
  });

  it("rejects unsafe routes", () => {
    const scriptUrl = `java${"script"}:alert(1)`;
    expect(resolveElectronTrayNavigation(scriptUrl)).toBeNull();
    expect(resolveElectronTrayNavigation("//evil.example")).toBeNull();
    expect(resolveElectronTrayNavigation("")).toBeNull();
  });
});
