import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { buildDmTypingChatKey } from "~/features/typing-indicator/typing-key";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import { SidebarDmList } from "./sidebar-dm-list.ui";
import type { SidebarChat } from "./sidebar.types";

const RECENT_DMS: Extract<SidebarChat, { type: "dm" }>[] = [
  {
    type: "dm",
    id: 42,
    name: "Alice",
    slug: "42-alice",
    lastMessage: "Hello",
    badge: 3,
    time: "10:13",
  },
  {
    type: "dm",
    id: 77,
    name: "Bob",
    slug: "77-bob",
    lastMessage: "Ping",
    badge: 0,
    time: "10:10",
  },
];

describe("SidebarDmList", () => {
  afterEach(() => {
    useUsersStore.getState().clear();
    useTypingIndicatorStore.getState().clearAll();
    useChatListStore.setState({ currentUserId: null });
  });

  it("switches between recent and all users tabs", () => {
    useChatListStore.setState({ currentUserId: 999 });
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 999, full_name: "Self User", email: "self@example.com" }),
        createUser({ user_id: 42, full_name: "Alice", email: "alice@example.com" }),
        createUser({ user_id: 77, full_name: "Bob", email: "bob@example.com" }),
        createUser({ user_id: 88, full_name: "Carol", email: "carol@example.com" }),
      ]);

    renderWithProviders(<SidebarDmList activeDmId={null} dms={RECENT_DMS} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /all users/i }));

    const allLinks = screen.getAllByRole("link");
    expect(allLinks[0]?.textContent).toContain("Alice");
    expect(allLinks[1]?.textContent).toContain("Bob");
    expect(allLinks[2]?.textContent).toContain("Carol");
    expect(screen.queryByText("Self User")).not.toBeInTheDocument();
  });

  it("shows typing text for recent DM when partner is typing", () => {
    useChatListStore.setState({ currentUserId: 100 });
    const key = buildDmTypingChatKey([42], 100);
    if (key == null) {
      throw new Error("Expected typing key");
    }
    useTypingIndicatorStore.getState().setTyping(key, 42, true);

    renderWithProviders(<SidebarDmList activeDmId={42} dms={RECENT_DMS} />);

    expect(screen.getByText(/^typing$/i)).toBeInTheDocument();
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("renders partner avatar image in recent DMs when user has avatar_url", () => {
    useChatListStore.setState({ currentUserId: 999 });
    useUsersStore.getState().mergeUsers([
      createUser({ user_id: 999, full_name: "Self User", email: "self@example.com" }),
      createUser({
        user_id: 42,
        full_name: "Alice",
        email: "alice@example.com",
        avatar_url: "https://cdn.example.com/u42.png",
      }),
      createUser({ user_id: 77, full_name: "Bob", email: "bob@example.com" }),
    ]);

    const { container } = renderWithProviders(<SidebarDmList activeDmId={null} dms={RECENT_DMS} />);

    const avatarSrcs = [...container.querySelectorAll("img")].map((el) => el.getAttribute("src"));
    const aliceSrc = avatarSrcs.find((s) => s?.includes("cdn.example.com"));
    expect(aliceSrc).toBeTruthy();
    expect(aliceSrc).toContain("_av=");
  });

  it("prefers user avatar over chat avatar snapshot in recent DMs", () => {
    useChatListStore.setState({ currentUserId: 999 });
    useUsersStore.getState().mergeUsers([
      createUser({ user_id: 999, full_name: "Self User", email: "self@example.com" }),
      createUser({
        user_id: 42,
        full_name: "Alice",
        email: "alice@example.com",
        avatar_url: "https://live.example.com/u42.png",
      }),
    ]);

    const dmsWithStaleAvatar: Extract<SidebarChat, { type: "dm" }>[] = [
      {
        type: "dm",
        id: 42,
        name: "Alice",
        slug: "42-alice",
        lastMessage: "Hello",
        badge: 3,
        time: "10:13",
        avatar_url: "https://stale.example.com/chat-avatar.png",
      },
    ];

    const { container } = renderWithProviders(
      <SidebarDmList activeDmId={null} dms={dmsWithStaleAvatar} />,
    );

    const avatarSrc = container.querySelector("img")?.getAttribute("src");
    expect(avatarSrc).toContain("live.example.com/u42.png");
    expect(avatarSrc).not.toContain("stale.example.com/chat-avatar.png");
  });

  it("uses tokenized compact typography classes in recent dm rows", () => {
    renderWithProviders(<SidebarDmList activeDmId={42} dms={RECENT_DMS} />);

    expect(screen.getByText("Hello")).toHaveClass("text-[11px]");
    expect(screen.getByText("Hello")).toHaveClass("text-text-secondary");
    expect(screen.getByText("10:13")).toHaveClass("text-xs");
  });

  it("shows user presence indicators in recent and all users tabs", () => {
    const now = Math.floor(Date.now() / 1000);
    useChatListStore.setState({ currentUserId: 999 });
    useUsersStore.getState().mergeUsers([
      createUser({ user_id: 999, full_name: "Self User", email: "self@example.com" }),
      createUser({
        user_id: 42,
        full_name: "Alice",
        email: "alice@example.com",
        presence: { status: "active", timestamp: now },
      }),
      createUser({
        user_id: 77,
        full_name: "Bob",
        email: "bob@example.com",
        presence: { status: "idle", timestamp: now },
      }),
    ]);

    renderWithProviders(<SidebarDmList activeDmId={42} dms={RECENT_DMS} />);

    expect(screen.getByRole("status", { name: /online/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /away/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /all users/i }));

    expect(screen.getByRole("status", { name: /online/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /away/i })).toBeInTheDocument();
  });

  it("shows status emoji next to name but not status text in recent or all users rows", () => {
    useChatListStore.setState({ currentUserId: 999 });
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 999, full_name: "Self User", email: "self@example.com" }),
        createUser({ user_id: 42, full_name: "Alice", email: "alice@example.com" }),
        createUser({ user_id: 77, full_name: "Bob", email: "bob@example.com" }),
      ]);
    useUsersStore
      .getState()
      .setStatus(42, { text: "Deep work", emojiName: "speech_balloon", away: false });
    useUsersStore.getState().setStatus(77, { text: "WFH", emojiName: "house", away: false });

    renderWithProviders(<SidebarDmList activeDmId={42} dms={RECENT_DMS} />);

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByText(/Deep work/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("sidebar-user-status-emoji")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /all users/i }));

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/Deep work/)).not.toBeInTheDocument();
    expect(screen.queryByText(/WFH/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("sidebar-user-status-emoji").length).toBeGreaterThanOrEqual(2);
  });
});
