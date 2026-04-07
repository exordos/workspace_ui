import { afterEach, describe, expect, it } from "vitest";
import { setCurrentOrgRouteIdResolver } from "~/shared/lib/org-route";
import {
  resolveGlobalNavigationRoute,
  resolveGlobalShortcutAction,
  type GlobalNavigationShortcutKey,
} from "./app-shortcuts.lib";

describe("app-shortcuts", () => {
  afterEach(() => {
    setCurrentOrgRouteIdResolver(null);
  });

  it("prefixes shortcut routes with current org scope", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");
    expect(resolveGlobalNavigationRoute("mod+1", "general")).toBe(
      "/org/chat.example.com/stream/general",
    );
    expect(resolveGlobalNavigationRoute("mod+4", "general")).toBe("/org/chat.example.com/calls");
  });

  it("maps global navigation shortcuts to expected routes", () => {
    const cases: { key: GlobalNavigationShortcutKey; route: string }[] = [
      { key: "mod+1", route: "/stream/general" },
      { key: "mod+2", route: "/calendar" },
      { key: "mod+3", route: "/mail" },
      { key: "mod+4", route: "/calls" },
      { key: "mod+shift+a", route: "/activity/starred" },
    ];

    for (const item of cases) {
      expect(resolveGlobalNavigationRoute(item.key, "general")).toBe(item.route);
    }
  });

  it("uses provided default stream slug for messenger route", () => {
    expect(resolveGlobalNavigationRoute("mod+1", "engineering")).toBe("/stream/engineering");
  });

  it("maps theme shortcut to non-navigation action", () => {
    expect(resolveGlobalShortcutAction("mod+shift+t", "general")).toEqual({ type: "toggle-theme" });
  });
});
