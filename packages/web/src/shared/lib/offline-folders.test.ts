import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOfflineFolders, saveOfflineFolders } from "./offline-folders";

const OFFLINE_FOLDERS_KEY_PREFIX = "workspace-offline-folders:";

function clearOfflineFolderKeys(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(OFFLINE_FOLDERS_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

describe("offline-folders", () => {
  const instanceA = "inst-a";
  const instanceB = "inst-b";

  beforeEach(() => {
    clearOfflineFolderKeys();
  });

  afterEach(() => {
    clearOfflineFolderKeys();
  });

  it("saves and loads folders for the same instance", () => {
    saveOfflineFolders(instanceA, [
      { id: "all", label: "All", backgroundColor: 0, badge: 10 },
      { id: "work", label: "Work", backgroundColor: 16711680, badge: undefined },
    ]);

    expect(loadOfflineFolders(instanceA)).toEqual([
      { id: "all", label: "All", backgroundColor: 0, badge: 10 },
      { id: "work", label: "Work", backgroundColor: 16711680, badge: undefined },
    ]);
  });

  it("keeps caches isolated between instances", () => {
    saveOfflineFolders(instanceA, [{ id: "a", label: "Alpha", backgroundColor: 1, badge: 1 }]);
    saveOfflineFolders(instanceB, [{ id: "b", label: "Beta", backgroundColor: 2, badge: 2 }]);

    expect(loadOfflineFolders(instanceA)).toEqual([
      { id: "a", label: "Alpha", backgroundColor: 1, badge: 1 },
    ]);
    expect(loadOfflineFolders(instanceB)).toEqual([
      { id: "b", label: "Beta", backgroundColor: 2, badge: 2 },
    ]);
  });

  it("returns empty array for malformed payload", () => {
    localStorage.setItem("workspace-offline-folders:inst-a", "{oops");
    expect(loadOfflineFolders(instanceA)).toEqual([]);
  });

  it("keeps optional systemType field when cached payload is valid", () => {
    saveOfflineFolders(instanceA, [
      {
        id: "all",
        label: "All",
        backgroundColor: 0,
        badge: undefined,
        systemType: "all",
      },
      {
        id: "work",
        label: "Work",
        backgroundColor: 123,
        badge: 2,
        systemType: "created",
      },
      {
        id: "system:personal",
        label: "Personal",
        backgroundColor: 0,
        badge: undefined,
        systemType: "personal",
      },
      {
        id: "system:channels",
        label: "Channels",
        backgroundColor: 0,
        badge: undefined,
        systemType: "channels",
      },
    ]);

    expect(loadOfflineFolders(instanceA)).toEqual([
      {
        id: "all",
        label: "All",
        backgroundColor: 0,
        badge: undefined,
        systemType: "all",
      },
      {
        id: "work",
        label: "Work",
        backgroundColor: 123,
        badge: 2,
        systemType: "created",
      },
      {
        id: "system:personal",
        label: "Personal",
        backgroundColor: 0,
        badge: undefined,
        systemType: "personal",
      },
      {
        id: "system:channels",
        label: "Channels",
        backgroundColor: 0,
        badge: undefined,
        systemType: "channels",
      },
    ]);
  });

  it("drops malformed folder entries during load", () => {
    localStorage.setItem(
      "workspace-offline-folders:inst-a",
      JSON.stringify([
        { id: "ok", label: "OK", backgroundColor: 123, badge: 3 },
        { id: 42, label: "Bad", backgroundColor: 10 },
        { id: "bad-system", label: "Bad system", backgroundColor: 1, systemType: "legacy" },
      ]),
    );

    expect(loadOfflineFolders(instanceA)).toEqual([
      { id: "ok", label: "OK", backgroundColor: 123, badge: 3 },
    ]);
  });
});
