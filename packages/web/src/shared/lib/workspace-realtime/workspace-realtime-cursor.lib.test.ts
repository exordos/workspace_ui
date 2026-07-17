import { describe, expect, it } from "vitest";
import {
  createWorkspaceRealtimeCursorStorage,
  workspaceRealtimeCursorKey,
} from "./workspace-realtime-cursor.lib";
import type {
  WorkspaceRealtimeCursorOwner,
  WorkspaceRealtimeCursorStorageLike,
} from "./workspace-realtime-cursor.lib";

class MemoryStorage implements WorkspaceRealtimeCursorStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function createOwner(overrides: Partial<WorkspaceRealtimeCursorOwner> = {}) {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    projectId: "project-a",
    userUuid: "user-a",
    ...overrides,
  };
}

describe("workspace-realtime cursor", () => {
  it("builds a durable key from account, instance, organization, project, and user", () => {
    expect(workspaceRealtimeCursorKey(createOwner({ accountId: "account:a" }))).toBe(
      "workspace-realtime:cursor:account:account%3Aa:instance:instance-a:organization:org-a:project:project-a:user:user-a",
    );
  });

  it("keeps cursor writes monotonic", () => {
    const rawStorage = new MemoryStorage();
    const storage = createWorkspaceRealtimeCursorStorage(rawStorage);
    const owner = createOwner();

    storage.write(owner, { epochGeneration: "generation-a", epochVersion: 12 });
    storage.write(owner, { epochGeneration: "generation-a", epochVersion: 10 });
    storage.write(owner, { epochGeneration: "generation-a", epochVersion: 14 });

    expect(storage.read(owner)).toEqual({ epochGeneration: "generation-a", epochVersion: 14 });
  });

  it("ignores invalid stored cursor values", () => {
    const rawStorage = new MemoryStorage();
    const storage = createWorkspaceRealtimeCursorStorage(rawStorage);
    const owner = createOwner();

    rawStorage.setItem(workspaceRealtimeCursorKey(owner), "not-a-number");

    expect(storage.read(owner)).toBeNull();
  });

  it("removes legacy numeric cursors because they lack epoch generation", () => {
    const rawStorage = new MemoryStorage();
    const storage = createWorkspaceRealtimeCursorStorage(rawStorage);
    const owner = createOwner();
    const key = workspaceRealtimeCursorKey(owner);
    rawStorage.setItem(key, "42");

    expect(storage.read(owner)).toBeNull();
    expect(rawStorage.getItem(key)).toBeNull();
  });
});
