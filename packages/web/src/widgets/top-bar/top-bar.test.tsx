import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDownloadStore } from "~/entities/download/download.model";
import { useUsersStore } from "~/entities/user/user.model";
import { renderWithProviders } from "~/test/render";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import { TopBar } from "./top-bar.ui";

describe("TopBar", () => {
  afterEach(() => {
    useChatListStore.setState({ currentUserId: null });
    useUsersStore.getState().clear();
    useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
    useSearchModalStore.getState().closeModal();
    useRightDrawerStore.setState({ open: false, mode: "info", userIdOverride: null });
  });

  it("calls onSectionChange for available sections", () => {
    const onSectionChange = vi.fn();

    renderWithProviders(<TopBar activeSection="chat" onSectionChange={onSectionChange} />);

    fireEvent.click(screen.getByRole("button", { name: /calendar/i }));
    fireEvent.click(screen.getByRole("button", { name: /mail/i }));
    fireEvent.click(screen.getByRole("button", { name: /calls/i }));
    fireEvent.click(screen.getByRole("button", { name: /services/i }));

    expect(onSectionChange).toHaveBeenNthCalledWith(1, "calendar");
    expect(onSectionChange).toHaveBeenNthCalledWith(2, "mail");
    expect(onSectionChange).toHaveBeenNthCalledWith(3, "calls");
    expect(onSectionChange).toHaveBeenNthCalledWith(4, "services");
  });

  it("still calls onSectionChange for chat", () => {
    const onSectionChange = vi.fn();

    renderWithProviders(<TopBar activeSection="calendar" onSectionChange={onSectionChange} />);

    fireEvent.click(screen.getByRole("button", { name: /chats\s*&\s*channels/i }));

    expect(onSectionChange).toHaveBeenCalledWith("chat");
  });

  it("opens global search from top bar action", () => {
    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);

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
    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /profile/i }));
    });

    const drawer = useRightDrawerStore.getState();
    expect(drawer.open).toBe(true);
    expect(drawer.mode).toBe("user-menu");
  });

  it("uses semantic token class for active section background", () => {
    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /chats\s*&\s*channels/i })).toHaveClass(
      "bg-card-bg-active",
    );
  });

  it("uses tokenized geometry for top bar shell", () => {
    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);

    const header = screen.getByRole("banner", { name: /top bar/i });
    expect(header).toHaveClass("rounded-b-xl");
    expect(header).toHaveClass("p-2");
  });

  it("uses left slot inset to align server switcher with folder rail", () => {
    renderWithProviders(
      <TopBar
        activeSection="chat"
        onSectionChange={vi.fn()}
        leftContent={<div data-testid="mock-left-content" />}
      />,
    );

    const leftSlot = screen.getByTestId("topbar-left-slot");
    expect(leftSlot).toHaveClass("pl-5");
  });

  it("uses compact section buttons aligned from the left with a small inset", () => {
    renderWithProviders(
      <TopBar
        activeSection="chat"
        onSectionChange={vi.fn()}
        leftContent={<div data-testid="mock-left-content" />}
      />,
    );

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

    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);
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

    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);

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

    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);

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

    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);

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

    renderWithProviders(<TopBar activeSection="chat" onSectionChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /open downloads/i }));

    const status = screen.getByText(/50%/i);
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: /remove report\.pdf/i })).toBeInTheDocument();
  });
});
