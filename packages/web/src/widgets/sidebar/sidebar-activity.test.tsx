import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { countMentionsUnread } from "~/entities/chat-list/chat-list-sidebar-totals.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { SidebarActivity } from "./sidebar-activity.ui";
import { MY_ACTIVITY } from "./sidebar.lib";

const INBOX_COUNT_ONE_MESSAGES = [
  {
    id: 31,
    sender_id: 42,
    sender_full_name: "Alice",
    content: "dm unread",
    timestamp: 31,
    type: "private" as const,
    display_recipient: [
      { id: 7, full_name: "Me", email: "me@example.com" },
      { id: 42, full_name: "Alice", email: "alice@example.com" },
    ],
    flags: [],
  },
];

const INBOX_COUNT_THREE_MESSAGES = [
  {
    id: 11,
    sender_id: 42,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "bugs",
    content: "stream unread 1",
    timestamp: 11,
    type: "stream" as const,
    display_recipient: "engineering",
    flags: [],
  },
  {
    id: 12,
    sender_id: 43,
    sender_full_name: "Bob",
    stream_id: 10,
    subject: "bugs",
    content: "stream unread 2",
    timestamp: 12,
    type: "stream" as const,
    display_recipient: "engineering",
    flags: [],
  },
  {
    id: 13,
    sender_id: 42,
    sender_full_name: "Alice",
    content: "dm unread",
    timestamp: 13,
    type: "private" as const,
    display_recipient: [
      { id: 7, full_name: "Me", email: "me@example.com" },
      { id: 42, full_name: "Alice", email: "alice@example.com" },
    ],
    flags: [],
  },
];

describe("SidebarActivity", () => {
  afterEach(() => {
    useActivityStore.getState().clear();
    useChatListStore.getState().clear();
    useDraftStore.getState().clear();
    useMuteStore.getState().clear();
    useSettingsStore.getState().resetToDefaults();
  });

  it("shows mention and draft badges from current store state", () => {
    const lastAppliedMessages = [
      {
        id: 1,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "hello",
        timestamp: 1,
        type: "stream" as const,
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
        type: "stream" as const,
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
        type: "stream" as const,
        display_recipient: "engineering",
        flags: ["mentioned"],
      },
    ];
    useChatListStore.setState({
      currentUserId: 7,
      lastAppliedMessages,
      mentionsUnreadCount: countMentionsUnread(lastAppliedMessages, 7),
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

  it("shows inbox badge from summed unread stream and dm counts in expanded view", () => {
    useChatListStore.getState().setFromMessages(INBOX_COUNT_THREE_MESSAGES, 7);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxRow = screen.getByRole("link", { name: /inbox/i });
    expect(within(inboxRow).getByText("3")).toBeInTheDocument();
  });

  it("excludes muted stream unread from expanded inbox badge", () => {
    useChatListStore.getState().setFromMessages(INBOX_COUNT_THREE_MESSAGES, 7);
    useMuteStore.getState().muteStream(10);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxRow = screen.getByRole("link", { name: /inbox/i });
    expect(within(inboxRow).getByText("1")).toBeInTheDocument();
    expect(within(inboxRow).queryByText("3")).not.toBeInTheDocument();
  });

  it("shows favorites badge in expanded view from starred summary", () => {
    useChatListStore.setState({ currentUserId: 7, lastAppliedMessages: [] });
    useActivityStore.getState().setStarredSummaryFromRegisterMessageIds([1, 2, 3, 4]);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const favoritesRow = screen.getByRole("link", { name: /starred/i });
    expect(within(favoritesRow).getByText("4")).toBeInTheDocument();
  });

  it("renders compact activity shortcuts with badges when collapsed", () => {
    const lastAppliedMessages = [
      {
        id: 1,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "hello",
        timestamp: 1,
        type: "stream" as const,
        display_recipient: "engineering",
        flags: ["mentioned"],
      },
    ];
    useChatListStore.setState({
      currentUserId: 7,
      lastAppliedMessages,
      mentionsUnreadCount: countMentionsUnread(lastAppliedMessages, 7),
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
    expect(within(mentionsCompactLink).getByText("1")).toHaveClass("text-text-primary", "h-4");
    expect(within(draftsCompactLink).getByText("2")).toHaveClass("text-text-primary", "h-4");
  });

  it("shows compact inbox badge from summed unread stream and dm counts", () => {
    useChatListStore.getState().setFromMessages(INBOX_COUNT_THREE_MESSAGES, 7);

    render(
      <MemoryRouter>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxLink = screen.getByRole("link", { name: /inbox/i });
    expect(within(inboxLink).getByText("3")).toHaveClass("text-text-primary", "h-4");
  });

  it("keeps compact activity badges above adjacent button hovers", () => {
    useChatListStore.getState().setFromMessages(INBOX_COUNT_THREE_MESSAGES, 7);
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
    useActivityStore.getState().setStarredSummaryFromRegisterMessageIds([1, 2, 3, 4, 5, 6, 7]);

    render(
      <MemoryRouter>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const favoritesLink = screen.getByRole("link", { name: /starred/i });
    expect(within(favoritesLink).getByText("7")).not.toHaveClass("opacity-70");
  });

  it("hides inbox badge when unread total is zero", () => {
    useChatListStore.getState().setFromMessages([], 7);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    const inboxRow = screen.getByRole("link", { name: /inbox/i });
    expect(inboxRow.querySelector(".bg-sidebar-unread")).toBeNull();
  });

  it("updates inbox badge when chat-list unread totals change", () => {
    useChatListStore.getState().setFromMessages([], 7);

    render(
      <MemoryRouter>
        <SidebarActivity open onToggle={() => {}} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /inbox/i }).querySelector(".bg-sidebar-unread"),
    ).toBeNull();

    act(() => {
      useChatListStore.getState().setFromMessages(INBOX_COUNT_ONE_MESSAGES, 7);
    });
    expect(within(screen.getByRole("link", { name: /inbox/i })).getByText("1")).toBeInTheDocument();

    act(() => {
      useChatListStore.getState().setFromMessages(INBOX_COUNT_THREE_MESSAGES, 7);
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
      <MemoryRouter initialEntries={["/org/acme.zulip.com/activity/starred"]}>
        <SidebarActivity open={false} onToggle={() => {}} />
      </MemoryRouter>,
    );

    const starredLink = screen.getByRole("link", { name: /starred/i });
    expect(starredLink).toHaveClass("border-border-subtle");
    expect(starredLink).toHaveClass("bg-card-bg-active");
    expect(starredLink).toHaveAttribute("aria-current", "page");
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
