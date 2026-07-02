import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import { renderWithProviders } from "~/test/render";
import { RightPanelWorkspaceInfo } from "./right-panel-workspace-info.ui";
import type { WorkspaceRightPanelInfoView } from "./right-panel.types";

const runWorkspaceStreamNotificationUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("~/entities/messenger/messenger-sidebar-actions.lib", () => ({
  runWorkspaceStreamNotificationUpdate: (...args: unknown[]) =>
    runWorkspaceStreamNotificationUpdateMock(...args),
}));

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const SECOND_STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const OWNER_KEY = "account:instance:organization:project:user";
const DATE = "2026-06-22T10:10:00Z";

function createInfo(
  overrides: Partial<WorkspaceRightPanelInfoView> = {},
): WorkspaceRightPanelInfoView {
  return {
    streamUuid: STREAM_UUID,
    notificationMode: "all_messages",
    title: "#general",
    description: null,
    participantsCount: 2,
    onlineCount: 1,
    topics: [],
    ...overrides,
  };
}

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: "project-a",
    ownerUuid: "user-a",
    userUuid: "user-a",
    role: "owner",
    notificationMode: "all_messages",
    name: "general",
    description: "",
    unreadCount: 0,
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

describe("RightPanelWorkspaceInfo", () => {
  afterEach(() => {
    runWorkspaceStreamNotificationUpdateMock.mockReset();
    useMessengerStore.getState().clear();
  });

  it("shows current notification mode and sends workspace update", async () => {
    runWorkspaceStreamNotificationUpdateMock.mockResolvedValue({ status: "applied" });

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    expect(screen.getByText("All messages")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All messages" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("radio", { name: "Muted" }));

    await waitFor(() => {
      expect(runWorkspaceStreamNotificationUpdateMock).toHaveBeenCalledWith({
        streamUuid: STREAM_UUID,
        notificationMode: "muted",
      });
    });
  });

  it("clears notification error when channel changes", async () => {
    runWorkspaceStreamNotificationUpdateMock.mockRejectedValue(new Error("Update failed"));

    const { rerender } = renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Muted" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();

    rerender(
      <RightPanelWorkspaceInfo
        info={createInfo({
          streamUuid: SECOND_STREAM_UUID,
          notificationMode: "mentions_only",
          title: "#random",
        })}
      />,
    );

    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Muted" })).not.toBeDisabled();
  });

  it("reads notification mode updates from the messenger store", () => {
    act(() => {
      useMessengerStore.getState().startBootstrap(OWNER_KEY);
      useMessengerStore.getState().upsertStream(OWNER_KEY, createStream());
    });

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    expect(screen.getByRole("radio", { name: "All messages" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    act(() => {
      useMessengerStore
        .getState()
        .upsertStream(OWNER_KEY, createStream({ notificationMode: "muted" }));
    });

    expect(screen.getByRole("radio", { name: "Muted" })).toHaveAttribute("aria-checked", "true");
  });
});
