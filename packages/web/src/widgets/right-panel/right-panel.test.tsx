import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import * as muteChat from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { setLocale } from "~/i18n/i18n";
import * as zulipStreams from "~/shared/api/zulip-streams";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { renderWithProviders } from "~/test/render";
import { RightPanel } from "./right-panel.ui";
import type * as ReactRouterDom from "react-router-dom";

const fetchVersionCatalogMock = vi.hoisted(() => vi.fn());
const useAppUpdateMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const statusEmojiPickerMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("~/shared/lib/updater", () => ({
  fetchVersionCatalog: fetchVersionCatalogMock,
  useAppUpdate: useAppUpdateMock,
}));

vi.mock("emoji-picker-react", () => ({
  default: (props: {
    onEmojiClick?: (data: { emoji: string; names?: string[] }) => void;
    className?: string;
  }) => {
    statusEmojiPickerMock(props);
    return (
      <button
        type="button"
        className={props.className}
        onClick={() => props.onEmojiClick?.({ emoji: "🧪", names: ["test_tube"] })}
      >
        Pick status emoji
      </button>
    );
  },
  Theme: {
    LIGHT: "light",
    DARK: "dark",
  },
}));

describe("RightPanel truthfulness", () => {
  afterEach(() => {
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      isLoadingMore: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    useChatInfoStore.getState().clear();
    useMediaViewerStore.getState().close();
    useMuteStore.getState().clear();
    useChatListStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
    });
    useUsersStore.getState().clear();
    useThemeStore.getState().setMode("dark");
    useThemeStore.getState().setPalette("orange-warm");
    useSettingsStore.getState().resetToDefaults();
    fetchVersionCatalogMock.mockReset();
    useAppUpdateMock.mockReset();
    navigateMock.mockReset();
    statusEmojiPickerMock.mockReset();
    act(() => {
      setLocale("en");
    });
    vi.restoreAllMocks();
  });

  it("does not render fake DM action rows", () => {
    renderWithProviders(
      <RightPanel
        title="Alice"
        user={{
          name: "Alice",
          lastSeen: "online",
        }}
      />,
    );

    expect(screen.queryByText(/share contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/edit contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/delete contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/block contact/i)).not.toBeInTheDocument();
  });

  it("does not render fake channel media and call-room rows", () => {
    useCurrentChatMessagesStore.setState({
      context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
      messages: [],
      isLoadingMore: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });

    renderWithProviders(<RightPanel title="engineering" participantsCount={3} onlineCount={1} />);

    expect(screen.queryByText(/36 photos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/call \| #topic 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/call \| #topic 2/i)).not.toBeInTheDocument();
  });

  it("renders settings mode with explicit option selection for language and sound", () => {
    renderWithProviders(<RightPanel mode="settings" title="Settings" />);

    expect(screen.getByRole("heading", { name: /^settings$/i })).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /notification sound/i }));
    });
    expect(screen.getByRole("button", { name: /^digital$/i })).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^digital$/i }));
    });
    expect(useSettingsStore.getState().notificationSound).toBe("digital");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /language/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /русский/i }));
    });
    expect(useSettingsStore.getState().language).toBe("ru");

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /chat list density|плотность списка чатов/i }),
      );
    });
    expect(screen.getByRole("button", { name: /compact|компактная/i })).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /compact|компактная/i }));
    });
    expect(useSettingsStore.getState().chatListDensity).toBe("compact");
  });

  it("opens current user profile from settings personal-info action", () => {
    useChatListStore.getState().setCurrentUserId(42);
    const openUserProfile = vi.fn();

    renderWithProviders(
      <RightDrawerContext.Provider value={{ open: true, setOpen: vi.fn(), openUserProfile }}>
        <RightPanel mode="settings" title="Settings" />
      </RightDrawerContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /personal info/i }));

    expect(openUserProfile).toHaveBeenCalledWith(42);
  });

  it("renders unified authenticated-user menu without duplicate settings entry", () => {
    const onOpenAboutDrawer = vi.fn();
    const onOpenBuildsDrawer = vi.fn();

    const { container } = renderWithProviders(
      <RightDrawerContext.Provider
        value={{ open: true, setOpen: vi.fn(), openUserProfile: vi.fn() }}
      >
        <RightPanel
          mode="user-menu"
          title="Profile"
          onOpenAboutDrawer={onOpenAboutDrawer}
          onOpenBuildsDrawer={onOpenBuildsDrawer}
        />
      </RightDrawerContext.Provider>,
    );

    expect(screen.queryByRole("heading", { name: /^profile$/i })).not.toBeInTheDocument();
    expect(container.querySelector("header.border-b.border-border-subtle")).toBeNull();
    expect(screen.queryByRole("button", { name: /^settings$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /folder layout/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /select build/i }));
    expect(onOpenBuildsDrawer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /app version/i }));
    expect(onOpenAboutDrawer).toHaveBeenCalledTimes(1);
  });

  it("opens user-status dialog from authenticated user menu", () => {
    renderWithProviders(<RightPanel mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));

    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    expect(statusDialog).toBeInTheDocument();
    expect(within(statusDialog).getByRole("textbox", { name: /^status$/i })).toBeInTheDocument();
    expect(within(statusDialog).getByRole("checkbox", { name: /away/i })).toBeInTheDocument();
  });

  it("lets users pick any emoji in status dialog", () => {
    renderWithProviders(<RightPanel mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));

    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    fireEvent.click(within(statusDialog).getByRole("button", { name: /choose emoji/i }));
    fireEvent.click(within(statusDialog).getByRole("button", { name: /pick status emoji/i }));

    expect(within(statusDialog).getByText("🧪")).toBeInTheDocument();
  });

  it("renders current server as a regular scrollable menu item", () => {
    const instanceId = useInstancesStore.getState().addInstance({
      realm: "https://chat.example.test",
      email: "qa-user@example.test",
      apiKey: "",
    });
    useInstancesStore.getState().setCurrentInstanceId(instanceId);

    renderWithProviders(<RightPanel mode="user-menu" title="Profile" />);

    const currentServerItem = screen.getByTestId("user-menu-current-server-item");
    expect(currentServerItem).toHaveClass("px-2.5");
    expect(currentServerItem).toHaveClass("py-2.5");
    expect(currentServerItem).not.toHaveClass("rounded-lg");
    expect(currentServerItem).not.toHaveClass("p-2.5");
    expect(currentServerItem.closest(".overflow-y-auto")).not.toBeNull();
  });

  it("renders select-build mode as a right sidebar with downloadable versions list", async () => {
    useAppUpdateMock.mockReturnValue({
      status: "idle",
      check: vi.fn(),
      install: vi.fn(),
    });
    fetchVersionCatalogMock.mockResolvedValue({
      latest: {
        stable: { version: "2.0.0", shortVersion: "2.0.0" },
        dev: { version: "2.1.0-dev.4", shortVersion: "2.1.0-dev.4" },
      },
      versions: {
        stable: [
          { version: "2.0.0", shortVersion: "2.0.0", linux: { url: "https://example/stable" } },
        ],
        dev: [
          {
            version: "2.1.0-dev.4",
            shortVersion: "2.1.0-dev.4",
            linux: { url: "https://example/dev" },
          },
        ],
      },
    });

    renderWithProviders(<RightPanel mode="builds" title="Select build" />);

    expect(screen.getByRole("heading", { name: /select build/i })).toBeInTheDocument();
    expect(await screen.findByText("2.0.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stable/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dev/i })).toBeInTheDocument();
  });

  it("opens select-build sidebar from user menu without external callback", async () => {
    useAppUpdateMock.mockReturnValue({
      status: "idle",
      check: vi.fn(),
      install: vi.fn(),
    });
    fetchVersionCatalogMock.mockResolvedValue({
      latest: {
        stable: { version: "2.0.0", shortVersion: "2.0.0" },
        dev: { version: "2.1.0-dev.4", shortVersion: "2.1.0-dev.4" },
      },
      versions: {
        stable: [
          { version: "2.0.0", shortVersion: "2.0.0", linux: { url: "https://example/stable" } },
        ],
        dev: [
          {
            version: "2.1.0-dev.4",
            shortVersion: "2.1.0-dev.4",
            linux: { url: "https://example/dev" },
          },
        ],
      },
    });

    renderWithProviders(<RightPanel mode="user-menu" title="Profile" />);
    fireEvent.click(screen.getByRole("button", { name: /select build/i }));

    expect(await screen.findByRole("heading", { name: /select build/i })).toBeInTheDocument();
    expect(screen.getByText("2.0.0")).toBeInTheDocument();
  });

  it("renders about mode with app version, technical details, and licenses link", () => {
    renderWithProviders(<RightPanel mode="about" title="About" />);

    expect(screen.getByRole("heading", { name: /app version/i })).toBeInTheDocument();
    expect(screen.getByText(/current version:/i)).toBeInTheDocument();
    expect(screen.getByText(/technical details/i)).toBeInTheDocument();
    expect(screen.getByText(/environment/i)).toBeInTheDocument();
    expect(screen.getByText(/build type/i)).toBeInTheDocument();
    expect(screen.getByText(/runtime/i)).toBeInTheDocument();
    expect(screen.getByText(/platform/i)).toBeInTheDocument();
    expect(screen.getByText(/base url/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open source licenses/i })).toBeInTheDocument();
  });

  it("routes to common group dm when a common-group row is clicked", () => {
    const onSelectCommonGroup = vi.fn();

    renderWithProviders(
      <RightPanel
        title="Alice"
        user={{
          name: "Alice",
          commonGroups: [{ name: "Design Team", slug: "7,42,99", unread: 1 }],
        }}
        onSelectCommonGroup={onSelectCommonGroup}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /design team/i }));
    expect(onSelectCommonGroup).toHaveBeenCalledWith("7,42,99");
  });

  it("renders extended dm profile rows when user profile fields are provided", () => {
    const user = {
      name: "Alice",
      userId: 42,
      email: "alice@example.com",
      jobTitle: "Senior Engineer",
      manager: "Bob Manager",
      localTime: "10:45",
    };

    renderWithProviders(<RightPanel title="Alice" user={user} />);

    expect(screen.getByText(/^user id$/i)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText(/^job title$/i)).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText(/^manager$/i)).toBeInTheDocument();
    expect(screen.getByText("Bob Manager")).toBeInTheDocument();
    expect(screen.getByText(/^local time$/i)).toBeInTheDocument();
    expect(screen.getByText("10:45")).toBeInTheDocument();
  });

  it("renders profile contact rows with tel/profile links and plain email text", () => {
    const user = {
      name: "Alice",
      userId: 42,
      email: "alice@example.com",
      phone: "+1 (555) 010-1000",
      timezone: "Europe/Berlin",
      dateJoined: "2025-01-10",
      isBot: false,
      isActive: true,
      profileLink: "https://chat.example.com/#user/42",
    };

    renderWithProviders(<RightPanel title="Alice" user={user} />);

    expect(screen.queryByRole("link", { name: "alice@example.com" })).not.toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+1 (555) 010-1000" })).toHaveAttribute(
      "href",
      "tel:+15550101000",
    );
    expect(screen.getByRole("link", { name: "42" })).toHaveAttribute(
      "href",
      "https://chat.example.com/#user/42",
    );
    expect(screen.getByText(/^timezone$/i)).toBeInTheDocument();
    expect(screen.getByText("Europe/Berlin")).toBeInTheDocument();
    const joinedLabel = screen.getByText(/^joined$/i);
    expect(joinedLabel.closest("li")).toHaveTextContent("2025");
    expect(screen.getByText(/^account type$/i)).toBeInTheDocument();
    expect(screen.getByText("Human")).toBeInTheDocument();
    expect(screen.getByText(/^account status$/i)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("copies email and user id from profile contact rows", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    renderWithProviders(
      <RightPanel
        title="Alice"
        user={{
          name: "Alice Example",
          userId: 42,
          email: "alice@example.com",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy email/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy user id/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("alice@example.com");
      expect(writeTextMock).toHaveBeenCalledWith("42");
    });
  });

  it("opens avatar preview in original size on avatar click", () => {
    renderWithProviders(
      <RightPanel
        title="Alice"
        user={{
          name: "Alice Example",
          avatarUrl: "https://cdn.example.com/avatars/alice.png",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open avatar preview/i }));

    const viewerState = useMediaViewerStore.getState();
    expect(viewerState.isOpen).toBe(true);
    expect(viewerState.items).toHaveLength(1);
    expect(viewerState.items[0]?.type).toBe("image");
    expect(viewerState.items[0]?.url).toContain("https://cdn.example.com/avatars/alice.png");
    expect(viewerState.items[0]?.url).toContain("_av=");
  });

  it("renders direct-message button in user profile and opens dm by user id", () => {
    const onOpenDirectMessage = vi.fn();

    renderWithProviders(
      <RightPanel
        title="Alice"
        user={{
          name: "Alice",
          userId: 42,
        }}
        onOpenDirectMessage={onOpenDirectMessage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open direct messages/i }));
    expect(onOpenDirectMessage).toHaveBeenCalledWith(42);
  });

  it("renders group dm member info without channel-only sections", () => {
    act(() => {
      useChatInfoStore.getState().setData({
        type: "dm",
        name: "Alice, Bob, Me",
        memberCount: 3,
        onlineCount: 2,
        description: null,
        isMuted: false,
        members: [
          {
            userId: 1,
            fullName: "Alice",
            email: "alice@example.com",
            avatarUrl: null,
            isOnline: true,
          },
          { userId: 2, fullName: "Bob", email: "", avatarUrl: null, isOnline: false },
        ],
      });
    });

    act(() => {
      renderWithProviders(<RightPanel title="Group chat" />);
    });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText(/channel info/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^topics$/i)).not.toBeInTheDocument();
  });

  it("shows custom user statuses in group dm members list", () => {
    act(() => {
      useUsersStore.getState().mergeUser({
        user_id: 1,
        full_name: "Alice",
        status: {
          text: "Working remotely",
          emojiCode: "1f3e0",
          away: false,
        },
        statusFetchedAt: Date.now(),
      });
      useChatInfoStore.getState().setData({
        type: "dm",
        name: "Alice, Bob, Me",
        memberCount: 2,
        onlineCount: 1,
        description: null,
        isMuted: false,
        members: [
          {
            userId: 1,
            fullName: "Alice",
            email: "alice@example.com",
            avatarUrl: null,
            isOnline: true,
          },
          { userId: 2, fullName: "Bob", email: "", avatarUrl: null, isOnline: false },
        ],
      });
    });

    renderWithProviders(<RightPanel title="Group chat" />);

    expect(screen.getByText("🏠 Working remotely")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("uses semantic text tokens in dm info panel for light themes", () => {
    useThemeStore.getState().setMode("light");
    useThemeStore.getState().setPalette("blue-cold");

    renderWithProviders(
      <RightPanel
        title="Alice"
        user={{
          name: "Alice",
          email: "alice@example.com",
        }}
      />,
    );

    expect(screen.getByText(/^information$/i)).toHaveClass("text-text-primary");
    expect(screen.getByText("Alice")).toHaveClass("text-text-primary");
    expect(screen.getByText(/^email$/i)).toHaveClass("text-text-secondary");
  });

  it("places profile header inside the same scroll container", () => {
    renderWithProviders(
      <RightPanel
        title="Alice"
        user={{
          name: "Alice",
          email: "alice@example.com",
        }}
      />,
    );

    const infoHeading = screen.getByRole("heading", { name: /information/i });
    expect(infoHeading.closest(".overflow-y-auto")).not.toBeNull();
  });

  it("shows retry error and does not mutate local mute state when mute API fails", async () => {
    useCurrentChatMessagesStore.setState({
      context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
      messages: [],
      isLoadingMore: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    vi.spyOn(muteChat, "muteStream").mockResolvedValue(false);

    renderWithProviders(<RightPanel title="engineering" participantsCount={3} onlineCount={1} />);

    fireEvent.click(screen.getByRole("button", { name: /mute notifications/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(useMuteStore.getState().isStreamMuted(10)).toBe(false);
  });

  it("renders stream description and topic rows from chat info data", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.getState().setData({
        type: "stream",
        name: "engineering",
        memberCount: 3,
        onlineCount: 1,
        members: [],
        description: "Engineering stream for product delivery",
        isMuted: false,
        topics: [
          { name: "release", unreadCount: 2 },
          { name: "infra", unreadCount: 0 },
        ],
      });
    });

    renderWithProviders(<RightPanel title="engineering" participantsCount={3} onlineCount={1} />);

    expect(screen.getByText("Engineering stream for product delivery")).toBeInTheDocument();
    expect(screen.getByText("release")).toBeInTheDocument();
    expect(screen.getByText("infra")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("navigates to the selected stream topic from right-panel topic list", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.getState().setData({
        type: "stream",
        name: "engineering",
        memberCount: 3,
        onlineCount: 1,
        members: [],
        description: "Engineering stream for product delivery",
        isMuted: false,
        topics: [{ name: "release", unreadCount: 2 }],
      });
    });

    renderWithProviders(<RightPanel title="engineering" participantsCount={3} onlineCount={1} />);

    fireEvent.click(screen.getByRole("button", { name: /release/i }));

    expect(navigateMock).toHaveBeenCalledWith(
      withCurrentOrgRoute(`/stream/10-engineering/topic/${encodeURIComponent("release")}`),
    );
  });

  it("opens user profile from stream members list", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.getState().setData({
        type: "stream",
        name: "engineering",
        memberCount: 1,
        onlineCount: 1,
        members: [
          {
            userId: 77,
            fullName: "Alice Cooper",
            email: "alice@example.com",
            avatarUrl: null,
            isOnline: true,
          },
        ],
        description: null,
        isMuted: false,
        topics: [],
      });
    });
    const openUserProfile = vi.fn();

    renderWithProviders(
      <RightDrawerContext.Provider value={{ open: true, setOpen: vi.fn(), openUserProfile }}>
        <RightPanel title="engineering" participantsCount={1} onlineCount={1} />
      </RightDrawerContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /open profile: alice cooper/i }));

    expect(openUserProfile).toHaveBeenCalledWith(77);
  });

  it("shows custom user statuses in stream members list", () => {
    act(() => {
      useUsersStore.getState().mergeUser({
        user_id: 77,
        full_name: "Alice Cooper",
        status: {
          text: "In focus",
          emojiCode: "1f4ac",
          away: false,
        },
        statusFetchedAt: Date.now(),
      });
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.getState().setData({
        type: "stream",
        name: "engineering",
        memberCount: 1,
        onlineCount: 1,
        members: [
          {
            userId: 77,
            fullName: "Alice Cooper",
            email: "alice@example.com",
            avatarUrl: null,
            isOnline: true,
          },
        ],
        description: null,
        isMuted: false,
        topics: [],
      });
    });

    renderWithProviders(<RightPanel title="engineering" participantsCount={1} onlineCount={1} />);

    expect(screen.getByText("💬 In focus")).toBeInTheDocument();
  });

  it("hides channel edit/delete actions for member role", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.getState().setData({
        type: "stream",
        name: "engineering",
        memberCount: 3,
        onlineCount: 1,
        members: [],
        description: "Engineering stream",
        isMuted: false,
        topics: [],
      });
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member", role: 400 });
    });

    renderWithProviders(<RightPanel title="engineering" participantsCount={3} onlineCount={1} />);

    expect(screen.queryByRole("button", { name: /edit channel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete channel/i })).not.toBeInTheDocument();
  });

  it("shows channel edit/delete actions for admin role and submits edit changes", async () => {
    const updateStreamSpy = vi.spyOn(zulipStreams, "updateStream").mockResolvedValue(true);

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.getState().setData({
        type: "stream",
        name: "engineering",
        memberCount: 3,
        onlineCount: 1,
        members: [],
        description: "Engineering stream",
        isMuted: false,
        topics: [],
      });
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });
    });

    renderWithProviders(<RightPanel title="engineering" participantsCount={3} onlineCount={1} />);

    expect(screen.getByRole("button", { name: /edit channel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete channel/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit channel/i }));

    fireEvent.change(screen.getByLabelText(/channel name/i), {
      target: { value: "platform" },
    });
    fireEvent.change(screen.getByLabelText(/^description/i), {
      target: { value: "Platform discussions" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateStreamSpy).toHaveBeenCalledWith(10, {
        name: "platform",
        description: "Platform discussions",
      });
    });
  });
});
