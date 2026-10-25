import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWorkspaceStreamUnarchive } from "~/entities/messenger/messenger-sidebar-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { CreateChatDialog } from "./create-chat-dialog.ui";
import type { CreateChatDialogProps } from "./create-chat-dialog.types";

vi.mock("~/entities/messenger/messenger-sidebar-actions.lib", () => ({
  runWorkspaceCreateTopicRequest: vi.fn(),
  runWorkspaceStreamUnarchive: vi.fn(),
}));

function createUser(overrides: Partial<User> & { uuid: string }): User {
  return {
    uuid: overrides.uuid,
    username: overrides.username ?? overrides.uuid,
    firstName: overrides.firstName ?? null,
    lastName: overrides.lastName ?? null,
    displayName: overrides.displayName ?? overrides.username ?? overrides.uuid,
    email: overrides.email ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
    status: overrides.status ?? "offline",
    statusEmoji: overrides.statusEmoji ?? null,
    statusText: overrides.statusText ?? null,
    lastPingAt: overrides.lastPingAt ?? "2026-06-30T09:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-06-30T09:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-30T09:00:00.000Z",
  };
}

function seedWorkspaceSession(organizationOrigin = "https://workspace.test"): void {
  useWorkspaceAuthStore.getState().setSession({
    accountId: "account",
    instanceId: "instance",
    organizationId: "org",
    organizationOrigin,
    projectId: "project",
    userUuid: "current-user",
    accessToken: "token",
    refreshToken: "refresh",
    login: "current@example.com",
    profile: {
      uuid: "current-user",
      username: "current",
      firstName: "Current",
      lastName: "User",
      email: "current@example.com",
    },
  });
}

function renderDialog(props: Partial<CreateChatDialogProps> = {}): void {
  render(
    <CreateChatDialog
      open
      onOpenChange={vi.fn()}
      onNavigateWorkspaceStream={vi.fn()}
      onNavigateWorkspaceTopic={vi.fn()}
      onChannelCreated={vi.fn()}
      {...props}
    />,
  );
}

describe("CreateChatDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
    useUsersStore.getState().replaceUsers([
      createUser({
        uuid: "current-user",
        username: "current",
        displayName: "Current User",
        email: "current@example.com",
        status: "active",
      }),
      createUser({
        uuid: "alice-user",
        username: "alice",
        displayName: "Alice",
        email: "a@a.test",
        status: "active",
      }),
    ]);
  });

  afterEach(() => {
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
  });

  it("disables channel creation and shows reason while Workspace profile is loading", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("tab", { name: "Create channel" }));
    fireEvent.change(screen.getByPlaceholderText("Channel name"), {
      target: { value: "engineering" },
    });

    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();
    expect(
      screen.getByText("Profile is still loading. Try again in a moment."),
    ).toBeInTheDocument();
  });

  it("keeps all create-chat tabs visible and keyboard-addressable", () => {
    renderDialog();

    const startChatTab = screen.getByRole("tab", { name: "Start chat" });
    const archivedTab = screen.getByRole("tab", { name: "Archive" });

    expect(screen.getByRole("tab", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Create channel" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Create topic" })).toBeInTheDocument();

    startChatTab.focus();
    fireEvent.keyDown(startChatTab, { key: "End" });
    expect(archivedTab).toHaveFocus();
    expect(archivedTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(archivedTab, { key: "Home" });
    expect(startChatTab).toHaveFocus();
    expect(startChatTab).toHaveAttribute("aria-selected", "true");
  });

  it("uses caller-provided visible tabs", () => {
    renderDialog({ visibleTabs: ["dm", "channel"] });

    expect(screen.getByRole("tab", { name: "Start chat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Create channel" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Channels" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Create topic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("renders channels tab as a Workspace placeholder without subscribe actions", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("tab", { name: "Channels" }));

    expect(
      screen.getByText(
        "Workspace channel browsing is not connected yet. The tab is kept as a placeholder.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Show channels" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search channels…")).toBeInTheDocument();
    expect(screen.getByText("No channels found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
  });

  it("renders archived direct chats and channels with separate history and retryable restore buttons", async () => {
    seedWorkspaceSession();
    const ownerKey = workspaceRuntimeOwnerKey(
      useWorkspaceAuthStore.getState().getCurrentRuntimeContext()!,
    );
    const stream: MessengerStream = {
      uuid: "10000000-0000-4000-8000-000000000001",
      projectId: "project",
      ownerUuid: "current-user",
      userUuid: "current-user",
      role: "member",
      notificationMode: "all_messages",
      name: "Alice",
      description: "",
      unreadCount: 0,
      sourceName: "native",
      audience: "private",
      isPrivate: true,
      inviteOnly: true,
      announce: false,
      isArchived: true,
      directUserUuid: "alice-user",
      lastMessageUuid: null,
      createdAt: "2026-06-30T09:00:00.000Z",
      updatedAt: "2026-06-30T09:00:00.000Z",
    };
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().upsertStream(ownerKey, stream);
    useMessengerStore.getState().upsertStream(ownerKey, {
      ...stream,
      uuid: "10000000-0000-4000-8000-000000000002",
      name: "Engineering",
      directUserUuid: null,
      audience: "channel",
    });
    useMessengerStore.setState({ isLoading: false });
    const onNavigateWorkspaceStream = vi.fn();
    renderDialog({ onNavigateWorkspaceStream });
    fireEvent.click(screen.getByRole("tab", { name: "Archive" }));
    expect(screen.getByText("Direct chat")).toBeInTheDocument();
    expect(screen.getByText("Channel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open history: Engineering" }));
    expect(onNavigateWorkspaceStream).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000002");
    expect(runWorkspaceStreamUnarchive).not.toHaveBeenCalled();
    onNavigateWorkspaceStream.mockClear();
    fireEvent.change(screen.getByPlaceholderText("Search archived chats…"), {
      target: { value: "alice" },
    });
    expect(
      screen.queryByRole("button", { name: "Open history: Engineering" }),
    ).not.toBeInTheDocument();
    let rejectRequest: ((error: Error) => void) | undefined;
    vi.mocked(runWorkspaceStreamUnarchive).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Unarchive: Alice" }));
    expect(screen.getByRole("button", { name: "Unarchiving: Alice" })).toBeDisabled();
    expect(onNavigateWorkspaceStream).not.toHaveBeenCalled();
    await act(async () => {
      rejectRequest?.(new Error("network"));
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not unarchive the chat. Try again.");
    expect(screen.getByRole("button", { name: "Unarchive: Alice" })).toBeEnabled();
    vi.mocked(runWorkspaceStreamUnarchive).mockImplementationOnce(() => {
      const restored = { ...stream, isArchived: false };
      useMessengerStore.getState().upsertStream(ownerKey, restored);
      return Promise.resolve({ status: "applied", ownerKey, stream: restored });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unarchive: Alice" }));
      await Promise.resolve();
    });
    expect(screen.getByText("No archived chats found")).toBeInTheDocument();
    expect(onNavigateWorkspaceStream).not.toHaveBeenCalled();
  });

  it("shows bootstrap loading and failure instead of an empty archive", () => {
    seedWorkspaceSession();
    const ownerKey = workspaceRuntimeOwnerKey(
      useWorkspaceAuthStore.getState().getCurrentRuntimeContext()!,
    );
    useMessengerStore.getState().startBootstrap(ownerKey);
    renderDialog();
    fireEvent.click(screen.getByRole("tab", { name: "Archive" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("No archived chats found")).not.toBeInTheDocument();
    act(() => useMessengerStore.setState({ isLoading: false, error: "network" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the archive.");
    expect(screen.queryByText("No archived chats found")).not.toBeInTheDocument();
  });

  it("clears and disables conflicting options when encrypted creation is selected", () => {
    seedWorkspaceSession();
    renderDialog();
    fireEvent.click(screen.getByRole("tab", { name: "Create channel" }));
    const invite = screen.getByLabelText("Invite only");
    const announce = screen.getByLabelText("Announce channel creation");
    fireEvent.click(invite);
    fireEvent.click(announce);
    expect(invite).toBeChecked();
    expect(announce).toBeChecked();
    fireEvent.click(screen.getByLabelText("Create encrypted chat"));
    expect(invite).not.toBeChecked();
    expect(invite).toBeDisabled();
    expect(announce).not.toBeChecked();
    expect(announce).toBeDisabled();
    expect(screen.getByLabelText("Announcement-only channel")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Create encrypted chat"));
    expect(invite).toBeEnabled();
    expect(announce).toBeEnabled();
    expect(invite).not.toBeChecked();
    expect(announce).not.toBeChecked();
  });

  it("keeps announcement-only control visible but disabled for Workspace", () => {
    seedWorkspaceSession();
    renderDialog();

    fireEvent.click(screen.getByRole("tab", { name: "Create channel" }));

    expect(screen.getByLabelText("Announcement-only channel")).toBeDisabled();
    expect(
      screen.getByText("Announcement-only policy is not connected to Workspace yet."),
    ).toBeInTheDocument();
  });
});
