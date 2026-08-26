import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MESSENGER_ALL_CHATS_FOLDER_UUID,
  MESSENGER_CHANNELS_FOLDER_UUID,
  MESSENGER_PERSONAL_FOLDER_UUID,
} from "~/entities/messenger/messenger-folder-system-type.lib";
import * as messengerSidebarLib from "~/entities/messenger/messenger-sidebar.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerBootstrapPayload,
  MessengerFolder,
  MessengerStream,
} from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { SidebarShell } from "./sidebar-shell.ui";
import type { ReactNode } from "react";

const folderRailPropsMock = vi.fn();
const workspaceSidebarPropsMock = vi.fn();

vi.mock("~/widgets/folder-rail/folder-rail.ui", () => ({
  FolderRail: (props: {
    folders: { id: string; label: string; badge?: number; systemType?: string }[];
    selectedFolderId: string;
    onSelectFolder: (folderId: string) => void;
    layout: string;
  }) => {
    folderRailPropsMock(props);

    return (
      <button
        type="button"
        data-testid="folder-rail"
        onClick={() => props.onSelectFolder(props.folders[1]?.id ?? props.folders[0]?.id ?? "all")}
      >
        {props.selectedFolderId}
      </button>
    );
  },
}));

vi.mock("./sidebar-workspace.ui", () => ({
  WorkspaceSidebar: (props: {
    streams: { title: string }[];
    allStreams: { title: string }[];
    loading: boolean;
    error: string | null;
    selectedFolderSystemType?: MessengerFolder["systemType"];
    activityPanelBottomSlot?: ReactNode;
  }) => {
    workspaceSidebarPropsMock(props);

    return (
      <div data-testid="workspace-sidebar">
        {props.streams.map((stream) => (
          <span key={stream.title}>{stream.title}</span>
        ))}
        {props.activityPanelBottomSlot}
      </div>
    );
  },
}));

const OWNER_KEY = "owner:sidebar-shell";
const PROJECT_ID = "project-a";
const ORG_ID = "acme";
const STREAM_UUID = "stream-engineering";
const PRODUCT_STREAM_UUID = "stream-product";
const DATE = "2026-06-30T10:00:00Z";
const ALL_FOLDER_UUID = MESSENGER_ALL_CHATS_FOLDER_UUID;
const PERSONAL_FOLDER_UUID = MESSENGER_PERSONAL_FOLDER_UUID;
const CHANNELS_FOLDER_UUID = MESSENGER_CHANNELS_FOLDER_UUID;
const TEAM_FOLDER_UUID = "folder-team";

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: PROJECT_ID,
    ownerUuid: "owner-a",
    userUuid: "user-a",
    role: "member",
    notificationMode: "mentions_only",
    name: "Engineering",
    description: "",
    unreadCount: 4,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createFolder(overrides: Partial<MessengerFolder> = {}): MessengerFolder {
  return {
    uuid: ALL_FOLDER_UUID,
    title: "All chats",
    backgroundColorValue: null,
    unreadCount: 4,
    systemType: "all",
    items: [
      {
        uuid: "folder-item-engineering",
        projectId: PROJECT_ID,
        folderUuid: ALL_FOLDER_UUID,
        userUuid: "user-a",
        streamUuid: STREAM_UUID,
        conversationId: `stream:${STREAM_UUID}`,
        chatType: "stream",
        orderIndex: 10,
        pinnedAt: null,
        unreadCount: 4,
        createdAt: DATE,
        updatedAt: DATE,
      },
    ],
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function bootstrapMessengerSidebar(
  payloadOverrides: Partial<MessengerBootstrapPayload> = {},
): void {
  useMessengerStore.getState().startBootstrap(OWNER_KEY);
  useMessengerStore.getState().replaceBootstrapState(OWNER_KEY, {
    streams: [createStream()],
    streamBindings: [],
    topics: [],
    conversations: [],
    folders: [
      createFolder(),
      createFolder({
        uuid: TEAM_FOLDER_UUID,
        title: "Team",
        systemType: "created",
      }),
    ],
    ...payloadOverrides,
  });
}

describe("SidebarShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useMessengerStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
    useSettingsStore.getState().resetToDefaults();
    useSidebarConfigStore.getState().setSelectedFolderId("all");
    useSidebarConfigStore.getState().setConfig({
      expandedStreamUuids: [],
      activityOpen: false,
    });
    useSidebarConfigStore.getState().setSearchQuery("");
    folderRailPropsMock.mockReset();
    workspaceSidebarPropsMock.mockReset();
  });

  it("renders messenger-store folders and streams without legacy sidebar switching", () => {
    bootstrapMessengerSidebar();
    useSidebarConfigStore.getState().setSelectedFolderId("missing-folder");

    render(
      <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
    );

    expect(screen.getByTestId("workspace-sidebar")).toHaveTextContent("Engineering");
    expect(screen.getByTestId("folder-rail")).toHaveTextContent(ALL_FOLDER_UUID);

    const lastFolderRailCall = folderRailPropsMock.mock.lastCall?.[0];
    expect(lastFolderRailCall?.folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ALL_FOLDER_UUID, label: "All chats" }),
        expect.objectContaining({ id: TEAM_FOLDER_UUID, label: "Team" }),
      ]),
    );

    const lastWorkspaceSidebarCall = workspaceSidebarPropsMock.mock.lastCall?.[0];
    expect(lastWorkspaceSidebarCall?.streams).toEqual([
      expect.objectContaining({ title: "Engineering", streamUuid: STREAM_UUID }),
    ]);
  });

  it("updates selected folder through sidebar config only", () => {
    bootstrapMessengerSidebar();

    render(
      <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
    );

    fireEvent.click(screen.getByTestId("folder-rail"));

    expect(useSidebarConfigStore.getState().selectedFolderId).toBe(TEAM_FOLDER_UUID);
  });

  it("keeps the query while switching folders and always passes the All projection", async () => {
    const engineeringItem = createFolder().items[0]!;
    const productItem = {
      ...engineeringItem,
      uuid: "folder-item-product",
      streamUuid: PRODUCT_STREAM_UUID,
      conversationId: `stream:${PRODUCT_STREAM_UUID}`,
      unreadCount: 0,
    };
    bootstrapMessengerSidebar({
      streams: [
        createStream(),
        createStream({ uuid: PRODUCT_STREAM_UUID, name: "Product", unreadCount: 0 }),
      ],
      folders: [
        createFolder({ items: [engineeringItem, productItem] }),
        createFolder({
          uuid: TEAM_FOLDER_UUID,
          title: "Team",
          systemType: "created",
          items: [{ ...engineeringItem, folderUuid: TEAM_FOLDER_UUID }],
        }),
      ],
    });
    useSidebarConfigStore.getState().setSelectedFolderId(TEAM_FOLDER_UUID);
    useSidebarConfigStore.getState().setSearchQuery("product");

    render(
      <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
    );

    expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.streams).toEqual([
      expect.objectContaining({ streamUuid: STREAM_UUID }),
    ]);
    expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.allStreams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ streamUuid: STREAM_UUID }),
        expect.objectContaining({ streamUuid: PRODUCT_STREAM_UUID }),
      ]),
    );

    act(() => {
      folderRailPropsMock.mock.lastCall?.[0]?.onSelectFolder(ALL_FOLDER_UUID);
    });

    await waitFor(() =>
      expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.streams).toHaveLength(2),
    );
    expect(useSidebarConfigStore.getState().searchQuery).toBe("product");
  });

  it("does not build the All projection outside search mode", () => {
    const selectorSpy = vi.spyOn(messengerSidebarLib, "selectMessengerSidebarStreams");
    bootstrapMessengerSidebar();
    useSidebarConfigStore.getState().setSelectedFolderId(TEAM_FOLDER_UUID);

    render(
      <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
    );

    expect(selectorSpy).toHaveBeenCalledTimes(1);
    expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.allStreams).toEqual([]);
  });

  it("reuses the selected All projection during search", () => {
    const selectorSpy = vi.spyOn(messengerSidebarLib, "selectMessengerSidebarStreams");
    bootstrapMessengerSidebar();
    useSidebarConfigStore.getState().setSelectedFolderId(ALL_FOLDER_UUID);
    useSidebarConfigStore.getState().setSearchQuery("engineering");

    render(
      <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
    );

    expect(selectorSpy).toHaveBeenCalledTimes(1);
    expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.allStreams).toBe(
      workspaceSidebarPropsMock.mock.lastCall?.[0]?.streams,
    );
  });

  it("builds the All projection when the query becomes non-empty", async () => {
    const selectorSpy = vi.spyOn(messengerSidebarLib, "selectMessengerSidebarStreams");
    const engineeringItem = createFolder().items[0]!;
    const productItem = {
      ...engineeringItem,
      uuid: "folder-item-product",
      streamUuid: PRODUCT_STREAM_UUID,
      conversationId: `stream:${PRODUCT_STREAM_UUID}`,
      unreadCount: 0,
    };
    bootstrapMessengerSidebar({
      streams: [
        createStream(),
        createStream({ uuid: PRODUCT_STREAM_UUID, name: "Product", unreadCount: 0 }),
      ],
      folders: [
        createFolder({ items: [engineeringItem, productItem] }),
        createFolder({
          uuid: TEAM_FOLDER_UUID,
          title: "Team",
          systemType: "created",
          items: [{ ...engineeringItem, folderUuid: TEAM_FOLDER_UUID }],
        }),
      ],
    });
    useSidebarConfigStore.getState().setSelectedFolderId(TEAM_FOLDER_UUID);

    render(
      <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
    );

    expect(selectorSpy).toHaveBeenCalledTimes(1);
    expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.allStreams).toEqual([]);

    act(() => useSidebarConfigStore.getState().setSearchQuery("product"));

    await waitFor(() =>
      expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.allStreams).toHaveLength(2),
    );
    expect(selectorSpy).toHaveBeenCalledTimes(2);
    expect(selectorSpy.mock.lastCall?.[1]).toEqual(
      expect.objectContaining({ selectedFolderUuid: ALL_FOLDER_UUID }),
    );
  });

  it.each([
    ["Personal", PERSONAL_FOLDER_UUID, "personal", STREAM_UUID],
    ["Channels", CHANNELS_FOLDER_UUID, "channels", PRODUCT_STREAM_UUID],
  ] as const)(
    "normalizes backend-like %s folder data before the sidebar search seam",
    (_title, selectedFolderUuid, expectedSystemType, expectedLocalStreamUuid) => {
      const engineeringItem = createFolder().items[0]!;
      const productItem = {
        ...engineeringItem,
        uuid: "folder-item-product",
        streamUuid: PRODUCT_STREAM_UUID,
        conversationId: `stream:${PRODUCT_STREAM_UUID}`,
        unreadCount: 0,
      };
      bootstrapMessengerSidebar({
        streams: [
          createStream({ audience: "private", isPrivate: true }),
          createStream({ uuid: PRODUCT_STREAM_UUID, name: "Product", unreadCount: 0 }),
        ],
        folders: [
          createFolder({ items: [engineeringItem, productItem] }),
          createFolder({
            uuid: PERSONAL_FOLDER_UUID,
            title: "Personal",
            systemType: "all",
            items: [{ ...engineeringItem, folderUuid: PERSONAL_FOLDER_UUID }],
          }),
          createFolder({
            uuid: CHANNELS_FOLDER_UUID,
            title: "Channels",
            systemType: "all",
            items: [{ ...productItem, folderUuid: CHANNELS_FOLDER_UUID }],
          }),
        ],
      });
      useSidebarConfigStore.getState().setSelectedFolderId(selectedFolderUuid);
      useSidebarConfigStore.getState().setSearchQuery("product");

      render(
        <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
      );

      expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.selectedFolderSystemType).toBe(
        expectedSystemType,
      );
      expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.streams).toEqual([
        expect.objectContaining({ streamUuid: expectedLocalStreamUuid }),
      ]);
      expect(workspaceSidebarPropsMock.mock.lastCall?.[0]?.allStreams).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ streamUuid: STREAM_UUID }),
          expect.objectContaining({ streamUuid: PRODUCT_STREAM_UUID }),
        ]),
      );
      expect(folderRailPropsMock.mock.lastCall?.[0]?.folders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: PERSONAL_FOLDER_UUID, systemType: "personal" }),
          expect.objectContaining({ id: CHANNELS_FOLDER_UUID, systemType: "channels" }),
        ]),
      );
    },
  );

  it("passes a fresh unread badge to the rail after a local folder item update", async () => {
    bootstrapMessengerSidebar();

    render(
      <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
    );

    expect(folderRailPropsMock.mock.lastCall?.[0]?.folders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ALL_FOLDER_UUID, badge: 4 })]),
    );

    act(() => {
      useMessengerStore.getState().upsertFolderItem(OWNER_KEY, {
        uuid: "folder-item-engineering",
        projectId: PROJECT_ID,
        folderUuid: ALL_FOLDER_UUID,
        userUuid: "user-a",
        streamUuid: STREAM_UUID,
        conversationId: `stream:${STREAM_UUID}`,
        chatType: "stream",
        orderIndex: 10,
        pinnedAt: null,
        unreadCount: 7,
        createdAt: DATE,
        updatedAt: "2026-06-30T10:10:00Z",
      });
    });

    await waitFor(() =>
      expect(folderRailPropsMock.mock.lastCall?.[0]?.folders).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: ALL_FOLDER_UUID, badge: 7 })]),
      ),
    );
  });

  it("renders from active workspace session when pathname is empty", () => {
    bootstrapMessengerSidebar();
    useWorkspaceAuthStore.getState().setSession({
      accountId: "account-a",
      instanceId: "instance-a",
      organizationId: ORG_ID,
      organizationOrigin: "https://acme.test",
      projectId: PROJECT_ID,
      userUuid: "user-a",
      accessToken: "token-a",
      login: "user-a",
      profile: {
        uuid: "user-a",
        username: "user-a",
        firstName: "Ada",
        lastName: null,
        email: null,
      },
    });

    render(<SidebarShell />);

    expect(screen.getByTestId("workspace-sidebar")).toHaveTextContent("Engineering");
  });

  it("falls back to a valid folder when the selected folder belongs to a previous workspace", () => {
    bootstrapMessengerSidebar();
    useSidebarConfigStore.getState().setSelectedFolderId(TEAM_FOLDER_UUID);

    const { rerender } = render(
      <SidebarShell pathname={`/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}`} />,
    );

    expect(screen.getByTestId("folder-rail")).toHaveTextContent(TEAM_FOLDER_UUID);

    const nextAllFolderUuid = MESSENGER_ALL_CHATS_FOLDER_UUID;
    const misleadingAllFolderUuid = "folder-project-b-with-all-marker";
    const nextStreamUuid = "stream-product";
    act(() => {
      useMessengerStore.getState().replaceBootstrapState(OWNER_KEY, {
        streams: [
          createStream({
            uuid: nextStreamUuid,
            name: "Product",
            projectId: "project-b",
          }),
        ],
        streamBindings: [],
        topics: [],
        conversations: [],
        folders: [
          createFolder({
            uuid: misleadingAllFolderUuid,
            title: "Not the fixed All folder",
            systemType: "all",
            items: [],
          }),
          createFolder({
            uuid: nextAllFolderUuid,
            title: "All project B",
            systemType: "all",
            items: [
              {
                uuid: "folder-item-product",
                projectId: "project-b",
                folderUuid: nextAllFolderUuid,
                userUuid: "user-a",
                streamUuid: nextStreamUuid,
                conversationId: `stream:${nextStreamUuid}`,
                chatType: "stream",
                orderIndex: 10,
                pinnedAt: null,
                unreadCount: 0,
                createdAt: DATE,
                updatedAt: DATE,
              },
            ],
          }),
        ],
      });
    });

    rerender(
      <SidebarShell pathname={`/org/${ORG_ID}/project/project-b/stream/${nextStreamUuid}`} />,
    );

    expect(screen.getByTestId("folder-rail")).toHaveTextContent(nextAllFolderUuid);
    expect(screen.getByTestId("workspace-sidebar")).toHaveTextContent("Product");
  });
});
