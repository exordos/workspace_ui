import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as LoggerModule from "~/shared/lib/logger";
import { useWorkspaceAuthStore } from "./workspace-auth.model";
import type { WorkspaceAuthSession } from "./workspace-auth.model";

// Auth tests protect account switching and runtime generation changes.
vi.mock("~/shared/lib/logger", async (importOriginal) => {
  const { createPartialLoggerMock } = await import("~/test/logger-vitest-mock");
  return createPartialLoggerMock(importOriginal as () => Promise<typeof LoggerModule>);
});

function resetStore(): void {
  localStorage.removeItem("workspace-auth-sessions");
  localStorage.removeItem("workspace-auth-current-account");
  useWorkspaceAuthStore.setState({
    sessions: [],
    currentAccountId: null,
    runtimeGeneration: 0,
    runtimeGenerationSequence: 0,
    sessionSelectionGeneration: 0,
  });
}

function createSession(
  overrides: Partial<Omit<WorkspaceAuthSession, "runtimeGeneration">> = {},
): Omit<WorkspaceAuthSession, "runtimeGeneration"> {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: "project-a",
    userUuid: "user-a",
    login: "user-a@example.com",
    accessToken: "access-token-a",
    refreshToken: "refresh-token-a",
    expiresAtMs: 1000,
    profile: {
      uuid: "user-a",
      username: "user-a",
      firstName: "User",
      lastName: "A",
      email: "user-a@example.com",
      status: "active",
    },
    ...overrides,
  };
}

describe("workspace-auth store", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("persists profile edits without restarting runtime and rejects an old runtime", () => {
    const store = useWorkspaceAuthStore.getState();
    store.setSession(createSession());
    const runtime = store.getCurrentRuntimeContext();
    expect(runtime).not.toBeNull();
    if (runtime == null) throw new Error("Expected runtime");
    const profile = { ...createSession().profile, username: "new-user", firstName: "New" };
    expect(store.updateProfileForRuntime(runtime, profile)).toBe(true);
    expect(store.getCurrentRuntimeContext()?.runtimeGeneration).toBe(runtime.runtimeGeneration);
    expect(store.getCurrentSession()?.profile.username).toBe("new-user");
    expect(
      JSON.parse(localStorage.getItem("workspace-auth-sessions") ?? "[]")[0].profile.username,
    ).toBe("new-user");
    store.setCurrentAccountId(null);
    store.setCurrentAccountId(runtime.accountId);
    expect(store.updateProfileForRuntime(runtime, { ...profile, username: "stale" })).toBe(false);
    expect(store.getCurrentSession()?.profile.username).toBe("new-user");
  });

  it("stores a session and exposes current runtime context", () => {
    useWorkspaceAuthStore.getState().setSession(createSession());

    expect(useWorkspaceAuthStore.getState().getCurrentRuntimeContext()).toMatchObject({
      accountId: "account-a",
      organizationId: "org-a",
      organizationOrigin: "https://org-a.example.com",
      projectId: "project-a",
      userUuid: "user-a",
      accessToken: "access-token-a",
      runtimeGeneration: 1,
    });
  });

  it("supports multiple accounts without replacing inactive sessions", () => {
    useWorkspaceAuthStore.getState().setSession(createSession({ accountId: "account-a" }));
    useWorkspaceAuthStore.getState().setSession(
      createSession({
        accountId: "account-b",
        instanceId: "instance-b",
        organizationId: "org-b",
        organizationOrigin: "https://org-b.example.com",
        projectId: "project-b",
        userUuid: "user-b",
      }),
    );

    expect(useWorkspaceAuthStore.getState().sessions).toHaveLength(2);
    expect(useWorkspaceAuthStore.getState().getCurrentRuntimeContext()?.accountId).toBe(
      "account-b",
    );

    useWorkspaceAuthStore.getState().setCurrentAccountId("account-a");

    expect(useWorkspaceAuthStore.getState().getCurrentRuntimeContext()).toMatchObject({
      accountId: "account-a",
      projectId: "project-a",
    });
  });

  it("bumps generation when switching accounts to invalidate stale writes", () => {
    useWorkspaceAuthStore.getState().setSession(createSession({ accountId: "account-a" }));
    const before = useWorkspaceAuthStore.getState().runtimeGeneration;
    useWorkspaceAuthStore.getState().setSession(createSession({ accountId: "account-b" }));
    useWorkspaceAuthStore.getState().setCurrentAccountId("account-a");

    expect(useWorkspaceAuthStore.getState().runtimeGeneration).toBeGreaterThan(before);
    expect(useWorkspaceAuthStore.getState().getCurrentRuntimeContext()?.runtimeGeneration).toBe(
      useWorkspaceAuthStore.getState().runtimeGeneration,
    );
  });

  it("updates active account tokens and invalidates active runtime", () => {
    useWorkspaceAuthStore.getState().setSession(createSession());
    const before = useWorkspaceAuthStore.getState().runtimeGeneration;
    const selectionBefore = useWorkspaceAuthStore.getState().sessionSelectionGeneration;

    useWorkspaceAuthStore.getState().updateTokens("account-a", {
      accessToken: "access-token-b",
      refreshToken: "refresh-token-b",
      expiresAtMs: 2000,
    });

    expect(useWorkspaceAuthStore.getState().getCurrentRuntimeContext()).toMatchObject({
      accessToken: "access-token-b",
      refreshToken: "refresh-token-b",
      runtimeGeneration: before + 1,
    });
    expect(useWorkspaceAuthStore.getState().sessionSelectionGeneration).toBe(selectionBefore);
  });

  it("keeps credential and incarnation stable through A to B to A", () => {
    const auth = useWorkspaceAuthStore.getState();
    const accountA = createSession();
    auth.setSession(accountA);
    const firstScreen = auth.getCurrentRuntimeContext();
    const firstOwner = auth.getRuntimeContextForOwner(accountA);
    auth.setSession(createSession({ accountId: "account-b" }));
    auth.setCurrentAccountId(accountA.accountId);

    expect(auth.getCurrentRuntimeContext()?.runtimeGeneration).not.toBe(
      firstScreen?.runtimeGeneration,
    );
    expect(auth.getCurrentRuntimeContext()?.ownerRuntimeGeneration).toBe(
      firstOwner?.runtimeGeneration,
    );
    expect(auth.getRuntimeContextForOwner(accountA)).toMatchObject({
      runtimeGeneration: firstOwner?.runtimeGeneration,
      incarnationGeneration: firstOwner?.incarnationGeneration,
    });

    const selected = auth.getCurrentRuntimeContext();
    const backgroundBefore = useWorkspaceAuthStore
      .getState()
      .sessions.find(({ accountId }) => accountId === "account-b");
    auth.updateTokens("account-b", { accessToken: "updated-background-token" });
    const backgroundAfter = useWorkspaceAuthStore
      .getState()
      .sessions.find(({ accountId }) => accountId === "account-b");
    expect(backgroundAfter?.runtimeGeneration).not.toBe(backgroundBefore?.runtimeGeneration);
    expect(backgroundAfter?.incarnationGeneration).toBe(backgroundBefore?.incarnationGeneration);
    expect(auth.getCurrentRuntimeContext()).toBe(selected);
    auth.removeSession("account-b");
    expect(auth.getCurrentRuntimeContext()).toBe(selected);
  });

  it("updates duplicate account while preserving the original instance id", () => {
    useWorkspaceAuthStore.getState().setSession(createSession({ instanceId: "instance-a" }));

    useWorkspaceAuthStore.getState().setSession(
      createSession({
        instanceId: "new-instance",
        accessToken: "new-access-token",
      }),
    );

    expect(useWorkspaceAuthStore.getState().sessions).toHaveLength(1);
    expect(useWorkspaceAuthStore.getState().sessions[0]).toMatchObject({
      instanceId: "instance-a",
      accessToken: "new-access-token",
    });
  });

  it("removes the current account and selects the next available account", () => {
    useWorkspaceAuthStore.getState().setSession(createSession({ accountId: "account-a" }));
    useWorkspaceAuthStore.getState().setSession(createSession({ accountId: "account-b" }));

    useWorkspaceAuthStore.getState().removeSession("account-b");

    expect(useWorkspaceAuthStore.getState().getCurrentRuntimeContext()?.accountId).toBe(
      "account-a",
    );
  });

  it("ignores switching to an unknown account", () => {
    useWorkspaceAuthStore.getState().setSession(createSession({ accountId: "account-a" }));
    const before = useWorkspaceAuthStore.getState().runtimeGeneration;
    const selectionBefore = useWorkspaceAuthStore.getState().sessionSelectionGeneration;

    useWorkspaceAuthStore.getState().setCurrentAccountId("missing");

    expect(useWorkspaceAuthStore.getState().currentAccountId).toBe("account-a");
    expect(useWorkspaceAuthStore.getState().runtimeGeneration).toBe(before);
    expect(useWorkspaceAuthStore.getState().sessionSelectionGeneration).toBe(selectionBefore);
  });

  it("hydrates valid stored sessions and drops malformed rows", async () => {
    localStorage.setItem(
      "workspace-auth-sessions",
      JSON.stringify([createSession(), { accountId: "broken" }]),
    );
    localStorage.setItem("workspace-auth-current-account", "account-a");

    vi.resetModules();
    const { useWorkspaceAuthStore: freshStore } = await import("./workspace-auth.model");

    expect(freshStore.getState().sessions).toHaveLength(1);
    expect(freshStore.getState().currentAccountId).toBe("account-a");
    expect(freshStore.getState().getCurrentRuntimeContext()).toMatchObject({
      accountId: "account-a",
      userUuid: "user-a",
    });
  });
});
