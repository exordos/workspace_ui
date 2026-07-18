import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import type * as UserApi from "~/entities/user/api/user.api";
import {
  removeUserStatusAwayPreference,
  writeUserStatusAwayPreference,
} from "~/entities/user/user-status-away-preference.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { useAddStreamMembersStore } from "~/features/add-stream-members/add-stream-members.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import type * as ExternalAccountsApiModule from "~/features/external-accounts/external-accounts.api";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import * as muteChat from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { setLocale, t } from "~/i18n/i18n";
import * as messengerStreams from "~/shared/api/messenger-streams";
import type { WorkspaceStreamRole } from "~/shared/api/messenger.types";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { resetRealmEmojisCacheForTests } from "~/shared/lib/realm-emojis-cache";
import { resetToastStateForTests, useToastStore } from "~/shared/lib/toast/toast.model";
import { userIdStorageKey, type UserId } from "~/shared/lib/user-id.lib";
import { renderWithProviders } from "~/test/render";
import { RightPanelShell } from "./right-panel-shell.ui";
import { RightPanelUserProfileHeader } from "./right-panel-user-profile-header.ui";
import type * as ReactRouterDom from "react-router-dom";

const fetchVersionCatalogMock = vi.hoisted(() => vi.fn());
const useAppUpdateMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const statusEmojiPickerMock = vi.hoisted(() => vi.fn());
const fetchRealmEmojisMock = vi.hoisted(() => vi.fn());
const updateOwnStatusMock = vi.hoisted(() => vi.fn());
const preflightExternalOperationMock = vi.hoisted(() => vi.fn());
const ENGINEERING_STREAM_UUID = "00000000-0000-4000-8000-000000000010";
const DESIGN_STREAM_UUID = "00000000-0000-4000-8000-000000000011";
const RELEASE_TOPIC_UUID = "00000000-0000-4000-8000-000000000210";
const ADMIN_USER_UUID = "00000000-0000-4000-8000-000000000042";
const ALICE_USER_UUID = "00000000-0000-4000-8000-000000000077";
const BOB_USER_UUID = "00000000-0000-4000-8000-000000000088";
const ALICE_BINDING_UUID = "10000000-0000-4000-8000-000000000077";

function setCurrentStreamRole(userId: UserId, role: WorkspaceStreamRole = "owner"): void {
  useChatInfoStore.setState((state) => ({
    streamMemberRolesByUserId: {
      ...state.streamMemberRolesByUserId,
      [userIdStorageKey(userId)]: role,
    },
  }));
}

function setStreamMemberBinding(userId: UserId, bindingUuid: string): void {
  useChatInfoStore.setState((state) => ({
    streamMemberBindingUuidsByUserId: {
      ...state.streamMemberBindingUuidsByUserId,
      [userIdStorageKey(userId)]: bindingUuid,
    },
  }));
}

function openMemberContextMenu(name: string): void {
  fireEvent.contextMenu(
    screen.getByRole("button", { name: new RegExp(`open profile: ${name}`, "i") }),
  );
}

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

vi.mock("~/features/external-accounts/zulip-external-account.ui", () => ({
  ZulipExternalAccountCard: () => "Zulip external account card",
}));

vi.mock("~/features/external-accounts/external-accounts.api", async (importOriginal) => {
  const actual = await importOriginal<typeof ExternalAccountsApiModule>();
  return {
    ...actual,
    preflightExternalOperation: (...args: unknown[]) => preflightExternalOperationMock(...args),
  };
});

vi.mock("~/shared/api/messenger-users", async () => {
  const actual = await vi.importActual("~/shared/api/messenger-users");
  return {
    ...actual,
    fetchRealmEmojis: (...args: unknown[]) => fetchRealmEmojisMock(...args),
  };
});

vi.mock("~/entities/user/api/user.api", async (importOriginal) => {
  const actual = await importOriginal<typeof UserApi>();
  return {
    ...actual,
    updateOwnStatus: (...args: unknown[]) => updateOwnStatusMock(...args),
  };
});

vi.mock("emoji-picker-react", () => ({
  default: (props: {
    onEmojiClick?: (data: {
      emoji: string;
      names?: string[];
      isCustom?: boolean;
      unified?: string;
      unifiedWithoutSkinTone?: string;
    }) => void;
    className?: string;
    customEmojis?: { id: string; names: string[]; imgUrl: string }[];
    emojiStyle?: string;
  }) => {
    statusEmojiPickerMock(props);
    const customEmoji = props.customEmojis?.[0];
    return (
      <>
        <button
          type="button"
          className={props.className}
          onClick={() => props.onEmojiClick?.({ emoji: "🧪", names: ["test_tube"] })}
        >
          Pick status emoji
        </button>
        {customEmoji != null && (
          <button
            type="button"
            onClick={() =>
              props.onEmojiClick?.({
                emoji: customEmoji.id,
                names: customEmoji.names,
                isCustom: true,
                unified: customEmoji.id,
                unifiedWithoutSkinTone: customEmoji.id,
              })
            }
          >
            Pick custom status emoji
          </button>
        )}
      </>
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
    removeUserStatusAwayPreference(ADMIN_USER_UUID);
    resetRealmEmojisCacheForTests();
    preflightExternalOperationMock.mockReset();
    preflightExternalOperationMock.mockResolvedValue({
      ok: true,
      value: {
        allowed: true,
        action: "messenger.stream.rename",
        target: { type: "stream", uuid: ENGINEERING_STREAM_UUID },
        losses: [],
        requiresConfirmation: false,
      },
    });
  });

  afterEach(() => {
    const currentInstanceId = useInstancesStore.getState().currentInstanceId;
    removeUserStatusAwayPreference(ADMIN_USER_UUID, currentInstanceId);
    removeUserStatusAwayPreference(ADMIN_USER_UUID);
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
    resetToastStateForTests();
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
      context: {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000010",
        streamName: "engineering",
        topic: "general",
      },
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

  it("uses locally saved away preference when opening user-status dialog", () => {
    const instanceId = useInstancesStore.getState().addInstance({
      realm: "https://chat.example.test",
      login: "qa-user@example.test",
      authType: "iam",
      iamAccessToken: "access-token",
    }).id;
    useInstancesStore.getState().setCurrentInstanceId(instanceId);
    useChatListStore.setState({ currentUserId: ADMIN_USER_UUID });
    useUsersStore.getState().mergeUser({
      user_id: ADMIN_USER_UUID,
      full_name: "Alice Doe",
      status: { text: "Focusing", emojiName: "coffee", away: false },
    });
    writeUserStatusAwayPreference(ADMIN_USER_UUID, instanceId, true);

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));

    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    expect(within(statusDialog).getByRole("checkbox", { name: /away/i })).toBeChecked();
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

  it("saves selected realm status emoji metadata without decoding its id as unicode", async () => {
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
    fireEvent.click(
      within(statusDialog).getByRole("button", { name: /pick custom status emoji/i }),
    );

    expect(within(statusDialog).queryByText("B")).not.toBeInTheDocument();
    expect(within(statusDialog).getByRole("img", { name: ":party_parrot:" })).toHaveAttribute(
      "src",
      realmEmoji.imgUrl,
    );

    fireEvent.change(within(statusDialog).getByRole("textbox", { name: /^status$/i }), {
      target: { value: "Party" },
    });
    fireEvent.click(within(statusDialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnStatusMock).toHaveBeenCalledWith({
        text: "Party",
        away: false,
        emojiName: "party_parrot",
        emojiCode: "42",
        reactionType: "realm_emoji",
      });
    });
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
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(t("settings.statusUpdateError"));
  });

  it("saves selected status emoji metadata and applies the status locally", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
    });
    updateOwnStatusMock.mockResolvedValue({
      ok: true,
      status: {
        text: "Focus",
        emojiName: "house",
        emojiCode: "1f3e0",
        reactionType: "unicode_emoji",
        away: true,
      },
    });

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));
    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    fireEvent.click(within(statusDialog).getByRole("button", { name: /status 🏠/i }));
    fireEvent.change(within(statusDialog).getByRole("textbox", { name: /^status$/i }), {
      target: { value: "Focus" },
    });
    fireEvent.click(within(statusDialog).getByRole("checkbox", { name: /away/i }));
    fireEvent.click(within(statusDialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnStatusMock).toHaveBeenCalledWith({
        text: "Focus",
        away: true,
        emojiName: "house",
        emojiCode: "1f3e0",
        reactionType: "unicode_emoji",
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /^status$/i })).not.toBeInTheDocument();
    });
    expect(useUsersStore.getState().getUser(42)?.status).toEqual({
      text: "Focus",
      emojiName: "house",
      emojiCode: "1f3e0",
      reactionType: "unicode_emoji",
      away: true,
    });
  });

  it("still sends status updates when the current user id is not loaded yet", async () => {
    updateOwnStatusMock.mockResolvedValue({
      ok: true,
      status: {
        text: "Booting",
        away: false,
      },
    });

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));
    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    fireEvent.change(within(statusDialog).getByRole("textbox", { name: /^status$/i }), {
      target: { value: "Booting" },
    });
    fireEvent.click(within(statusDialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnStatusMock).toHaveBeenCalledWith({
        text: "Booting",
        away: false,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /^status$/i })).not.toBeInTheDocument();
    });
  });

  it("renders current server as a regular scrollable menu item", () => {
    const instanceId = useInstancesStore.getState().addInstance({
      realm: "https://chat.example.test",
      login: "qa-user@example.test",
      authType: "iam",
      iamAccessToken: "",
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

  it("renders external account controls in the current user right-panel profile", () => {
    useChatListStore.getState().setCurrentUserId(42);

    renderWithProviders(
      <RightPanelShell
        title="Admin User"
        user={{
          name: "Admin User",
          userId: 42,
          email: "admin@example.com",
        }}
      />,
    );

    expect(screen.getByText("Zulip external account card")).toBeInTheDocument();
  });

  it("keeps Zulip controls available in the messenger-only right-panel profile", () => {
    renderWithProviders(
      <RightPanelUserProfileHeader
        user={{ name: "Admin User", userId: 42 }}
        showBackToChatInfo={false}
        onBackFromNestedProfile={vi.fn()}
        avatarSrc={undefined}
        isOwnProfile
        status={null}
        statusLabel={undefined}
        contactRows={[]}
        directMessageUserId={42}
        showProfileCallButton={false}
        onProfileDmCall={vi.fn()}
        onAvatarAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Zulip external account card")).toBeInTheDocument();
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
      context: {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000010",
        streamName: "engineering",
        topic: "general",
      },
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
    expect(useMuteStore.getState().getStreamNotificationLevel(ENGINEERING_STREAM_UUID)).toBe(
      "subscribed",
    );
  });

  it("renders server-provided general chat topic names literally in chat info data", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "",
        },
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

    expect(screen.getByText("general chat")).toBeInTheDocument();
  });

  it("does not render empty topic rows from chat info data", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "",
        },
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

    expect(screen.getByText(t("channel.noTopics"))).toBeInTheDocument();
  });

  it("renders stream description and topic rows from chat info data", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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

  it("renders non-empty server topics without system empty-topic styling", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "",
        },
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

    expect(screen.getByText("general")).not.toHaveClass("italic");
    expect(screen.queryByText(t("chat.generalChat"))).not.toBeInTheDocument();
  });

  it("navigates to the selected stream topic from right-panel topic list", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
      withCurrentOrgRoute(
        `/stream/${ENGINEERING_STREAM_UUID}/topic/${encodeURIComponent("release")}`,
      ),
    );
  });

  it("shows delete-topic action for admin and deletes active topic from right panel", async () => {
    const deleteTopicSpy = vi.spyOn(messengerStreams, "deleteTopic").mockResolvedValue({
      ok: true,
      complete: true,
      attempts: 1,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "release",
        },
        messages: [],
        isLoadingMore: false,
        hasOlderMessages: true,
        hasNewerMessages: false,
      });
      useChatListStore.getState().setFromMessages(
        [
          {
            id: "00000000-0000-4000-8000-000000000001",
            sender_id: 20,
            sender_full_name: "Alice",
            content: "hello",
            timestamp: 1000,
            type: "stream",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
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
        topics: [{ name: "release", topicUuid: RELEASE_TOPIC_UUID, unreadCount: 2 }],
      });
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete topic/i }));

    await waitFor(() => {
      expect(deleteTopicSpy).toHaveBeenCalledWith(RELEASE_TOPIC_UUID);
    });
    expect(screen.queryByText("release")).not.toBeInTheDocument();
    expect(navigateMock).toHaveBeenCalledWith(
      withCurrentOrgRoute(`/stream/${ENGINEERING_STREAM_UUID}`),
      {
        replace: true,
      },
    );
  });

  it("hides delete-topic action for non-admin channel admin", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "member");
      useUsersStore.getState().mergeUser({ user_id: ADMIN_USER_UUID, full_name: "Member" });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [ADMIN_USER_UUID],
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
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
        user_id: ALICE_USER_UUID,
        full_name: "Alice Cooper",
        status: {
          text: "In focus",
          emojiCode: "1f4ac",
          away: false,
        },
        statusFetchedAt: Date.now(),
      });
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
            userId: ALICE_USER_UUID,
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

    expect(screen.getByText("Member - 💬 In focus")).toBeInTheDocument();
  });

  it("shows add members action for stream owner role", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              userId: ALICE_USER_UUID,
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
        streamMemberIds: [ALICE_USER_UUID],
      });
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /add members/i })).toBeInTheDocument();
  });

  it("shows add members action for stream owner role with IAM UUID identity", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              userId: ADMIN_USER_UUID,
              fullName: "Admin User",
              email: "admin@example.com",
              avatarUrl: null,
              isOnline: true,
            },
          ],
          description: null,
          isMuted: false,
          topics: [],
        },
        streamMemberIds: [ADMIN_USER_UUID],
      });
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "owner");
      useUsersStore.getState().mergeUser({ user_id: ADMIN_USER_UUID, full_name: "Admin User" });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /add members/i })).toBeInTheDocument();
  });

  it("does not show add members action for regular stream members", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              userId: ALICE_USER_UUID,
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
        streamMemberIds: [ALICE_USER_UUID],
      });
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "member");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member" });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /add members/i })).not.toBeInTheDocument();
  });

  it("shows add members action for stream administrator role", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              userId: ALICE_USER_UUID,
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
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          canAddSubscribersGroup: 9123,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "administrator");
      useUsersStore.getState().mergeUser({ user_id: ADMIN_USER_UUID, full_name: "Member" });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9123,
          name: "channel-adders",
          members: [ADMIN_USER_UUID],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /add members/i })).toBeInTheDocument();
  });

  it("ignores old org add-subscribers group without stream administrator role", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              userId: ALICE_USER_UUID,
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
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          inviteOnly: false,
          canAddSubscribersGroup: 9,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "member");
      useUsersStore.getState().mergeUser({ user_id: ADMIN_USER_UUID, full_name: "Member" });
      useUsersStore.getState().setCurrentUserChannelCapabilities({
        realmCanAddSubscribersGroup: 14,
      });
      useUserGroupsStore.getState().setGroups([
        {
          id: 14,
          name: "role:members",
          members: [ADMIN_USER_UUID],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /add members/i })).not.toBeInTheDocument();
  });

  it("shows add members action for stream administrator in public channel", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          inviteOnly: false,
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "administrator");
      useUsersStore.getState().mergeUser({ user_id: ADMIN_USER_UUID, full_name: "Member" });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [ADMIN_USER_UUID],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByRole("button", { name: /add members/i })).toBeInTheDocument();
  });

  it("hides add members action for regular member even when old channel metadata exists", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          inviteOnly: true,
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "member");
      useUsersStore.getState().mergeUser({ user_id: ADMIN_USER_UUID, full_name: "Member" });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [ADMIN_USER_UUID],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /add members/i })).not.toBeInTheDocument();
  });

  it("shows remove-member action for stream administrator role", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          canRemoveSubscribersGroup: 9124,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "administrator");
      setStreamMemberBinding(77, ALICE_BINDING_UUID);
      useUsersStore.getState().mergeUsers([
        { user_id: ADMIN_USER_UUID, full_name: "Member" },
        { user_id: 77, full_name: "Alice" },
      ]);
      useUserGroupsStore.getState().setGroups([
        {
          id: 9124,
          name: "channel-removers",
          members: [ADMIN_USER_UUID],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    openMemberContextMenu("Alice");
    expect(screen.getByRole("menuitem", { name: /remove from channel/i })).toBeInTheDocument();
  });

  it("shows remove-member action for stream owner without remove-subscribers group membership", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          canAdministerChannelGroup: 9126,
          canRemoveSubscribersGroup: 9124,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "owner");
      setStreamMemberBinding(77, ALICE_BINDING_UUID);
      useUsersStore.getState().mergeUsers([
        { user_id: ADMIN_USER_UUID, full_name: "Member" },
        { user_id: 77, full_name: "Alice" },
      ]);
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [ADMIN_USER_UUID],
          direct_subgroup_ids: [],
        },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    openMemberContextMenu("Alice");
    expect(screen.getByRole("menuitem", { name: /remove from channel/i })).toBeInTheDocument();
  });

  it("submits add-members dialog and calls stream members api", async () => {
    const addMembersSpy = vi.spyOn(messengerStreams, "addMembersToStream").mockResolvedValue({
      ok: true,
      addedUserIds: [88],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              userId: ALICE_USER_UUID,
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
        streamMemberIds: [ALICE_USER_UUID],
      });
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([
          { streamUuid: "00000000-0000-4000-8000-000000000010", name: "Test clon" },
        ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "owner");
      setStreamMemberBinding(77, ALICE_BINDING_UUID);
      useUsersStore.getState().mergeUsers([
        { user_id: ADMIN_USER_UUID, full_name: "Admin", email: "admin@example.com" },
        { user_id: ALICE_USER_UUID, full_name: "Alice", email: "alice@example.com" },
        { user_id: BOB_USER_UUID, full_name: "Bob", email: "bob@example.com" },
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
        streamUuid: "00000000-0000-4000-8000-000000000010",
        userIds: [BOB_USER_UUID],
      });
    });
  });

  it("does not submit add-members when canonical stream name is unavailable", () => {
    const addMembersSpy = vi.spyOn(messengerStreams, "addMembersToStream").mockResolvedValue({
      ok: true,
      addedUserIds: [88],
      alreadySubscribedUserIds: [],
      unauthorizedStreams: [],
    });

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "test-clon",
          topic: "general",
        },
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
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Admin", email: "admin@example.com" },
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

  it("shows remove-member action for removable members and hides for self/stream owners", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              fullName: "Stream Owner",
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
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          creatorId: BOB_USER_UUID,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "owner");
      setCurrentStreamRole(77, "member");
      setStreamMemberBinding(77, ALICE_BINDING_UUID);
      setCurrentStreamRole(88, "owner");
      setCurrentStreamRole(100, "owner");
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Current User" },
        { user_id: 77, full_name: "Alice" },
        { user_id: 100, full_name: "Stream Owner" },
        { user_id: 88, full_name: "Stream Creator" },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={4} onlineCount={1} />,
    );

    openMemberContextMenu("Alice");
    expect(screen.getByRole("menuitem", { name: /remove from channel/i })).toBeInTheDocument();
  });

  it("renders Creator and Channel admin badges from stream roles", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              userId: BOB_USER_UUID,
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
        streamMemberIds: [77, BOB_USER_UUID],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(77, "owner");
      setCurrentStreamRole(BOB_USER_UUID, "administrator");
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Current User" },
        { user_id: 77, full_name: "Stream Creator" },
        { user_id: BOB_USER_UUID, full_name: "Channel Admin" },
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
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
              userId: ALICE_USER_UUID,
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
        streamMemberIds: [ALICE_USER_UUID],
      });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          creatorId: ALICE_USER_UUID,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(ALICE_USER_UUID, "owner");
      useUsersStore.getState().mergeUsers([
        { user_id: 42, full_name: "Current User" },
        { user_id: ALICE_USER_UUID, full_name: "Creator Admin" },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.queryByText("Channel admin")).not.toBeInTheDocument();
  });

  it("changes stream member role from context menu", async () => {
    const updateRoleSpy = vi
      .spyOn(messengerStreams, "updateStreamBindingRole")
      .mockResolvedValue(true);

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "test-clon",
          topic: "general",
        },
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
              userId: ALICE_USER_UUID,
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
        streamMemberIds: [ALICE_USER_UUID],
      });
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "owner");
      setCurrentStreamRole(ALICE_USER_UUID, "member");
      setStreamMemberBinding(ALICE_USER_UUID, ALICE_BINDING_UUID);
      useUsersStore.getState().mergeUsers([
        { user_id: ADMIN_USER_UUID, full_name: "Admin", email: "admin@example.com" },
        { user_id: ALICE_USER_UUID, full_name: "Alice", email: "alice@example.com" },
      ]);
    });

    renderWithProviders(
      <RightPanelShell title="test-clon" participantsCount={1} onlineCount={1} />,
    );

    expect(screen.getByText(/member - online/i)).toBeInTheDocument();
    openMemberContextMenu("Alice");
    expect(screen.getByText(/change role/i)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /moderator/i }));

    await waitFor(() => {
      expect(updateRoleSpy).toHaveBeenCalledWith(ALICE_BINDING_UUID, "moderator");
    });
    expect(useChatInfoStore.getState().streamMemberRolesByUserId[ALICE_USER_UUID]).toBe(
      "moderator",
    );
  });

  it("removes stream member from context menu without opening profile", async () => {
    const deleteBindingSpy = vi
      .spyOn(messengerStreams, "deleteStreamBinding")
      .mockResolvedValue(true);
    const openUserProfile = vi.fn();

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "test-clon",
          topic: "general",
        },
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
              userId: ALICE_USER_UUID,
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
        streamMemberIds: [ALICE_USER_UUID],
      });
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([
          { streamUuid: "00000000-0000-4000-8000-000000000010", name: "Test clon" },
        ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "owner");
      setStreamMemberBinding(ALICE_USER_UUID, ALICE_BINDING_UUID);
      useUsersStore.getState().mergeUsers([
        { user_id: ADMIN_USER_UUID, full_name: "Admin", email: "admin@example.com" },
        { user_id: ALICE_USER_UUID, full_name: "Alice", email: "alice@example.com" },
      ]);
    });

    renderWithProviders(
      <RightDrawerContext.Provider value={{ open: true, setOpen: vi.fn(), openUserProfile }}>
        <RightPanelShell title="test-clon" participantsCount={1} onlineCount={1} />
      </RightDrawerContext.Provider>,
    );

    openMemberContextMenu("Alice");
    fireEvent.click(screen.getByRole("menuitem", { name: /remove from channel/i }));

    await waitFor(() => {
      expect(deleteBindingSpy).toHaveBeenCalledWith(ALICE_BINDING_UUID);
    });
    expect(openUserProfile).not.toHaveBeenCalled();
    expect(useChatInfoStore.getState().streamMemberIds).toEqual([]);
  });

  it("hides channel edit/delete actions for member role", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
      setCurrentStreamRole(42, "member");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Member" });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /edit channel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /archive channel/i })).not.toBeInTheDocument();
  });

  it("shows channel edit/delete actions for stream owner role and submits edit changes", async () => {
    const updateStreamSpy = vi.spyOn(messengerStreams, "updateStream").mockResolvedValue(true);

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
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
      expect(updateStreamSpy).toHaveBeenCalledWith(ENGINEERING_STREAM_UUID, {
        name: "platform",
        description: "Platform discussions",
      });
    });
  });

  it("fails closed for external stream rename without the effective capability", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: ENGINEERING_STREAM_UUID,
          streamName: "engineering",
          topic: "general",
        },
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
          streamUuid: ENGINEERING_STREAM_UUID,
          name: "engineering",
          provider: {
            kind: "zulip",
            accountUuid: "external-account-1",
            externalId: "zulip-stream-1",
            capabilities: {},
          },
        },
      ]);
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );

    expect(screen.queryByRole("button", { name: /edit channel/i })).not.toBeInTheDocument();
    expect(preflightExternalOperationMock).not.toHaveBeenCalled();
  });

  it("preflights an allowed external stream rename before updating the stream", async () => {
    const updateStreamSpy = vi.spyOn(messengerStreams, "updateStream").mockResolvedValue(true);
    const provider = {
      kind: "zulip",
      accountUuid: "external-account-1",
      externalId: "zulip-stream-1",
      capabilities: {
        "messenger.stream.rename": { available: true, revision: 1, limits: {} },
      },
    };
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: ENGINEERING_STREAM_UUID,
          streamName: "engineering",
          topic: "general",
        },
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
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([
          { streamUuid: ENGINEERING_STREAM_UUID, name: "engineering", provider },
        ]);
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
    });

    renderWithProviders(
      <RightPanelShell title="engineering" participantsCount={3} onlineCount={1} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit channel/i }));
    fireEvent.change(screen.getByLabelText(/channel name/i), {
      target: { value: "platform" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(preflightExternalOperationMock).toHaveBeenCalledWith({
        externalAccountUuid: "external-account-1",
        action: "messenger.stream.rename",
        target: { type: "stream", uuid: ENGINEERING_STREAM_UUID },
      });
      expect(updateStreamSpy).toHaveBeenCalledWith(ENGINEERING_STREAM_UUID, {
        name: "platform",
        description: "Engineering stream",
      });
    });
  });

  it("strips one UI hash prefix from title fallback in edit channel form", async () => {
    const updateStreamSpy = vi.spyOn(messengerStreams, "updateStream").mockResolvedValue(true);

    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
    });

    renderWithProviders(
      <RightPanelShell title="#engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit channel/i }));

    const channelNameInput = screen.getByLabelText(/channel name/i);
    expect(channelNameInput).toHaveValue("engineering");

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateStreamSpy).toHaveBeenCalledWith(ENGINEERING_STREAM_UUID, {
        name: "engineering",
        description: "",
      });
    });
  });

  it("strips only one UI hash prefix from title fallback in edit channel form", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
    });

    renderWithProviders(
      <RightPanelShell title="##engineering" participantsCount={3} onlineCount={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit channel/i }));

    expect(screen.getByLabelText(/channel name/i)).toHaveValue("#engineering");
  });

  it("shows channel edit/delete actions for stream administrator", () => {
    act(() => {
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          canAdministerChannelGroup: 9126,
        },
      ]);
      useChatListStore.getState().setCurrentUserId(ADMIN_USER_UUID);
      setCurrentStreamRole(ADMIN_USER_UUID, "administrator");
      useUsersStore.getState().mergeUser({ user_id: ADMIN_USER_UUID, full_name: "Member" });
      useUserGroupsStore.getState().setGroups([
        {
          id: 9126,
          name: "channel-admins",
          members: [ADMIN_USER_UUID],
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

  it("shows unarchive action for archived channels in the right panel", async () => {
    const unarchiveStreamSpy = vi.spyOn(messengerStreams, "unarchiveStream").mockResolvedValue({
      ok: true,
    });

    act(() => {
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          isArchived: true,
        },
      ]);
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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

    expect(screen.queryByRole("button", { name: /archive channel/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^unarchive$/i }));

    expect(useChatListStore.getState().streamsMap.get(ENGINEERING_STREAM_UUID)?.isArchived).toBe(
      false,
    );
    await waitFor(() => {
      expect(unarchiveStreamSpy).toHaveBeenCalledWith(ENGINEERING_STREAM_UUID);
    });
  });

  it("optimistically archives channel and redirects immediately on archive action", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveStreamSpy = vi.spyOn(messengerStreams, "archiveStream").mockResolvedValue(true);

    act(() => {
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
      useChatListStore.getState().setStreamMetadataHydrated(true);
      useChatListStore.getState().setFromMessages(
        [
          {
            id: "00000000-0000-4000-8000-000000000001",
            sender_id: 50,
            sender_full_name: "Sender",
            content: "latest",
            timestamp: 2000,
            type: "stream",
            stream_uuid: "00000000-0000-4000-8000-000000000010",
            display_recipient: "engineering",
            subject: "general",
            flags: [],
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            sender_id: 50,
            sender_full_name: "Sender",
            content: "older",
            timestamp: 1000,
            type: "stream",
            stream_uuid: "00000000-0000-4000-8000-000000000011",
            display_recipient: "design",
            subject: "general",
            flags: [],
          },
        ],
        42,
      );
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          isArchived: false,
        },
      ]);
      useChatListStore
        .getState()
        .upsertStreamMetadataRows([
          { streamUuid: "00000000-0000-4000-8000-000000000011", name: "design", isArchived: false },
        ]);
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
    expect(useChatListStore.getState().streamsMap.get(ENGINEERING_STREAM_UUID)?.isArchived).toBe(
      true,
    );
    expect(navigateMock).toHaveBeenCalledWith(
      expect.stringContaining(`/stream/${DESIGN_STREAM_UUID}`),
      {
        replace: true,
      },
    );

    await waitFor(() => {
      expect(archiveStreamSpy).toHaveBeenCalledWith(ENGINEERING_STREAM_UUID);
    });
  });

  it("rolls back optimistic archive on request failure", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(messengerStreams, "archiveStream").mockResolvedValue(false);

    act(() => {
      useChatListStore.getState().setCurrentUserId(42);
      setCurrentStreamRole(42, "owner");
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Admin" });
      useChatListStore.getState().setStreamMetadataHydrated(true);
      useChatListStore.getState().upsertStreamMetadataRows([
        {
          streamUuid: "00000000-0000-4000-8000-000000000010",
          name: "engineering",
          isArchived: false,
        },
      ]);
      useCurrentChatMessagesStore.setState({
        context: {
          type: "stream",
          streamId: "00000000-0000-4000-8000-000000000010",
          streamName: "engineering",
          topic: "general",
        },
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
      expect(useChatListStore.getState().streamsMap.get(ENGINEERING_STREAM_UUID)?.isArchived).toBe(
        false,
      );
    });
  });
});
