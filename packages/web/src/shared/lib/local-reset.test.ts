import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearLocalStatePreservingCriticalKeys } from "./local-reset";

function clearTestStorage(): void {
  for (const key of [
    "zulip-web-instances",
    "zulip-web-current-instance",
    "workspace-palette",
    "workspace-theme-mode",
    "workspace-settings",
    "workspace-settings:org-1",
    "workspace-locale",
    "workspace-locale:org-1",
    "zulip-web-sidebar-config",
    "zulip-web-sidebar-config:org-1",
    "workspace-palette:org-1",
    "workspace-theme-mode:org-1",
    "recent_dm_partners",
    "analytics_consent",
    "push_token",
    "temporary-cache",
  ]) {
    localStorage.removeItem(key);
  }
}

describe("clearLocalStatePreservingCriticalKeys", () => {
  beforeEach(() => {
    clearTestStorage();
  });

  afterEach(() => {
    clearTestStorage();
  });

  it("preserves critical auth and preference keys while removing non-critical entries", () => {
    localStorage.setItem("zulip-web-instances", '[{"id":"1"}]');
    localStorage.setItem("zulip-web-current-instance", "1");
    localStorage.setItem("workspace-palette", "blue-cold");
    localStorage.setItem("workspace-theme-mode", "light");
    localStorage.setItem("workspace-settings", '{"chatSorting":"recent"}');
    localStorage.setItem("workspace-settings:org-1", '{"chatSorting":"alphabetical"}');
    localStorage.setItem("workspace-locale", "ru");
    localStorage.setItem("workspace-locale:org-1", "en");
    localStorage.setItem("zulip-web-sidebar-config", '{"activityOpen":true}');
    localStorage.setItem("zulip-web-sidebar-config:org-1", '{"activityOpen":false}');
    localStorage.setItem("workspace-palette:org-1", "blue-cold");
    localStorage.setItem("workspace-theme-mode:org-1", "light");
    localStorage.setItem("recent_dm_partners", "[1,2,3]");
    localStorage.setItem("analytics_consent", "granted");

    localStorage.setItem("push_token", "abc");
    localStorage.setItem("temporary-cache", "remove-me");

    clearLocalStatePreservingCriticalKeys();

    expect(localStorage.getItem("zulip-web-instances")).toBe('[{"id":"1"}]');
    expect(localStorage.getItem("zulip-web-current-instance")).toBe("1");
    expect(localStorage.getItem("workspace-palette")).toBe("blue-cold");
    expect(localStorage.getItem("workspace-theme-mode")).toBe("light");
    expect(localStorage.getItem("workspace-settings")).toBe('{"chatSorting":"recent"}');
    expect(localStorage.getItem("workspace-settings:org-1")).toBe('{"chatSorting":"alphabetical"}');
    expect(localStorage.getItem("workspace-locale")).toBe("ru");
    expect(localStorage.getItem("workspace-locale:org-1")).toBe("en");
    expect(localStorage.getItem("zulip-web-sidebar-config")).toBe('{"activityOpen":true}');
    expect(localStorage.getItem("zulip-web-sidebar-config:org-1")).toBe('{"activityOpen":false}');
    expect(localStorage.getItem("workspace-palette:org-1")).toBe("blue-cold");
    expect(localStorage.getItem("workspace-theme-mode:org-1")).toBe("light");
    expect(localStorage.getItem("recent_dm_partners")).toBe("[1,2,3]");
    expect(localStorage.getItem("analytics_consent")).toBe("granted");

    expect(localStorage.getItem("push_token")).toBeNull();
    expect(localStorage.getItem("temporary-cache")).toBeNull();
  });

  it("does not throw when storage operations fail", () => {
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = () => {
      throw new Error("SecurityError");
    };

    expect(() => clearLocalStatePreservingCriticalKeys()).not.toThrow();

    localStorage.getItem = originalGetItem;
  });
});
