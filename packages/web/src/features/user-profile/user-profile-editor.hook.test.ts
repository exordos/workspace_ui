import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import type { OwnProfile } from "~/shared/api/own-profile.types";
import { useOwnProfileEditor } from "./user-profile-editor.hook";

const loadMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
vi.mock("./user-profile.api", () => ({
  loadOwnProfile: (...args: unknown[]) => loadMock(...args),
  updateOwnProfile: (...args: unknown[]) => updateMock(...args),
}));
const profile: OwnProfile = {
  uuid: "user-a",
  username: "alice",
  firstName: "Alice",
  lastName: null,
  email: "alice@example.com",
  phone: null,
  description: "",
};
const session: WorkspaceAuthSession = {
  accountId: "a",
  instanceId: "i",
  organizationId: "org",
  organizationOrigin: "https://org.example",
  projectId: "p",
  userUuid: profile.uuid,
  login: "alice",
  accessToken: "token",
  runtimeGeneration: 1,
  profile: {
    uuid: profile.uuid,
    username: "alice",
    firstName: "Alice",
    lastName: null,
    email: profile.email,
  },
};
function renderEditor() {
  return renderHook(() => {
    useWorkspaceAuthStore((state) => state.sessions);
    useWorkspaceAuthStore((state) => state.currentAccountId);
    return useOwnProfileEditor(useWorkspaceAuthStore.getState().getCurrentRuntimeContext(), true);
  });
}
describe("profile editor lifecycle", () => {
  beforeEach(() => {
    loadMock.mockReset().mockResolvedValue(profile);
    updateMock.mockReset();
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: "a",
      runtimeGeneration: 1,
    });
  });
  afterEach(() =>
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 }),
  );

  it("retains edits on rejection and rebases to the saved response on success", async () => {
    const { result } = renderEditor();
    await waitFor(() => expect(result.current.draft?.firstName).toBe("Alice"));
    act(() => result.current.change("firstName", "New"));
    updateMock.mockResolvedValueOnce({ ok: false, kind: "forbidden" });
    await act(async () => {
      expect(await result.current.save()).toBe(false);
    });
    expect(result.current.draft?.firstName).toBe("New");
    expect(result.current.dirty).toBe(true);
    updateMock.mockResolvedValueOnce({
      ok: true,
      profile: { ...profile, firstName: "New" },
      refreshPending: true,
    });
    await act(async () => {
      expect(await result.current.save()).toBe(true);
    });
    expect(result.current.dirty).toBe(false);
    expect(result.current.refreshPending).toBe(true);
  });

  it("ignores an old load after A to no session to A", async () => {
    let resolve: (profile: OwnProfile) => void = (_profile: OwnProfile) => {
      throw new Error("Missing resolver");
    };
    loadMock.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderEditor();
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId(null));
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("a"));
    await waitFor(() => expect(result.current.draft?.firstName).toBe("Alice"));
    await act(async () => {
      resolve({ ...profile, firstName: "Stale" });
      await Promise.resolve();
    });
    expect(result.current.draft?.firstName).toBe("Alice");
  });
});
