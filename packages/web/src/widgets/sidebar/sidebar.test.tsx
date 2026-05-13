import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import type * as CreateChatApiModule from "~/features/create-chat/create-chat.api";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import type * as MuteChatApiModule from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type * as PinChatApiModule from "~/features/pin-chat/pin-chat.api";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { buildDmTypingChatKey } from "~/features/typing-indicator/typing-key";
import { t } from "~/i18n/i18n";
import type * as WorkspaceApiModule from "~/shared/api/workspace-client";
import type * as ZulipApiModule from "~/shared/api/zulip";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { Sidebar } from "./sidebar.ui";

const createChannelMock = vi.fn();
const unarchiveChannelMock = vi.fn();
const markDmAsReadMock = vi.fn();
const setTopicResolvedStateMock = vi.fn();
const muteStreamMock = vi.fn();
const unmuteStreamMock = vi.fn();
const muteTopicMock = vi.fn();
const unmuteTopicMock = vi.fn();
const unmuteTopicInMutedStreamMock = vi.fn();
const pinChatInFolderMock = vi.fn();
const unpinChatInFolderMock = vi.fn();
const getFolderItemsMock = vi.fn();
const getFoldersMock = vi.fn().mockResolvedValue([]);
const addChatToFolderMock = vi.fn();
const removeChatFromFolderMock = vi.fn();

vi.mock("~/features/create-chat/create-chat.api", async (importOriginal) => {
  const actual = await importOriginal<typeof CreateChatApiModule>();
  return {
    ...actual,
    createChannel: (...args: unknown[]) => createChannelMock(...args),
    unarchiveChannel: (...args: unknown[]) => unarchiveChannelMock(...args),
  };
});

vi.mock("~/shared/api/zulip", async (importOriginal) => {
  const actual = await importOriginal<typeof ZulipApiModule>();
  return {
    ...actual,
    markDmAsRead: (...args: unknown[]) => markDmAsReadMock(...args),
    setTopicResolvedState: (...args: unknown[]) => setTopicResolvedStateMock(...args),
  };
});

vi.mock("~/features/mute-chat/mute-chat.api", async (importOriginal) => {
  const actual = await importOriginal<typeof MuteChatApiModule>();
  return {
    ...actual,
    muteStream: (...args: unknown[]) => muteStreamMock(...args),
    unmuteStream: (...args: unknown[]) => unmuteStreamMock(...args),
    muteTopic: (...args: unknown[]) => muteTopicMock(...args),
    unmuteTopic: (...args: unknown[]) => unmuteTopicMock(...args),
    unmuteTopicInMutedStream: (...args: unknown[]) => unmuteTopicInMutedStreamMock(...args),
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

function RoutePathProbe() {
  const location = useLocation();
  return <output data-testid="route-path">{location.pathname}</output>;
}

interface RouteNavigateButtonProps {
  to: string;
  label: string;
}

function RouteNavigateButton({ to, label }: Readonly<RouteNavigateButtonProps>) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(to)}>
      {label}
    </button>
  );
}

describe("Sidebar", () => {
  afterEach(() => {
    useFolderSyncStore.getState().clear();
    useUsersStore.getState().clear();
    useTypingIndicatorStore.getState().clearAll();
    useMuteStore.getState().clear();
    usePinStore.getState().clear();
    useChatListStore.setState({ currentUserId: null });
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: [] });
    useSidebarConfigStore.getState().setSearchQuery("");
    useSidebarConfigStore.getState().setCreateChatOpen(false);
    useSettingsStore.getState().resetToDefaults();
    createChannelMock.mockReset();
    unarchiveChannelMock.mockReset();
    markDmAsReadMock.mockReset();
    setTopicResolvedStateMock.mockReset();
    muteStreamMock.mockReset();
    unmuteStreamMock.mockReset();
    muteTopicMock.mockReset();
    unmuteTopicMock.mockReset();
    unmuteTopicInMutedStreamMock.mockReset();
    muteStreamMock.mockResolvedValue(true);
    unmuteStreamMock.mockResolvedValue(true);
    muteTopicMock.mockResolvedValue(true);
    unmuteTopicMock.mockResolvedValue(true);
    unmuteTopicInMutedStreamMock.mockResolvedValue(true);
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

  it("закрывает модалку New chat и переходит в архивированный канал из вкладки Archived", async () => {
    useChatListStore.getState().clear();
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 501, name: "Legacy", isArchived: true }]);
    useSidebarConfigStore.getState().setCreateChatOpen(true);

    renderWithProviders(
      <>
        <RoutePathProbe />
        <Sidebar
          streams={[]}
          selectedFolderId="all"
          sidebarChats={[DM_CHAT]}
          sidebarDms={[DM_CHAT]}
        />
      </>,
      { route: "/" },
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Archived channels" }));
    fireEvent.click(screen.getByText("#Legacy").closest("button")!);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(useSidebarConfigStore.getState().createChatOpen).toBe(false);
    });

    expect(screen.getByTestId("route-path")).toHaveTextContent("/stream/501-legacy");
  });

  it("renders loading state for folder chat list", () => {
    // При явной загрузке списка папки показываем явный loading-state (спиннер + подпись).
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="folder-1"
        sidebarChats={[]}
        sidebarChatsLoading
        sidebarDms={[DM_CHAT]}
      />,
    );

    expect(screen.getByRole("status", { name: t("app.loading") })).toBeInTheDocument();
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
    expect(searchContainer).toHaveClass("focus-within:border-accent");
    expect(searchInput).toHaveClass("focus-visible:!outline-none");
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
    const archivedChannelsTab = screen.getByRole("tab", { name: /archived channels/i });

    expect(startChatTab).toHaveAttribute("aria-selected", "true");
    expect(groupChatTab).toHaveAttribute("aria-selected", "false");

    startChatTab.focus();
    fireEvent.keyDown(startChatTab, { key: "ArrowRight" });

    expect(groupChatTab).toHaveFocus();
    expect(groupChatTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(groupChatTab, { key: "End" });
    expect(archivedChannelsTab).toHaveFocus();
    expect(archivedChannelsTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(archivedChannelsTab, { key: "Home" });
    expect(startChatTab).toHaveFocus();
    expect(startChatTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(startChatTab, { key: "ArrowLeft" });
    expect(archivedChannelsTab).toHaveFocus();
    expect(createChannelTab).toHaveAttribute("aria-selected", "false");
  });

  it("wires create-chat tabs to tabpanels with aria relationships", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId="all" sidebarDms={[DM_CHAT]} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    const tablist = screen.getByRole("tablist", { name: /new chat/i });
    expect(tablist).toBeInTheDocument();

    const startChatTab = screen.getByRole("tab", { name: /start chat/i });
    const groupChatTab = screen.getByRole("tab", { name: /group chat/i });
    const createChannelTab = screen.getByRole("tab", { name: /create channel/i });
    const archivedChannelsTab = screen.getByRole("tab", { name: /archived channels/i });
    expect(screen.getAllByRole("tab")).toHaveLength(4);

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
    expect(archivedChannelsTab).toHaveAttribute("aria-selected", "false");
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
    fireEvent.click(screen.getByLabelText(/announce channel creation/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /bob teammate/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(createChannelMock).toHaveBeenCalledWith({
        name: "Engineering",
        description: "",
        subscribers: [1001, 1002],
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

    const streamLink = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href")?.startsWith("/stream/"));
    expect(streamLink).toHaveAttribute("href", "/stream/12-marketing");
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

  it("rolls back optimistic mute when creating topic with mute enabled fails and retries", async () => {
    muteTopicMock.mockResolvedValue(false);

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId="all" sidebarChats={[STREAM_CHAT]} sidebarDms={[]} />,
    );

    fireEvent.contextMenu(screen.getByText("#Engineering"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /new topic/i }));

    const topicDialog = await screen.findByRole("dialog", { name: /create topic/i });
    const topicNameInput = within(topicDialog).getByRole("textbox", { name: /topic name/i });
    const muteTopicToggle = within(topicDialog).getByRole("checkbox", { name: /mute topic/i });
    const createButton = within(topicDialog).getByRole("button", { name: /create/i });

    fireEvent.change(topicNameInput, { target: { value: "release" } });
    fireEvent.click(muteTopicToggle);
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(muteTopicMock).toHaveBeenCalledWith(11, "release");
      expect(useMuteStore.getState().isTopicMuted(11, "release")).toBe(false);
      expect(screen.getByText(t("app.error"))).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(muteTopicMock).toHaveBeenCalledTimes(2);
    });
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

  it("rolls back stream mute and shows retry feedback when API call fails", async () => {
    muteStreamMock.mockResolvedValue(false);

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId="all" sidebarChats={[STREAM_CHAT]} sidebarDms={[]} />,
    );

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    fireEvent.contextMenu(streamLink);

    const muteItem = await screen.findByRole("menuitem", { name: /mute notifications/i });
    fireEvent.click(muteItem);

    await waitFor(() => {
      expect(muteStreamMock).toHaveBeenCalledWith(11);
      expect(useMuteStore.getState().isStreamMuted(11)).toBe(false);
      expect(screen.getByText(t("app.error"))).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(muteStreamMock).toHaveBeenCalledTimes(2);
    });
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
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        activeStreamSlug="11-engineering"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    expect(screen.getByText("# incident")).toBeInTheDocument();
  });

  it("shows topic last message sender name in folder stream list", async () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [
        {
          subject: "incident",
          badge: 0,
          lastMessage: "Topic update",
          lastMessageSenderName: "Topic Sender",
        },
      ],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        activeStreamSlug="11-engineering"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("# incident")).toBeInTheDocument();
      expect(screen.getByText("Topic Sender")).toBeInTheDocument();
    });
  });

  it("hides topic sender row in folder stream list when sender name is missing", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    expect(screen.queryByText(t("roles.member"))).not.toBeInTheDocument();
  });

  it("shows topic last message sender name in stream list when sidebarChats is absent", () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[
          {
            stream_id: 11,
            name: "Engineering",
            lastMessage: "Deploy today",
            time: "12:10",
            topics: [
              {
                subject: "incident",
                badge: 0,
                lastMessage: "Topic update",
                lastMessageSenderName: "Legacy Sender",
              },
            ],
          },
        ]}
        selectedFolderId="all"
        activeStreamSlug="11-engineering"
        sidebarDms={[]}
      />,
    );

    expect(screen.getByText("Legacy Sender")).toBeInTheDocument();
  });

  it("opens stream from folder list when stream meta area is clicked", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      badge: 3,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };

    renderWithProviders(
      <>
        <Sidebar
          streams={[]}
          selectedFolderId="all"
          sidebarChats={[streamWithTopics]}
          sidebarDms={[]}
        />
        <RoutePathProbe />
      </>,
    );

    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
    expect(screen.queryByText("# incident")).not.toBeInTheDocument();

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    fireEvent.click(within(streamLink).getByText("3"));

    expect(screen.getByText("# incident")).toBeInTheDocument();
    expect(screen.getByTestId("route-path")).toHaveTextContent("/stream/11-engineering");
  });

  it("opens stream from stream list when unread badge in meta area is clicked", () => {
    renderWithProviders(
      <>
        <Sidebar
          streams={[
            {
              stream_id: 11,
              name: "Engineering",
              lastMessage: "Deploy today",
              time: "12:10",
              badge: 3,
              topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
            },
          ]}
          selectedFolderId="all"
          sidebarDms={[]}
        />
        <RoutePathProbe />
      </>,
    );

    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
    expect(screen.queryByText("# incident")).not.toBeInTheDocument();

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    fireEvent.click(within(streamLink).getByText("3"));

    expect(screen.getByText("# incident")).toBeInTheDocument();
    expect(screen.getByTestId("route-path")).toHaveTextContent("/stream/11-engineering");
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

  it("allows opening multiple stream topic lists via expand buttons", () => {
    const streamWithIncidentTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    const streamWithLaunchTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT_SECOND,
      topics: [{ subject: "launch", badge: 0, lastMessage: "Launch checklist" }],
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithIncidentTopic, streamWithLaunchTopic]}
        sidebarDms={[]}
      />,
    );

    const toggleButtons = screen.getAllByRole("button", { name: /expand topics/i });
    fireEvent.click(toggleButtons[0]!);
    fireEvent.click(toggleButtons[1]!);

    expect(screen.getByText("# incident")).toBeInTheDocument();
    expect(screen.getByText("# launch")).toBeInTheDocument();
  });

  it("keeps stream topics expanded after manual toggle when dm chat is active", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics, DM_CHAT]}
        sidebarDms={[DM_CHAT]}
        activeDmIdParam={DM_CHAT.slug}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /expand topics/i }));

    expect(screen.getByText("# incident")).toBeInTheDocument();
  });

  it("collapses all but target stream topics after stream navigation", async () => {
    const streamWithIncidentTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    const streamWithLaunchTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT_SECOND,
      topics: [{ subject: "launch", badge: 0, lastMessage: "Launch checklist" }],
    };

    renderWithProviders(
      <>
        <Sidebar
          streams={[]}
          selectedFolderId="all"
          sidebarChats={[streamWithIncidentTopic, streamWithLaunchTopic]}
          sidebarDms={[]}
        />
        <RoutePathProbe />
      </>,
    );

    const toggleButtons = screen.getAllByRole("button", { name: /expand topics/i });
    fireEvent.click(toggleButtons[0]!);
    fireEvent.click(toggleButtons[1]!);
    expect(screen.getByText("# incident")).toBeInTheDocument();
    expect(screen.getByText("# launch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /marketing/i }));

    await waitFor(() => {
      expect(screen.getByTestId("route-path")).toHaveTextContent("/stream/12-marketing");
    });
    await waitFor(() => {
      expect(screen.queryByText("# incident")).not.toBeInTheDocument();
      expect(screen.getByText("# launch")).toBeInTheDocument();
    });
  });

  it("collapses all expanded stream topics after non-chat navigation", async () => {
    const streamWithIncidentTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    const streamWithLaunchTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT_SECOND,
      topics: [{ subject: "launch", badge: 0, lastMessage: "Launch checklist" }],
    };

    renderWithProviders(
      <>
        <Sidebar
          streams={[]}
          selectedFolderId="all"
          sidebarChats={[streamWithIncidentTopic, streamWithLaunchTopic]}
          sidebarDms={[]}
        />
        <RouteNavigateButton to="/inbox" label="go-inbox" />
        <RoutePathProbe />
      </>,
    );

    const toggleButtons = screen.getAllByRole("button", { name: /expand topics/i });
    fireEvent.click(toggleButtons[0]!);
    fireEvent.click(toggleButtons[1]!);
    expect(screen.getByText("# incident")).toBeInTheDocument();
    expect(screen.getByText("# launch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "go-inbox" }));

    await waitFor(() => {
      expect(screen.getByTestId("route-path")).toHaveTextContent("/inbox");
    });
    await waitFor(() => {
      expect(screen.queryByText("# incident")).not.toBeInTheDocument();
      expect(screen.queryByText("# launch")).not.toBeInTheDocument();
    });
  });

  it("collapses expanded stream topics when a direct message chat is active", async () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

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
    const streamUnreadBadge = screen.getByText("3");
    const streamMetaRow = streamUnreadBadge.parentElement;

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
    expect(expandButton).toHaveClass("right-1.5");
    expect(expandButton).toHaveClass("top-2.5");
    expect(expandButton).toHaveClass("h-5");
    expect(expandButton).toHaveClass("w-5");
    expect(expandButton).toHaveClass("bg-bg/60");
    expect(expandButton).not.toHaveClass("opacity-0");
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
    expect(chatMenuButton).toHaveClass("top-8");
    expect(chatMenuButton).not.toHaveClass("top-1");
  });

  it("places topic mute control under topic unread badge", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 2, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        activeStreamSlug="11-engineering"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    const topicMuteButton = screen.getByRole("button", { name: /mute topic/i });
    const actionsContainer = topicMuteButton.parentElement;
    const topicLink = screen.getByRole("link", { name: /incident/i });

    expect(actionsContainer).toBeTruthy();
    expect(actionsContainer).toHaveClass("flex-col");
    expect(actionsContainer).toHaveClass("items-end");
    expect(within(topicLink).getByText("2")).toBeInTheDocument();
    expect(within(actionsContainer as HTMLElement).queryByText("2")).toBeNull();
  });

  it("uses effective mute state for topic action label when stream is muted", () => {
    useMuteStore.getState().muteStream(11);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /expand topics/i }));
    expect(screen.getByRole("button", { name: /unmute topic/i })).toBeInTheDocument();
  });

  it("uses visibility_policy=2 endpoint when unmuting topic in muted stream", async () => {
    useMuteStore.getState().muteStream(11);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /expand topics/i }));
    fireEvent.click(screen.getByRole("button", { name: /unmute topic/i }));

    await waitFor(() => {
      expect(unmuteTopicInMutedStreamMock).toHaveBeenCalledWith(11, "incident");
      expect(useMuteStore.getState().isTopicUnmuted(11, "incident")).toBe(true);
    });
  });

  it("rolls back topic mute and retries from inline error feedback when topic API fails", async () => {
    muteTopicMock.mockResolvedValue(false);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /expand topics/i }));
    fireEvent.click(screen.getByRole("button", { name: /mute topic/i }));

    await waitFor(() => {
      expect(muteTopicMock).toHaveBeenCalledWith(11, "incident");
      expect(useMuteStore.getState().isTopicMuted(11, "incident")).toBe(false);
      expect(screen.getByText(t("app.error"))).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(muteTopicMock).toHaveBeenCalledTimes(2);
    });
  });

  it("navigates to topic when topic unread badge is clicked", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 2, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <>
        <Sidebar
          streams={[]}
          selectedFolderId="all"
          activeStreamSlug="11-engineering"
          sidebarChats={[streamWithTopics]}
          sidebarDms={[]}
        />
        <RoutePathProbe />
      </>,
    );

    const topicLink = screen.getByRole("link", { name: /incident/i });
    fireEvent.click(within(topicLink).getByText("2"));

    expect(screen.getByTestId("route-path")).toHaveTextContent(
      "/stream/11-engineering/topic/incident",
    );
  });

  it("does not navigate when topic mute action is clicked", () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <>
        <Sidebar
          streams={[
            {
              stream_id: 11,
              name: "Engineering",
              lastMessage: "Deploy today",
              time: "12:10",
              topics: [{ subject: "incident", badge: 2, lastMessage: "Topic update" }],
            },
          ]}
          selectedFolderId="all"
          activeStreamSlug="11-engineering"
          sidebarDms={[]}
        />
        <RoutePathProbe />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /mute topic/i }));

    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
  });

  it("marks topic as done from topic row action", async () => {
    setTopicResolvedStateMock.mockResolvedValue(true);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <>
        <Sidebar
          streams={[]}
          selectedFolderId="all"
          activeStreamSlug="11-engineering"
          sidebarChats={[streamWithTopics]}
          sidebarDms={[]}
        />
        <RoutePathProbe />
      </>,
    );

    const markDoneButton = screen.getByRole("button", { name: /mark topic as done/i });
    fireEvent.click(markDoneButton);

    await waitFor(() => {
      expect(setTopicResolvedStateMock).toHaveBeenCalledWith(11, "incident", true);
    });
    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
  });

  it("marks resolved topic as not done from topic row action", async () => {
    setTopicResolvedStateMock.mockResolvedValue(true);
    const moveStreamTopicSpy = vi.spyOn(useChatListStore.getState(), "moveStreamTopic");
    const moveCurrentTopicSpy = vi.spyOn(
      useCurrentChatMessagesStore.getState(),
      "moveStreamTopicMessages",
    );
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "\u2714 incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: ["11-engineering"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="all"
        activeStreamSlug="11-engineering"
        sidebarChats={[streamWithTopics]}
        sidebarDms={[]}
      />,
    );

    const markNotDoneButton = screen.getByRole("button", { name: /mark topic as not done/i });
    fireEvent.click(markNotDoneButton);

    await waitFor(() => {
      expect(setTopicResolvedStateMock).toHaveBeenCalledWith(11, "\u2714 incident", false);
    });
    expect(moveStreamTopicSpy).toHaveBeenCalledWith({
      streamId: 11,
      oldTopic: "\u2714 incident",
      newTopic: "incident",
    });
    expect(moveCurrentTopicSpy).toHaveBeenCalledWith({
      streamId: 11,
      oldTopic: "\u2714 incident",
      newTopic: "incident",
    });
    moveStreamTopicSpy.mockRestore();
    moveCurrentTopicSpy.mockRestore();
  });
});
