import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { CreateChatDialog } from "./create-chat-dialog.ui";
import type { CreateChatDialogProps } from "./create-chat-dialog.types";

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

function seedWorkspaceSession(): void {
  useWorkspaceAuthStore.getState().setSession({
    accountId: "account",
    instanceId: "instance",
    organizationId: "org",
    organizationOrigin: "https://workspace.test",
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
    const archivedTab = screen.getByRole("tab", { name: "Archived channels" });

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
    expect(screen.queryByRole("tab", { name: "Archived channels" })).not.toBeInTheDocument();
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

  it("renders archived channels tab as a Workspace placeholder", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("tab", { name: "Archived channels" }));

    expect(
      screen.getByText(
        "Workspace archived channels are not connected yet. The tab is kept as a placeholder.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search archived channels…")).toBeInTheDocument();
    expect(screen.getByText("No archived channels found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unarchive/i })).not.toBeInTheDocument();
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
