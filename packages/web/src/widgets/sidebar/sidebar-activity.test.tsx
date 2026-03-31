import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { SidebarActivity } from "./sidebar-activity.ui";
import { MY_ACTIVITY } from "./sidebar.lib";

describe("SidebarActivity", () => {
  afterEach(() => {
    useChatListStore.getState().clear();
    useDraftStore.getState().clear();
    useSettingsStore.getState().resetToDefaults();
  });

  it("shows mention and draft badges from current store state", () => {
    useChatListStore.setState({
      currentUserId: 7,
      lastAppliedMessages: [
        {
          id: 1,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "bugs",
          content: "hello",
          timestamp: 1,
          type: "stream",
          display_recipient: "engineering",
          flags: ["mentioned"],
        },
        {
          id: 2,
          sender_id: 43,
          sender_full_name: "Bob",
          stream_id: 10,
          subject: "bugs",
          content: "hello",
          timestamp: 2,
          type: "stream",
          display_recipient: "engineering",
          flags: ["mentioned", "read"],
        },
        {
          id: 3,
          sender_id: 7,
          sender_full_name: "Me",
          stream_id: 10,
          subject: "bugs",
          content: "self mention",
          timestamp: 3,
          type: "stream",
          display_recipient: "engineering",
          flags: ["mentioned"],
        },
      ],
    });
    useDraftStore.getState().setDrafts([
      { id: 1, type: "stream", to: [10], topic: "general", content: "one", timestamp: 1 },
      { id: 2, type: "private", to: [42], topic: "", content: "two", timestamp: 2 },
      { id: 3, type: "private", to: [42], topic: "", content: "   ", timestamp: 3 },
    ]);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const mentionsRow = screen.getByText(/mentions/i).closest("a");
    const draftsRow = screen.getByText(/drafts/i).closest("a");

    expect(mentionsRow).not.toBeNull();
    expect(draftsRow).not.toBeNull();
    expect(within(mentionsRow!).getByText("1")).toBeInTheDocument();
    expect(within(draftsRow!).getByText("2")).toBeInTheDocument();
  });

  it("renders compact activity shortcuts with badges when collapsed", () => {
    useChatListStore.setState({
      currentUserId: 7,
      lastAppliedMessages: [
        {
          id: 1,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "bugs",
          content: "hello",
          timestamp: 1,
          type: "stream",
          display_recipient: "engineering",
          flags: ["mentioned"],
        },
      ],
    });
    useDraftStore.getState().setDrafts([
      { id: 1, type: "stream", to: [10], topic: "general", content: "one", timestamp: 1 },
      { id: 2, type: "private", to: [42], topic: "", content: "two", timestamp: 2 },
    ]);

    render(
      <MemoryRouter>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /mentions/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /drafts/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /inbox/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /my activity/i })).toBeInTheDocument();
    expect(screen.queryByText(/^My Activity$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Mentions$/i)).not.toBeInTheDocument();
    const compactList = screen.getByRole("list", { name: /my activity/i });
    const compactContainer = compactList.parentElement;
    expect(compactContainer).not.toBeNull();
    expect(compactContainer!).toHaveClass("pt-0");
    const lastCompactItem = compactList.lastElementChild as HTMLElement | null;
    expect(lastCompactItem).not.toBeNull();
    expect(
      within(lastCompactItem!).getByRole("button", { name: /my activity/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    const mentionsCompactLink = screen.getByRole("link", { name: /mentions/i });
    const draftsCompactLink = screen.getByRole("link", { name: /drafts/i });
    expect(within(mentionsCompactLink).getByText("1")).toHaveClass("opacity-70");
    expect(within(draftsCompactLink).getByText("2")).toHaveClass("opacity-70");
  });

  it("renders collapsed activity shortcuts in a single monochrome row", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const compactList = screen.getByRole("list", { name: /my activity/i });
    expect(compactList).toHaveClass("flex-nowrap");

    const privateNotesLink = screen.getByRole("link", { name: /private notes/i });
    expect(privateNotesLink).toHaveClass("h-8");
    expect(privateNotesLink).toHaveClass("w-8");

    const privateNotesIcon = privateNotesLink.querySelector("svg");
    expect(privateNotesIcon).not.toBeNull();
    expect(privateNotesIcon).toHaveClass("text-current");
    expect(privateNotesLink.querySelector(".bg-accent")).toBeNull();
  });

  it("renders denser expanded activity rows when compact density is enabled", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });
    useSettingsStore.getState().setChatListDensity("compact");

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const mentionsLink = screen.getByRole("link", { name: /mentions/i });
    expect(mentionsLink).toHaveClass("rounded-lg");
    expect(mentionsLink).toHaveClass("px-2.5");
    expect(mentionsLink).toHaveClass("py-1.5");
    expect(mentionsLink).not.toHaveClass("rounded-xl");

    const mentionsChip = screen.getByTestId("activity-icon-bg-mentions");
    expect(mentionsChip).toHaveClass("h-8");
    expect(mentionsChip).toHaveClass("w-8");
  });

  it("highlights active collapsed shortcut with header-like active styling", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxLink = screen.getByRole("link", { name: /inbox/i });
    expect(inboxLink).toHaveClass("border");
    expect(inboxLink).toHaveClass("border-border-subtle");
    expect(inboxLink).toHaveClass("bg-card-bg-active");
    expect(inboxLink).toHaveClass("text-text-primary");
  });

  it("does not render legacy non-routable flagged activity row", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/flagged/i)).not.toBeInTheDocument();
  });

  it("uses semantic token classes for activity icon chips", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("activity-icon-bg-home")).toHaveClass("bg-accent");
    expect(screen.getByTestId("activity-icon-bg-mentions")).toHaveClass("bg-indicator-yellow");
    expect(screen.getByTestId("activity-icon-bg-reactions")).toHaveClass("bg-indicator-green");
    expect(screen.getByTestId("activity-icon-bg-drafts")).toHaveClass("bg-indicator-purple");
  });

  it("renders starred activity icon as outlined star glyph", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const favoritesChip = screen.getByTestId("activity-icon-bg-favorites");
    const favoritesPath = favoritesChip.querySelector("path");

    expect(favoritesPath).not.toBeNull();
    expect(favoritesPath?.getAttribute("d")).toContain("zM");
  });

  it("uses a balanced size for starred icon in expanded activity row", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const favoritesChip = screen.getByTestId("activity-icon-bg-favorites");
    const favoritesIcon = favoritesChip.querySelector("svg");
    expect(favoritesIcon).toHaveAttribute("width", "18");
    expect(favoritesIcon).toHaveAttribute("height", "18");
  });

  it("uses updated icon set for My Activity shortcuts", () => {
    expect(MY_ACTIVITY.map((item) => item.icon)).toEqual([
      "mail",
      "at",
      "files",
      "star_outline",
      "mood",
      "chat_bubble_outline",
    ]);
  });

  it("renders expanded activity links as themed cards and marks active route", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const mentionsLink = screen.getByRole("link", { name: /mentions/i });
    expect(mentionsLink).toHaveClass("rounded-xl");
    expect(mentionsLink).not.toHaveClass("border");
    expect(mentionsLink).not.toHaveClass("border-border-subtle");
    expect(mentionsLink).not.toHaveClass("border-accent-soft/60");
    expect(mentionsLink).toHaveClass("bg-bg-elevated/60");
    expect(mentionsLink).toHaveClass("bg-card-bg");
    expect(mentionsLink).toHaveAttribute("aria-current", "page");
  });

  it("renders private-notes entry as self DM route", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const privateNotesLink = screen.getByRole("link", { name: /private notes/i });
    expect(privateNotesLink).toHaveAttribute("href", "/dm/7");
  });
});
