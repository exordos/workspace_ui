import { describe, expect, it } from "vitest";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestContextCurrent,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeCursorKey,
  workspaceRuntimeOwnerKey,
} from "./workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "./workspace-runtime.types";

// Runtime tests keep stale async writes out of the wrong project.
function createContext(overrides: Partial<WorkspaceRuntimeContext> = {}): WorkspaceRuntimeContext {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: "project-a",
    userUuid: "user-a",
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

describe("workspace-runtime", () => {
  it("captures owner fields without copying tokens", () => {
    const context = createContext({ accessToken: "secret-access", refreshToken: "secret-refresh" });

    const captured = captureWorkspaceRuntimeRequestContext(() => context);

    expect(captured).toEqual({
      accountId: "account-a",
      instanceId: "instance-a",
      organizationId: "org-a",
      projectId: "project-a",
      userUuid: "user-a",
      runtimeGeneration: 1,
    });
    expect(captured).not.toHaveProperty("accessToken");
    expect(captured).not.toHaveProperty("refreshToken");
  });

  it("returns null when no runtime context is active", () => {
    expect(captureWorkspaceRuntimeRequestContext(() => null)).toBeNull();
  });

  it("keeps a captured context current while owner and generation match", () => {
    const current = createContext();
    const captured = captureWorkspaceRuntimeRequestContext(() => current);

    expect(isWorkspaceRuntimeRequestContextCurrent(captured, () => current)).toBe(true);
    expect(isWorkspaceRuntimeRequestInvalidated(captured, () => current)).toBe(false);
  });

  it("invalidates when account changes", () => {
    const captured = captureWorkspaceRuntimeRequestContext(() => createContext());

    expect(
      isWorkspaceRuntimeRequestContextCurrent(captured, () =>
        createContext({ accountId: "account-b" }),
      ),
    ).toBe(false);
  });

  it("invalidates when organization changes", () => {
    const captured = captureWorkspaceRuntimeRequestContext(() => createContext());

    expect(
      isWorkspaceRuntimeRequestContextCurrent(captured, () =>
        createContext({ organizationId: "org-b" }),
      ),
    ).toBe(false);
  });

  it("invalidates when project changes", () => {
    const captured = captureWorkspaceRuntimeRequestContext(() => createContext());

    expect(
      isWorkspaceRuntimeRequestContextCurrent(captured, () =>
        createContext({ projectId: "project-b" }),
      ),
    ).toBe(false);
  });

  it("invalidates when user changes", () => {
    const captured = captureWorkspaceRuntimeRequestContext(() => createContext());

    expect(
      isWorkspaceRuntimeRequestContextCurrent(captured, () =>
        createContext({ userUuid: "user-b" }),
      ),
    ).toBe(false);
  });

  it("invalidates A to B to A when generation changed", () => {
    const captured = captureWorkspaceRuntimeRequestContext(() =>
      createContext({ accountId: "account-a", runtimeGeneration: 1 }),
    );

    expect(
      isWorkspaceRuntimeRequestContextCurrent(captured, () =>
        createContext({ accountId: "account-a", runtimeGeneration: 2 }),
      ),
    ).toBe(false);
  });

  it("invalidates an aborted request", () => {
    const controller = new AbortController();
    const current = createContext();
    const captured = captureWorkspaceRuntimeRequestContext(() => current);

    controller.abort();

    expect(isWorkspaceRuntimeRequestInvalidated(captured, () => current, controller.signal)).toBe(
      true,
    );
  });

  it("includes account, instance, organization, project, and user in owner keys", () => {
    const owner = createContext();

    expect(workspaceRuntimeOwnerKey(owner)).toBe(
      "account:account-a:instance:instance-a:organization:org-a:project:project-a:user:user-a",
    );
    expect(workspaceRuntimeCursorKey(owner)).toBe(
      "account:account-a:instance:instance-a:organization:org-a:project:project-a:user:user-a:cursor",
    );
  });
});
