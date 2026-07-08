import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { MessengerSidebarStreamItem } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { WorkspaceSidebar } from "./sidebar-workspace.ui";
import type { ComponentProps } from "react";

vi.mock("~/features/create-chat/create-chat-dialog.ui", () => ({
  CreateChatDialog: () => null,
}));

const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const DATE = "2026-07-02T10:00:00Z";
const ACTIVITY_COUNTS = {
  inboxCount: null,
  mentionsCount: null,
};

function stream(overrides: Partial<MessengerSidebarStreamItem> = {}): MessengerSidebarStreamItem {
  return {
    id: `stream:${STREAM_UUID}`,
    streamUuid: STREAM_UUID,
    title: "Engineering",
    audience: "channel",
    isPrivate: false,
    uiKind: "channel",
    unreadCount: 0,
    pinnedAt: null,
    orderIndex: null,
    route: `/org/acme/project/project-a/stream/${STREAM_UUID}`,
    topics: [],
    preview: null,
    updatedAt: DATE,
    lastMessageCreatedAt: null,
    ...overrides,
  };
}

function renderWorkspaceSidebar(props: Partial<ComponentProps<typeof WorkspaceSidebar>> = {}) {
  return render(
    <MemoryRouter initialEntries={["/org/acme/project/project-a/messenger"]}>
      <WorkspaceSidebar
        streams={[]}
        loading={false}
        error={null}
        activityCounts={ACTIVITY_COUNTS}
        workspaceStreamCount={0}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("WorkspaceSidebar", () => {
  afterEach(() => {
    useChatListStore.getState().clear();
    useSidebarConfigStore.getState().setConfig({
      activityOpen: false,
      expandedStreamUuids: [],
    });
    useSidebarConfigStore.getState().setSearchQuery("");
    useSidebarConfigStore.getState().setCreateChatOpen(false);
  });

  it("keeps supported workspace activity links while disabling unsupported activity items", () => {
    useSidebarConfigStore.getState().setConfig({ activityOpen: true });
    useChatListStore.getState().setFromMessages(
      [
        {
          id: 1,
          sender_id: 42,
          sender_full_name: "Alice",
          content: "legacy unread",
          timestamp: 1,
          type: "private" as const,
          display_recipient: [
            { id: 7, full_name: "Me", email: "me@example.com" },
            { id: 42, full_name: "Alice", email: "alice@example.com" },
          ],
          flags: [],
        },
      ],
      7,
    );

    renderWorkspaceSidebar({
      activityCounts: {
        inboxCount: 2,
        mentionsCount: null,
      },
    });

    const expectedDisabledItems = [
      ["mentions", "workspaceMessenger.mentionsUnsupported"],
      ["drafts", "workspaceMessenger.draftsUnsupported"],
      ["reactions", "workspaceMessenger.reactionsUnsupported"],
      ["feed", "workspaceMessenger.feedUnsupported"],
      ["private notes", "workspaceMessenger.privateNotesUnsupported"],
    ] as const;

    for (const [label, titleKey] of expectedDisabledItems) {
      expect(screen.queryByRole("link", { name: new RegExp(label, "i") })).not.toBeInTheDocument();
      const control = screen.getByRole("button", { name: new RegExp(label, "i") });
      expect(control).toHaveAttribute("aria-disabled", "true");
      expect(control).toHaveAttribute("title", t(titleKey));
    }

    const inboxControl = screen.getByRole("link", { name: /inbox/i });
    expect(inboxControl).toHaveAttribute("href", "/org/acme/project/project-a/inbox");
    expect(within(inboxControl).getByText("2")).toBeInTheDocument();
    expect(within(inboxControl).queryByText("1")).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: /starred/i })).toHaveAttribute(
      "href",
      "/org/acme/project/project-a/activity/starred",
    );
    expect(screen.queryByRole("button", { name: /starred/i })).not.toBeInTheDocument();
  });

  it("shows a distinct empty workspace state", () => {
    renderWorkspaceSidebar();

    expect(screen.getByText(t("sidebar.emptyWorkspace"))).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.emptyWorkspaceHint"))).toBeInTheDocument();
  });

  it("shows a distinct empty selected folder state", () => {
    renderWorkspaceSidebar({
      workspaceStreamCount: 3,
      selectedFolderSystemType: "created",
    });

    expect(screen.getByText(t("sidebar.emptySelectedFolder"))).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.emptySelectedFolderHint"))).toBeInTheDocument();
  });

  it("shows a distinct empty search state", () => {
    useSidebarConfigStore.getState().setSearchQuery("missing topic");

    renderWorkspaceSidebar({
      streams: [stream()],
      workspaceStreamCount: 1,
    });

    expect(screen.getByText(t("sidebar.emptySearch"))).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.emptySearchHint"))).toBeInTheDocument();
  });

  it("keeps empty search visible and shows a non-blocking warning when refresh fails", () => {
    useSidebarConfigStore.getState().setSearchQuery("missing topic");

    renderWorkspaceSidebar({
      streams: [stream()],
      workspaceStreamCount: 1,
      error: "Network timeout",
    });

    expect(screen.getByText(t("sidebar.emptySearch"))).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.emptySearchHint"))).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.partialLoadError"))).toBeInTheDocument();
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
    expect(screen.queryByText(t("app.error"))).not.toBeInTheDocument();
  });

  it("keeps empty selected folder visible and shows a non-blocking warning when refresh fails", () => {
    renderWorkspaceSidebar({
      workspaceStreamCount: 3,
      selectedFolderSystemType: "created",
      error: "Network timeout",
    });

    expect(screen.getByText(t("sidebar.emptySelectedFolder"))).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.emptySelectedFolderHint"))).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.partialLoadError"))).toBeInTheDocument();
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
    expect(screen.queryByText(t("app.error"))).not.toBeInTheDocument();
  });

  it("shows non-blocking sidebar errors when stream rows are still available", () => {
    renderWorkspaceSidebar({
      streams: [stream()],
      workspaceStreamCount: 1,
      error: "Network timeout",
    });

    expect(screen.getByText(/Engineering/)).toBeInTheDocument();
    expect(screen.getByText(t("sidebar.partialLoadError"))).toBeInTheDocument();
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
  });

  it("renders a private stream without direct ui kind as a channel row", () => {
    renderWorkspaceSidebar({
      streams: [
        stream({
          title: "Private room",
          audience: "private",
          isPrivate: true,
          uiKind: "channel",
        }),
      ],
      workspaceStreamCount: 1,
    });

    expect(screen.getByRole("link", { name: /#private room/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^private room$/i })).not.toBeInTheDocument();
  });

  it("renders direct-private user status emoji when sidebar row has user status data", () => {
    renderWorkspaceSidebar({
      streams: [
        stream({
          title: "Alice Workspace",
          audience: "private",
          isPrivate: true,
          uiKind: "directPrivate",
          statusEmoji: "speech_balloon",
          statusText: "Focus",
        }),
      ],
      workspaceStreamCount: 1,
    });

    const link = screen.getByRole("link", { name: /Alice Workspace/i });
    expect(within(link).getByTestId("sidebar-user-status-emoji")).toHaveTextContent("💬");
    expect(within(link).getByText("Focus")).toBeInTheDocument();
  });
});
