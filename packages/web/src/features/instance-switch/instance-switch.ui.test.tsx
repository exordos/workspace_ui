import { fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useMessengerBackgroundProjectionStore } from "~/entities/messenger/messenger-background-projection.model";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import { renderWithProviders } from "~/test/render";
import { InstanceSwitcher } from "./instance-switch.ui";

function PathnameProbe() {
  const { pathname } = useLocation();
  return <span data-testid="pathname-probe">{pathname}</span>;
}

function OrgRouteInstanceSyncProbe() {
  const location = useLocation();
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const setCurrentInstanceId = useInstancesStore((s) => s.setCurrentInstanceId);

  useEffect(() => {
    const { orgId } = extractOrgRouteFromPathname(location.pathname);
    if (orgId == null) return;
    const matchedInstance = instances.find((instance) => instance.id === orgId);
    if (matchedInstance == null) return;
    if (matchedInstance.id !== currentInstanceId) {
      setCurrentInstanceId(matchedInstance.id);
    }
  }, [currentInstanceId, instances, location.pathname, setCurrentInstanceId]);

  return null;
}

function resetStore() {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    unreadCountsByInstance: {},
  });
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  useMessengerBackgroundProjectionStore.getState().clear();
}

function renderInstanceSwitcher(route = "/") {
  return renderWithProviders(
    <>
      <OrgRouteInstanceSyncProbe />
      <InstanceSwitcher />
    </>,
    { route },
  );
}

function createWorkspaceSession(
  overrides: Partial<WorkspaceAuthSession> = {},
): WorkspaceAuthSession {
  return {
    accountId: overrides.accountId ?? "a.example.com:project-a:user-a",
    instanceId: overrides.instanceId ?? "workspace-inst-a",
    organizationId: overrides.organizationId ?? "a.example.com",
    organizationOrigin: overrides.organizationOrigin ?? "https://a.example.com",
    projectId: overrides.projectId ?? "project-a",
    userUuid: overrides.userUuid ?? "user-a",
    login: overrides.login ?? "alice@example.com",
    accessToken: overrides.accessToken ?? "access-token",
    refreshToken: overrides.refreshToken,
    expiresAtMs: overrides.expiresAtMs,
    runtimeGeneration: overrides.runtimeGeneration ?? 1,
    profile: overrides.profile ?? {
      uuid: overrides.userUuid ?? "user-a",
      username: "alice",
      firstName: "Alice",
      lastName: null,
      email: overrides.login ?? "alice@example.com",
      status: "active",
    },
  };
}

describe("InstanceSwitcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetStore();
  });

  it("renders Workspace auth sessions when legacy instances are empty", async () => {
    useWorkspaceAuthStore.setState({
      sessions: [
        createWorkspaceSession(),
        createWorkspaceSession({
          accountId: "b.example.com:project-b:user-b",
          instanceId: "workspace-inst-b",
          organizationId: "b.example.com",
          organizationOrigin: "https://b.example.com",
          projectId: "project-b",
          userUuid: "user-b",
          login: "bob@example.com",
        }),
      ],
      currentAccountId: "a.example.com:project-a:user-a",
      runtimeGeneration: 1,
    });

    renderWithProviders(<InstanceSwitcher />);

    expect(
      screen.getByRole("button", {
        name: /current server: alice@example\.com · a\.example\.com · project-a/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /bob@example\.com · b\.example\.com · project-b/i,
      }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("a.example.com · project-a")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("b.example.com · project-b")).toBeInTheDocument();
  });

  it("switches Workspace auth session and navigates to its messenger route", () => {
    useWorkspaceAuthStore.setState({
      sessions: [
        createWorkspaceSession(),
        createWorkspaceSession({
          accountId: "b.example.com:project-b:user-b",
          instanceId: "workspace-inst-b",
          organizationId: "b.example.com",
          organizationOrigin: "https://b.example.com",
          projectId: "project-b",
          userUuid: "user-b",
          login: "bob@example.com",
        }),
      ],
      currentAccountId: "a.example.com:project-a:user-a",
      runtimeGeneration: 1,
    });

    renderWithProviders(
      <>
        <PathnameProbe />
        <InstanceSwitcher />
      </>,
      { route: "/org/a.example.com/project/project-a/stream/stream-a" },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /bob@example\.com · b\.example\.com · project-b/i,
      }),
    );

    expect(useWorkspaceAuthStore.getState().currentAccountId).toBe(
      "b.example.com:project-b:user-b",
    );
    expect(screen.getByTestId("pathname-probe")).toHaveTextContent(
      "/org/b.example.com/project/project-b/messenger",
    );
  });

  it("shows live unread indicator for a Workspace background session projection", async () => {
    const activeSession = createWorkspaceSession();
    const backgroundSession = createWorkspaceSession({
      accountId: "b.example.com:project-b:user-b",
      instanceId: "workspace-inst-b",
      organizationId: "b.example.com",
      organizationOrigin: "https://b.example.com",
      projectId: "project-b",
      userUuid: "user-b",
      login: "bob@example.com",
    });
    useWorkspaceAuthStore.setState({
      sessions: [activeSession, backgroundSession],
      currentAccountId: activeSession.accountId,
      runtimeGeneration: 1,
    });

    const ownerKey = workspaceRuntimeOwnerKey(backgroundSession);
    useMessengerBackgroundProjectionStore.getState().recordAppliedEvent(
      ownerKey,
      {
        epoch_version: 9,
        type: "folder",
        kind: "folder.updated",
        folder: {
          uuid: "folder-b",
          project_id: backgroundSession.projectId,
          user_uuid: backgroundSession.userUuid,
          title: "All",
          background_color_value: null,
          system_type: "all",
          unread_count: 3,
          folder_items: [],
          created_at: "2026-07-07T10:00:00Z",
          updated_at: "2026-07-07T10:00:00Z",
        },
      },
      {
        owner: {
          accountId: backgroundSession.accountId,
          instanceId: backgroundSession.instanceId,
          organizationId: backgroundSession.organizationId,
          projectId: backgroundSession.projectId,
          userUuid: backgroundSession.userUuid,
          runtimeGeneration: backgroundSession.runtimeGeneration,
        },
        ownerKey,
        surface: "background",
        source: "websocket",
      },
    );

    renderWithProviders(<InstanceSwitcher />);

    expect(screen.getByTestId(`instance-quick-${backgroundSession.accountId}`)).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(
      await screen.findByTestId(`workspace-session-unread-${backgroundSession.accountId}`),
    ).toHaveTextContent("3");
  });

  it("shows generic instance unread badge in dropdown", async () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: { "org-a": 0, "org-b": 4 },
    });

    renderInstanceSwitcher();
    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByTestId("instance-unread-org-b")).toHaveTextContent("4");
  });

  it("positions dropdown unread badge in top-right corner of generic instance logo", async () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: { "org-a": 0, "org-b": 4 },
    });

    renderInstanceSwitcher();
    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });

    const logoContainer = await screen.findByTestId("instance-logo-org-b");
    const unreadBadge = await screen.findByTestId("instance-unread-org-b");

    expect(logoContainer).toBeInTheDocument();
    expect(logoContainer).toContainElement(unreadBadge);
    expect(unreadBadge).toHaveClass("absolute");
    expect(unreadBadge).toHaveClass("top-0");
    expect(unreadBadge).toHaveClass("right-0");
  });

  it("keeps add-organization action only inside dropdown", async () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: {},
    });

    renderInstanceSwitcher();

    expect(screen.queryByRole("button", { name: /add server/i })).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText(/add server/i)).toBeInTheDocument();
  });

  it("shows all generic instances in dropdown with fallback logos", async () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }, { id: "org-c" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: {},
    });

    renderInstanceSwitcher();
    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });

    const firstLogo = await screen.findByTestId("instance-logo-org-a");
    const secondLogo = screen.getByTestId("instance-logo-org-b");
    const thirdLogo = screen.getByTestId("instance-logo-org-c");
    const firstItem = firstLogo.closest('[role="menuitem"]');
    const secondItem = secondLogo.closest('[role="menuitem"]');
    const thirdItem = thirdLogo.closest('[role="menuitem"]');

    expect(firstItem).toBeInTheDocument();
    expect(secondItem).toBeInTheDocument();
    expect(thirdItem).toBeInTheDocument();

    expect(firstLogo.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
    expect(secondLogo.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
    expect(thirdLogo.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
    expect(firstLogo.querySelector("img")).toHaveClass("h-9");
    expect(firstLogo.querySelector("img")).toHaveClass("w-9");
    expect(firstLogo.querySelector("img")).not.toHaveClass("rounded-full");
    expect(secondLogo.querySelector("img")).toHaveClass("h-9");
    expect(secondLogo.querySelector("img")).toHaveClass("w-9");
    expect(secondLogo.querySelector("img")).not.toHaveClass("rounded-full");
    expect(thirdLogo.querySelector("img")).toHaveClass("h-9");
    expect(thirdLogo.querySelector("img")).toHaveClass("w-9");
    expect(thirdLogo.querySelector("img")).not.toHaveClass("rounded-full");
  });

  it("shows noticeable logout action and confirms before removing organization", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: {},
    });

    renderInstanceSwitcher();
    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });

    const logoutButtons = await screen.findAllByRole("button", {
      name: /logout from organization/i,
    });
    expect(logoutButtons[0]).toHaveClass("text-notice-base");
    expect(logoutButtons[0]).not.toHaveClass("opacity-0");
    expect(logoutButtons[0]).toHaveClass("h-6");
    expect(logoutButtons[0]).toHaveClass("w-6");
    expect(logoutButtons[0]).not.toHaveTextContent(/logout from organization/i);
    expect(logoutButtons[0]?.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(logoutButtons[0]!);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("org-a"));
    expect(useInstancesStore.getState().instances).toHaveLength(2);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: /logout from organization/i }))[0]!,
    );
    expect(useInstancesStore.getState().instances).toHaveLength(1);
  });

  it("renders quick instance icons and switches active instance on click", () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: { "org-a": 0, "org-b": 0 },
    });

    renderInstanceSwitcher();

    const secondInstanceButton = screen.getByRole("button", { name: "org-b" });
    fireEvent.click(secondInstanceButton);

    expect(useInstancesStore.getState().currentInstanceId).toBe("org-b");
  });

  it("navigates to target organization inbox when switching from a DM route", () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: { "org-a": 0, "org-b": 0 },
    });

    renderWithProviders(
      <>
        <OrgRouteInstanceSyncProbe />
        <PathnameProbe />
        <InstanceSwitcher />
      </>,
      { route: "/org/org-a/dm/42" },
    );

    fireEvent.click(screen.getByRole("button", { name: "org-b" }));

    expect(screen.getByTestId("pathname-probe")).toHaveTextContent("/org/org-b/inbox");
  });

  it("does not mutate current instance before route-based org sync catches up", () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: { "org-a": 0, "org-b": 0 },
    });

    renderWithProviders(
      <>
        <PathnameProbe />
        <InstanceSwitcher />
      </>,
      { route: "/org/org-a/dm/42" },
    );

    fireEvent.click(screen.getByRole("button", { name: "org-b" }));

    expect(screen.getByTestId("pathname-probe")).toHaveTextContent("/org/org-b/inbox");
    expect(useInstancesStore.getState().currentInstanceId).toBe("org-a");
  });

  it("shows only three organizations in header and moves rest to dropdown overflow", () => {
    useInstancesStore.setState({
      instances: [
        { id: "org-a" },
        { id: "org-b" },
        { id: "org-c" },
        { id: "org-d" },
        { id: "org-e" },
      ],
      currentInstanceId: "org-a",
      unreadCountsByInstance: {},
    });

    const { container } = renderInstanceSwitcher();
    const quickButtons = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="instance-quick-"]'),
    );

    expect(quickButtons).toHaveLength(3);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("sorts organizations by user selection order", () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }, { id: "org-c" }, { id: "org-d" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: {},
    });

    const { container } = renderInstanceSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "org-c" }));

    const quickIds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="instance-quick-"]'),
    ).map((element) => element.dataset.testid?.replace("instance-quick-", ""));

    expect(quickIds).toEqual(["org-c", "org-a", "org-b"]);
  });

  it("highlights the active organization with an outline in header and dropdown", async () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: { "org-a": 1, "org-b": 0 },
    });

    renderInstanceSwitcher();

    const activeButton = screen.getByRole("button", { name: /current server: org-a/i });
    expect(activeButton).toHaveClass("h-10");
    expect(activeButton).toHaveClass("w-10");
    expect(activeButton).toHaveClass("bg-card-bg-active");
    expect(screen.getByTestId("instance-frame-org-a")).toHaveClass("ring-2");
    expect(screen.getByTestId("instance-frame-org-a")).toHaveClass("ring-inset");

    const selectorButton = screen.getByRole("button", { name: /select account/i });
    expect(selectorButton).toBeInTheDocument();
    expect(selectorButton).not.toHaveClass("border");

    fireEvent.pointerDown(selectorButton, {
      button: 0,
      ctrlKey: false,
    });

    const activeDropdownItem = (await screen.findByTestId("instance-logo-org-a")).closest(
      '[role="menuitem"]',
    );

    expect(activeDropdownItem).toHaveClass("bg-card-bg-active");
    expect(screen.getByTestId("instance-logo-org-a")).toHaveClass("ring-2");
    expect(screen.getByTestId("instance-logo-org-a")).toHaveClass("ring-inset");
    expect(screen.getByTestId("instance-logo-org-b")).not.toHaveClass("ring-2");
  });

  it("shows unread badge for the current instance item when unread > 0", async () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: { "org-a": 2, "org-b": 0 },
    });

    renderInstanceSwitcher();
    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByTestId("instance-unread-org-a")).toHaveTextContent("2");
    expect(screen.queryByTestId("instance-unread-org-b")).not.toBeInTheDocument();
  });

  it("updates dropdown unread badge when store count changes", async () => {
    useInstancesStore.setState({
      instances: [{ id: "org-a" }, { id: "org-b" }],
      currentInstanceId: "org-a",
      unreadCountsByInstance: { "org-a": 0, "org-b": 0 },
    });

    renderInstanceSwitcher();
    fireEvent.pointerDown(screen.getByRole("button", { name: /select account/i }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.queryByTestId("instance-unread-org-b")).not.toBeInTheDocument();

    useInstancesStore.getState().setInstanceUnreadCount("org-b", 6);

    expect(await screen.findByTestId("instance-unread-org-b")).toHaveTextContent("6");
  });
});
