import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { testMessageId } from "~/test/factories";
import { SidebarActivity } from "./sidebar-activity.ui";
import { MY_ACTIVITY } from "./sidebar.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000010";

function setAllFolderBadge(badge?: number): void {
  useFolderSyncStore.setState({
    folders: [
      {
        id: "all-folder",
        label: "All",
        backgroundColor: 0,
        systemType: "all",
        badge,
      },
    ],
  });
}

describe("SidebarActivity", () => {
  afterEach(() => {
    useActivityStore.getState().clear();
    useChatListStore.getState().clear();
    useDraftStore.getState().clear();
    useFolderSyncStore.setState({ folders: [] });
    useMuteStore.getState().clear();
    useSettingsStore.getState().resetToDefaults();
  });

  it("shows mention and draft badges from current store state", () => {
    useChatListStore.setState({
      currentUserId: 7,
      lastAppliedMessages: [],
      mentionsUnreadCount: 1,
    });
    useDraftStore.getState().setDrafts([
      {
        id: testMessageId(1),
        type: "stream",
        to: [10],
        topic: "general",
        content: "one",
        timestamp: 1,
      },
      { id: testMessageId(2), type: "private", to: [42], topic: "", content: "two", timestamp: 2 },
      { id: testMessageId(3), type: "private", to: [42], topic: "", content: "   ", timestamp: 3 },
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

  it("shows inbox badge from server all-folder unread count in expanded view", () => {
    setAllFolderBadge(3);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxRow = screen.getByRole("link", { name: /inbox/i });
    expect(within(inboxRow).getByText("3")).toBeInTheDocument();
  });

  it("keeps server inbox badge when stream mute state changes", () => {
    setAllFolderBadge(3);
    useMuteStore.getState().muteStream(STREAM_UUID);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxRow = screen.getByRole("link", { name: /inbox/i });
    expect(within(inboxRow).getByText("3")).toBeInTheDocument();
    expect(within(inboxRow).queryByText("1")).not.toBeInTheDocument();
  });

  it("shows favorites badge in expanded view from starred summary", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });
    useActivityStore
      .getState()
      .setStarredSummaryFromRegisterMessageIds([
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
        "00000000-0000-4000-8000-000000000004",
      ]);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const favoritesRow = screen.getByRole("link", { name: /starred/i });
    expect(within(favoritesRow).getByText("4")).toBeInTheDocument();
  });

  it("renders compact activity shortcuts with badges when collapsed", () => {
    useChatListStore.setState({
      currentUserId: 7,
      lastAppliedMessages: [],
      mentionsUnreadCount: 1,
    });
    useDraftStore.getState().setDrafts([
      {
        id: testMessageId(1),
        type: "stream",
        to: [10],
        topic: "general",
        content: "one",
        timestamp: 1,
      },
      { id: testMessageId(2), type: "private", to: [42], topic: "", content: "two", timestamp: 2 },
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
    expect(within(mentionsCompactLink).getByText("1")).toHaveClass("text-text-primary", "h-4");
    expect(within(draftsCompactLink).getByText("2")).toHaveClass("text-text-primary", "h-4");
  });

  it("shows compact inbox badge from server all-folder unread count", () => {
    setAllFolderBadge(3);

    render(
      <MemoryRouter>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxLink = screen.getByRole("link", { name: /inbox/i });
    expect(within(inboxLink).getByText("3")).toHaveClass("text-text-primary", "h-4");
  });

  it("keeps compact activity badges above adjacent button hovers", () => {
    setAllFolderBadge(3);
    useChatListStore.setState({ mentionsUnreadCount: 180 });

    render(
      <MemoryRouter>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxLink = screen.getByRole("link", { name: /inbox/i });
    const inboxBadgeWrapper = within(inboxLink).getByText("3").parentElement;
    expect(inboxBadgeWrapper).toHaveClass("z-sticky", "pointer-events-none");
    expect(inboxLink.closest("li")).toHaveClass("z-sticky");
  });

  it("shows compact favorites badge from starred summary", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });
    useActivityStore
      .getState()
      .setStarredSummaryFromRegisterMessageIds([
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
        "00000000-0000-4000-8000-000000000004",
        "00000000-0000-4000-8000-000000000005",
        "00000000-0000-4000-8000-000000000006",
        "00000000-0000-4000-8000-000000000007",
      ]);

    render(
      <MemoryRouter>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const favoritesLink = screen.getByRole("link", { name: /starred/i });
    expect(within(favoritesLink).getByText("7")).not.toHaveClass("opacity-70");
  });

  it("hides inbox badge when unread total is zero", () => {
    setAllFolderBadge(0);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxRow = screen.getByRole("link", { name: /inbox/i });
    expect(inboxRow.querySelector(".bg-sidebar-unread")).toBeNull();
  });

  it("updates inbox badge when server folder unread count changes", () => {
    setAllFolderBadge(0);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /inbox/i }).querySelector(".bg-sidebar-unread"),
    ).toBeNull();

    act(() => {
      setAllFolderBadge(1);
    });
    expect(within(screen.getByRole("link", { name: /inbox/i })).getByText("1")).toBeInTheDocument();

    act(() => {
      setAllFolderBadge(3);
    });
    const inboxRow = screen.getByRole("link", { name: /inbox/i });
    expect(within(inboxRow).getByText("3")).toBeInTheDocument();
    expect(within(inboxRow).queryByText("1")).toBeNull();
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

    const feedLink = screen.getByRole("link", { name: /feed/i });
    expect(feedLink).toHaveClass("h-8");
    expect(feedLink).toHaveClass("w-8");

    const feedIcon = feedLink.querySelector("svg");
    expect(feedIcon).not.toBeNull();
    expect(feedIcon).toHaveClass("text-current");
    expect(feedLink.querySelector(".bg-accent")).toBeNull();
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
    expect(mentionsLink).toHaveClass("px-2");
    expect(mentionsLink).toHaveClass("py-1");
    expect(mentionsLink).not.toHaveClass("rounded-xl");

    const mentionsChip = screen.getByTestId("activity-icon-bg-mentions");
    expect(mentionsChip).toHaveClass("h-7");
    expect(mentionsChip).toHaveClass("w-7");
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

    expect(screen.getByTestId("activity-icon-bg-inbox")).toHaveClass("bg-accent");
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
    expect(favoritesIcon).toHaveAttribute("width", "16");
    expect(favoritesIcon).toHaveAttribute("height", "16");
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
    expect(mentionsLink).toHaveClass("rounded-lg");
    expect(mentionsLink).not.toHaveClass("border");
    expect(mentionsLink).not.toHaveClass("border-border-subtle");
    expect(mentionsLink).not.toHaveClass("border-accent-soft/60");
    expect(mentionsLink).toHaveClass("bg-bg-elevated/60");
    expect(mentionsLink).toHaveClass("bg-card-bg");
    expect(mentionsLink).toHaveAttribute("aria-current", "page");
  });

  it("marks activity shortcut active for org-prefixed activity routes", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter initialEntries={["/org/acme.messenger.com/activity/starred"]}>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const starredLink = screen.getByRole("link", { name: /starred/i });
    expect(starredLink).toHaveClass("border-border-subtle");
    expect(starredLink).toHaveClass("bg-card-bg-active");
    expect(starredLink).toHaveAttribute("aria-current", "page");
  });

  it("renders feed entry as feed route", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const feedLink = screen.getByRole("link", { name: /feed/i });
    expect(feedLink).toHaveAttribute("href", "/feed");
  });
});
