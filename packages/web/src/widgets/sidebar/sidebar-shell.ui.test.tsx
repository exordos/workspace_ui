import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    folders: { id: string; label: string; badge?: number }[];
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
    loading: boolean;
    error: string | null;
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
const DATE = "2026-06-30T10:00:00Z";
const ALL_FOLDER_UUID = "folder-all";
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

    const nextAllFolderUuid = "folder-all-project-b";
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
