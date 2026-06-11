import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { useAddStreamMembersStore } from "~/features/add-stream-members/add-stream-members.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import * as muteChat from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useRemoveStreamMembersStore } from "~/features/remove-stream-members/remove-stream-members.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { setLocale, t } from "~/i18n/i18n";
import * as zulipStreams from "~/shared/api/zulip-streams";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { resetRealmEmojisCacheForTests } from "~/shared/lib/realm-emojis-cache";
import { renderWithProviders } from "~/test/render";
import { RightPanelShell } from "./right-panel-shell.ui";
import type * as ReactRouterDom from "react-router-dom";

const fetchVersionCatalogMock = vi.hoisted(() => vi.fn());
const useAppUpdateMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const statusEmojiPickerMock = vi.hoisted(() => vi.fn());
const fetchRealmEmojisMock = vi.hoisted(() => vi.fn());
const updateOwnStatusMock = vi.hoisted(() => vi.fn());

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

vi.mock("~/shared/api/zulip-users", async () => {
  const actual = await vi.importActual("~/shared/api/zulip-users");
  return {
    ...actual,
    fetchRealmEmojis: (...args: unknown[]) => fetchRealmEmojisMock(...args),
  };
});

vi.mock("~/entities/user/api/user.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/entities/user/api/user.api")>();
  return {
    ...actual,
    updateOwnStatus: (...args: unknown[]) => updateOwnStatusMock(...args),
  };
});

vi.mock("emoji-picker-react", () => ({
  default: (props: {
    onEmojiClick?: (data: { emoji: string; names?: string[] }) => void;
    className?: string;
    customEmojis?: unknown[];
    emojiStyle?: string;
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
  EmojiStyle: {
    NATIVE: "native",
  },
}));

describe("RightPanel truthfulness", () => {
  beforeEach(() => {
    resetRealmEmojisCacheForTests();
  });

  afterEach(() => {
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      isLoadingMore: false,
      isLoadingNewer: false,
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
    useUserGroupsStore.getState().clear();
    useAddStreamMembersStore.setState({
      open: false,
      streamId: null,
      streamName: "",
      existingMemberIds: [],
      query: "",
      selectedIds: [],
      submitting: false,
      error: null,
      lastResult: null,
    });
    useRemoveStreamMembersStore.getState().clear();
    useThemeStore.getState().setMode("dark");
    useThemeStore.getState().setPalette("orange-warm");
    useSettingsStore.getState().resetToDefaults();
    fetchVersionCatalogMock.mockReset();
    useAppUpdateMock.mockReset();
    navigateMock.mockReset();
    statusEmojiPickerMock.mockReset();
    fetchRealmEmojisMock.mockReset();
    fetchRealmEmojisMock.mockResolvedValue([]);
    updateOwnStatusMock.mockReset();
    updateOwnStatusMock.mockResolvedValue({ ok: true, status: null });
    act(() => {
      setLocale("en");
    });
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(null);
    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    vi.restoreAllMocks();
  });

  it("does not render fake DM action rows", () => {
    renderWithProviders(
      <RightPanelShell
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

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.queryByText(/36 photos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/call \| topic 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/call \| topic 2/i)).not.toBeInTheDocument();
  });

  it("renders settings mode with explicit option selection for language and sound", () => {
    renderWithProviders(<RightPanelShell mode="settings" title="Settings" />);

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

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /auto sign-out|автовыход/i }));
    });
    expect(screen.getByRole("button", { name: /^never$|^никогда$/i })).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^never$|^никогда$/i }));
    });
    expect(useSettingsStore.getState().authIdleTimeout).toBe("never");
  });

  it("opens current user profile from settings personal-info action", () => {
    useChatListStore.getState().setCurrentUserId(42);
    const openUserProfile = vi.fn();

    renderWithProviders(
      <RightDrawerContext.Provider value={{ open: true, setOpen: vi.fn(), openUserProfile }}>
        <RightPanelShell mode="settings" title="Settings" />
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
        <RightPanelShell
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
    expect(screen.getByRole("button", { name: /auto sign-out/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /auto sign-out/i }));
    fireEvent.click(screen.getByRole("button", { name: /^never$/i }));
    expect(useSettingsStore.getState().authIdleTimeout).toBe("never");

    fireEvent.click(screen.getByRole("button", { name: /select build/i }));
    expect(onOpenBuildsDrawer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /app version/i }));
    expect(onOpenAboutDrawer).toHaveBeenCalledTimes(1);
  });

  it("opens user-status dialog from authenticated user menu", () => {
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));

    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    expect(statusDialog).toBeInTheDocument();
    expect(within(statusDialog).getByRole("textbox", { name: /^status$/i })).toBeInTheDocument();
    expect(within(statusDialog).getByRole("checkbox", { name: /away/i })).toBeInTheDocument();
  });

  it("lets users pick any emoji in status dialog", async () => {
    const realmEmoji = {
      id: "42",
      names: ["party_parrot"],
      imgUrl: "https://chat.example.test/user_avatars/realm/42.png",
    };
    fetchRealmEmojisMock.mockResolvedValue([realmEmoji]);

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));

    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    fireEvent.click(within(statusDialog).getByRole("button", { name: /choose emoji/i }));
    await waitFor(() => {
      expect(fetchRealmEmojisMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      const props = statusEmojiPickerMock.mock.calls.at(-1)?.[0] as
        | { customEmojis?: unknown[]; emojiStyle?: string }
        | undefined;
      expect(props?.customEmojis).toEqual([realmEmoji]);
      expect(props?.emojiStyle).toBe("native");
    });
    fireEvent.click(within(statusDialog).getByRole("button", { name: /pick status emoji/i }));

    expect(within(statusDialog).getByText("🧪")).toBeInTheDocument();
  });

  it("keeps status dialog open and preserves store status when clear fails", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      status: {
        text: "Busy",
        away: false,
      },
      statusFetchedAt: Date.now(),
    });
    updateOwnStatusMock.mockResolvedValue({
      ok: false,
      status: 503,
      kind: "transient",
      message: "Server error",
    });

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));

    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    fireEvent.click(within(statusDialog).getByRole("button", { name: /clear/i }));
    fireEvent.click(within(statusDialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnStatusMock).toHaveBeenCalledWith({
        text: "",
        emojiName: undefined,
        away: false,
      });
    });
    expect(screen.getByRole("dialog", { name: /^status$/i })).toBeInTheDocument();
    expect(useUsersStore.getState().getUser(42)?.status).toEqual({
      text: "Busy",
      away: false,
    });
  });

  it("renders current server as a regular scrollable menu item", () => {
    const instanceId = useInstancesStore.getState().addInstance({
      realm: "https://chat.example.test",
      email: "qa-user@example.test",
      apiKey: "",
    }).id;
    useInstancesStore.getState().setCurrentInstanceId(instanceId);

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

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

    renderWithProviders(<RightPanelShell mode="builds" title="Select build" />);

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

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);
    fireEvent.click(screen.getByRole("button", { name: /select build/i }));

    expect(await screen.findByRole("heading", { name: /select build/i })).toBeInTheDocument();
    expect(screen.getByText("2.0.0")).toBeInTheDocument();
  });

  it("renders about mode with app version, technical details, and licenses link", () => {
    renderWithProviders(<RightPanelShell mode="about" title="About" />);

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
      <RightPanelShell
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

    renderWithProviders(<RightPanelShell title="Alice" user={user} />);

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

    renderWithProviders(<RightPanelShell title="Alice" user={user} />);

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
      <RightPanelShell
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
      <RightPanelShell
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
      <RightPanelShell
        title="Alice"
        user={{
          name: "Alice",
          userId: 42,
        }}
        onOpenDirectMessage={onOpenDirectMessage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^message$/i }));
    expect(onOpenDirectMessage).toHaveBeenCalledWith(42);
  });

  it("renders call button when dm call bridge is registered and invokes handler", () => {
    const onOpenDirectMessage = vi.fn();
    const invokeDmCall = vi.fn();
    useChatListStore.getState().setCurrentUserId(7);
    useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(invokeDmCall);

    renderWithProviders(
      <RightPanelShell
        title="Alice"
        user={{
          name: "Alice",
          userId: 42,
        }}
        onOpenDirectMessage={onOpenDirectMessage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^call$/i }));
    expect(invokeDmCall).toHaveBeenCalledTimes(1);
    expect(invokeDmCall).toHaveBeenCalledWith(42);
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
      renderWithProviders(<RightPanelShell title="Group chat" />);
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

    renderWithProviders(<RightPanelShell title="Group chat" />);

    expect(screen.getByText("🏠 Working remotely")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("uses semantic text tokens in dm info panel for light themes", () => {
    useThemeStore.getState().setMode("light");
    useThemeStore.getState().setPalette("blue-cold");

    renderWithProviders(
      <RightPanelShell
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
      <RightPanelShell
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

  it("shows retry error and does not mutate local notification state when API fails", async () => {
    useCurrentChatMessagesStore.setState({
      context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
      messages: [],
      isLoadingMore: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    vi.spyOn(muteChat, "setStreamNotificationLevel").mockResolvedValue(false);

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /muted/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(useMuteStore.getState().getStreamNotificationLevel(10)).toBe("default");
  });

  it("renders default topic label for legacy general chat alias in chat info data", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "" },
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
        description: null,
        isMuted: false,
        topics: [{ name: "general chat", unreadCount: 0 }],
      });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.getByText(t("chat.generalChat"))).toBeInTheDocument();
    expect(screen.queryByText("general chat")).not.toBeInTheDocument();
  });

  it("renders default topic label for empty topic name in chat info data", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "" },
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
        description: null,
        isMuted: false,
        topics: [{ name: "", unreadCount: 1 }],
      });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.getByText(t("chat.generalChat"))).toBeInTheDocument();
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

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.getByText("Engineering stream for product delivery")).toBeInTheDocument();
    expect(screen.getByText("release")).toBeInTheDocument();
    expect(screen.getByText("infra")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the system general-chat topic separately and only it in italic", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "" },
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
          { name: "", unreadCount: 2 },
          { name: "general", unreadCount: 0 },
        ],
      });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.getByText(t("chat.generalChat"))).toHaveClass("italic");
    expect(screen.getByText("general")).not.toHaveClass("italic");
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

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /release/i }));

    expect(navigateMock).toHaveBeenCalledWith(
      withCurrentOrgRoute(`/stream/10-engineering/topic/${encodeURIComponent("release")}`),
    );
  });

  it("shows delete-topic action for admin and deletes active topic from right panel", async () => {
    const deleteTopicSpy = vi.spyOn(zulipStreams, "deleteTopic").mockResolvedValue({
      ok: true,
      complete: true,
      attempts: 1,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "release" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatListStore.getState().setFromMessages(
        [
          {
            id: 1,
            sender_id: 20,
            sender_full_name: "Alice",
            content: "hello",
            timestamp: 1000,
            type: "stream",
            stream_id: 10,
            display_recipient: "engineering",
            subject: "release",
            flags: [],
          },
        ],
        42,
      );
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
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete topic/i }));

    await waitFor(() => {
      expect(deleteTopicSpy).toHaveBeenCalledWith(10, "release");
    });
    expect(screen.queryByText("release")).not.toBeInTheDocument();
    expect(navigateMock).toHaveBeenCalledWith(withCurrentOrgRoute("/stream/10-engineering"), {
      replace: true,
    });
  });

  it("hides delete-topic action for non-admin channel admin", () => {
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
        topics: [{ name: "release", unreadCount: 0 }],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member", role: 400 });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [42],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /delete topic/i })).not.toBeInTheDocument();
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
        <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />
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

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByText("💬 In focus")).toBeInTheDocument();
  });

  it("shows add members action for admin role", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /add members/i })).toBeInTheDocument();
  });

  it("does not show add members action for members without channel-level permission", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member", role: 400 });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /add members/i })).not.toBeInTheDocument();
  });

  it("shows add members action for channel-level add-subscribers group member", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          canAddSubscribersGroup: 9123,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member", role: 400 });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9123,
          name: "channel-adders",
          members: [42],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /add members/i })).toBeInTheDocument();
  });

  it("shows add members action for modern org add-subscribers group in public channel", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          inviteOnly: false,
          canAddSubscribersGroup: 9,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member", role: 400 });
      useUsersStore.getState().setCurrentUserChannelCapabilities({
        realmCanAddSubscribersGroup: 14,
      });
      useUserGroupsStore.getState().setGroups([
        {
          id: 14,
          name: "role:members",
          members: [42],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /add members/i })).toBeInTheDocument();
  });

  it("shows add members action for channel admin in public channel", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          inviteOnly: false,
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member", role: 400 });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [42],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /add members/i })).toBeInTheDocument();
  });

  it("hides add members action for channel admin in private channel without add-group permission", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          inviteOnly: true,
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member", role: 400 });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [42],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /add members/i })).not.toBeInTheDocument();
  });

  it("shows remove-member action for channel-level remove-subscribers group member", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          canRemoveSubscribersGroup: 9124,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Member", role: 400 },
        { user_id: 77, full_name: "Alice", role: 400 },
      ]);
      useUserGroupsStore.getState().setGroups([
        {
          id: 9124,
          name: "channel-removers",
          members: [42],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /remove from channel: alice/i })).toBeInTheDocument();
  });

  it("shows remove-member action for channel admin even without remove-subscribers group membership", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          canAdministerChannelGroup: 9126,
          canRemoveSubscribersGroup: 9124,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Member", role: 400 },
        { user_id: 77, full_name: "Alice", role: 400 },
      ]);
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [42],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /remove from channel: alice/i })).toBeInTheDocument();
  });

  it("submits add-members dialog and calls stream members api", async () => {
    const addMembersSpy = vi.spyOn(zulipStreams, "addMembersToStream").mockResolvedValue({
      ok: true,
      addedUserIds: [88],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 10, name: "Test clon" }]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Admin", email: "admin@example.com", role: 200 },
        { user_id: 77, full_name: "Alice", email: "alice@example.com" },
        { user_id: 88, full_name: "Bob", email: "bob@example.com" },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add members/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /bob/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(addMembersSpy).toHaveBeenCalledWith({
        streamName: "Test clon",
        userIds: [88],
      });
    });
  });

  it("does not submit add-members when canonical stream name is unavailable", () => {
    const addMembersSpy = vi.spyOn(zulipStreams, "addMembersToStream").mockResolvedValue({
      ok: true,
      addedUserIds: [88],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "test-clon", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "test-clon",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Admin", email: "admin@example.com", role: 200 },
        { user_id: 77, full_name: "Alice", email: "alice@example.com" },
        { user_id: 88, full_name: "Bob", email: "bob@example.com" },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="test-clon" participantsCount={1} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add members/i }));

    expect(addMembersSpy).not.toHaveBeenCalled();
    expect(useAddStreamMembersStore.getState().open).toBe(false);
  });

  it("shows remove-member action for removable members and hides for self/creator/org-owner", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 4,
          onlineCount: 1,
          members: [
            {
              userId: 42,
              fullName: "Current User",
              email: "me@example.com",
              avatarUrl: null,
              isOnline: true,
            },
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
            {
              userId: 100,
              fullName: "Org Owner",
              email: "owner@example.com",
              avatarUrl: null,
              isOnline: false,
            },
            {
              userId: 88,
              fullName: "Stream Creator",
              email: "creator@example.com",
              avatarUrl: null,
              isOnline: false,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [42, 77, 88, 100],
      });
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([{ streamId: 10, name: "engineering", creatorId: 88 }]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Current User", role: 200 },
        { user_id: 77, full_name: "Alice", role: 400 },
        { user_id: 100, full_name: "Org Owner", role: 100 },
        { user_id: 88, full_name: "Stream Creator", role: 400 },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={4} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /remove from channel: alice/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove from channel: current user/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove from channel: stream creator/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove from channel: org owner/i }),
    ).not.toBeInTheDocument();
  });

  it("renders Creator and Channel admin badges from channel metadata", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 2,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Stream Creator",
              email: "creator@example.com",
              avatarUrl: null,
              isOnline: true,
            },
            {
              userId: 88,
              fullName: "Channel Admin",
              email: "admin@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77, 88],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          creatorId: 77,
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Current User", role: 200 },
        { user_id: 77, full_name: "Stream Creator", role: 400 },
        { user_id: 88, full_name: "Channel Admin", role: 400 },
      ]);
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [88],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={2} onlineCount={1} />,
    );

    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Channel admin")).toBeInTheDocument();
  });

  it("prioritizes Creator badge over Channel admin for the same user", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "engineering", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "engineering",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Creator Admin",
              email: "creator-admin@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          creatorId: 77,
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Current User", role: 200 },
        { user_id: 77, full_name: "Creator Admin", role: 400 },
      ]);
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [77],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.queryByText("Channel admin")).not.toBeInTheDocument();
  });

  it("removes stream member via hover cross and does not open profile on click", async () => {
    const removeMembersSpy = vi.spyOn(zulipStreams, "removeMembersFromStream").mockResolvedValue({
      ok: true,
      removedUserIds: [77],
      alreadyUnsubscribedUserIds: [],
      unauthorizedStreams: [],
    });
    const openUserProfile = vi.fn();

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: { type: "stream", streamId: 10, streamName: "test-clon", topic: "general" },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatInfoStore.setState({
        data: {
          type: "stream",
          name: "test-clon",
          memberCount: 1,
          onlineCount: 1,
          members: [
            {
              userId: 77,
              fullName: "Alice",
              email: "alice@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [77],
      });
      useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 10, name: "Test clon" }]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Admin", email: "admin@example.com", role: 200 },
        { user_id: 77, full_name: "Alice", email: "alice@example.com", role: 400 },
      ]);
    });

    renderWithProviders(
      <RightDrawerContext.Provider value={{ open: true, setOpen: vi.fn(), openUserProfile }}>
        <RightPanelShell title="test-clon" participantsCount={1} onlineCount={1} />
      </RightDrawerContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /remove from channel: alice/i }));

    await waitFor(() => {
      expect(removeMembersSpy).toHaveBeenCalledWith({
        streamName: "Test clon",
        userIds: [77],
      });
    });
    expect(openUserProfile).not.toHaveBeenCalled();
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

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /edit channel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /archive channel/i })).not.toBeInTheDocument();
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

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /edit channel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archive channel/i })).toBeInTheDocument();

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

  it("strips one UI hash prefix from title fallback in edit channel form", async () => {
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
        name: "",
        memberCount: 3,
        onlineCount: 1,
        members: [],
        description: null,
        isMuted: false,
        topics: [],
      });
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });
    });

    renderWithProviders(
      <RightPanelShell title="#engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit channel/i }));

    const channelNameInput = screen.getByLabelText(/channel name/i);
    expect(channelNameInput).toHaveValue("engineering");

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateStreamSpy).toHaveBeenCalledWith(10, {
        name: "engineering",
        description: "",
      });
    });
  });

  it("strips only one UI hash prefix from title fallback in edit channel form", () => {
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
        name: "",
        memberCount: 3,
        onlineCount: 1,
        members: [],
        description: null,
        isMuted: false,
        topics: [],
      });
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });
    });

    renderWithProviders(
      <RightPanelShell title="##engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit channel/i }));

    expect(screen.getByLabelText(/channel name/i)).toHaveValue("#engineering");
  });

  it("shows channel edit/delete actions for channel admin", () => {
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
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamId: 10,
          name: "engineering",
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member", role: 400 });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [42],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /edit channel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archive channel/i })).toBeInTheDocument();
  });

  it("optimistically archives channel and redirects immediately on archive action", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const updateStreamSpy = vi.spyOn(zulipStreams, "updateStream").mockResolvedValue(true);

    act(() => {
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });
      useChatListStore.getState().setStreamMetadataHydrated(true);
      useChatListStore.getState().setFromMessages(
        [
          {
            id: 1,
            sender_id: 50,
            sender_full_name: "Sender",
            content: "latest",
            timestamp: 2000,
            type: "stream",
            stream_id: 10,
            display_recipient: "engineering",
            subject: "general",
            flags: [],
          },
          {
            id: 2,
            sender_id: 50,
            sender_full_name: "Sender",
            content: "older",
            timestamp: 1000,
            type: "stream",
            stream_id: 11,
            display_recipient: "design",
            subject: "general",
            flags: [],
          },
        ],
        42,
      );
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([{ streamId: 10, name: "engineering", isArchived: false }]);
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([{ streamId: 11, name: "design", isArchived: false }]);
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
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /archive channel/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(useChatListStore.getState().streamsMap.get(10)?.isArchived).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining("/stream/11"), {
      replace: true,
    });

    await waitFor(() => {
      expect(updateStreamSpy).toHaveBeenCalledWith(10, { isArchived: true });
    });
  });

  it("rolls back optimistic archive on request failure", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(zulipStreams, "updateStream").mockResolvedValue(false);

    act(() => {
      useChatListStore.getState().setCurrentUserId(42);
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin", role: 200 });
      useChatListStore.getState().setStreamMetadataHydrated(true);
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([{ streamId: 10, name: "engineering", isArchived: false }]);
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
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /archive channel/i }));

    await waitFor(() => {
      expect(useChatListStore.getState().streamsMap.get(10)?.isArchived).toBe(false);
    });
  });
});
