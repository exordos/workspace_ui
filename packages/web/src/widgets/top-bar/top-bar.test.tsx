import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDownloadStore } from "~/entities/download/download.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { ELECTRON_MAC_TITLEBAR_STRIP_CLASS } from "~/shared/lib/electron-title-bar.lib";
import { setCurrentOrgRouteIdResolver } from "~/shared/lib/org-route";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import { TOP_BAR_PROFILE_STATUS_MAX_CH } from "./top-bar.lib";
import { TopBar } from "./top-bar.ui";

const CURRENT_USER_UUID = "a225223c-637c-4afa-918f-5f2798b9305f";

function LocationProbe() {
  return <span data-testid="location-path">{useLocation().pathname}</span>;
}

function resetTopBarRelatedStores(): void {
  useMessengerStore.getState().clear();
  useUsersStore.getState().clear();
  useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  setCurrentOrgRouteIdResolver(null);
  useSearchModalStore.getState().closeModal();
  useRightDrawerStore.setState({ open: false, mode: "info", userIdOverride: null });
}

function createWorkspaceSession(
  overrides: Partial<WorkspaceAuthSession> = {},
): WorkspaceAuthSession {
  const userUuid = overrides.userUuid ?? CURRENT_USER_UUID;
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "workspace.example.com",
    organizationOrigin: "https://workspace.example.com",
    projectId: "project-a",
    userUuid,
    login: "alice@example.com",
    accessToken: "access-token",
    runtimeGeneration: 1,
    profile: {
      uuid: userUuid,
      username: "alice",
      firstName: "Alice",
      lastName: "Workspace",
      email: "alice@example.com",
      status: "active",
    },
    ...overrides,
  };
}

function seedWorkspaceSession(userUuid = CURRENT_USER_UUID): void {
  const session = createWorkspaceSession({ userUuid });
  useWorkspaceAuthStore.setState({
    currentAccountId: session.accountId,
    runtimeGeneration: 1,
    sessions: [session],
  });
}

function createDirectWorkspaceStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  const now = "2026-07-02T10:00:00Z";
  return {
    uuid: "75309057-419c-4b12-a7c1-3932429ec4a6",
    projectId: "project-a",
    ownerUuid: "owner-a",
    userUuid: "current-user",
    role: "member",
    notificationMode: "all_messages",
    name: "Alice Workspace",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "private",
    isPrivate: true,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: "a225223c-637c-4afa-918f-5f2798b9305f",
    lastMessageUuid: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("TopBar", () => {
  afterEach(() => {
    resetTopBarRelatedStores();
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it("navigates to calendar when calendar section is clicked", () => {
    renderWithProviders(
      <>
        <LocationProbe />
        <TopBar />
      </>,
      { route: "/" },
    );

    fireEvent.click(screen.getByRole("button", { name: /calendar/i }));
    expect(screen.getByTestId("location-path")).toHaveTextContent("/calendar");
  });

  it("does not render calls or services nav buttons by default", () => {
    renderWithProviders(
      <>
        <LocationProbe />
        <TopBar />
      </>,
      { route: "/" },
    );

    expect(screen.queryByRole("button", { name: /^calls$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^services$/i })).not.toBeInTheDocument();
  });

  it("navigates to the app root when chat is selected without Workspace project", () => {
    renderWithProviders(
      <>
        <LocationProbe />
        <TopBar />
      </>,
      { route: "/calendar" },
    );

    fireEvent.click(screen.getByRole("button", { name: /chats\s*&\s*channels/i }));
    expect(screen.getByTestId("location-path")).toHaveTextContent("/");
  });

  it("navigates to Workspace messenger root when chat is selected with Workspace project", () => {
    seedWorkspaceSession();
    setCurrentOrgRouteIdResolver(() => "workspace.example.com");

    renderWithProviders(
      <>
        <LocationProbe />
        <TopBar />
      </>,
      { route: "/calendar" },
    );

    fireEvent.click(screen.getByRole("button", { name: /chats\s*&\s*channels/i }));
    expect(screen.getByTestId("location-path")).toHaveTextContent(
      "/org/workspace.example.com/project/project-a/messenger",
    );
  });

  it("sets aria-current on the section that matches the URL", () => {
    renderWithProviders(<TopBar />, { route: "/calendar" });

    expect(screen.getByRole("button", { name: /calendar/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /chats\s*&\s*channels/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("hides the unfinished global search action", () => {
    renderWithProviders(<TopBar />);

    expect(screen.queryByRole("button", { name: /search/i })).not.toBeInTheDocument();
  });

  it("opens Workspace people search without legacy message filters", () => {
    renderWithProviders(<TopBar />, {
      route: "/org/workspace.example.com/project/project-a/messenger",
    });

    act(() => {
      useSearchModalStore.getState().openModal();
    });

    expect(screen.getByPlaceholderText(t("search.search"))).not.toBeDisabled();
    expect(screen.queryByPlaceholderText(t("search.filterStream"))).not.toBeInTheDocument();
  });

  it("opens selected Workspace user from top-bar search through direct-private stream route", () => {
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: "a225223c-637c-4afa-918f-5f2798b9305f",
        username: "alice.workspace",
        displayName: "Alice Workspace",
        email: "alice.workspace@example.com",
        status: "active",
      }),
    );
    useMessengerStore.getState().startBootstrap("owner:top-bar");
    useMessengerStore.getState().replaceBootstrapState("owner:top-bar", {
      streams: [createDirectWorkspaceStream()],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [],
    });

    renderWithProviders(
      <>
        <LocationProbe />
        <TopBar />
      </>,
      { route: "/org/workspace.example.com/project/project-a/messenger" },
    );

    act(() => {
      useSearchModalStore.getState().openModal();
    });
    fireEvent.change(screen.getByPlaceholderText(t("search.search")), {
      target: { value: "alice.workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Alice Workspace/i }));

    expect(screen.getByTestId("location-path")).toHaveTextContent(
      "/org/workspace.example.com/project/project-a/stream/75309057-419c-4b12-a7c1-3932429ec4a6",
    );
    expect(useSearchModalStore.getState().open).toBe(false);
  });

  it("opens user menu in right drawer when profile trigger is clicked", () => {
    renderWithProviders(<TopBar />);

    const profileButton = screen.getByRole("button", { name: /profile/i });
    expect(profileButton).toHaveAttribute("aria-expanded", "false");

    act(() => {
      fireEvent.click(profileButton);
    });

    const drawer = useRightDrawerStore.getState();
    expect(drawer.open).toBe(true);
    expect(drawer.mode).toBe("user-menu");
    expect(profileButton).toHaveAttribute("aria-expanded", "true");
  });

  it("closes user menu when profile trigger is clicked again", () => {
    renderWithProviders(<TopBar />);

    const profileButton = screen.getByRole("button", { name: /profile/i });
    act(() => {
      fireEvent.click(profileButton);
    });
    expect(useRightDrawerStore.getState().open).toBe(true);

    act(() => {
      fireEvent.click(profileButton);
    });

    const drawer = useRightDrawerStore.getState();
    expect(drawer.open).toBe(false);
    expect(profileButton).toHaveAttribute("aria-expanded", "false");
  });

  it("uses semantic token class for active section background from route", () => {
    renderWithProviders(<TopBar />, { route: "/mail" });

    expect(screen.getByRole("button", { name: /mail/i })).toHaveClass("bg-card-bg-active");
  });

  it("uses tokenized geometry for top bar shell", () => {
    renderWithProviders(<TopBar />);

    const header = screen.getByRole("banner", { name: /top bar/i });
    expect(header).toHaveClass("rounded-b-lg");
    // Matches left/right sidebars + chat header across themes
    expect(header).toHaveClass("bg-bg-elevated");
    expect(screen.getByTestId("topbar-toolbar-row")).toHaveClass("p-2");
  });

  it("uses left slot inset to align server switcher with folder rail", () => {
    renderWithProviders(<TopBar />);

    const leftSlot = screen.getByTestId("topbar-left-slot");
    expect(leftSlot).toHaveClass("pl-5");
  });

  it("reserves macOS traffic light region when Electron reports darwin", () => {
    (window as unknown as Record<string, unknown>).electronAPI = {
      platform: "darwin",
      notifications: { show: vi.fn() },
    };
    renderWithProviders(<TopBar />);

    const strip = screen.getByTestId("topbar-mac-titlebar-strip");
    expect(strip).toHaveClass("electron-drag");
    expect(strip).toHaveClass(ELECTRON_MAC_TITLEBAR_STRIP_CLASS);

    const leftSlot = screen.getByTestId("topbar-left-slot");
    expect(leftSlot).toHaveClass("pl-5");
  });

  it("uses compact section buttons aligned from the left with a small inset", () => {
    renderWithProviders(<TopBar />);

    const sectionsSlot = screen.getByTestId("topbar-sections-slot");
    expect(sectionsSlot).toHaveClass("items-start");
    expect(sectionsSlot).toHaveClass("pl-2");

    const chatsButton = screen.getByRole("button", { name: /chats\s*&\s*channels/i });
    expect(chatsButton).toHaveClass("h-10");
    expect(chatsButton).toHaveClass("w-10");
    expect(chatsButton).toHaveClass("rounded-lg");
    expect(chatsButton.querySelector("svg")).toHaveAttribute("width", "24");
  });

  it("uses semantic token classes for presence indicators", () => {
    seedWorkspaceSession();
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: CURRENT_USER_UUID,
        full_name: "Alice",
        presence: { status: "active", timestamp: Date.now() },
      }),
    );

    renderWithProviders(<TopBar />);
    expect(screen.getByLabelText(/online/i)).toHaveClass("bg-indicator-green");

    act(() => {
      useUsersStore.getState().upsertUser(
        createUser({
          uuid: CURRENT_USER_UUID,
          full_name: "Alice",
          presence: { status: "idle", timestamp: Date.now() },
        }),
      );
    });
    expect(screen.getByLabelText(/away/i)).toHaveClass("bg-indicator-orange");
  });

  it("updates profile trigger avatar src when users store avatar changes", () => {
    seedWorkspaceSession();
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: CURRENT_USER_UUID,
        full_name: "Alice",
        email: "alice@example.com",
        avatar_url: "urn:url:https://cdn.example.com/avatar/old.png",
      }),
    );

    renderWithProviders(<TopBar />);
    const profileButton = screen.getByRole("button", { name: /profile/i });
    const profileAvatarBefore = profileButton.querySelector("img");
    expect(profileAvatarBefore?.getAttribute("src")).toContain("cdn.example.com/avatar/old.png");

    act(() => {
      useUsersStore.getState().upsertUser(
        createUser({
          uuid: CURRENT_USER_UUID,
          avatar_url: "urn:url:https://cdn.example.com/avatar/new.png",
        }),
      );
    });

    const profileAvatarAfter = profileButton.querySelector("img");
    expect(profileAvatarAfter?.getAttribute("src")).toContain("cdn.example.com/avatar/new.png");
  });

  it("shows current user email under display name in profile trigger", () => {
    seedWorkspaceSession();
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: CURRENT_USER_UUID,
        full_name: "Dmitrii Korobkin",
        email: "dmitrii@example.com",
      }),
    );

    renderWithProviders(<TopBar />);

    const profileButton = screen.getByRole("button", { name: /profile/i });
    const profileScope = within(profileButton);
    expect(profileScope.getByText("Dmitrii Korobkin")).toHaveClass("whitespace-nowrap");

    const email = profileScope.getByText("dmitrii@example.com");
    expect(email).toHaveClass("text-[11px]");
    expect(email).toHaveClass("text-text-secondary");
    expect(email).toHaveClass("whitespace-nowrap");
    expect(email).not.toHaveClass("truncate");
  });

  it("shows Workspace auth profile when legacy user store is empty", () => {
    seedWorkspaceSession();

    renderWithProviders(<TopBar />);

    const profileButton = screen.getByRole("button", { name: /profile/i });
    const profileScope = within(profileButton);
    expect(profileScope.getByText("Alice Workspace")).toBeInTheDocument();
    expect(profileScope.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText(/online/i)).toBeInTheDocument();
  });

  it("navigates to the next Workspace inbox after logging out from the current account", async () => {
    const firstSession = createWorkspaceSession();
    const secondSession = createWorkspaceSession({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "next.example.com",
      organizationOrigin: "https://next.example.com",
      projectId: "project-b",
      userUuid: "b225223c-637c-4afa-918f-5f2798b9305f",
      login: "bob@example.com",
      runtimeGeneration: 1,
      profile: {
        uuid: "b225223c-637c-4afa-918f-5f2798b9305f",
        username: "bob",
        firstName: "Bob",
        lastName: "Workspace",
        email: "bob@example.com",
        status: "active",
      },
    });
    useWorkspaceAuthStore.setState({
      currentAccountId: firstSession.accountId,
      runtimeGeneration: 1,
      sessions: [firstSession, secondSession],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(
      <>
        <LocationProbe />
        <TopBar />
      </>,
      { route: "/org/workspace.example.com/project/project-a/stream/old-stream" },
    );

    const accountMenuTrigger = screen
      .getAllByRole("button", { name: t("auth.selectServer") })
      .find((button) => button.getAttribute("aria-haspopup") === "menu");
    expect(accountMenuTrigger).toBeDefined();
    fireEvent.pointerDown(accountMenuTrigger!, { button: 0, ctrlKey: false });
    fireEvent.click((await screen.findAllByRole("button", { name: t("auth.logoutFromOrg") }))[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("location-path")).toHaveTextContent(
        "/org/next.example.com/project/project-b/inbox",
      );
      expect(useWorkspaceAuthStore.getState().currentAccountId).toBe(secondSession.accountId);
    });
  });

  it("shows short profile status without a hover title", () => {
    seedWorkspaceSession();
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: CURRENT_USER_UUID,
        full_name: "Dmitrii Korobkin",
        status: { text: "In a meeting", away: false },
      }),
    );

    renderWithProviders(<TopBar />);

    const profileButton = screen.getByRole("button", { name: /profile/i });
    const status = within(profileButton).getByText("In a meeting");
    expect(status).toHaveClass("truncate");
    expect(status).toHaveClass(`max-w-[${TOP_BAR_PROFILE_STATUS_MAX_CH}ch]`);
    expect(status).not.toHaveAttribute("title");
  });

  it("shows profile status emoji with status text in profile trigger", () => {
    seedWorkspaceSession();
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: CURRENT_USER_UUID,
        full_name: "Dmitrii Korobkin",
        statusEmoji: "☕",
        statusText: "Focus",
      }),
    );

    renderWithProviders(<TopBar />);

    const profileButton = screen.getByRole("button", { name: /profile/i });
    expect(within(profileButton).getByText("☕ Focus")).toBeInTheDocument();
  });

  it("shows full profile status on hover when truncated", () => {
    const longStatus = "a".repeat(TOP_BAR_PROFILE_STATUS_MAX_CH + 5);
    seedWorkspaceSession();
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: CURRENT_USER_UUID,
        full_name: "Dmitrii Korobkin",
        status: { text: longStatus, away: false },
      }),
    );

    renderWithProviders(<TopBar />);

    const profileButton = screen.getByRole("button", { name: /profile/i });
    const status = within(profileButton).getByText(longStatus);
    expect(status).toHaveClass("truncate");
    expect(status).toHaveClass(`max-w-[${TOP_BAR_PROFILE_STATUS_MAX_CH}ch]`);
    expect(status).toHaveAttribute("title", longStatus);
  });

  it("shows download center entries and allows clearing queue", () => {
    useDownloadStore.setState({
      duplicateRequestTick: 0,
      entries: [
        {
          path: "/user_uploads/1/report.pdf",
          fileName: "report.pdf",
          status: "downloading",
          receivedBytes: 512,
          totalBytes: 1024,
          startedAt: 1,
          updatedAt: 2,
        },
      ],
    });

    renderWithProviders(<TopBar />);

    fireEvent.click(screen.getByRole("button", { name: /open downloads/i }));

    expect(screen.getByRole("dialog", { name: /downloads/i })).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText(/50%/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(useDownloadStore.getState().entries).toEqual([]);
  });

  it("marks download trigger as dialog popup control", () => {
    useDownloadStore.setState({
      duplicateRequestTick: 0,
      entries: [
        {
          path: "/user_uploads/2/spec.pdf",
          fileName: "spec.pdf",
          status: "downloading",
          receivedBytes: 256,
          totalBytes: 1024,
          startedAt: 10,
          updatedAt: 11,
        },
      ],
    });

    renderWithProviders(<TopBar />);

    const trigger = screen.getByRole("button", { name: /open downloads/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("announces download status and provides file-specific remove labels", () => {
    useDownloadStore.setState({
      duplicateRequestTick: 0,
      entries: [
        {
          path: "/user_uploads/3/report.pdf",
          fileName: "report.pdf",
          status: "downloading",
          receivedBytes: 512,
          totalBytes: 1024,
          startedAt: 20,
          updatedAt: 21,
        },
      ],
    });

    renderWithProviders(<TopBar />);

    fireEvent.click(screen.getByRole("button", { name: /open downloads/i }));

    const status = screen.getByText(/50%/i);
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: /remove report\.pdf/i })).toBeInTheDocument();
  });
});

describe("TopBar with VITE_TOP_BAR_CALLS_NAV / VITE_TOP_BAR_SERVICES_NAV", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    resetTopBarRelatedStores();
  });

  it("navigates to mail, calls, and services when both build flags are enabled", async () => {
    vi.stubEnv("VITE_TOP_BAR_CALLS_NAV", "true");
    vi.stubEnv("VITE_TOP_BAR_SERVICES_NAV", "true");
    vi.resetModules();
    const { TopBar: TopBarWithNav } = await import("./top-bar.ui");

    renderWithProviders(
      <>
        <LocationProbe />
        <TopBarWithNav />
      </>,
      { route: "/" },
    );

    fireEvent.click(screen.getByRole("button", { name: /mail/i }));
    expect(screen.getByTestId("location-path")).toHaveTextContent("/mail");

    fireEvent.click(screen.getByRole("button", { name: /calls/i }));
    expect(screen.getByTestId("location-path")).toHaveTextContent("/calls");

    fireEvent.click(screen.getByRole("button", { name: /services/i }));
    expect(screen.getByTestId("location-path")).toHaveTextContent("/services");
  });

  it("shows only calls when only VITE_TOP_BAR_CALLS_NAV is set", async () => {
    vi.stubEnv("VITE_TOP_BAR_CALLS_NAV", "true");
    vi.resetModules();
    const { TopBar: TopBarCallsOnly } = await import("./top-bar.ui");

    renderWithProviders(
      <>
        <LocationProbe />
        <TopBarCallsOnly />
      </>,
      { route: "/" },
    );

    expect(screen.getByRole("button", { name: /calls/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^services$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /calls/i }));
    expect(screen.getByTestId("location-path")).toHaveTextContent("/calls");
  });
});
