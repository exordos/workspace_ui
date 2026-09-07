import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adaptWorkspaceMessengerUserDto } from "~/entities/user/user-adapters.lib";
import { toWorkspaceUserCacheProfile } from "~/entities/user/user-sync.lib";
import { useUsersStore } from "~/entities/user/user.model";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import type * as WorkspaceUserCacheModule from "~/shared/lib/workspace-user-cache-db";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { LayoutProfileShareLink } from "./layout-profile-share-link.ui";
import { useLayoutResetRightDrawerOnOwnerChange } from "./layout-reset-right-drawer-on-owner-change.hook";

const getUser = vi.hoisted(() => vi.fn());
vi.mock("~/shared/api/workspace-client", () => ({ getUser }));
const readUserCacheProfile = vi.hoisted(() => vi.fn());
vi.mock("~/shared/lib/workspace-user-cache-db", async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceUserCacheModule>()),
  readWorkspaceUserCacheProfile: readUserCacheProfile,
}));
const USER = "33333333-3333-4333-8333-333333333333";
const SESSION: WorkspaceAuthSession = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  projectId: "project-a",
  organizationOrigin: "https://workspace.example.com",
  userUuid: "viewer-a",
  accessToken: "test-token",
  runtimeGeneration: 1,
  login: "viewer",
  profile: { uuid: "viewer-a", username: "viewer", firstName: null, lastName: null, email: null },
};
const DTO: WorkspaceMessengerUserDto = {
  uuid: USER,
  username: "alice",
  source: "iam",
  first_name: "Alice",
  last_name: "Smith",
  email: "alice@example.com",
  avatar: null,
  status: "active",
  status_emoji: null,
  status_text: null,
  last_ping_at: "2026-09-01T10:00:00Z",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
};

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="hash">{location.hash}</output>
      <button
        onClick={() =>
          void navigate(`${location.pathname}#user/44444444-4444-4444-8444-444444444444`)
        }
      >
        Another profile
      </button>
      <button onClick={() => void navigate("/org/org-a/project/project-a/stream/stream-a")}>
        Open stream
      </button>
      <button onClick={() => void navigate("/org/org-a/project/project-a/inbox")}>
        Open inbox
      </button>
    </>
  );
}
function ActiveAccountLink() {
  const runtimeContext = useWorkspaceAuthStore(
    (state) =>
      state.sessions.find((session) => session.accountId === state.currentAccountId) ?? null,
  );
  useLayoutResetRightDrawerOnOwnerChange({
    currentOwnerKey: runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext),
    closeRightDrawer: useRightDrawerStore.getState().close,
  });
  return <LayoutProfileShareLink runtimeContext={runtimeContext} routeReady />;
}
function mount(hash = `#user/${USER}`, ready = true) {
  return render(
    <MemoryRouter initialEntries={[`/org/org-a/project/project-a/inbox${hash}`]}>
      <LayoutProfileShareLink runtimeContext={SESSION} routeReady={ready} />
      <Probe />
    </MemoryRouter>,
  );
}

describe("LayoutProfileShareLink", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue(DTO);
    readUserCacheProfile.mockReset().mockResolvedValue(null);
    useWorkspaceAuthStore.setState({ sessions: [SESSION], currentAccountId: SESSION.accountId });
    useUsersStore.getState().clear();
    useUsersStore.getState().startOwnerSync(workspaceRuntimeOwnerKey(SESSION));
    useRightDrawerStore.getState().close();
  });

  it("loads the requested profile for the active owner and consumes the link once", async () => {
    mount();
    await waitFor(() =>
      expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(USER),
    );
    expect(getUser).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-a" }), USER);
    expect(useUsersStore.getState().usersById[USER]?.displayName).toBe("Alice Smith");
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
    act(() => useRightDrawerStore.getState().close());
    act(() => useUsersStore.getState().setLoadStatus("ready"));
    expect(useRightDrawerStore.getState().open).toBe(false);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it.each(["#user/not-a-uuid", "#message-123", ""])(
    "does not load an unrelated or invalid hash %s",
    (hash) => {
      mount(hash);
      expect(getUser).not.toHaveBeenCalled();
    },
  );

  it("waits for the matching route and user-store owner", () => {
    useUsersStore.getState().startOwnerSync("other-owner");
    mount(undefined, false);
    expect(getUser).not.toHaveBeenCalled();
    expect(useRightDrawerStore.getState().open).toBe(false);
  });

  it("does not open or cache an old request after an account switch", async () => {
    let resolve!: (value: typeof DTO) => void;
    getUser.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    act(() => {
      useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
      useUsersStore.getState().startOwnerSync("other-owner");
    });
    await act(() => {
      resolve(DTO);
      return Promise.resolve();
    });
    expect(useRightDrawerStore.getState().open).toBe(false);
    expect(useUsersStore.getState().usersById[USER]).toBeUndefined();
  });

  it("does not start a request from props that no longer match the live account", () => {
    const otherSession = { ...SESSION, accountId: "account-b", userUuid: "viewer-b" };
    useWorkspaceAuthStore.setState({
      sessions: [SESSION, otherSession],
      currentAccountId: otherSession.accountId,
    });
    useRightDrawerStore.getState().openWorkspaceUserProfile("current-profile");
    mount();
    expect(getUser).not.toHaveBeenCalled();
    expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe("current-profile");
  });

  it("does not replay a consumed profile after switching accounts in the same instance", async () => {
    render(
      <MemoryRouter initialEntries={[`/org/org-a/project/project-a/inbox#user/${USER}`]}>
        <ActiveAccountLink />
        <Probe />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(USER),
    );
    const otherSession = { ...SESSION, accountId: "account-b", userUuid: "viewer-b" };
    act(() => {
      useWorkspaceAuthStore.setState({
        sessions: [SESSION, otherSession],
        currentAccountId: otherSession.accountId,
      });
      useUsersStore.getState().startOwnerSync(workspaceRuntimeOwnerKey(otherSession));
    });
    expect(useRightDrawerStore.getState().open).toBe(false);
    act(() => useUsersStore.getState().setLoadStatus("ready"));
    expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
  });

  it("reports unavailable users without breaking directory loading", async () => {
    useUsersStore.getState().setLoadStatus("ready");
    getUser.mockRejectedValue(new Error("Not found"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not open this profile/i);
    expect(useRightDrawerStore.getState().open).toBe(false);
    expect(useUsersStore.getState().loadStatus).toBe("ready");
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("does not replay a failed link on token refresh or account switching", async () => {
    getUser.mockRejectedValue(new Error("Not found"));
    render(
      <MemoryRouter initialEntries={[`/org/org-a/project/project-a/inbox#user/${USER}`]}>
        <ActiveAccountLink />
        <Probe />
      </MemoryRouter>,
    );
    await screen.findByRole("alert");
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
    const refreshed = { ...SESSION, runtimeGeneration: 2 };
    act(() => {
      useRightDrawerStore.getState().openWorkspaceUserProfile("manually-opened");
      useWorkspaceAuthStore.setState({ sessions: [refreshed] });
    });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe("manually-opened");
    const otherSession = { ...SESSION, accountId: "account-b", userUuid: "viewer-b" };
    act(() => {
      useWorkspaceAuthStore.setState({
        sessions: [otherSession],
        currentAccountId: otherSession.accountId,
      });
      useUsersStore.getState().startOwnerSync(workspaceRuntimeOwnerKey(otherSession));
    });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not restore an unavailable notice after leaving and returning to its route", async () => {
    getUser.mockRejectedValue(new Error("Not found"));
    mount();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Open stream" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Open inbox" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("clears a previous unavailable notice after another link opens successfully", async () => {
    getUser.mockRejectedValueOnce(new Error("Not found"));
    mount();
    await screen.findByRole("alert");
    const otherUuid = "44444444-4444-4444-8444-444444444444";
    getUser.mockResolvedValueOnce({ ...DTO, uuid: otherUuid });
    fireEvent.click(screen.getByRole("button", { name: "Another profile" }));
    await waitFor(() =>
      expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(otherUuid),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
  });

  it("rejects a response for a different user", async () => {
    getUser.mockResolvedValue({ ...DTO, uuid: "44444444-4444-4444-8444-444444444444" });
    mount();
    await screen.findByRole("alert");
    expect(useRightDrawerStore.getState().open).toBe(false);
  });

  it("opens an owner-scoped cached profile before refresh and does not reopen it after closing", async () => {
    const cached = adaptWorkspaceMessengerUserDto(DTO);
    useUsersStore.getState().upsertUserForOwner(workspaceRuntimeOwnerKey(SESSION), cached);
    let resolve!: (value: typeof DTO) => void;
    getUser.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(USER);
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
    act(() => useRightDrawerStore.getState().close());
    await act(() => {
      resolve({ ...DTO, first_name: "Updated", updated_at: "2026-09-02T10:00:00Z" });
      return Promise.resolve();
    });
    expect(useUsersStore.getState().usersById[USER]?.displayName).toBe("Updated Smith");
    expect(useRightDrawerStore.getState().open).toBe(false);
    expect(readUserCacheProfile).not.toHaveBeenCalled();
  });

  it("keeps a cached profile refresh alive after leaving the share-link route", async () => {
    const cached = adaptWorkspaceMessengerUserDto(DTO);
    useUsersStore.getState().upsertUserForOwner(workspaceRuntimeOwnerKey(SESSION), cached);
    let resolve!: (value: typeof DTO) => void;
    getUser.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Open stream" }));
    await act(() => {
      resolve({ ...DTO, first_name: "Updated", updated_at: "2026-09-02T10:00:00Z" });
      return Promise.resolve();
    });
    expect(useUsersStore.getState().usersById[USER]?.displayName).toBe("Updated Smith");
  });

  it("restores the owner-scoped persistent profile when its refresh fails offline", async () => {
    readUserCacheProfile.mockResolvedValue(
      toWorkspaceUserCacheProfile(adaptWorkspaceMessengerUserDto(DTO)),
    );
    getUser.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    await waitFor(() =>
      expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(USER),
    );
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    expect(readUserCacheProfile).toHaveBeenCalledWith(workspaceRuntimeOwnerKey(SESSION), USER);
    expect(useUsersStore.getState().usersById[USER]?.displayName).toBe("Alice Smith");
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restores a cached profile before bootstrap initializes an expired session's user owner", async () => {
    const expired = { ...SESSION, expiresAtMs: 1 };
    useWorkspaceAuthStore.setState({ sessions: [expired] });
    useUsersStore.getState().clear();
    readUserCacheProfile.mockResolvedValue(
      toWorkspaceUserCacheProfile(adaptWorkspaceMessengerUserDto(DTO)),
    );
    getUser.mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <MemoryRouter initialEntries={[`/org/org-a/project/project-a/inbox#user/${USER}`]}>
        <ActiveAccountLink />
        <Probe />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(USER),
    );
    expect(useUsersStore.getState().ownerKey).toBe(workspaceRuntimeOwnerKey(expired));
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens a profile delivered by directory bootstrap while its individual request fails", async () => {
    let reject!: (reason: Error) => void;
    getUser.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    mount();
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    await act(() => {
      useUsersStore
        .getState()
        .upsertUserForOwner(workspaceRuntimeOwnerKey(SESSION), adaptWorkspaceMessengerUserDto(DTO));
      reject(new Error("Temporary failure"));
      return Promise.resolve();
    });
    expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(USER);
    expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a persistent cache read that finishes after the account changes", async () => {
    let resolve!: (value: ReturnType<typeof toWorkspaceUserCacheProfile>) => void;
    readUserCacheProfile.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await waitFor(() => expect(readUserCacheProfile).toHaveBeenCalledTimes(1));
    act(() => {
      useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
      useUsersStore.getState().startOwnerSync("other-owner");
    });
    await act(() => {
      resolve(toWorkspaceUserCacheProfile(adaptWorkspaceMessengerUserDto(DTO)));
      return Promise.resolve();
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(useUsersStore.getState().usersById[USER]).toBeUndefined();
    expect(useRightDrawerStore.getState().open).toBe(false);
  });

  it("uses a profile hydrated during a pending persistent cache lookup", async () => {
    let resolve!: (value: null) => void;
    readUserCacheProfile.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    getUser.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    await waitFor(() => expect(readUserCacheProfile).toHaveBeenCalledTimes(1));
    await act(() => {
      useUsersStore
        .getState()
        .upsertUserForOwner(workspaceRuntimeOwnerKey(SESSION), adaptWorkspaceMessengerUserDto(DTO));
      resolve(null);
      return Promise.resolve();
    });
    expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(USER);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["unmount", "account change"])(
    "aborts a cached profile's refresh on %s",
    async (reason) => {
      useUsersStore
        .getState()
        .upsertUserForOwner(workspaceRuntimeOwnerKey(SESSION), adaptWorkspaceMessengerUserDto(DTO));
      let resolve!: (value: typeof DTO) => void;
      getUser.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const view = render(
        <MemoryRouter initialEntries={[`/org/org-a/project/project-a/inbox#user/${USER}`]}>
          <ActiveAccountLink />
          <Probe />
        </MemoryRouter>,
      );
      await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
      const signal = getUser.mock.calls[0]?.[0].signal as AbortSignal;
      expect(screen.getByTestId("hash")).toBeEmptyDOMElement();
      expect(signal.aborted).toBe(false);
      if (reason === "unmount") view.unmount();
      else act(() => useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null }));
      expect(signal.aborted).toBe(true);
      await act(() => {
        resolve({ ...DTO, first_name: "Stale", updated_at: "2026-09-02T10:00:00Z" });
        return Promise.resolve();
      });
      expect(useUsersStore.getState().usersById[USER]?.displayName).toBe("Alice Smith");
    },
  );

  it("cancels the cached refresh when a new profile link arrives", async () => {
    useUsersStore
      .getState()
      .upsertUserForOwner(workspaceRuntimeOwnerKey(SESSION), adaptWorkspaceMessengerUserDto(DTO));
    let resolve!: (value: typeof DTO) => void;
    getUser.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const otherUuid = "44444444-4444-4444-8444-444444444444";
    getUser.mockResolvedValueOnce({ ...DTO, uuid: otherUuid, first_name: "Other" });
    mount();
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    const signal = getUser.mock.calls[0]?.[0].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Another profile" }));
    await waitFor(() =>
      expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(otherUuid),
    );
    expect(signal.aborted).toBe(true);
    await act(() => {
      resolve({ ...DTO, first_name: "Stale", updated_at: "2026-09-02T10:00:00Z" });
      return Promise.resolve();
    });
    expect(useUsersStore.getState().usersById[USER]?.displayName).toBe("Alice Smith");
    expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(otherUuid);
  });
});
