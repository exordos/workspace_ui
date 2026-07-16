import { describe, expect, it, vi } from "vitest";
import { WORKSPACE_IAM_PROJECT_SCOPE_VERSION } from "~/shared/config/workspace-project";
import {
  hasCurrentWorkspaceIamProjectScope,
  migratePersistedIamSessionsToCurrentProject,
  type PersistedIamSessionScopeState,
} from "./app-iam-project-scope-migration.lib";

function session(
  overrides: Partial<PersistedIamSessionScopeState> = {},
): PersistedIamSessionScopeState {
  return {
    id: "instance-a",
    iamRefreshToken: "refresh-a",
    ...overrides,
  };
}

describe("persisted IAM project-scope migration", () => {
  it("recognizes only the current versioned scope marker", () => {
    expect(hasCurrentWorkspaceIamProjectScope(session())).toBe(false);
    expect(
      hasCurrentWorkspaceIamProjectScope(
        session({ iamProjectScopeVersion: WORKSPACE_IAM_PROJECT_SCOPE_VERSION }),
      ),
    ).toBe(true);
  });

  it("refreshes unmarked sessions once and skips already migrated sessions", async () => {
    const refreshInstance = vi.fn(() => Promise.resolve(true));
    const removeInstance = vi.fn();
    const result = await migratePersistedIamSessionsToCurrentProject({
      instances: [
        session(),
        session({
          id: "instance-current",
          iamProjectScopeVersion: WORKSPACE_IAM_PROJECT_SCOPE_VERSION,
        }),
      ],
      refreshInstance,
      removeInstance,
    });

    expect(refreshInstance).toHaveBeenCalledOnce();
    expect(refreshInstance).toHaveBeenCalledWith(
      expect.objectContaining({ id: "instance-a", iamRefreshToken: "refresh-a" }),
    );
    expect(removeInstance).not.toHaveBeenCalled();
    expect(result).toEqual({
      failedInstanceIds: [],
      migratedInstanceIds: ["instance-a"],
      removedInstanceIds: [],
    });
  });

  it("removes an unmarked access-only session so its old token cannot reach Workspace APIs", async () => {
    const refreshInstance = vi.fn(() => Promise.resolve(true));
    const removeInstance = vi.fn();
    const result = await migratePersistedIamSessionsToCurrentProject({
      instances: [session({ iamRefreshToken: undefined })],
      refreshInstance,
      removeInstance,
    });

    expect(refreshInstance).not.toHaveBeenCalled();
    expect(removeInstance).toHaveBeenCalledWith("instance-a");
    expect(result.removedInstanceIds).toEqual(["instance-a"]);
  });

  it("reports a refresh failure without marking or removing the persisted session", async () => {
    const removeInstance = vi.fn();
    const result = await migratePersistedIamSessionsToCurrentProject({
      instances: [session()],
      refreshInstance: () => Promise.resolve(false),
      removeInstance,
    });

    expect(removeInstance).not.toHaveBeenCalled();
    expect(result).toEqual({
      failedInstanceIds: ["instance-a"],
      migratedInstanceIds: [],
      removedInstanceIds: [],
    });
  });

  it("refreshes multiple sessions sequentially to preserve per-instance token updates", async () => {
    const order: string[] = [];
    const result = await migratePersistedIamSessionsToCurrentProject({
      instances: [session(), session({ id: "instance-b", iamRefreshToken: "refresh-b" })],
      refreshInstance: async (instance) => {
        order.push(`start:${instance.id}`);
        await Promise.resolve();
        order.push(`end:${instance.id}`);
        return true;
      },
      removeInstance: vi.fn(),
    });

    expect(order).toEqual([
      "start:instance-a",
      "end:instance-a",
      "start:instance-b",
      "end:instance-b",
    ]);
    expect(result.migratedInstanceIds).toEqual(["instance-a", "instance-b"]);
  });
});
