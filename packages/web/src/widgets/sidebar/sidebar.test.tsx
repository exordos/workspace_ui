import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import type * as CreateChatApiModule from "~/features/create-chat/create-chat.api";
import type * as ExternalAccountsApiModule from "~/features/external-accounts/external-accounts.api";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import type * as MuteChatApiModule from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type * as PinChatApiModule from "~/features/pin-chat/pin-chat.api";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import type * as MessengerReadStateModule from "~/shared/api/messenger-read-state";
import type * as MessengerStreamsModule from "~/shared/api/messenger-streams";
import type * as WorkspaceApiModule from "~/shared/api/workspace-client";
import { setCurrentOrgRouteIdResolver } from "~/shared/lib/org-route";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { Sidebar } from "./sidebar.ui";

const createChannelMock = vi.fn();
const unarchiveChannelMock = vi.fn();
const markDmAsReadMock = vi.fn();
const markTopicAsReadMock = vi.fn();
const setTopicResolvedStateMock = vi.fn();
const renameStreamTopicMock = vi.fn();
const muteStreamMock = vi.fn();
const unmuteStreamMock = vi.fn();
const setStreamNotificationLevelMock = vi.fn();
const muteTopicMock = vi.fn();
const unmuteTopicMock = vi.fn();
const unmuteTopicInMutedStreamMock = vi.fn();
const setTopicVisibilityLevelMock = vi.fn();
const createStreamTopicMock = vi.fn();
const pinChatInFolderMock = vi.fn();
const unpinChatInFolderMock = vi.fn();
const getFoldersMock = vi.fn().mockResolvedValue([]);
const addChatToFolderMock = vi.fn();
const removeChatFromFolderMock = vi.fn();
const preflightExternalOperationMock = vi.hoisted(() => vi.fn());
const INSTANCE_ID = "sidebar-test-instance";
const ALL_FOLDER_UUID = "00000000-0000-0000-0000-000000000000";
const PERSONAL_FOLDER_UUID = "00000000-0000-0000-0000-000000000001";
const CHANNELS_FOLDER_UUID = "00000000-0000-0000-0000-000000000002";
const PRIVATE_STREAM_UUID = "6738f91a-4fd1-416e-807f-cb4ae00ec1d3";
const PRIVATE_STREAM_SECOND_UUID = "815890be-9819-46b1-9291-880602e62b96";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_SECOND_UUID = "22222222-2222-4222-8222-222222222222";
const TOPIC_UUID = "33333333-3333-4333-8333-333333333333";

function topicEntity(name: string, streamUuid = STREAM_UUID) {
  return {
    uuid: TOPIC_UUID,
    stream_uuid: streamUuid,
    name,
    unread_count: 0,
    is_default: false,
  };
}

vi.mock("~/features/create-chat/create-chat.api", async (importOriginal) => {
  const actual = await importOriginal<typeof CreateChatApiModule>();
  return {
    ...actual,
    createChannel: (...args: unknown[]) => createChannelMock(...args),
    unarchiveChannel: (...args: unknown[]) => unarchiveChannelMock(...args),
  };
});

vi.mock("~/shared/api/messenger-read-state", async (importOriginal) => {
  const actual = await importOriginal<typeof MessengerReadStateModule>();
  return {
    ...actual,
    markDmAsRead: (...args: unknown[]) => markDmAsReadMock(...args),
    markTopicAsRead: (...args: unknown[]) => markTopicAsReadMock(...args),
    setTopicResolvedState: (...args: unknown[]) => setTopicResolvedStateMock(...args),
    renameStreamTopic: (...args: unknown[]) => renameStreamTopicMock(...args),
  };
});

vi.mock("~/features/external-accounts/external-accounts.api", async (importOriginal) => {
  const actual = await importOriginal<typeof ExternalAccountsApiModule>();
  return {
    ...actual,
    preflightExternalOperation: (...args: unknown[]) => preflightExternalOperationMock(...args),
  };
});

vi.mock("~/features/mute-chat/mute-chat.api", async (importOriginal) => {
  const actual = await importOriginal<typeof MuteChatApiModule>();
  return {
    ...actual,
    muteStream: (...args: unknown[]) => muteStreamMock(...args),
    unmuteStream: (...args: unknown[]) => unmuteStreamMock(...args),
    setStreamNotificationLevel: (...args: unknown[]) => setStreamNotificationLevelMock(...args),
    muteTopic: (...args: unknown[]) => muteTopicMock(...args),
    unmuteTopic: (...args: unknown[]) => unmuteTopicMock(...args),
    unmuteTopicInMutedStream: (...args: unknown[]) => unmuteTopicInMutedStreamMock(...args),
    setTopicVisibilityLevel: (...args: unknown[]) => setTopicVisibilityLevelMock(...args),
  };
});

vi.mock("~/shared/api/messenger-streams", async (importOriginal) => {
  const actual = await importOriginal<typeof MessengerStreamsModule>();
  return {
    ...actual,
    createStreamTopic: (...args: unknown[]) => createStreamTopicMock(...args),
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
    getFolders: (...args: unknown[]) => getFoldersMock(...args),
    addChatToFolder: (...args: unknown[]) => addChatToFolderMock(...args),
    removeChatFromFolder: (...args: unknown[]) => removeChatFromFolderMock(...args),
  };
});

const PRIVATE_STREAM_CHAT: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  streamUuid: PRIVATE_STREAM_UUID,
  name: "Alice",
  private: true,
  lastMessage: "Hello",
  time: "10:13",
  topics: [],
};

const PRIVATE_STREAM_CHAT_SECOND: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  streamUuid: PRIVATE_STREAM_SECOND_UUID,
  name: "Bob",
  private: true,
  lastMessage: "Hi",
  time: "10:45",
  topics: [],
};

const STREAM_CHAT: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  streamUuid: STREAM_UUID,
  name: "Engineering",
  lastMessage: "Deploy today",
  time: "12:10",
  topics: [],
};

const STREAM_CHAT_SECOND: Extract<SidebarChat, { type: "stream" }> = {
  type: "stream",
  streamUuid: STREAM_SECOND_UUID,
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
    useMuteStore.getState().clear();
    usePinStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      dmUnreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
    useChatListStore.setState({ currentUserId: null });
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: [] });
    useSidebarConfigStore.getState().setSearchQuery("");
    useSidebarConfigStore.getState().setCreateChatOpen(false);
    useSettingsStore.getState().resetToDefaults();
    createChannelMock.mockReset();
    unarchiveChannelMock.mockReset();
    markDmAsReadMock.mockReset();
    markTopicAsReadMock.mockReset();
    setTopicResolvedStateMock.mockReset();
    renameStreamTopicMock.mockReset();
    setTopicResolvedStateMock.mockResolvedValue(topicEntity("\u2714 incident"));
    renameStreamTopicMock.mockResolvedValue(topicEntity("postmortem"));
    preflightExternalOperationMock.mockReset();
    preflightExternalOperationMock.mockResolvedValue({
      ok: true,
      value: {
        allowed: true,
        action: "messenger.topic.rename",
        target: { type: "topic", uuid: TOPIC_UUID },
        losses: [],
        requiresConfirmation: false,
      },
    });
    muteStreamMock.mockReset();
    unmuteStreamMock.mockReset();
    setStreamNotificationLevelMock.mockReset();
    muteTopicMock.mockReset();
    unmuteTopicMock.mockReset();
    unmuteTopicInMutedStreamMock.mockReset();
    setTopicVisibilityLevelMock.mockReset();
    createStreamTopicMock.mockReset();
    muteStreamMock.mockResolvedValue(true);
    unmuteStreamMock.mockResolvedValue(true);
    setStreamNotificationLevelMock.mockResolvedValue(true);
    muteTopicMock.mockResolvedValue(true);
    unmuteTopicMock.mockResolvedValue(true);
    unmuteTopicInMutedStreamMock.mockResolvedValue(true);
    setTopicVisibilityLevelMock.mockResolvedValue(true);
    pinChatInFolderMock.mockReset();
    unpinChatInFolderMock.mockReset();
    getFoldersMock.mockReset();
    getFoldersMock.mockResolvedValue([]);
    addChatToFolderMock.mockReset();
    removeChatFromFolderMock.mockReset();
    setCurrentOrgRouteIdResolver(null);
  });

  it("does not render the separate direct-messages section when sidebarChats is provided", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
      />,
    );

    expect(screen.queryByText(/direct messages/i)).not.toBeInTheDocument();
    expect(screen.getByText("#Alice")).toBeInTheDocument();
  });

  it("highlights private stream chat when route slug matches", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
        activeStreamSlug="6738f91a-4fd1-416e-807f-cb4ae00ec1d3"
      />,
    );

    const aliceLink = screen.getByRole("link", { name: /alice/i });
    expect(aliceLink).toHaveClass("bg-sidebar-hover");
  });

  it("закрывает модалку New chat и переходит в архивированный канал из вкладки Archived", async () => {
    useChatListStore.getState().clear();
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([
        { streamUuid: "00000000-0000-4000-8000-000000000501", name: "Legacy", isArchived: true },
      ]);
    useSidebarConfigStore.getState().setCreateChatOpen(true);

    renderWithProviders(
      <>
        <RoutePathProbe />
        <Sidebar
          streams={[]}
          selectedFolderId={ALL_FOLDER_UUID}
          sidebarChats={[PRIVATE_STREAM_CHAT]}
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

    expect(screen.getByTestId("route-path")).toHaveTextContent(
      "/stream/00000000-0000-4000-8000-000000000501",
    );
  });

  it("renders loading state for folder chat list", () => {
    // When loading a folder list explicitly, show a loading state (spinner + label).
    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId="folder-1" sidebarChats={[]} sidebarChatsLoading />,
    );

    expect(screen.getByRole("status", { name: t("app.loading") })).toBeInTheDocument();
    expect(screen.getByText(t("app.loading"))).toBeInTheDocument();
  });

  it("does not show folder list loading label when chats exist while sync is in flight", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId="folder-1"
        sidebarChats={[PRIVATE_STREAM_CHAT]}
        sidebarChatsLoading
      />,
    );

    expect(screen.queryByText(t("app.loading"))).not.toBeInTheDocument();
    expect(screen.getByText("#Alice")).toBeInTheDocument();
  });

  it("does not render legacy chats-and-channels heading", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: /chats\s*&\s*channels/i }),
    ).not.toBeInTheDocument();
  });

  it("uses semantic token classes for sidebar search input container", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/find/i);
    const searchContainer = searchInput.closest("label");

    expect(searchContainer).toHaveClass("bg-text-field-bg");
    expect(searchContainer).toHaveClass("border-border-subtle");
    expect(searchContainer).toHaveClass("focus-within:border-accent");
    expect(searchInput).toHaveClass("focus-visible:!outline-none");
  });

  it("uses design-size classes for sidebar shell and compose trigger", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
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
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
      />,
    );

    const dmLink = screen.getByRole("link", { name: /alice/i });
    expect(dmLink).toHaveClass("rounded-md");
    expect(dmLink).toHaveClass("px-2");
    expect(dmLink).toHaveClass("py-1.5");

    const avatarText = within(dmLink).getByText("#");
    const avatar = avatarText.closest("span");
    expect(avatar).not.toBeNull();
    expect(avatar).toHaveClass("w-8");
    expect(avatar).toHaveClass("h-8");
  });

  it("uses sidebar background token for sidebar scrollbar track", () => {
    const { container } = renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
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
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
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

  it("matches private stream chats by display title in sidebar search", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[STREAM_CHAT, PRIVATE_STREAM_CHAT]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: "alice" },
    });

    expect(screen.getByText("#Alice")).toBeInTheDocument();
    expect(screen.queryByText("#Engineering")).not.toBeInTheDocument();
  });

  it("matches stream chats by stream name in sidebar search", () => {
    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[STREAM_CHAT, PRIVATE_STREAM_CHAT]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: "engineering" },
    });

    expect(screen.getByText("#Engineering")).toBeInTheDocument();
    expect(screen.queryByText("#Alice")).not.toBeInTheDocument();
  });

  it("matches stream chats by topic name in sidebar search", () => {
    const streamWithTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "release-train", badge: 0 }],
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[streamWithTopic, PRIVATE_STREAM_CHAT]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: "release-train" },
    });

    expect(screen.getByText("#Engineering")).toBeInTheDocument();
    expect(screen.queryByText("#Alice")).not.toBeInTheDocument();
  });

  it("matches the system general-chat topic by its localized label in sidebar search", () => {
    const streamWithTopic: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "", badge: 0 }],
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[streamWithTopic, PRIVATE_STREAM_CHAT]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/find/i), {
      target: { value: t("chat.generalChat") },
    });

    expect(screen.getByText("#Engineering")).toBeInTheDocument();
    expect(screen.queryByText("#Alice")).not.toBeInTheDocument();
  });

  it("does not render the separate direct-messages section when sidebarChats is absent", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

    expect(screen.queryByText(/direct messages/i)).not.toBeInTheDocument();
  });

  it("shows empty-folder state when folder mode has no chats", () => {
    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId="custom-folder" sidebarChats={[]} />,
    );

    expect(screen.getByText(/folder is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/add chats from a chat menu/i)).toBeInTheDocument();
    expect(screen.queryByText(/direct messages/i)).not.toBeInTheDocument();
  });

  it("does not show empty-folder state in split sidebar mode", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

    expect(screen.queryByText(/folder is empty/i)).not.toBeInTheDocument();
  });

  it("does not render a static fake call footer by default", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

    expect(screen.queryByText(/calling, trying to connect/i)).not.toBeInTheDocument();
    expect(screen.queryByText("0:47")).not.toBeInTheDocument();
  });

  it("exposes activity toggle expanded state for assistive technologies", () => {
    useSidebarConfigStore.getState().setConfig({ activityOpen: true });
    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

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

    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

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

    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
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

    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    fireEvent.change(screen.getByPlaceholderText(/search users/i), { target: { value: "carol" } });
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /start chat/i })).toHaveClass("border-b-2");
    });
    expect(screen.getByPlaceholderText(/search users/i)).toHaveValue("");
  });

  it("supports keyboard navigation between create-chat tabs", () => {
    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    const startChatTab = screen.getByRole("tab", { name: /start chat/i });
    const browseChannelsTab = screen.getByRole("tab", { name: /^channels$/i });
    const createChannelTab = screen.getByRole("tab", { name: /create channel/i });
    const archivedChannelsTab = screen.getByRole("tab", { name: /archived channels/i });

    expect(startChatTab).toHaveAttribute("aria-selected", "true");
    expect(browseChannelsTab).toHaveAttribute("aria-selected", "false");

    startChatTab.focus();
    fireEvent.keyDown(startChatTab, { key: "ArrowRight" });

    expect(browseChannelsTab).toHaveFocus();
    expect(browseChannelsTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(browseChannelsTab, { key: "End" });
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
    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    const tablist = screen.getByRole("tablist", { name: /new chat/i });
    expect(tablist).toBeInTheDocument();

    const startChatTab = screen.getByRole("tab", { name: /start chat/i });
    const browseChannelsTab = screen.getByRole("tab", { name: /^channels$/i });
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
    expect(browseChannelsTab).toHaveAttribute("aria-selected", "true");
    expect(browseChannelsTab).toHaveAttribute("tabindex", "0");
    expect(startChatTab).toHaveAttribute("aria-selected", "false");
    expect(startChatTab).toHaveAttribute("tabindex", "-1");

    const browsePanelId = browseChannelsTab.getAttribute("aria-controls");
    expect(browsePanelId).toBeTruthy();
    const browsePanel = document.getElementById(browsePanelId!);
    expect(browsePanel).toBeInTheDocument();
    expect(browsePanel).toHaveAttribute("role", "tabpanel");
    expect(browsePanel).toHaveAttribute("aria-labelledby", browseChannelsTab.id);

    expect(createChannelTab).toHaveAttribute("aria-selected", "false");
    expect(archivedChannelsTab).toHaveAttribute("aria-selected", "false");
  });

  it("passes channel options and selected subscribers to createChannel", async () => {
    createChannelMock.mockResolvedValue({ streamId: "00000000-0000-4000-8000-000000000099" });
    useChatListStore.setState({ currentUserId: 1001 });
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 1001, full_name: "Alice Me", email: "alice@example.com" }),
        createUser({ user_id: 1002, full_name: "Bob Teammate", email: "bob@example.com" }),
        createUser({ user_id: 1003, full_name: "Carol Teammate", email: "carol@example.com" }),
      ]);

    renderWithProviders(<Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} />);

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
        subscribers: [1002],
        inviteOnly: true,
        announce: true,
      });
    });
  });

  it("marks topic as read from topic context menu via Workspace topic action", async () => {
    markTopicAsReadMock.mockResolvedValue(true);
    useInstancesStore.setState({
      instances: [
        {
          id: INSTANCE_ID,
          realm: "https://chat.example.com",
          login: "user@example.com",
          authType: "iam",
          iamAccessToken: "api-key",
        },
      ],
      currentInstanceId: INSTANCE_ID,
      unreadCountsByInstance: { [INSTANCE_ID]: 2 },
      dmUnreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });
    const streamWithTopics = {
      ...STREAM_CHAT,
      badge: 2,
      topics: [{ topicUuid: TOPIC_UUID, subject: "incident", badge: 2, lastMessage: "Need fix" }],
    };

    renderWithProviders(
      <Sidebar
        streams={[streamWithTopics]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    expect(screen.getByText("incident").parentElement).toHaveClass("font-semibold");

    fireEvent.contextMenu(screen.getByText("incident"));
    const markAsReadItem = await screen.findByRole("menuitem", { name: /mark as read/i });
    fireEvent.click(markAsReadItem);

    await waitFor(() => {
      expect(markTopicAsReadMock).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "incident",
        TOPIC_UUID,
      );
    });
  });

  it("keeps topic unread badge rendered when topic mark-as-read API fails", async () => {
    markTopicAsReadMock.mockResolvedValue(false);
    useInstancesStore.setState({
      instances: [
        {
          id: INSTANCE_ID,
          realm: "https://chat.example.com",
          login: "user@example.com",
          authType: "iam",
          iamAccessToken: "api-key",
        },
      ],
      currentInstanceId: INSTANCE_ID,
      unreadCountsByInstance: { [INSTANCE_ID]: 2 },
      dmUnreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });
    const streamWithTopics = {
      ...STREAM_CHAT,
      badge: 2,
      topics: [{ topicUuid: TOPIC_UUID, subject: "incident", badge: 2, lastMessage: "Need fix" }],
    };

    renderWithProviders(
      <Sidebar
        streams={[streamWithTopics]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[
          {
            ...STREAM_CHAT,
            badge: 2,
            topics: [
              { topicUuid: TOPIC_UUID, subject: "incident", badge: 2, lastMessage: "Need fix" },
            ],
          },
        ]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("incident"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /mark as read/i }));

    await waitFor(() => {
      expect(markTopicAsReadMock).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "incident",
        TOPIC_UUID,
      );
    });
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(2);
  });

  it("marks topic as done from topic context menu", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "Engineering" }]);
    useChatListStore.getState().setCurrentUserId(42);
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });
    const streamWithTopics = {
      ...STREAM_CHAT,
      topics: [{ topicUuid: TOPIC_UUID, subject: "incident", badge: 0, lastMessage: "Need fix" }],
    };

    renderWithProviders(
      <Sidebar
        streams={[streamWithTopics]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("incident"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /mark topic as done/i }));

    await waitFor(() => {
      expect(setTopicResolvedStateMock).toHaveBeenCalledWith(
        TOPIC_UUID,
        "11111111-1111-4111-8111-111111111111",
        "incident",
        true,
      );
    });
  });

  it("renames topic from topic context menu", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "Engineering" }]);
    useChatListStore.getState().setCurrentUserId(42);
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });
    const streamWithTopics = {
      ...STREAM_CHAT,
      topics: [{ topicUuid: TOPIC_UUID, subject: "incident", badge: 0, lastMessage: "Need fix" }],
    };

    renderWithProviders(
      <Sidebar
        streams={[streamWithTopics]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("incident"));
    expect(await screen.findByRole("menuitem", { name: /move to channel/i })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("menuitem", { name: /rename topic/i }));

    const input = await screen.findByRole("textbox", { name: /topic name/i });
    fireEvent.change(input, { target: { value: "postmortem" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(renameStreamTopicMock).toHaveBeenCalledWith(
        TOPIC_UUID,
        "11111111-1111-4111-8111-111111111111",
        "incident",
        "postmortem",
      );
    });
  });

  it("fails closed for external topic rename without the effective capability", async () => {
    const provider = {
      kind: "zulip",
      accountUuid: "external-account-1",
      externalId: "zulip-topic-1",
      capabilities: {},
    };
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "Engineering", provider }]);
    useChatListStore.getState().upsertStreamTopicShells(STREAM_UUID, [
      {
        topicUuid: TOPIC_UUID,
        streamUuid: STREAM_UUID,
        name: "incident",
        provider,
      },
    ]);
    useChatListStore.getState().setCurrentUserId(42);
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: [STREAM_UUID] });
    const streamWithTopics = {
      ...STREAM_CHAT,
      provider,
      topics: [
        { topicUuid: TOPIC_UUID, subject: "incident", badge: 0, lastMessage: "Need fix", provider },
      ],
    };

    renderWithProviders(
      <Sidebar
        streams={[streamWithTopics]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug={STREAM_UUID}
        sidebarChats={[streamWithTopics]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("incident"));
    await screen.findByRole("menuitem", { name: /mark as read/i });
    expect(screen.queryByRole("menuitem", { name: /rename topic/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /move to channel/i })).not.toBeInTheDocument();
    expect(preflightExternalOperationMock).not.toHaveBeenCalled();
  });

  it("preflights an allowed external topic rename before dispatch", async () => {
    renameStreamTopicMock.mockResolvedValue(topicEntity("postmortem"));
    const provider = {
      kind: "zulip",
      accountUuid: "external-account-1",
      externalId: "zulip-topic-1",
      capabilities: {
        "messenger.topic.rename": { available: true, revision: 1, limits: {} },
      },
    };
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "Engineering", provider }]);
    useChatListStore.getState().upsertStreamTopicShells(STREAM_UUID, [
      {
        topicUuid: TOPIC_UUID,
        streamUuid: STREAM_UUID,
        name: "incident",
        provider,
      },
    ]);
    useChatListStore.getState().setCurrentUserId(42);
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: [STREAM_UUID] });
    const streamWithTopics = {
      ...STREAM_CHAT,
      provider,
      topics: [
        { topicUuid: TOPIC_UUID, subject: "incident", badge: 0, lastMessage: "Need fix", provider },
      ],
    };

    renderWithProviders(
      <Sidebar
        streams={[streamWithTopics]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug={STREAM_UUID}
        sidebarChats={[streamWithTopics]}
      />,
    );
    fireEvent.contextMenu(screen.getByText("incident"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /rename topic/i }));
    fireEvent.change(await screen.findByRole("textbox", { name: /topic name/i }), {
      target: { value: "postmortem" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(preflightExternalOperationMock).toHaveBeenCalledWith({
        externalAccountUuid: "external-account-1",
        action: "messenger.topic.rename",
        target: { type: "topic", uuid: TOPIC_UUID },
      });
      expect(renameStreamTopicMock).toHaveBeenCalledWith(
        TOPIC_UUID,
        STREAM_UUID,
        "incident",
        "postmortem",
      );
    });
  });

  it("requires confirmation for lossy external topic rename and honors cancel", async () => {
    renameStreamTopicMock.mockResolvedValue(topicEntity("postmortem"));
    preflightExternalOperationMock.mockResolvedValue({
      ok: true,
      value: {
        allowed: true,
        action: "messenger.topic.rename",
        target: { type: "topic", uuid: TOPIC_UUID },
        losses: [{ code: "metadata", message: "Provider metadata will be simplified." }],
        requiresConfirmation: true,
      },
    });
    const provider = {
      kind: "zulip",
      accountUuid: "external-account-1",
      externalId: "zulip-topic-1",
      capabilities: {
        "messenger.topic.rename": { available: true, revision: 1, limits: {} },
      },
    };
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "Engineering", provider }]);
    useChatListStore.getState().upsertStreamTopicShells(STREAM_UUID, [
      {
        topicUuid: TOPIC_UUID,
        streamUuid: STREAM_UUID,
        name: "incident",
        provider,
      },
    ]);
    useChatListStore.getState().setCurrentUserId(42);
    useSidebarConfigStore.getState().setConfig({ expandedStreamSlugs: [STREAM_UUID] });
    const streamWithTopics = {
      ...STREAM_CHAT,
      provider,
      topics: [
        { topicUuid: TOPIC_UUID, subject: "incident", badge: 0, lastMessage: "Need fix", provider },
      ],
    };

    renderWithProviders(
      <Sidebar
        streams={[streamWithTopics]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug={STREAM_UUID}
        sidebarChats={[streamWithTopics]}
      />,
    );
    fireEvent.contextMenu(screen.getByText("incident"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /rename topic/i }));
    fireEvent.change(await screen.findByRole("textbox", { name: /topic name/i }), {
      target: { value: "postmortem" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Provider metadata will be simplified.")).toBeInTheDocument();
    expect(renameStreamTopicMock).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: /cancel/i }),
    );
    expect(renameStreamTopicMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByText("incident"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /rename topic/i }));
    fireEvent.change(await screen.findByRole("textbox", { name: /topic name/i }), {
      target: { value: "postmortem" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(
      within(confirmation).getByText("Provider metadata will be simplified."),
    ).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: /continue anyway/i }));
    await waitFor(() => expect(renameStreamTopicMock).toHaveBeenCalledTimes(1));
  });

  it("does not show pin action in personal system folder stream context menu", async () => {
    useFolderSyncStore.setState({
      folders: [
        {
          id: PERSONAL_FOLDER_UUID,
          label: "Personal",
          backgroundColor: 0,
          systemType: "personal",
        },
      ],
    });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={PERSONAL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("#Alice"));

    await screen.findByRole("menuitem", { name: /mark as read/i });
    expect(screen.queryByRole("menuitem", { name: /^pin$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^unpin$/i })).not.toBeInTheDocument();
  });

  it("shows pin action in private stream context menu and pins chat in selected folder", async () => {
    useFolderSyncStore.setState({ allFolderApiUuid: ALL_FOLDER_UUID });
    getFoldersMock.mockResolvedValue([
      {
        uuid: ALL_FOLDER_UUID,
        title: "All",
        created_at: "",
        updated_at: "",
        background_color_value: 0,
        unread_count: 0,
        system_type: "all",
        folder_items: [
          {
            uuid: "item-42",
            stream_uuid: "6738f91a-4fd1-416e-807f-cb4ae00ec1d3",
            chat_type: "stream",
            folder: ALL_FOLDER_UUID,
            order_index: 0,
            pinned_at: null,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ]);
    pinChatInFolderMock.mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("#Alice"));

    const pinItem = await screen.findByRole("menuitem", { name: /^pin$/i });
    fireEvent.click(pinItem);

    await waitFor(() => {
      expect(getFoldersMock).toHaveBeenCalled();
      expect(pinChatInFolderMock).toHaveBeenCalledWith(ALL_FOLDER_UUID, "item-42");
      expect(
        usePinStore
          .getState()
          .isPinned(ALL_FOLDER_UUID, "stream:6738f91a-4fd1-416e-807f-cb4ae00ec1d3:general"),
      ).toBe(true);
    });
  });

  it("pins stream chat when folder item uses stream_uuid", async () => {
    getFoldersMock.mockResolvedValue([
      {
        uuid: "custom-folder",
        title: "Custom",
        created_at: "",
        updated_at: "",
        background_color_value: 0,
        unread_count: 0,
        system_type: "created",
        folder_items: [
          {
            uuid: "item-11",
            stream_uuid: "11111111-1111-4111-8111-111111111111",
            chat_type: "stream",
            folder: "custom-folder",
            order_index: 0,
            pinned_at: null,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ]);
    pinChatInFolderMock.mockResolvedValue(true);

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId="custom-folder" sidebarChats={[STREAM_CHAT]} />,
    );

    const streamRow = screen.getByRole("link", { name: /engineering/i });
    fireEvent.contextMenu(streamRow);
    fireEvent.click(await screen.findByRole("menuitem", { name: /^pin$/i }));

    await waitFor(() => {
      expect(getFoldersMock).toHaveBeenCalled();
      expect(pinChatInFolderMock).toHaveBeenCalledWith("custom-folder", "item-11");
    });
  });

  it("shows unpin action in private stream context menu when chat is already pinned", async () => {
    useFolderSyncStore.setState({ allFolderApiUuid: ALL_FOLDER_UUID });
    usePinStore
      .getState()
      .pinChat(ALL_FOLDER_UUID, "stream:6738f91a-4fd1-416e-807f-cb4ae00ec1d3:general", {
        folderItemUuid: "item-42",
      });
    unpinChatInFolderMock.mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("#Alice"));

    const unpinItem = await screen.findByRole("menuitem", { name: /^unpin$/i });
    fireEvent.click(unpinItem);

    await waitFor(() => {
      expect(unpinChatInFolderMock).toHaveBeenCalledWith(ALL_FOLDER_UUID, "item-42");
      expect(
        usePinStore
          .getState()
          .isPinned(ALL_FOLDER_UUID, "stream:6738f91a-4fd1-416e-807f-cb4ae00ec1d3:general"),
      ).toBe(false);
    });
  });

  it("navigates to pinned private stream without leaving org scope on click", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");
    usePinStore
      .getState()
      .pinChat(ALL_FOLDER_UUID, "stream:6738f91a-4fd1-416e-807f-cb4ae00ec1d3:general", {
        folderItemUuid: "item-42",
        pinnedAt: "2026-03-14T12:00:00Z",
      });

    renderWithProviders(
      <>
        <Sidebar
          streams={[]}
          selectedFolderId={ALL_FOLDER_UUID}
          sidebarChats={[PRIVATE_STREAM_CHAT, PRIVATE_STREAM_CHAT_SECOND]}
        />
        <RoutePathProbe />
      </>,
      { route: "/org/chat.example.com/inbox" },
    );

    fireEvent.click(screen.getByRole("link", { name: /alice/i }));

    expect(screen.getByTestId("route-path")).toHaveTextContent(
      "/org/chat.example.com/stream/6738f91a-4fd1-416e-807f-cb4ae00ec1d3",
    );
  });

  it("prefixes folder private stream links with current org route", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT]}
      />,
    );

    expect(screen.getByRole("link", { name: /alice/i })).toHaveAttribute(
      "href",
      "/org/chat.example.com/stream/6738f91a-4fd1-416e-807f-cb4ae00ec1d3",
    );
  });

  it("renders pinned private stream chats before unpinned ones", () => {
    useFolderSyncStore.setState({ allFolderApiUuid: ALL_FOLDER_UUID });
    usePinStore
      .getState()
      .pinChat(ALL_FOLDER_UUID, "stream:815890be-9819-46b1-9291-880602e62b96:general", {
        folderItemUuid: "item-77",
        pinnedAt: "2026-03-14T12:00:00Z",
      });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[PRIVATE_STREAM_CHAT, PRIVATE_STREAM_CHAT_SECOND]}
      />,
    );

    const streamLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/stream/"));
    expect(streamLinks[0]).toHaveAttribute("href", "/stream/815890be-9819-46b1-9291-880602e62b96");
    expect(streamLinks[1]).toHaveAttribute("href", "/stream/6738f91a-4fd1-416e-807f-cb4ae00ec1d3");
  });

  it("renders pinned stream chats before unpinned ones when folder item uses stream_uuid", () => {
    useFolderSyncStore.setState({ allFolderApiUuid: ALL_FOLDER_UUID });
    usePinStore.getState().setFromServer([
      {
        folderUuid: ALL_FOLDER_UUID,
        folderItemUuid: "item-12",
        chatId: `stream:${STREAM_SECOND_UUID}:general`,
        orderIndex: 0,
        pinnedAt: "2026-03-14T12:00:00Z",
      },
    ]);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[STREAM_CHAT, STREAM_CHAT_SECOND]}
      />,
    );

    const streamLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/stream/"));
    expect(streamLinks[0]).toHaveAttribute("href", "/stream/22222222-2222-4222-8222-222222222222");
    expect(streamLinks[1]).toHaveAttribute("href", "/stream/11111111-1111-4111-8111-111111111111");
  });

  it("uses pinFolderId to order chats in system folders", () => {
    usePinStore.getState().setFromServer([
      {
        folderUuid: ALL_FOLDER_UUID,
        folderItemUuid: "item-12",
        chatId: `stream:${STREAM_SECOND_UUID}:general`,
        orderIndex: 0,
        pinnedAt: "2026-03-14T12:00:00Z",
      },
    ]);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={CHANNELS_FOLDER_UUID}
        pinFolderId={ALL_FOLDER_UUID}
        sidebarChats={[STREAM_CHAT, STREAM_CHAT_SECOND]}
      />,
    );

    const streamLink = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href")?.startsWith("/stream/"));
    expect(streamLink).toHaveAttribute("href", "/stream/22222222-2222-4222-8222-222222222222");
  });

  it("uses pinFolderId for pin action in system folders", async () => {
    getFoldersMock.mockResolvedValue([
      {
        uuid: ALL_FOLDER_UUID,
        title: "All",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        background_color_value: 0,
        unread_count: 0,
        system_type: "all",
        folder_items: [
          {
            uuid: "item-11",
            stream_uuid: "11111111-1111-4111-8111-111111111111",
            chat_type: "stream",
            folder: ALL_FOLDER_UUID,
            order_index: 0,
            pinned_at: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    ]);
    pinChatInFolderMock.mockResolvedValue(true);

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={CHANNELS_FOLDER_UUID}
        pinFolderId={ALL_FOLDER_UUID}
        sidebarChats={[STREAM_CHAT]}
      />,
    );

    const streamRow = screen.getByRole("link", { name: /engineering/i });
    fireEvent.contextMenu(streamRow);

    fireEvent.click(await screen.findByRole("menuitem", { name: /^pin$/i }));

    await waitFor(() => {
      expect(getFoldersMock).toHaveBeenCalled();
      expect(pinChatInFolderMock).toHaveBeenCalledWith(ALL_FOLDER_UUID, "item-11");
    });
  });

  it("opens inline new-topic input from stream context menu action", async () => {
    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} sidebarChats={[STREAM_CHAT]} />,
    );

    fireEvent.contextMenu(screen.getByText("#Engineering"));

    const createTopicItem = await screen.findByRole("menuitem", { name: /new topic/i });
    fireEvent.click(createTopicItem);

    expect(await screen.findByRole("textbox", { name: /topic name/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /create topic/i })).not.toBeInTheDocument();
  });

  it("creates stream topic through server API from inline context-menu input", async () => {
    createStreamTopicMock.mockResolvedValue({
      uuid: "33333333-3333-4333-8333-333333333333",
      name: "release",
      stream_uuid: STREAM_UUID,
      unread_count: 0,
      is_default: false,
    });

    renderWithProviders(
      <>
        <Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} sidebarChats={[STREAM_CHAT]} />
        <RoutePathProbe />
      </>,
    );

    fireEvent.contextMenu(screen.getByText("#Engineering"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /new topic/i }));

    const topicNameInput = await screen.findByRole("textbox", { name: /topic name/i });
    fireEvent.change(topicNameInput, { target: { value: "release" } });
    fireEvent.keyDown(topicNameInput, { key: "Enter" });

    await waitFor(() => {
      expect(createStreamTopicMock).toHaveBeenCalledWith({
        streamUuid: STREAM_UUID,
        name: "release",
      });
      expect(setTopicVisibilityLevelMock).not.toHaveBeenCalled();
      expect(screen.getByTestId("route-path")).toHaveTextContent(
        "/stream/11111111-1111-4111-8111-111111111111/topic/33333333-3333-4333-8333-333333333333",
      );
    });
  });

  it("opens stream context menu from keyboard on focused stream row", async () => {
    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} sidebarChats={[STREAM_CHAT]} />,
    );

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    streamLink.focus();
    fireEvent.keyDown(streamLink, { key: "ContextMenu" });

    expect(await screen.findByRole("menuitem", { name: /mark as read/i })).toBeInTheDocument();
  });

  it("rolls back stream notification level and shows retry feedback when API call fails", async () => {
    setStreamNotificationLevelMock.mockResolvedValue(false);

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} sidebarChats={[STREAM_CHAT]} />,
    );

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    fireEvent.contextMenu(streamLink);

    const mutedOption = await screen.findByRole("radio", { name: /muted/i });
    fireEvent.click(mutedOption);

    await waitFor(() => {
      expect(setStreamNotificationLevelMock).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "muted",
      );
      expect(useMuteStore.getState().getStreamNotificationLevel(STREAM_UUID)).toBe("subscribed");
      expect(screen.getByText(t("app.error"))).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(setStreamNotificationLevelMock).toHaveBeenCalledTimes(2);
    });
  });

  it("adds stream chat to folder from context submenu item click", async () => {
    getFoldersMock
      .mockResolvedValueOnce([
        {
          uuid: "all-folder",
          title: "All",
          created_at: "",
          updated_at: "",
          background_color_value: 0xff8438,
          unread_count: 0,
          system_type: "all",
          folder_items: [],
        },
        {
          uuid: "work-folder",
          title: "Work",
          created_at: "",
          updated_at: "",
          background_color_value: 0x3a92ff,
          unread_count: 0,
          system_type: "created",
          // Initially empty: user action should ADD the stream.
          folder_items: [],
        },
      ])
      .mockResolvedValue([
        {
          uuid: "all-folder",
          title: "All",
          created_at: "",
          updated_at: "",
          background_color_value: 0xff8438,
          unread_count: 0,
          system_type: "all",
          folder_items: [],
        },
        {
          uuid: "work-folder",
          title: "Work",
          created_at: "",
          updated_at: "",
          background_color_value: 0x3a92ff,
          unread_count: 0,
          system_type: "created",
          // After add: server returns the assignment in the folders list.
          folder_items: [
            {
              uuid: "work-item-1",
              stream_uuid: "11111111-1111-4111-8111-111111111111",
              chat_type: "stream",
              folder: "work-folder",
              order_index: 0,
              pinned_at: null,
              created_at: "",
              updated_at: "",
            },
          ],
        },
      ]);
    addChatToFolderMock.mockResolvedValue(true);

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} sidebarChats={[STREAM_CHAT]} />,
    );

    fireEvent.contextMenu(screen.getByText("#Engineering"));

    const addToFolderItem = await screen.findByRole("menuitem", { name: /add to folder/i });
    fireEvent.click(addToFolderItem);

    const workFolderItem = await screen.findByRole("menuitemcheckbox", { name: /work/i });
    fireEvent.click(workFolderItem);

    await waitFor(() => {
      expect(addChatToFolderMock).toHaveBeenCalledWith(
        "work-folder",
        "stream:11111111-1111-4111-8111-111111111111:general",
      );
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
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    expect(screen.getByText("incident")).toBeInTheDocument();
  });

  it("renders server-provided general-chat topic as a literal topic", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: t("chat.generalChat"), badge: 0, lastMessage: "User topic" }],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    const userTopicLabel = screen.getByText(t("chat.generalChat"));
    expect(userTopicLabel).not.toHaveClass("italic");
    expect(userTopicLabel.closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining(`/topic/${encodeURIComponent(t("chat.generalChat"))}`),
    );
  });

  it("shows only three topics and expands the rest via show-more button", () => {
    const streamWithManyTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [
        { subject: "topic-a", badge: 0, lastMessage: "A" },
        { subject: "topic-b", badge: 0, lastMessage: "B" },
        { subject: "topic-c", badge: 0, lastMessage: "C" },
        { subject: "topic-d", badge: 0, lastMessage: "D" },
        { subject: "topic-e", badge: 0, lastMessage: "E" },
      ],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithManyTopics]}
      />,
    );

    expect(screen.getByText("topic-a")).toBeInTheDocument();
    expect(screen.getByText("topic-b")).toBeInTheDocument();
    expect(screen.getByText("topic-c")).toBeInTheDocument();
    expect(screen.queryByText("topic-d")).not.toBeInTheDocument();
    expect(screen.queryByText("topic-e")).not.toBeInTheDocument();

    const showMoreButton = screen.getByRole("button", {
      name: t("channel.showMoreTopicsWithCount", { count: 2 }),
    });
    fireEvent.click(showMoreButton);

    expect(screen.getByText("topic-d")).toBeInTheDocument();
    expect(screen.getByText("topic-e")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("channel.hideExtraTopics") })).toBeInTheDocument();
  });

  it("shows topic last message sender name in folder stream list", async () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      lastMessageSenderName: "Stream Sender",
      topics: [
        {
          subject: "incident",
          badge: 0,
          lastMessage: "Topic update",
          lastMessageSenderName: "Topic Sender",
        },
      ],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("incident")).toBeInTheDocument();
      expect(screen.getByText("Stream Sender")).toBeInTheDocument();
      expect(screen.getByText("Topic Sender")).toBeInTheDocument();
    });
  });

  it("hides topic sender row in folder stream list when sender name is missing", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} sidebarChats={[streamWithTopics]} />,
    );

    expect(screen.queryByText(t("roles.member"))).not.toBeInTheDocument();
  });

  it("shows topic last message sender name in stream list when sidebarChats is absent", () => {
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[
          {
            streamUuid: STREAM_UUID,
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
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
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
          selectedFolderId={ALL_FOLDER_UUID}
          sidebarChats={[streamWithTopics]}
        />
        <RoutePathProbe />
      </>,
    );

    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
    expect(screen.queryByText("incident")).not.toBeInTheDocument();

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    fireEvent.click(within(streamLink).getByText("3"));

    expect(screen.getByText("incident")).toBeInTheDocument();
    expect(screen.getByTestId("route-path")).toHaveTextContent(
      "/stream/11111111-1111-4111-8111-111111111111",
    );
  });

  it("opens stream from stream list when unread badge in meta area is clicked", () => {
    renderWithProviders(
      <>
        <Sidebar
          streams={[
            {
              streamUuid: STREAM_UUID,
              name: "Engineering",
              lastMessage: "Deploy today",
              time: "12:10",
              badge: 3,
              topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
            },
          ]}
          selectedFolderId={ALL_FOLDER_UUID}
        />
        <RoutePathProbe />
      </>,
    );

    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
    expect(screen.queryByText("incident")).not.toBeInTheDocument();

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    fireEvent.click(within(streamLink).getByText("3"));

    expect(screen.getByText("incident")).toBeInTheDocument();
    expect(screen.getByTestId("route-path")).toHaveTextContent(
      "/stream/11111111-1111-4111-8111-111111111111",
    );
  });

  it("auto-expands stream topics when stream is clicked in sidebar", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} sidebarChats={[streamWithTopics]} />,
    );

    expect(screen.queryByText("incident")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("#Engineering"));
    expect(screen.getByText("incident")).toBeInTheDocument();
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
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[streamWithIncidentTopic, streamWithLaunchTopic]}
      />,
    );

    const toggleButtons = screen.getAllByRole("button", { name: /expand topics/i });
    fireEvent.click(toggleButtons[0]!);
    fireEvent.click(toggleButtons[1]!);

    expect(screen.getByText("incident")).toBeInTheDocument();
    expect(screen.getByText("launch")).toBeInTheDocument();
  });

  it("keeps stream topics expanded after manual toggle when private stream is present", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[streamWithTopics, PRIVATE_STREAM_CHAT]}
      />,
    );

    const toggleButtons = screen.getAllByRole("button", { name: /expand topics/i });
    fireEvent.click(toggleButtons[0]!);

    expect(screen.getByText("incident")).toBeInTheDocument();
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
          selectedFolderId={ALL_FOLDER_UUID}
          sidebarChats={[streamWithIncidentTopic, streamWithLaunchTopic]}
        />
        <RoutePathProbe />
      </>,
    );

    const toggleButtons = screen.getAllByRole("button", { name: /expand topics/i });
    fireEvent.click(toggleButtons[0]!);
    fireEvent.click(toggleButtons[1]!);
    expect(screen.getByText("incident")).toBeInTheDocument();
    expect(screen.getByText("launch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /marketing/i }));

    await waitFor(() => {
      expect(screen.getByTestId("route-path")).toHaveTextContent(
        "/stream/22222222-2222-4222-8222-222222222222",
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("incident")).not.toBeInTheDocument();
      expect(screen.getByText("launch")).toBeInTheDocument();
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
          selectedFolderId={ALL_FOLDER_UUID}
          sidebarChats={[streamWithIncidentTopic, streamWithLaunchTopic]}
        />
        <RouteNavigateButton to="/inbox" label="go-inbox" />
        <RoutePathProbe />
      </>,
    );

    const toggleButtons = screen.getAllByRole("button", { name: /expand topics/i });
    fireEvent.click(toggleButtons[0]!);
    fireEvent.click(toggleButtons[1]!);
    expect(screen.getByText("incident")).toBeInTheDocument();
    expect(screen.getByText("launch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "go-inbox" }));

    await waitFor(() => {
      expect(screen.getByTestId("route-path")).toHaveTextContent("/inbox");
    });
    await waitFor(() => {
      expect(screen.queryByText("incident")).not.toBeInTheDocument();
      expect(screen.queryByText("launch")).not.toBeInTheDocument();
    });
  });

  it("collapses expanded stream topics when a direct message chat is active", async () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        sidebarChats={[streamWithTopics, PRIVATE_STREAM_CHAT]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("incident")).not.toBeInTheDocument();
    });
  });

  it("places stream chat-menu trigger under counters and keeps avatar overlay toggle", () => {
    const streamWithUnread: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      badge: 3,
    };

    renderWithProviders(
      <Sidebar streams={[]} selectedFolderId={ALL_FOLDER_UUID} sidebarChats={[streamWithUnread]} />,
    );

    const chatMenuButton = screen.getByRole("button", { name: /chat menu/i });
    const expandButton = screen.getByRole("button", { name: /expand topics/i });
    const streamUnreadBadge = screen.getByText("3");
    const streamMetaRow = streamUnreadBadge.parentElement;

    expect(streamMetaRow).not.toBeNull();
    expect(streamMetaRow!).toContainElement(streamUnreadBadge);
    expect(streamMetaRow!).toHaveClass("items-center");
    expect(streamMetaRow!).not.toHaveClass("flex-col");

    expect(chatMenuButton).toHaveClass("right-7");
    expect(chatMenuButton).not.toHaveClass("right-2");
    expect(chatMenuButton).toHaveClass("top-2.5");
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

  it("places topic notification cycle button under topic unread badge", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 2, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    const topicLink = screen.getByRole("link", { name: /incident/i });
    const topicRow = topicLink.parentElement!.parentElement as HTMLElement;
    const notificationButton = within(topicRow).getByRole("button", {
      name: t("channel.topicVisibilityDefault"),
    });
    const actionsContainer = notificationButton.closest(".flex-col");

    expect(actionsContainer).toBeTruthy();
    expect(actionsContainer).toHaveClass("flex-col");
    expect(actionsContainer).toHaveClass("items-end");
    expect(within(topicLink).getByText("2")).toBeInTheDocument();
    expect(within(actionsContainer as HTMLElement).queryByText("2")).toBeNull();
  });

  it("shows inherit (default) visibility for topic when stream is muted", () => {
    useMuteStore.getState().muteStream(STREAM_UUID);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    const topicLink = screen.getByRole("link", { name: /incident/i });
    const topicRow = topicLink.parentElement!.parentElement as HTMLElement;
    expect(
      within(topicRow).getByRole("button", { name: t("channel.topicVisibilityDefault") }),
    ).toBeInTheDocument();
  });

  it("sets unmuted visibility when cycling topic in muted stream", async () => {
    useMuteStore.getState().muteStream(STREAM_UUID);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    const topicLink = await screen.findByRole("link", { name: /incident/i });
    const topicRow = topicLink.parentElement!.parentElement as HTMLElement;
    fireEvent.click(
      within(topicRow).getByRole("button", { name: t("channel.topicVisibilityDefault") }),
    );

    await waitFor(() => {
      expect(setTopicVisibilityLevelMock).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "incident",
        "unmuted",
      );
      expect(useMuteStore.getState().isTopicUnmuted(STREAM_UUID, "incident")).toBe(true);
    });
  });

  it("rolls back topic visibility level and retries from inline error feedback when topic API fails", async () => {
    setTopicVisibilityLevelMock.mockResolvedValue(false);
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 0, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <Sidebar
        streams={[]}
        selectedFolderId={ALL_FOLDER_UUID}
        activeStreamSlug="11111111-1111-4111-8111-111111111111"
        sidebarChats={[streamWithTopics]}
      />,
    );

    const topicLink = await screen.findByRole("link", { name: /incident/i });
    const topicRow = topicLink.parentElement!.parentElement as HTMLElement;
    fireEvent.click(
      within(topicRow).getByRole("button", { name: t("channel.topicVisibilityDefault") }),
    );

    await waitFor(() => {
      expect(setTopicVisibilityLevelMock).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "incident",
        "followed",
      );
      expect(useMuteStore.getState().getTopicVisibilityLevel(STREAM_UUID, "incident")).toBe(
        "inherit",
      );
    });
    expect(screen.getByText(t("app.error"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(setTopicVisibilityLevelMock).toHaveBeenCalledTimes(2);
    });
  });

  it("navigates to topic when topic unread badge is clicked", () => {
    const streamWithTopics: Extract<SidebarChat, { type: "stream" }> = {
      ...STREAM_CHAT,
      topics: [{ subject: "incident", badge: 2, lastMessage: "Topic update" }],
    };
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <>
        <Sidebar
          streams={[]}
          selectedFolderId={ALL_FOLDER_UUID}
          activeStreamSlug="11111111-1111-4111-8111-111111111111"
          sidebarChats={[streamWithTopics]}
        />
        <RoutePathProbe />
      </>,
    );

    const topicLink = screen.getByRole("link", { name: /incident/i });
    fireEvent.click(within(topicLink).getByText("2"));

    expect(screen.getByTestId("route-path")).toHaveTextContent(
      "/stream/11111111-1111-4111-8111-111111111111/topic/incident",
    );
  });

  it("does not navigate when topic notification switch is clicked", async () => {
    useSidebarConfigStore
      .getState()
      .setConfig({ expandedStreamSlugs: ["11111111-1111-4111-8111-111111111111"] });

    renderWithProviders(
      <>
        <Sidebar
          streams={[
            {
              streamUuid: STREAM_UUID,
              name: "Engineering",
              lastMessage: "Deploy today",
              time: "12:10",
              topics: [{ subject: "incident", badge: 2, lastMessage: "Topic update" }],
            },
          ]}
          selectedFolderId={ALL_FOLDER_UUID}
          activeStreamSlug="11111111-1111-4111-8111-111111111111"
        />
        <RoutePathProbe />
      </>,
    );

    const topicLink = await screen.findByRole("link", { name: /incident/i });
    const topicRow = topicLink.parentElement!.parentElement as HTMLElement;
    fireEvent.click(
      within(topicRow).getByRole("button", { name: t("channel.topicVisibilityDefault") }),
    );

    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
  });
});
