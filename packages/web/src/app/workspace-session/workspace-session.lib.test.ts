import { afterEach, expect, it, vi } from "vitest";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { createWorkspaceRealtimeBrowserCursorStorage } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import { createWorkspaceRealtimeTransportCore } from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import {
  createWorkspaceSessionRuntimeManager,
  toWorkspaceSessionContext,
} from "./workspace-session.lib";

vi.mock(
  "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib")
    >()),
    createWorkspaceRealtimeTransportCore: vi.fn(() => ({
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
    })),
  }),
);

function createSession(accountId: string): WorkspaceAuthSession {
  return {
    accountId,
    instanceId: `${accountId}-instance`,
    organizationId: `${accountId}-org`,
    organizationOrigin: `https://${accountId}.example.invalid`,
    projectId: `${accountId}-project`,
    userUuid: `${accountId}-user`,
    login: "tester",
    accessToken: "test-token",
    runtimeGeneration: 1,
    profile: {
      uuid: `${accountId}-user`,
      username: "tester",
      firstName: null,
      lastName: null,
      email: null,
    },
  };
}

afterEach(() => {
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
});

it("fences an old background transport when auth publishes tokens before reconciliation", async () => {
  const active = createSession("account-a");
  const background = createSession("account-b");
  const activeContext = toWorkspaceSessionContext(active);
  const backgroundContext = toWorkspaceSessionContext(background);
  useWorkspaceAuthStore.setState({
    sessions: [active, background],
    currentAccountId: active.accountId,
  });
  const manager = createWorkspaceSessionRuntimeManager(
    createWorkspaceRealtimeBrowserCursorStorage(),
  );
  try {
    await manager.update([activeContext, backgroundContext], activeContext.ownerKey);
    const calls = vi.mocked(createWorkspaceRealtimeTransportCore).mock.calls;
    const first = calls[0]?.[0];
    const second = calls[1]?.[0];
    expect(first?.isOwnerCurrent?.(activeContext.owner)).toBe(true);
    expect(second?.isOwnerCurrent?.(backgroundContext.owner)).toBe(true);

    // The existing auth action intentionally keeps an inactive session's generation.
    useWorkspaceAuthStore
      .getState()
      .updateTokens(background.accountId, { accessToken: "rotated-token" });
    const rotated = useWorkspaceAuthStore.getState().sessions[1];
    expect(rotated?.runtimeGeneration).toBe(background.runtimeGeneration);
    expect(second?.isOwnerCurrent?.(backgroundContext.owner)).toBe(false);
    expect(first?.isOwnerCurrent?.(activeContext.owner)).toBe(true);
    if (rotated == null) throw new Error("Missing rotated background session");

    await manager.update(
      [activeContext, toWorkspaceSessionContext(rotated)],
      activeContext.ownerKey,
    );
    expect(calls[2]?.[0].isOwnerCurrent?.(backgroundContext.owner)).toBe(true);
    expect(second?.isOwnerCurrent?.(backgroundContext.owner)).toBe(false);
  } finally {
    await manager.stopAll();
  }
});
