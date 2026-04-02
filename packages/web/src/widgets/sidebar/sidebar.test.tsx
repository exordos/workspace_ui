import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import type * as PinChatApiModule from "~/features/pin-chat/pin-chat.api";
import { useSettingsStore } from "~/features/settings/settings.model";
import { buildDmTypingChatKey } from "~/features/typing-indicator/typing-key";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { t } from "~/i18n/i18n";
import type * as WorkspaceApiModule from "~/shared/api/workspace-client";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { Sidebar } from "./sidebar.ui";

const createChannelMock = vi.fn();
const markDmAsReadMock = vi.fn();
const setTopicResolvedStateMock = vi.fn();
const pinChatInFolderMock = vi.fn();
const unpinChatInFolderMock = vi.fn();
const getFolderItemsMock = vi.fn();
const getFoldersMock = vi.fn().mockResolvedValue([]);
const addChatToFolderMock = vi.fn();
const removeChatFromFolderMock = vi.fn();

vi.mock("~/features/create-chat/create-chat.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/features/create-chat/create-chat.api")>();
  return {
    ...actual,
    createChannel: (...args: unknown[]) => createChannelMock(...args),
  };
});

vi.mock("~/shared/api/zulip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip")>();
  return {
    ...actual,
    markDmAsRead: (...args: unknown[]) => markDmAsReadMock(...args),
    setTopicResolvedState: (...args: unknown[]) => setTopicResolvedStateMock(...args),
  };
});

vi.mock("~/features/pin-chat/pin-chat.api", async (importOriginal) => {
  const actual = await importOriginal<typeof PinChatApiModule>();
  return {
    ...actual,
    pinChatInFolder: (...args: unknown[]) => pinChatInFolderMock(...args),
    unpinChatInFolder: (...args: unknown[]) => unpinChatInFolderMock(...args),
  };
});

vi.mock("~/shared/api/workspace-client", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceApiModule>();
  return {
    ...actual,
    getFolderItems: (...args: unknown[]) => getFolderItemsMock(...args),
    getFolders: (...args: unknown[]) => getFoldersMock(...args),
    addChatToFolder: (...args: unknown[]) => addChatToFolderMock(...args),
    removeChatFromFolder: (...args: unknown[]) => removeChatFromFolderMock(...args),
  };
});

const DM_CHAT: Extract<SidebarChat, { type: "dm" }> = {
  type: "dm",
  id: 42,
  name: "Alice",
  slug: "42-alice",
  userIds: [42],
  lastMessage: "Hello",
  time: "10:13",
};

const DM_CHAT_SECOND: Extract<SidebarChat, { type: "dm" }> = {
  type: "dm",
  id: 77,
  name: "Bob",
  slug: "77-bob",
  userIds: [77],
  lastMessage: "Hi",
  time: "10:45",
};

const GROUP_DM_CHAT: Extract<SidebarChat, { type: "dm" }> = {
  type: "dm",
  id: 201,
  name: "Design Squad",
  slug: "201,202,203",
  isGroup: true,
  lastMessage: "Weekly sync",
  time: "11:05",
};

const STREAM_CHAT: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  stream_id: 11,
  name: "Engineering",
  lastMessage: "Deploy today",
  time: "12:10",
  topics: [],
};

const STREAM_CHAT_SECOND: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  stream_id: 12,
  name: "Marketing",
  lastMessage: "Campaign draft",
  time: "11:20",
  topics: [],
};

describe("Sidebar", () => {
  afterEach(() => {
    useUsersStore.getState().clear();
    useTypingIndicatorStore.getState().clearAll();
    usePinStore.getState().clear();
    useChatListStore.setState({ currentUserId: null });
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlug: null });
    useSidebarConfigStore.getState().setSearchQuery("");
    useSidebarConfigStore.getState().setCreateChatOpen(false);
    useSettingsStore.getState().resetToDefaults();
    createChannelMock.mockReset();
    markDmAsReadMock.mockReset();
    setTopicResolvedStateMock.mockReset();
    pinChatInFolderMock.mockReset();
    unpinChatInFolderMock.mockReset();
    getFolderItemsMock.mockReset();
    getFoldersMock.mockReset();
    getFoldersMock.mockResolvedValue([]);
    addChatToFolderMock.mockReset();
    removeChatFromFolderMock.mockReset();
  });

  it("does not render the separate direct-messages section when sidebarChats is provided", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    expect(screen.queryByText(/direct messages/i)).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders loading state for folder chat list", () => {
    // При явной загрузке списка папки должен показываться текстовый loading-state.
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="folder-1"
        sidebarChats={[]}
        sidebarChatsLoading
        sidebarDms={[DM_CHAT]}
      />,
    );

    expect(screen.getByText(t("app.loading"))).toBeInTheDocument();
  });

  it("does not show folder list loading label when chats exist while sync is in flight", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="folder-1"
        sidebarChats={[DM_CHAT]}
        sidebarChatsLoading
        sidebarDms={[DM_CHAT]}
      />,
    );

    expect(screen.queryByText(t("app.loading"))).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("does not render legacy chats-and-channels heading", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: /chats\s*&\s*channels/i }),
    ).not.toBeInTheDocument();
  });

  it("matches dm chats by participant email in sidebar search", () => {
    useUsersStore
      .getState()
      .mergeUsers([createUser({ user_id: 42, full_name: "Alice", email: "alice@example.com" })]);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: "alice@example.com" },
    });

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("uses semantic token classes for sidebar search input container", () => {
    const { container } = renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/find/i);
    const searchContainer = searchInput.closest("label");
    const separator = container.querySelector(".h-px");

    expect(searchContainer).toHaveClass("bg-text-field-bg");
    expect(searchContainer).toHaveClass("border-border-subtle");
    expect(separator).toHaveClass("bg-border-subtle/70");
  });

  it("uses design-size classes for sidebar shell and compose trigger", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    const sidebar = screen.getByRole("navigation", { name: /chat list/i });
    const createButton = screen.getByRole("button", { name: /new chat/i });

    expect(sidebar).toHaveClass("w-sidebar");
    expect(sidebar).toHaveClass("rounded-xl");
    expect(createButton).toHaveClass("h-8");
    expect(createButton).toHaveClass("w-8");
  });

  it("renders denser chat rows when compact density is enabled", () => {
    useSettingsStore.getState().setChatListDensity("compact");

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    const dmLink = screen.getByRole("link", { name: /alice/i });
    expect(dmLink).toHaveClass("rounded-md");
    expect(dmLink).toHaveClass("px-2");
    expect(dmLink).toHaveClass("py-1.5");

    const avatarText = within(dmLink).getByText("A");
    const avatar = avatarText.closest("div");
    expect(avatar).not.toBeNull();
    expect(avatar).toHaveClass("w-8");
    expect(avatar).toHaveClass("h-8");
  });

  it("uses sidebar background token for sidebar scrollbar track", () => {
    const { container } = renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    const sidebarScrollArea = container.querySelector(".scrollbar");
    expect(sidebarScrollArea).toBeInTheDocument();
    expect(sidebarScrollArea).toHaveClass("scrollbar-track-sidebar-bg");
  });

  it("renders activity-bottom slot directly under My Activity panel", () => {
    const { container } = renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
        activityPanelBottomSlot={
          <div data-testid="activity-panel-bottom-slot">Horizontal folders rail slot</div>
        }
      />,
    );

    const slot = screen.getByTestId("activity-panel-bottom-slot");
    const separator = container.querySelector(".my-2");

    expect(slot).toBeInTheDocument();
    expect(separator).toBeInTheDocument();
    expect(slot.nextElementSibling).toBe(separator);
  });

  it("matches dm chats by display title in sidebar search", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[STREAM_CHAT, DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: "alice" },
    });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("#Engineering")).not.toBeInTheDocument();
  });

  it("matches stream chats by stream name in sidebar search", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[STREAM_CHAT, DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: "engineering" },
    });

    expect(screen.getByText("#Engineering")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("matches stream chats by topic name in sidebar search", () => {
    const streamWithTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "release-train", badge: 0 }],
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopic, DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: "release-train" },
    });

    expect(screen.getByText("#Engineering")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("matches group dm chats by member email in sidebar search", () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 1002, full_name: "Bob Teammate", email: "bob@example.com" }),
        createUser({ user_id: 1003, full_name: "Carol Teammate", email: "carol@example.com" }),
      ]);
    const groupChat: Extract<SidebarChat, { type: "dm" }> = {
      ...GROUP_DM_CHAT,
      userIds: [1002, 1003],
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[groupChat]}
        sidebarDms={[groupChat]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: "bob@example.com" },
    });

    expect(screen.getByText("Design Squad")).toBeInTheDocument();
  });

  it("renders the separate direct-messages section when sidebarChats is absent", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    expect(screen.getByText(/direct messages/i)).toBeInTheDocument();
  });

  it("shows empty-folder state when folder mode has no chats", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="custom-folder"
        sidebarChats={[]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    expect(screen.getByText(/folder is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/add chats from a chat menu/i)).toBeInTheDocument();
    expect(screen.queryByText(/direct messages/i)).not.toBeInTheDocument();
  });

  it("does not show empty-folder state in split sidebar mode", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    expect(screen.queryByText(/folder is empty/i)).not.toBeInTheDocument();
  });

  it("does not render a static fake call footer by default", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    expect(screen.queryByText(/calling, trying to connect/i)).not.toBeInTheDocument();
    expect(screen.queryByText("0:47")).not.toBeInTheDocument();
  });

  it("exposes activity toggle expanded state for assistive technologies", () => {
    useSidebarConfigStore.getState().setConfig({ activityOpen: true });
    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    const activityToggle = screen.getByRole("button", { name: /activity/i });
    expect(activityToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(activityToggle);
    const collapsedActivityToggle = screen.getByRole("button", { name: /activity/i });
    expect(collapsedActivityToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show current user in start-chat list", () => {
    useChatListStore.setState({ currentUserId: 1001 });
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 1001, full_name: "Alice Me", email: "alice@example.com" }),
        createUser({ user_id: 1002, full_name: "Bob Teammate", email: "bob@example.com" }),
      ]);

    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    expect(screen.queryByRole("button", { name: /alice me/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bob teammate/i })).toBeInTheDocument();
  });

  it("shows presence indicators in create-chat user lists", () => {
    const now = Math.floor(Date.now() / 1000);
    useChatListStore.setState({ currentUserId: 1001 });
    useUsersStore.getState().mergeUsers([
      createUser({ user_id: 1001, full_name: "Alice Me", email: "alice@example.com" }),
      createUser({
        user_id: 1002,
        full_name: "Bob Teammate",
        email: "bob@example.com",
        presence: { status: "active", timestamp: now },
      }),
      createUser({
        user_id: 1003,
        full_name: "Carol Teammate",
        email: "carol@example.com",
        presence: { status: "idle", timestamp: now },
      }),
    ]);

    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    expect(screen.getByRole("status", { name: /online/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /away/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /group chat/i }));
    expect(screen.getByRole("status", { name: /online/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /away/i })).toBeInTheDocument();
  });

  it("resets create-chat dialog state after close and reopen", async () => {
    useChatListStore.setState({ currentUserId: 1001 });
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 1001, full_name: "Alice Me", email: "alice@example.com" }),
        createUser({ user_id: 1002, full_name: "Bob Teammate", email: "bob@example.com" }),
        createUser({ user_id: 1003, full_name: "Carol Teammate", email: "carol@example.com" }),
      ]);

    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    fireEvent.click(screen.getByRole("tab", { name: /group chat/i }));
    fireEvent.change(screen.getByPlaceholderText(/search users/i), { target: { value: "carol" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /carol teammate/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /start chat/i })).toHaveClass("border-b-2");
    });
    expect(screen.getByPlaceholderText(/search users/i)).toHaveValue("");
    expect(screen.queryByRole("checkbox", { name: /carol teammate/i })).not.toBeInTheDocument();
  });

  it("supports keyboard navigation between create-chat tabs", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    const startChatTab = screen.getByRole("tab", { name: /start chat/i });
    const groupChatTab = screen.getByRole("tab", { name: /group chat/i });
    const createChannelTab = screen.getByRole("tab", { name: /create channel/i });

    expect(startChatTab).toHaveAttribute("aria-selected", "true");
    expect(groupChatTab).toHaveAttribute("aria-selected", "false");

    startChatTab.focus();
    fireEvent.keyDown(startChatTab, { key: "ArrowRight" });

    expect(groupChatTab).toHaveFocus();
    expect(groupChatTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(groupChatTab, { key: "End" });
    expect(createChannelTab).toHaveFocus();
    expect(createChannelTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(createChannelTab, { key: "Home" });
    expect(startChatTab).toHaveFocus();
    expect(startChatTab).toHaveAttribute("aria-selected", "true");
  });

  it("wires create-chat tabs to tabpanels with aria relationships", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    const tablist = screen.getByRole("tablist", { name: /new chat/i });
    expect(tablist).toBeInTheDocument();

    const startChatTab = screen.getByRole("tab", { name: /start chat/i });
    const groupChatTab = screen.getByRole("tab", { name: /group chat/i });
    const createChannelTab = screen.getByRole("tab", { name: /create channel/i });

    const startPanelId = startChatTab.getAttribute("aria-controls");
    expect(startPanelId).toBeTruthy();
    const startPanel = document.getElementById(startPanelId!);
    expect(startPanel).toBeInTheDocument();
    expect(startPanel).toHaveAttribute("role", "tabpanel");
    expect(startPanel).toHaveAttribute("aria-labelledby", startChatTab.id);

    fireEvent.keyDown(startChatTab, { key: "ArrowRight" });
    expect(groupChatTab).toHaveAttribute("aria-selected", "true");
    expect(groupChatTab).toHaveAttribute("tabindex", "0");
    expect(startChatTab).toHaveAttribute("aria-selected", "false");
    expect(startChatTab).toHaveAttribute("tabindex", "-1");

    const groupPanelId = groupChatTab.getAttribute("aria-controls");
    expect(groupPanelId).toBeTruthy();
    const groupPanel = document.getElementById(groupPanelId!);
    expect(groupPanel).toBeInTheDocument();
    expect(groupPanel).toHaveAttribute("role", "tabpanel");
    expect(groupPanel).toHaveAttribute("aria-labelledby", groupChatTab.id);

    expect(createChannelTab).toHaveAttribute("aria-selected", "false");
  });

  it("passes channel options and selected subscribers to createChannel", async () => {
    createChannelMock.mockResolvedValue({ streamId: 99 });
    useChatListStore.setState({ currentUserId: 1001 });
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 1001, full_name: "Alice Me", email: "alice@example.com" }),
        createUser({ user_id: 1002, full_name: "Bob Teammate", email: "bob@example.com" }),
        createUser({ user_id: 1003, full_name: "Carol Teammate", email: "carol@example.com" }),
      ]);

    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    fireEvent.click(screen.getByRole("tab", { name: /create channel/i }));
    fireEvent.change(screen.getByPlaceholderText(/^channel name$/i), {
      target: { value: "Engineering" },
    });
    fireEvent.click(screen.getByLabelText(/invite only/i));
    fireEvent.click(screen.getByLabelText(/announce channel/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /bob teammate/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(createChannelMock).toHaveBeenCalledWith({
        name: "Engineering",
        description: "",
        subscribers: [1002],
        inviteOnly: true,
        announce: true,
      });
    });
  });

  it("renders dedicated group avatar icon for group dm chats", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[GROUP_DM_CHAT]}
        sidebarDms={[GROUP_DM_CHAT]}
      />,
    );

    expect(screen.getByText("Design Squad")).toBeInTheDocument();
    expect(screen.getByTestId("group-avatar-icon-201,202,203")).toBeInTheDocument();
  });

  it("shows mark-as-read action in dm context menu and triggers dm narrow API", async () => {
    markDmAsReadMock.mockResolvedValue(true);
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Alice"));

    const markAsReadItem = await screen.findByRole("menuitem", { name: /mark as read/i });
    fireEvent.click(markAsReadItem);

    await waitFor(() => {
      expect(markDmAsReadMock).toHaveBeenCalledWith([42]);
    });
  });

  it("does not show pin action in personal system folder context menu", async () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="system:personal"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Alice"));

    await screen.findByRole("menuitem", { name: /mark as read/i });
    expect(screen.queryByRole("menuitem", { name: /^pin$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^unpin$/i })).not.toBeInTheDocument();
  });

  it("opens dm context menu from keyboard on focused row", async () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    const dmLink = screen.getByRole("link", { name: /alice/i });
    dmLink.focus();
    fireEvent.keyDown(dmLink, { key: "F10", shiftKey: true });

    expect(await screen.findByRole("menuitem", { name: /mark as read/i })).toBeInTheDocument();
  });

  it("shows typing status in DM row when partner is typing", () => {
    useChatListStore.setState({ currentUserId: 100 });
    const typingKey = buildDmTypingChatKey([42], 100);
    if (typingKey == null) {
      throw new Error("Expected typing key");
    }
    useTypingIndicatorStore.getState().setTyping(typingKey, 42, true);
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    expect(screen.getByText(/^typing$/i)).toBeInTheDocument();
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("shows pin action in dm context menu and pins chat in selected folder", async () => {
    getFolderItemsMock.mockResolvedValue([
      {
        uuid: "item-42",
        chatId: "dm:42",
        folderUuid: "all",
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    pinChatInFolderMock.mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Alice"));

    const pinItem = await screen.findByRole("menuitem", { name: /^pin$/i });
    fireEvent.click(pinItem);

    await waitFor(() => {
      expect(getFolderItemsMock).toHaveBeenCalledWith("all");
      expect(pinChatInFolderMock).toHaveBeenCalledWith("all", "item-42");
      expect(usePinStore.getState().isPinned("all", "dm:42")).toBe(true);
    });
  });

  it("shows unpin action in dm context menu when chat is already pinned", async () => {
    usePinStore.getState().pinChat("all", "dm:42", { folderItemUuid: "item-42" });
    unpinChatInFolderMock.mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT]}
        sidebarDms={[DM_CHAT]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Alice"));

    const unpinItem = await screen.findByRole("menuitem", { name: /^unpin$/i });
    fireEvent.click(unpinItem);

    await waitFor(() => {
      expect(unpinChatInFolderMock).toHaveBeenCalledWith("all", "item-42");
      expect(usePinStore.getState().isPinned("all", "dm:42")).toBe(false);
    });
  });

  it("renders pinned dm chats before unpinned ones", () => {
    usePinStore.getState().pinChat("all", "dm:77", { folderItemUuid: "item-77", orderIndex: 0 });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT, DM_CHAT_SECOND]}
        sidebarDms={[DM_CHAT, DM_CHAT_SECOND]}
      />,
    );

    const dmLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/dm/"));
    expect(dmLinks[0]).toHaveAttribute("href", "/dm/77-bob");
    expect(dmLinks[1]).toHaveAttribute("href", "/dm/42-alice");
  });

  it("renders pinned stream chats before unpinned ones", () => {
    usePinStore
      .getState()
      .pinChat("all", "stream:12:general", { folderItemUuid: "item-12", orderIndex: 0 });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[STREAM_CHAT, STREAM_CHAT_SECOND]}
        sidebarDms={[]}
      />,
    );

    const streamLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/stream/"));
    expect(streamLinks[0]).toHaveAttribute("href", "/stream/12-marketing");
    expect(streamLinks[1]).toHaveAttribute("href", "/stream/11-engineering");
  });

  it("uses pinFolderId to order chats in system folders", () => {
    usePinStore
      .getState()
      .pinChat("all", "stream:12:general", { folderItemUuid: "item-12", orderIndex: 0 });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="system:channels"
        pinFolderId="all"
        sidebarChats={[STREAM_CHAT, STREAM_CHAT_SECOND]}
        sidebarDms={[]}
      />,
    );

    const streamLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/stream/"));
    expect(streamLinks[0]).toHaveAttribute("href", "/stream/12-marketing");
  });

  it("uses pinFolderId for pin action in system folders", async () => {
    getFolderItemsMock.mockResolvedValue([
      {
        uuid: "item-11",
        chatId: "stream:11:general",
        folderUuid: "all",
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    pinChatInFolderMock.mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="system:channels"
        pinFolderId="all"
        sidebarChats={[STREAM_CHAT]}
        sidebarDms={[]}
      />,
    );

    const streamRow = screen.getByRole("link", { name: /engineering/i });
    fireEvent.contextMenu(streamRow);

    fireEvent.click(await screen.findByRole("menuitem", { name: /^pin$/i }));

    await waitFor(() => {
      expect(getFolderItemsMock).toHaveBeenCalledWith("all");
      expect(pinChatInFolderMock).toHaveBeenCalledWith("all", "item-11");
    });
  });

  it("shows pinned chats only in pin-reorder mode and allows exiting mode", () => {
    const onExitPinReorderMode = vi.fn();
    usePinStore.getState().pinChat("all", "dm:42", { folderItemUuid: "item-42" });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[DM_CHAT, DM_CHAT_SECOND]}
        sidebarDms={[DM_CHAT, DM_CHAT_SECOND]}
        pinReorderMode
        onExitPinReorderMode={onExitPinReorderMode}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onExitPinReorderMode).toHaveBeenCalledTimes(1);
  });

  it("opens stream new-topic dialog with zulip topic settings from context menu action", async () => {
    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId="all" sidebarChats={[STREAM_CHAT]} sidebarDms={[]} />,
    );

    fireEvent.contextMenu(screen.getByText("#Engineering"));

    const createTopicItem = await screen.findByRole("menuitem", { name: /new topic/i });
    fireEvent.click(createTopicItem);

    const topicDialog = await screen.findByRole("dialog", { name: /create topic/i });
    const topicNameInput = within(topicDialog).getByRole("textbox", { name: /topic name/i });
    const muteTopicToggle = within(topicDialog).getByRole("checkbox", { name: /mute topic/i });
    const createButton = within(topicDialog).getByRole("button", { name: /create/i });

    await waitFor(() => {
      expect(topicNameInput).toBeInTheDocument();
      expect(muteTopicToggle).toBeInTheDocument();
      expect(createButton).toBeDisabled();
    });

    fireEvent.change(topicNameInput, { target: { value: "platform updates" } });
    fireEvent.click(muteTopicToggle);
    expect(muteTopicToggle).toBeChecked();
    expect(createButton).toBeEnabled();
  });

  it("opens stream context menu from keyboard on focused stream row", async () => {
    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId="all" sidebarChats={[STREAM_CHAT]} sidebarDms={[]} />,
    );

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    streamLink.focus();
    fireEvent.keyDown(streamLink, { key: "ContextMenu" });

    expect(await screen.findByRole("menuitem", { name: /mark as read/i })).toBeInTheDocument();
  });

  it("adds stream chat to folder from context submenu item click", async () => {
    getFoldersMock.mockResolvedValue([
      {
        uuid: "all-folder",
        title: "All",
        created_at: "",
        updated_at: "",
        background_color_value: 0xff8438,
        unread_messages: [],
        system_type: "all",
      },
      {
        uuid: "work-folder",
        title: "Work",
        created_at: "",
        updated_at: "",
        background_color_value: 0x3a92ff,
        unread_messages: [],
        system_type: "created",
      },
    ]);
    addChatToFolderMock.mockResolvedValue(true);
    const workFolderItems = [
      {
        uuid: "work-item-1",
        chatId: "stream:11",
        folderUuid: "work-folder",
        orderIndex: 0,
        pinnedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    getFolderItemsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(workFolderItems)
      .mockResolvedValue(workFolderItems);

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId="all" sidebarChats={[STREAM_CHAT]} sidebarDms={[]} />,
    );

    fireEvent.contextMenu(screen.getByText("#Engineering"));

    const addToFolderItem = await screen.findByRole("menuitem", { name: /add to folder/i });
    fireEvent.click(addToFolderItem);

    const workFolderItem = await screen.findByRole("menuitemcheckbox", { name: /work/i });
    fireEvent.click(workFolderItem);

    await waitFor(() => {
      expect(addChatToFolderMock).toHaveBeenCalledWith("work-folder", "stream:11:general");
      expect(addChatToFolderMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("menuitemcheckbox", { name: /work/i })).toBeChecked();
    });
  });

  it("expands stream topics when expanded stream slug is preselected in sidebar config", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    expect(screen.getByText("# incident")).toBeInTheDocument();
  });

  it("auto-expands stream topics when stream is clicked in sidebar", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    expect(screen.queryByText("# incident")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("#Engineering"));
    expect(screen.getByText("# incident")).toBeInTheDocument();
  });

  it("collapses expanded stream topics when a direct message chat is active", async () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics, DM_CHAT]}
        sidebarDms={[DM_CHAT]}
        activeDmIdParam={DM_CHAT.slug}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("# incident")).not.toBeInTheDocument();
    });
  });

  it("places stream chat-menu trigger under counters and keeps avatar overlay toggle", () => {
    const streamWithUnread: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      badge: 3,
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithUnread]}
        sidebarDms={[]}
      />,
    );

    const chatMenuButton = screen.getByRole("button", { name: /chat menu/i });
    const expandButton = screen.getByRole("button", { name: /expand topics/i });
    const streamTime = screen.getByText("12:10");
    const streamUnreadBadge = screen.getByText("3");
    const streamMetaRow = streamTime.parentElement;

    expect(streamMetaRow).not.toBeNull();
    expect(streamMetaRow!).toContainElement(streamUnreadBadge);
    expect(streamMetaRow!).toHaveClass("items-center");
    expect(streamMetaRow!).not.toHaveClass("flex-col");

    expect(chatMenuButton).toHaveClass("right-1");
    expect(chatMenuButton).not.toHaveClass("right-2");
    expect(chatMenuButton).toHaveClass("top-8");
    expect(chatMenuButton).not.toHaveClass("top-1");
    expect(chatMenuButton).not.toHaveClass("right-10");

    expect(expandButton).toHaveClass("absolute");
    expect(expandButton).toHaveClass("left-5");
    expect(expandButton).toHaveClass("top-5");
    expect(expandButton).toHaveClass("-translate-x-1/2");
    expect(expandButton).toHaveClass("-translate-y-1/2");
    expect(expandButton).toHaveClass("h-8");
    expect(expandButton).toHaveClass("w-8");
    expect(expandButton).toHaveClass("bg-bg/60");
    expect(expandButton).toHaveClass("opacity-0");
    expect(expandButton).toHaveClass("group-hover/stream:opacity-100");
    expect(expandButton).toHaveClass("group-focus-within/stream:opacity-100");
  });

  it("aligns dm chat-menu trigger horizontally with unread and keeps time left of unread", () => {
    const dmWithUnread: Extract<SidebarChat, { type: "dm" }> = {
      ...DM_CHAT,
      badge: 3,
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[dmWithUnread]}
        sidebarDms={[dmWithUnread]}
      />,
    );

    const dmLink = screen.getByRole("link", { name: /alice/i });
    const dmTime = within(dmLink).getByText("10:13");
    const dmUnreadBadge = within(dmLink).getByText("3");
    const dmMetaRow = dmTime.parentElement;

    expect(dmMetaRow).not.toBeNull();
    expect(dmMetaRow!).toContainElement(dmUnreadBadge);
    expect(dmMetaRow!).toHaveClass("items-center");
    expect(dmMetaRow!).not.toHaveClass("flex-col");

    const chatMenuButton = screen.getByRole("button", { name: /chat menu/i });
    expect(chatMenuButton).toHaveClass("top-1");
    expect(chatMenuButton).not.toHaveClass("top-8");
  });

  it("places topic mute control under topic unread badge", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 2, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    const topicMuteButton = screen.getByRole("button", { name: /mute topic/i });
    const actionsContainer = topicMuteButton.parentElement;

    expect(actionsContainer).toBeTruthy();
    expect(actionsContainer).toHaveClass("flex-col");
    expect(actionsContainer).toHaveClass("items-end");

    const topicBadge = within(actionsContainer as HTMLElement).getByText("2");
    expect(actionsContainer?.firstElementChild).toBe(topicBadge);
  });

  it("marks topic as done from topic row action", async () => {
    setTopicResolvedStateMock.mockResolvedValue(true);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    const markDoneButton = screen.getByRole("button", { name: /mark topic as done/i });
    fireEvent.click(markDoneButton);

    await waitFor(() => {
      expect(setTopicResolvedStateMock).toHaveBeenCalledWith(11, "incident", true);
    });
  });

  it("marks resolved topic as not done from topic row action", async () => {
    setTopicResolvedStateMock.mockResolvedValue(true);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "\u2714 incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    const markNotDoneButton = screen.getByRole("button", { name: /mark topic as not done/i });
    fireEvent.click(markNotDoneButton);

    await waitFor(() => {
      expect(setTopicResolvedStateMock).toHaveBeenCalledWith(11, "\u2714 incident", false);
    });
  });
});
