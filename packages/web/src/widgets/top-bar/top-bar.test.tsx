import { act, fireEvent, screen, within } from "@testing-library/react";
import React from "react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDownloadStore } from "~/entities/download/download.model";
import { useUsersStore } from "~/entities/user/user.model";
import { renderWithProviders } from "~/test/render";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import { ELECTRON_MAC_TITLEBAR_STRIP_CLASS } from "~/shared/lib/electron-title-bar.lib";
import { TopBar } from "./top-bar.ui";

function LocationProbe() {
  return <span data-testid="location-path">{useLocation().pathname}</span>;
}

function resetTopBarRelatedStores(): void {
  useChatListStore.setState({ currentUserId: null });
  useUsersStore.getState().clear();
  useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
  useSearchModalStore.getState().closeModal();
  useRightDrawerStore.setState({ open: false, mode: "info", userIdOverride: null });
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

  it("navigates to home when chat is selected from another section", () => {
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

  it("opens global search from top bar action", () => {
    renderWithProviders(<TopBar />);

    const searchButton = screen.getByRole("button", { name: /search/i });
    expect(searchButton).toHaveClass("h-10");
    expect(searchButton).toHaveClass("w-10");
    expect(searchButton).toHaveClass("rounded-lg");

    act(() => {
      fireEvent.click(searchButton);
    });
    expect(useSearchModalStore.getState().open).toBe(true);
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
    expect(header).toHaveClass("rounded-b-xl");
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
    useChatListStore.setState({ currentUserId: 7 });
    useUsersStore.getState().mergeUser({
      user_id: 7,
      full_name: "Alice",
      presence: { status: "active", timestamp: Date.now() },
    });

    renderWithProviders(<TopBar />);
    expect(screen.getByLabelText(/online/i)).toHaveClass("bg-indicator-green");

    act(() => {
      useUsersStore.getState().setPresence(7, { status: "idle", timestamp: Date.now() });
    });
    expect(screen.getByLabelText(/away/i)).toHaveClass("bg-indicator-orange");
  });

  it("shows current user email under display name in profile trigger", () => {
    useChatListStore.setState({ currentUserId: 11 });
    useUsersStore.getState().mergeUser({
      user_id: 11,
      full_name: "Dmitrii Korobkin",
      email: "dmitrii@example.com",
    });

    renderWithProviders(<TopBar />);

    const profileButton = screen.getByRole("button", { name: /profile/i });
    const profileScope = within(profileButton);
    expect(profileScope.getByText("Dmitrii Korobkin")).toBeInTheDocument();

    const email = profileScope.getByText("dmitrii@example.com");
    expect(email).toHaveClass("text-[11px]");
    expect(email).toHaveClass("text-text-secondary");
    expect(email).toHaveClass("truncate");
    expect(email).toHaveStyle({ maxWidth: `${"Dmitrii Korobkin".length}ch` });
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
