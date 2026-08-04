import { fireEvent, screen, waitFor } from "@testing-library/react";
import { act, type ReactElement } from "react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerFolder,
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
} from "~/entities/messenger/messenger.types";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import type { RightDrawerContextValue } from "~/shared/contexts/right-drawer.types";
import { formatMessageTimeRelative } from "~/shared/lib/datetime.lib";
import { renderWithProviders } from "~/test/render";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { SIDEBAR_SYSTEM_ALL_FOLDER_ID } from "./sidebar-folder.constants";
import { WorkspaceSidebar } from "./sidebar-workspace.ui";

const runWorkspaceStreamNotificationUpdateMock = vi.fn();
const runWorkspaceTopicNotificationUpdateMock = vi.fn();
const runWorkspaceFolderItemPinToggleMock = vi.fn();
const runWorkspaceFolderAssignmentToggleMock = vi.fn();
const runWorkspaceCreateTopicRequestMock = vi.fn();
const runWorkspaceTopicRenameRequestMock = vi.fn();
const runWorkspaceTopicDoneToggleMock = vi.fn();
const runWorkspaceStreamReadMock = vi.fn();
const runWorkspaceTopicReadMock = vi.fn();
const reportUnexpectedErrorMock = vi.fn();

vi.mock("~/entities/messenger/messenger-sidebar-actions.lib", () => ({
  runWorkspaceStreamNotificationUpdate: (...args: unknown[]) =>
    runWorkspaceStreamNotificationUpdateMock(...args),
  runWorkspaceTopicNotificationUpdate: (...args: unknown[]) =>
    runWorkspaceTopicNotificationUpdateMock(...args),
  runWorkspaceFolderItemPinToggle: (...args: unknown[]) =>
    runWorkspaceFolderItemPinToggleMock(...args),
  runWorkspaceFolderAssignmentToggle: (...args: unknown[]) =>
    runWorkspaceFolderAssignmentToggleMock(...args),
  runWorkspaceCreateTopicRequest: (...args: unknown[]) =>
    runWorkspaceCreateTopicRequestMock(...args),
  runWorkspaceTopicRenameRequest: (...args: unknown[]) =>
    runWorkspaceTopicRenameRequestMock(...args),
  runWorkspaceTopicDoneToggle: (...args: unknown[]) => runWorkspaceTopicDoneToggleMock(...args),
}));

vi.mock("~/entities/messenger/messenger-read-actions.lib", () => ({
  runWorkspaceStreamRead: (...args: unknown[]) => runWorkspaceStreamReadMock(...args),
  runWorkspaceTopicRead: (...args: unknown[]) => runWorkspaceTopicReadMock(...args),
}));

vi.mock("~/shared/lib/unexpected-error.lib", () => ({
  reportUnexpectedError: (...args: unknown[]) => reportUnexpectedErrorMock(...args),
}));

const OWNER_KEY = "owner:workspace-sidebar";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const FOLDER_UUID = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_UUID = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const DATE = "2026-06-22T10:10:00Z";

function createTopic(
  overrides: Partial<MessengerSidebarTopicItem> = {},
): MessengerSidebarTopicItem {
  return {
    id: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    title: "Release",
    unreadCount: 2,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    color: null,
    route: `/org/acme/project/project-a/messenger/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    preview: null,
    lastMessageCreatedAt: null,
    updatedAt: DATE,
    ...overrides,
  };
}

function createStream(
  overrides: Partial<MessengerSidebarStreamItem> = {},
): MessengerSidebarStreamItem {
  return {
    id: `stream:${STREAM_UUID}`,
    streamUuid: STREAM_UUID,
    directUserUuid: null,
    title: "Engineering",
    audience: "channel",
    isPrivate: false,
    isArchived: false,
    uiKind: "channel",
    notificationMode: "mentions_only",
    unreadCount: 3,
    pinnedAt: null,
    orderIndex: null,
    route: `/org/acme/project/project-a/messenger/stream/${STREAM_UUID}`,
    topics: [],
    preview: null,
    updatedAt: DATE,
    lastMessageCreatedAt: null,
    ...overrides,
  };
}

function createFolder(overrides: Partial<MessengerFolder> = {}): MessengerFolder {
  return {
    uuid: FOLDER_UUID,
    title: "Projects",
    backgroundColorValue: null,
    unreadCount: 3,
    systemType: "created",
    items: [
      {
        uuid: FOLDER_ITEM_UUID,
        projectId: "project-a",
        folderUuid: FOLDER_UUID,
        userUuid: "user-a",
        streamUuid: STREAM_UUID,
        conversationId: `stream:${STREAM_UUID}`,
        chatType: "stream",
        orderIndex: 10,
        pinnedAt: null,
        unreadCount: 3,
        createdAt: DATE,
        updatedAt: DATE,
      },
    ],
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function expectNoWorkspaceActionRequests(): void {
  expect(runWorkspaceStreamNotificationUpdateMock).not.toHaveBeenCalled();
  expect(runWorkspaceTopicNotificationUpdateMock).not.toHaveBeenCalled();
  expect(runWorkspaceFolderItemPinToggleMock).not.toHaveBeenCalled();
  expect(runWorkspaceFolderAssignmentToggleMock).not.toHaveBeenCalled();
  expect(runWorkspaceCreateTopicRequestMock).not.toHaveBeenCalled();
  expect(runWorkspaceTopicRenameRequestMock).not.toHaveBeenCalled();
  expect(runWorkspaceTopicDoneToggleMock).not.toHaveBeenCalled();
  expect(runWorkspaceStreamReadMock).not.toHaveBeenCalled();
  expect(runWorkspaceTopicReadMock).not.toHaveBeenCalled();
}

function CurrentPath(): ReactElement {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

function renderWorkspaceSidebar(
  streams: MessengerSidebarStreamItem[],
  rightDrawerValue?: RightDrawerContextValue,
): void {
  renderWithProviders(
    rightDrawerValue == null ? (
      <>
        <WorkspaceSidebar
          streams={streams}
          loading={false}
          error={null}
          activityCounts={{ inboxCount: null, mentionsCount: null }}
          workspaceStreamCount={streams.length}
        />
        <CurrentPath />
      </>
    ) : (
      <RightDrawerContext.Provider value={rightDrawerValue}>
        <WorkspaceSidebar
          streams={streams}
          loading={false}
          error={null}
          activityCounts={{ inboxCount: null, mentionsCount: null }}
          workspaceStreamCount={streams.length}
        />
      </RightDrawerContext.Provider>
    ),
    {
      route: `/org/acme/project/project-a/stream/${STREAM_UUID}`,
    },
  );
}

describe("WorkspaceSidebar context menu", () => {
  afterEach(() => {
    useMessengerStore.getState().clear();
    useSidebarConfigStore.getState().setSelectedFolderId(SIDEBAR_SYSTEM_ALL_FOLDER_ID);
    useSidebarConfigStore.getState().setCreateChatOpen(false);
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [] });
    runWorkspaceStreamNotificationUpdateMock.mockReset();
    runWorkspaceTopicNotificationUpdateMock.mockReset();
    runWorkspaceFolderItemPinToggleMock.mockReset();
    runWorkspaceFolderAssignmentToggleMock.mockReset();
    runWorkspaceCreateTopicRequestMock.mockReset();
    runWorkspaceTopicRenameRequestMock.mockReset();
    runWorkspaceTopicDoneToggleMock.mockReset();
    runWorkspaceStreamReadMock.mockReset();
    runWorkspaceTopicReadMock.mockReset();
    reportUnexpectedErrorMock.mockReset();
  });

  it("uses the stream color as the channel avatar background", () => {
    renderWorkspaceSidebar([createStream({ color: 0x2563eb })]);

    expect(screen.getByText("#")).toHaveAttribute("style", "background-color: rgb(37, 99, 235);");
  });

  it("hides non-muted channel and inherited topic notification modes", () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });

    renderWorkspaceSidebar([
      createStream({ notificationMode: "mentions_only", topics: [createTopic()] }),
    ]);

    expect(screen.queryByLabelText("Mentions only")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Default")).not.toBeInTheDocument();
  });

  it("shows explicit notification modes in channel and topic rows", () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });

    renderWorkspaceSidebar([
      createStream({
        notificationMode: "muted",
        topics: [createTopic({ notificationMode: "mute" })],
      }),
    ]);

    expect(screen.getByLabelText("Muted")).toBeInTheDocument();
    expect(screen.getByLabelText("Mute")).toBeInTheDocument();
  });

  it("uses gray unread badges for muted streams and topics", () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });

    renderWorkspaceSidebar([
      createStream({
        notificationMode: "muted",
        unreadCount: 3,
        topics: [
          createTopic({ unreadCount: 2, notificationMode: "default" }),
          createTopic({
            id: "topic:muted",
            topicUuid: "29e59899-1ad1-4c7c-a643-c3b9c513ce4d",
            title: "Muted topic",
            unreadCount: 4,
            notificationMode: "mute",
          }),
          createTopic({
            id: "topic:unmuted",
            topicUuid: "7f9b3bce-2f2c-4cc9-8c08-0353c324751d",
            title: "Unmuted topic",
            unreadCount: 5,
            notificationMode: "unmute",
          }),
        ],
      }),
    ]);

    expect(screen.getByText("3")).toHaveClass("bg-notice-disable", "text-badge-text");
    expect(screen.getByText("2")).toHaveClass("bg-notice-disable", "text-badge-text");
    expect(screen.getByText("4")).toHaveClass("bg-notice-disable", "text-badge-text");
    expect(screen.getByText("5")).toHaveClass("bg-sidebar-unread");
  });

  it("dims muted topic cards without striking their titles through", () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });

    renderWorkspaceSidebar([createStream({ topics: [createTopic({ notificationMode: "mute" })] })]);

    expect(screen.getByRole("link", { name: /release/i })).toHaveClass("opacity-70");
    expect(screen.getByText("#Release")).not.toHaveClass("line-through");
  });

  it("dims muted stream cards", () => {
    renderWorkspaceSidebar([createStream({ notificationMode: "muted" })]);

    const titleLink = screen.getByRole("link", { name: /engineering/i });
    expect(titleLink.closest("div.w-full")).toHaveClass("opacity-70");
  });

  it("marks every stream message read from the context menu", async () => {
    runWorkspaceStreamReadMock.mockResolvedValue({ status: "applied" });
    renderWorkspaceSidebar([createStream()]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /engineering/i }));

    expect(await screen.findByRole("radiogroup", { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /members/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /new topic/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /mark all as read/i }));

    await waitFor(() => {
      expect(runWorkspaceStreamReadMock).toHaveBeenCalledWith({ streamUuid: STREAM_UUID });
    });
  });

  it("marks a personal chat read through the stream action", async () => {
    runWorkspaceStreamReadMock.mockResolvedValue({ status: "applied" });
    renderWorkspaceSidebar([
      createStream({
        title: "Alice",
        audience: "private",
        isPrivate: true,
        uiKind: "directPrivate",
        directUserUuid: "user-alice",
      }),
    ]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /alice/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /mark all as read/i }));

    await waitFor(() => {
      expect(runWorkspaceStreamReadMock).toHaveBeenCalledWith({ streamUuid: STREAM_UUID });
    });
  });

  it("disables the stream read action while its request is pending", async () => {
    const request = deferred<{ status: string }>();
    runWorkspaceStreamReadMock.mockReturnValue(request.promise);
    renderWorkspaceSidebar([createStream()]);

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    fireEvent.contextMenu(streamLink);
    fireEvent.click(await screen.findByRole("menuitem", { name: /mark all as read/i }));
    fireEvent.contextMenu(streamLink);

    const pendingItem = await screen.findByRole("menuitem", { name: /mark all as read/i });
    expect(pendingItem).toHaveAttribute("data-disabled");
    fireEvent.click(pendingItem);
    expect(runWorkspaceStreamReadMock).toHaveBeenCalledTimes(1);

    request.resolve({ status: "applied" });
    await waitFor(() => {
      expect(pendingItem).not.toHaveAttribute("data-disabled");
    });
  });

  it("reports a stream read error through the shared handler", async () => {
    const error = new Error("read failed");
    runWorkspaceStreamReadMock.mockRejectedValue(error);
    renderWorkspaceSidebar([createStream()]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /engineering/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /mark all as read/i }));

    await waitFor(() => {
      expect(reportUnexpectedErrorMock).toHaveBeenCalledWith("workspace-sidebar-menu", error, {
        action: "stream-read",
      });
    });
  });

  it("hides the stream read action when there are no unread messages", async () => {
    renderWorkspaceSidebar([createStream({ unreadCount: 0 })]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /engineering/i }));

    expect(await screen.findByRole("radiogroup", { name: /notifications/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /mark all as read/i })).not.toBeInTheDocument();
  });

  it("opens the create-topic dialog from the stream context menu", async () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });
    renderWorkspaceSidebar([createStream({ topics: [createTopic()] })]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /engineering/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /new topic/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /topic name/i })).toBeInTheDocument();
    expect(runWorkspaceCreateTopicRequestMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("sidebar-new-topic-button")).not.toBeInTheDocument();
  });

  it("opens a topic immediately after creating it from the stream", async () => {
    const createdTopicUuid = "a65f8b8e-58e0-47e4-813b-ce8e65a88485";
    runWorkspaceCreateTopicRequestMock.mockResolvedValue({
      status: "applied",
      topic: { streamUuid: STREAM_UUID, uuid: createdTopicUuid },
    });
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });
    renderWorkspaceSidebar([createStream()]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /engineering/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /new topic/i }));
    fireEvent.change(await screen.findByRole("textbox", { name: /topic name/i }), {
      target: { value: "Roadmap" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByTestId("current-path")).toHaveTextContent(
        `/org/acme/project/project-a/stream/${STREAM_UUID}/topic/${createdTopicUuid}`,
      );
    });
  });

  it("renders topic color bars from the API RGB color, including default/general", () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });
    renderWorkspaceSidebar([
      createStream({
        topics: [
          createTopic({
            topicUuid: "default-topic",
            id: `topic:${STREAM_UUID}:default-topic`,
            title: "Общий чат",
            isDefault: true,
            color: 0xffd633,
            route: `/org/acme/project/project-a/stream/${STREAM_UUID}/topic/default-topic`,
          }),
          createTopic({
            topicUuid: "topic-1",
            id: `topic:${STREAM_UUID}:topic-1`,
            title: "Тема 1",
            isDefault: false,
            color: 0xf458d2,
            route: `/org/acme/project/project-a/stream/${STREAM_UUID}/topic/topic-1`,
          }),
        ],
      }),
    ]);

    expect(screen.getByText("#Общий чат")).toBeInTheDocument();
    expect(screen.getByText("#Тема 1")).toBeInTheDocument();
    const bars = screen.getAllByTestId("sidebar-topic-bar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveStyle({ backgroundColor: "#ffd633" });
    expect(bars[1]).toHaveStyle({ backgroundColor: "#f458d2" });
    expect(screen.queryByTestId("sidebar-stream-group-rail")).not.toBeInTheDocument();
  });

  it("opens the selected contact profile from a direct private chat", async () => {
    const openInfo = vi.fn();
    const openWorkspaceUserProfile = vi.fn();
    renderWorkspaceSidebar(
      [
        createStream({
          title: "Alice",
          audience: "private",
          isPrivate: true,
          uiKind: "directPrivate",
          directUserUuid: "alice-uuid",
        }),
      ],
      {
        open: false,
        setOpen: vi.fn(),
        openInfo,
        openWorkspaceUserProfile,
      },
    );

    fireEvent.contextMenu(screen.getByRole("link", { name: /alice/i }));

    fireEvent.click(await screen.findByRole("menuitem", { name: /contact info/i }));

    expect(openWorkspaceUserProfile).toHaveBeenCalledWith("alice-uuid");
    expect(openInfo).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: /members/i })).not.toBeInTheDocument();
    expectNoWorkspaceActionRequests();
  });

  it("opens the shared right panel from the stream members menu item without API actions", async () => {
    const openInfo = vi.fn();
    const setOpen = vi.fn();

    renderWorkspaceSidebar([createStream()], {
      open: false,
      setOpen,
      openInfo,
    });

    fireEvent.contextMenu(screen.getByRole("link", { name: /engineering/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /members/i }));

    expect(openInfo).toHaveBeenCalledTimes(1);
    expect(setOpen).not.toHaveBeenCalled();
    expectNoWorkspaceActionRequests();
  });

  it("opens the create chat dialog from the search header action", async () => {
    renderWorkspaceSidebar([createStream()]);

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    expect(await screen.findByRole("dialog", { name: /new chat/i })).toBeInTheDocument();
  });

  it("opens the stream context menu from the keyboard context-menu key", async () => {
    renderWorkspaceSidebar([createStream()]);

    fireEvent.keyDown(screen.getByRole("link", { name: /engineering/i }), {
      key: "ContextMenu",
    });

    expect(await screen.findByRole("radiogroup", { name: /notifications/i })).toBeInTheDocument();
  });

  it("pins a workspace stream when the selected folder owns a folder item", async () => {
    runWorkspaceFolderItemPinToggleMock.mockResolvedValue({ status: "applied" });
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().applyFolderSnapshot(OWNER_KEY, createFolder());
    useSidebarConfigStore.getState().setSelectedFolderId(FOLDER_UUID);

    renderWorkspaceSidebar([createStream()]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /engineering/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^pin$/i }));

    await waitFor(() => {
      expect(runWorkspaceFolderItemPinToggleMock).toHaveBeenCalledWith({
        folderUuid: FOLDER_UUID,
        folderItemUuid: FOLDER_ITEM_UUID,
        streamUuid: STREAM_UUID,
        pinned: true,
      });
    });
  });

  it("opens the topic context menu, marks it read, and toggles done state", async () => {
    runWorkspaceTopicDoneToggleMock.mockResolvedValue({ status: "applied" });
    runWorkspaceTopicReadMock.mockResolvedValue({ status: "applied" });
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });

    renderWorkspaceSidebar([createStream({ topics: [createTopic()] })]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /release/i }));
    expect(
      await screen.findByRole("radiogroup", { name: /topic notifications/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /^mark as read$/i }));

    await waitFor(() => {
      expect(runWorkspaceTopicReadMock).toHaveBeenCalledWith({
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      });
    });

    fireEvent.contextMenu(screen.getByRole("link", { name: /release/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /mark topic as done/i }));

    await waitFor(() => {
      expect(runWorkspaceTopicDoneToggleMock).toHaveBeenCalledWith({
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        done: true,
      });
    });
  });

  it("hides the topic read action when the topic is already read", async () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });
    renderWorkspaceSidebar([createStream({ topics: [createTopic({ unreadCount: 0 })] })]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /release/i }));

    expect(
      await screen.findByRole("radiogroup", { name: /topic notifications/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^mark as read$/i })).not.toBeInTheDocument();
  });

  it("shows the prepared last-message time in a workspace topic row", () => {
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [STREAM_UUID] });
    const lastMessageCreatedAt = new Date().toISOString();

    renderWorkspaceSidebar([createStream({ topics: [createTopic({ lastMessageCreatedAt })] })]);

    expect(
      screen.getByText(
        formatMessageTimeRelative(Math.floor(Date.parse(lastMessageCreatedAt) / 1000)),
      ),
    ).toBeInTheDocument();
  });

  it("shows the prepared last-message time in a workspace stream row", () => {
    const lastMessageCreatedAt = new Date().toISOString();

    renderWorkspaceSidebar([createStream({ lastMessageCreatedAt })]);

    expect(
      screen.getByText(
        formatMessageTimeRelative(Math.floor(Date.parse(lastMessageCreatedAt) / 1000)),
      ),
    ).toBeInTheDocument();
  });

  it("links a loaded stream preview to its message topic without changing expansion", () => {
    const previewRoute = `/org/acme/project/project-a/messenger/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [] });

    renderWorkspaceSidebar([
      createStream({
        preview: {
          messageUuid: "message-a",
          route: previewRoute,
          senderName: "Alice",
          text: "Latest update",
        },
      }),
    ]);

    const previewLink = screen.getByRole("link", { name: /alice:latest update/i });
    expect(previewLink).toHaveAttribute("href", previewRoute);
    expect(previewLink).toHaveClass("hover:bg-card-bg");

    act(() => {
      fireEvent.click(previewLink);
    });

    expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([]);
  });

  it("does not render a preview link when the preview is missing", () => {
    renderWorkspaceSidebar([createStream({ preview: null })]);

    expect(screen.queryByRole("link", { name: /latest update/i })).not.toBeInTheDocument();
  });

  it("passes private chat type when adding a personal chat to a folder", async () => {
    runWorkspaceFolderAssignmentToggleMock.mockResolvedValue({ status: "applied" });
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore
      .getState()
      .applyFolderSnapshot(OWNER_KEY, createFolder({ items: [], unreadCount: 0 }));

    renderWorkspaceSidebar([
      createStream({
        title: "Alice",
        audience: "private",
        isPrivate: true,
        uiKind: "directPrivate",
        unreadCount: 1,
      }),
    ]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /alice/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /add to folder/i }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /projects/i }));

    await waitFor(() => {
      expect(runWorkspaceFolderAssignmentToggleMock).toHaveBeenCalledWith({
        folderUuid: FOLDER_UUID,
        folderItemUuid: null,
        streamUuid: STREAM_UUID,
        chatType: "private",
        assigned: true,
      });
    });
  });

  it("keeps folder assignment chat type as stream when a private stream is not direct ui kind", async () => {
    runWorkspaceFolderAssignmentToggleMock.mockResolvedValue({ status: "applied" });
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore
      .getState()
      .applyFolderSnapshot(OWNER_KEY, createFolder({ items: [], unreadCount: 0 }));

    renderWorkspaceSidebar([
      createStream({
        title: "Private room",
        audience: "private",
        isPrivate: true,
        uiKind: "channel",
        unreadCount: 1,
      }),
    ]);

    fireEvent.contextMenu(screen.getByRole("link", { name: /#private room/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /add to folder/i }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /projects/i }));

    await waitFor(() => {
      expect(runWorkspaceFolderAssignmentToggleMock).toHaveBeenCalledWith({
        folderUuid: FOLDER_UUID,
        folderItemUuid: null,
        streamUuid: STREAM_UUID,
        chatType: "stream",
        assigned: true,
      });
    });
  });
});
