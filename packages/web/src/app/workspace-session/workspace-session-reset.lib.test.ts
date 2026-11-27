import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/platform/sessions/workspace-runtime.lib";
import { prepareWorkspaceColdStart } from "./workspace-session-reset.lib";
import { useWorkspaceSessionRuntime } from "./workspace-session.hook";

const mocks = vi.hoisted(() => ({
  update: vi.fn(() => Promise.resolve()),
  stopAll: vi.fn(() => Promise.resolve()),
  reconnectAll: vi.fn(() => Promise.resolve()),
  restartOwner: vi.fn(() => Promise.resolve()),
  startPresence: vi.fn(),
  stopPresence: vi.fn(),
  fetchSettings: vi.fn(() => Promise.resolve({ meet_url: null })),
  useHasUserForOwner: vi.fn(),
}));

vi.mock("./workspace-session.lib", () => ({
  createWorkspaceSessionRuntimeManager: () => mocks,
  startWorkspaceSessionPresence: mocks.startPresence,
  toWorkspaceSessionContext: (session: WorkspaceAuthSession) => session,
}));
vi.mock("~/entities/workspace-auth/workspace-auth.lib", () => ({
  fetchWorkspaceServerSettingsForOrganization: mocks.fetchSettings,
}));
vi.mock("~/modules/users/users-runtime", () => ({
  reconcileUsersSessions: vi.fn(),
  useHasUserForOwner: mocks.useHasUserForOwner,
}));

const owner: WorkspaceAuthSession = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  organizationOrigin: "https://a.example.invalid",
  projectId: "project-a",
  userUuid: "user-a",
  accessToken: "test-token",
  runtimeGeneration: 1,
  login: "tester",
  profile: { uuid: "user-a", username: "tester", firstName: null, lastName: null, email: null },
};

afterEach(() => {
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeSuspended: false });
  vi.clearAllMocks();
});

it("stops established session hosts and rejects new work while keeping IAM sessions for reload", () => {
  const sessions = [owner];
  useWorkspaceAuthStore.setState({ sessions, currentAccountId: owner.accountId });
  mocks.useHasUserForOwner.mockReturnValue(true);
  mocks.startPresence.mockReturnValue(mocks.stopPresence);
  const { rerender, result } = renderHook(
    ({ sessions }) => useWorkspaceSessionRuntime(sessions, sessions[0] ?? null, true),
    { initialProps: { sessions } },
  );
  expect(mocks.useHasUserForOwner).toHaveBeenCalledWith(
    owner.userUuid,
    workspaceRuntimeOwnerKey(owner),
  );
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.startPresence).toHaveBeenCalledOnce();
  expect(mocks.fetchSettings).toHaveBeenCalledOnce();

  act(() => prepareWorkspaceColdStart());
  expect(useWorkspaceAuthStore.getState().getCurrentRuntimeContext()).toBeNull();
  expect(useWorkspaceAuthStore.getState().getRuntimeContextForOwner(owner)).toBeNull();
  expect(useWorkspaceAuthStore.getState().getCurrentSession()).toBe(owner);
  expect(mocks.stopAll).toHaveBeenCalledExactlyOnceWith("workspace_cold_start");
  expect(mocks.stopPresence).toHaveBeenCalledOnce();

  rerender({ sessions: [{ ...owner }] });
  result.current();
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.startPresence).toHaveBeenCalledOnce();
  expect(mocks.fetchSettings).toHaveBeenCalledOnce();
  expect(mocks.restartOwner).not.toHaveBeenCalled();
});
