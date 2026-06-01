import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { performApplicationColdStart } from "./local-reset";
import {
  getChatMessagesAscending,
  MESSAGE_CACHE_DB_NAME,
  openMessageCacheDb,
  resetMessageCacheDbSingletonForTests,
  upsertChatMessages,
} from "./message-cache-db";

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
    "workspace-last-messenger-route",
  ]) {
    localStorage.removeItem(key);
  }
  sessionStorage.clear();
}

async function deleteMessageCacheDbForTests(): Promise<void> {
  try {
    const db = await openMessageCacheDb();
    db.close();
  } catch {
    // no open DB
  }
  resetMessageCacheDbSingletonForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(MESSAGE_CACHE_DB_NAME);
    req.onerror = () => reject(req.error ?? new Error("indexedDB deleteDatabase error"));
    req.onsuccess = () => resolve();
  });
}

describe("performApplicationColdStart", () => {
  beforeEach(async () => {
    clearTestStorage();
    await deleteMessageCacheDbForTests();
  });

  afterEach(async () => {
    clearTestStorage();
    await deleteMessageCacheDbForTests();
  });

  it("preserves auth keys while removing preferences, caches, and misc localStorage", async () => {
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
    localStorage.setItem("workspace-last-messenger-route", '{"path":"/chat"}');
    sessionStorage.setItem("zulip-web-oidc-desktop-flow", "flow");

    await performApplicationColdStart();

    expect(localStorage.getItem("zulip-web-instances")).toBe('[{"id":"1"}]');
    expect(localStorage.getItem("zulip-web-current-instance")).toBe("1");

    expect(localStorage.getItem("workspace-palette")).toBeNull();
    expect(localStorage.getItem("workspace-theme-mode")).toBeNull();
    expect(localStorage.getItem("workspace-settings")).toBeNull();
    expect(localStorage.getItem("workspace-settings:org-1")).toBeNull();
    expect(localStorage.getItem("workspace-locale")).toBeNull();
    expect(localStorage.getItem("workspace-locale:org-1")).toBeNull();
    expect(localStorage.getItem("zulip-web-sidebar-config")).toBeNull();
    expect(localStorage.getItem("zulip-web-sidebar-config:org-1")).toBeNull();
    expect(localStorage.getItem("workspace-palette:org-1")).toBeNull();
    expect(localStorage.getItem("workspace-theme-mode:org-1")).toBeNull();
    expect(localStorage.getItem("recent_dm_partners")).toBeNull();
    expect(localStorage.getItem("analytics_consent")).toBeNull();
    expect(localStorage.getItem("push_token")).toBeNull();
    expect(localStorage.getItem("workspace-last-messenger-route")).toBeNull();
    expect(sessionStorage.getItem("zulip-web-oidc-desktop-flow")).toBeNull();
  });

  it("deletes cached messages from IndexedDB", async () => {
    const instanceId = "inst-cold-start";
    const chatKey = "stream:1:general";
    const message: MockMessage = {
      id: 1,
      sender_id: 10,
      sender_full_name: "A",
      stream_id: 1,
      subject: "general",
      content: "<p>1</p>",
      timestamp: 1000,
    };
    await upsertChatMessages({
      instanceId,
      chatKey,
      messages: [message],
      windowSizeN: 200,
    });
    expect(await getChatMessagesAscending(instanceId, chatKey)).toHaveLength(1);

    await performApplicationColdStart();

    expect(await getChatMessagesAscending(instanceId, chatKey)).toEqual([]);
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
