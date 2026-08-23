import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerTopicListItem } from "~/entities/messenger/messenger.types";
import { renderWithProviders } from "~/test/render";
import { WorkspaceTopicContextMenu } from "./workspace-topic-context-menu.ui";

const runWorkspaceTopicNotificationUpdateMock = vi.fn();
const runWorkspaceTopicRenameRequestMock = vi.fn();
const runWorkspaceTopicDoneToggleMock = vi.fn();
const runWorkspaceTopicReadMock = vi.fn();
const reportUnexpectedErrorMock = vi.fn();

vi.mock("~/entities/messenger/messenger-sidebar-actions.lib", () => ({
  runWorkspaceTopicNotificationUpdate: (...args: unknown[]) =>
    runWorkspaceTopicNotificationUpdateMock(...args),
  runWorkspaceTopicRenameRequest: (...args: unknown[]) =>
    runWorkspaceTopicRenameRequestMock(...args),
  runWorkspaceTopicDoneToggle: (...args: unknown[]) => runWorkspaceTopicDoneToggleMock(...args),
}));

vi.mock("~/entities/messenger/messenger-read-actions.lib", () => ({
  runWorkspaceTopicRead: (...args: unknown[]) => runWorkspaceTopicReadMock(...args),
}));

vi.mock("~/shared/lib/unexpected-error.lib", () => ({
  reportUnexpectedError: (...args: unknown[]) => reportUnexpectedErrorMock(...args),
}));

const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const topic = {
  id: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
  streamUuid: STREAM_UUID,
  topicUuid: TOPIC_UUID,
  title: "Release",
  unreadCount: 2,
  isDefault: false,
  isDone: false,
  notificationMode: "default",
  color: null,
  route: `/messenger/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
  preview: null,
  lastMessageCreatedAt: null,
  updatedAt: "2026-08-22T00:00:00Z",
} satisfies MessengerTopicListItem;

function renderTopicMenu(): void {
  renderWithProviders(
    <WorkspaceTopicContextMenu
      topic={topic}
      streamTitle="Engineering"
      streamNotificationMode="all_messages"
    >
      <button type="button">Release</button>
    </WorkspaceTopicContextMenu>,
  );
}

function openTopicMenu(): void {
  fireEvent.contextMenu(screen.getByRole("button", { name: "Release" }));
}

describe("WorkspaceTopicContextMenu", () => {
  afterEach(() => {
    useMessengerStore.getState().clear();
    runWorkspaceTopicNotificationUpdateMock.mockReset();
    runWorkspaceTopicRenameRequestMock.mockReset();
    runWorkspaceTopicDoneToggleMock.mockReset();
    runWorkspaceTopicReadMock.mockReset();
    reportUnexpectedErrorMock.mockReset();
  });

  it("opens from right-click and updates the topic notification mode", async () => {
    runWorkspaceTopicNotificationUpdateMock.mockResolvedValue({ status: "applied" });
    renderTopicMenu();

    openTopicMenu();
    fireEvent.click(await screen.findByRole("radio", { name: "Mute" }));

    await waitFor(() => {
      expect(runWorkspaceTopicNotificationUpdateMock).toHaveBeenCalledWith({
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        notificationMode: "mute",
      });
    });
  });

  it("uses the shared read and done actions", async () => {
    runWorkspaceTopicReadMock.mockResolvedValue({ status: "applied" });
    runWorkspaceTopicDoneToggleMock.mockResolvedValue({ status: "applied" });
    renderTopicMenu();

    openTopicMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mark as read" }));
    await waitFor(() => {
      expect(runWorkspaceTopicReadMock).toHaveBeenCalledWith({
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      });
    });

    openTopicMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mark topic as done" }));
    await waitFor(() => {
      expect(runWorkspaceTopicDoneToggleMock).toHaveBeenCalledWith({
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        done: true,
      });
    });
  });

  it("renames the topic through the shared dialog", async () => {
    runWorkspaceTopicRenameRequestMock.mockResolvedValue({ status: "applied" });
    renderTopicMenu();

    openTopicMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename topic" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Topic name" }), {
      target: { value: "Deployment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(runWorkspaceTopicRenameRequestMock).toHaveBeenCalledWith({
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        name: "Deployment",
      });
    });
  });

  it("opens from the keyboard context-menu shortcut", async () => {
    renderTopicMenu();

    fireEvent.keyDown(screen.getByRole("button", { name: "Release" }), {
      key: "F10",
      shiftKey: true,
    });

    expect(
      await screen.findByRole("radiogroup", { name: "Topic notifications" }),
    ).toBeInTheDocument();
  });
});
