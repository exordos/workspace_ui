import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { performApplicationColdStart } from "./local-reset";

function clearTestStorage(): void {
  for (const key of [
    "workspace-runtime-instances",
    "workspace-runtime-current-instance",
    "workspace-palette",
    "workspace-theme-mode",
    "workspace-settings",
    "workspace-settings:org-1",
    "workspace-locale",
    "workspace-locale:org-1",
    "workspace-sidebar-config",
    "workspace-sidebar-config:org-1",
    "workspace-palette:org-1",
    "workspace-theme-mode:org-1",
    "recent_dm_partners",
    "analytics_consent",
    "push_token",
    "temporary-cache",
    "workspace-last-messenger-route",
  ]) {
    localStorage.removeItem(key);
  }
  sessionStorage.clear();
}

describe("performApplicationColdStart", () => {
  beforeEach(() => {
    clearTestStorage();
  });

  afterEach(() => {
    clearTestStorage();
  });

  it("preserves auth keys while removing preferences, caches, and misc localStorage", async () => {
    localStorage.setItem("workspace-runtime-instances", '[{"id":"1"}]');
    localStorage.setItem("workspace-runtime-current-instance", "1");
    localStorage.setItem("workspace-palette", "blue-cold");
    localStorage.setItem("workspace-theme-mode", "light");
    localStorage.setItem("workspace-settings", '{"prioritizePersonalUnread":true}');
    localStorage.setItem("workspace-settings:org-1", '{"prioritizeUnmutedUnreadChannels":true}');
    localStorage.setItem("workspace-locale", "ru");
    localStorage.setItem("workspace-locale:org-1", "en");
    localStorage.setItem("workspace-sidebar-config", '{"activityOpen":true}');
    localStorage.setItem("workspace-sidebar-config:org-1", '{"activityOpen":false}');
    localStorage.setItem("workspace-palette:org-1", "blue-cold");
    localStorage.setItem("workspace-theme-mode:org-1", "light");
    localStorage.setItem("recent_dm_partners", "[1,2,3]");
    localStorage.setItem("analytics_consent", "granted");
    localStorage.setItem("push_token", "abc");
    localStorage.setItem("workspace-last-messenger-route", '{"path":"/chat"}');

    await performApplicationColdStart();

    expect(localStorage.getItem("workspace-runtime-instances")).toBe('[{"id":"1"}]');
    expect(localStorage.getItem("workspace-runtime-current-instance")).toBe("1");

    expect(localStorage.getItem("workspace-palette")).toBeNull();
    expect(localStorage.getItem("workspace-theme-mode")).toBeNull();
    expect(localStorage.getItem("workspace-settings")).toBeNull();
    expect(localStorage.getItem("workspace-settings:org-1")).toBeNull();
    expect(localStorage.getItem("workspace-locale")).toBeNull();
    expect(localStorage.getItem("workspace-locale:org-1")).toBeNull();
    expect(localStorage.getItem("workspace-sidebar-config")).toBeNull();
    expect(localStorage.getItem("workspace-sidebar-config:org-1")).toBeNull();
    expect(localStorage.getItem("workspace-palette:org-1")).toBeNull();
    expect(localStorage.getItem("workspace-theme-mode:org-1")).toBeNull();
    expect(localStorage.getItem("recent_dm_partners")).toBeNull();
    expect(localStorage.getItem("analytics_consent")).toBeNull();
    expect(localStorage.getItem("push_token")).toBeNull();
    expect(localStorage.getItem("workspace-last-messenger-route")).toBeNull();
  });

  it("does not throw when storage operations fail", async () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function () {
      throw new Error("SecurityError");
    };

    await expect(performApplicationColdStart()).resolves.toBeUndefined();

    Storage.prototype.removeItem = originalRemoveItem;
  });

  it("clears HTTP caches when Cache Storage is available", async () => {
    const deleteMock = vi.fn().mockResolvedValue(true);
    const keysMock = vi.fn().mockResolvedValue(["workbox-precache-v2"]);
    vi.stubGlobal("caches", { keys: keysMock, delete: deleteMock });

    await performApplicationColdStart();

    expect(keysMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith("workbox-precache-v2");

    vi.unstubAllGlobals();
  });
});
