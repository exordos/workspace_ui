import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { RightPanelWorkspaceInfo } from "./right-panel-workspace-info.ui";
import type { WorkspaceRightPanelInfoView } from "./right-panel.types";

const runWorkspaceStreamNotificationUpdateMock = vi.hoisted(() => vi.fn());
const addWorkspaceStreamMembersMock = vi.hoisted(() => vi.fn());
const removeWorkspaceStreamMemberMock = vi.hoisted(() => vi.fn());

vi.mock("~/entities/messenger/messenger-sidebar-actions.lib", () => ({
  runWorkspaceStreamNotificationUpdate: (...args: unknown[]) =>
    runWorkspaceStreamNotificationUpdateMock(...args),
}));

vi.mock("~/entities/messenger/messenger-stream-member-actions.lib", () => ({
  addWorkspaceStreamMembers: (...args: unknown[]) => addWorkspaceStreamMembersMock(...args),
  removeWorkspaceStreamMember: (...args: unknown[]) => removeWorkspaceStreamMemberMock(...args),
}));

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const SECOND_STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const CURRENT_USER_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALICE_USER_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOB_USER_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ALICE_BINDING_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SELF_BINDING_UUID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const RUNTIME_CONTEXT = {
  accountId: "account",
  instanceId: "instance",
  organizationId: "organization",
  organizationOrigin: "https://workspace.example.com",
  projectId: "project",
  userUuid: CURRENT_USER_UUID,
  accessToken: "access-token",
  refreshToken: "refresh-token",
  runtimeGeneration: 1,
} satisfies Omit<WorkspaceAuthSession, "login" | "profile">;
const OWNER_KEY = workspaceRuntimeOwnerKey(RUNTIME_CONTEXT);
const DATE = "2026-06-22T10:10:00Z";

function createInfo(
  overrides: Partial<Extract<WorkspaceRightPanelInfoView, { kind: "channel" }>> = {},
): Extract<WorkspaceRightPanelInfoView, { kind: "channel" }> {
  return {
    kind: "channel",
    streamUuid: STREAM_UUID,
    notificationMode: "all_messages",
    title: "#general",
    color: 0x336699,
    description: null,
    participantsCount: 2,
    onlineCount: 1,
    members: [
      {
        bindingUuid: ALICE_BINDING_UUID,
        userUuid: ALICE_USER_UUID,
        name: "Alice Adams",
        avatarUrl: "urn:url:https://cdn.example/alice.png",
        email: "alice@example.com",
        status: "active",
        role: "member",
        isOnline: true,
        isCurrentUser: false,
        canRemove: true,
      },
    ],
    topics: [],
    ...overrides,
    topicSummary: overrides.topicSummary ?? null,
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

function createUser(overrides: Partial<User> & { uuid: string }): User {
  const { uuid, ...rest } = overrides;
  return {
    uuid,
    username: uuid,
    status: "offline",
    firstName: null,
    lastName: null,
    displayName: uuid,
    email: null,
    avatarUrl: null,
    statusEmoji: null,
    statusText: null,
    lastPingAt: DATE,
    createdAt: DATE,
    updatedAt: DATE,
    ...rest,
  };
}

function createSession(
  overrides: Partial<Omit<WorkspaceAuthSession, "runtimeGeneration">> = {},
): Omit<WorkspaceAuthSession, "runtimeGeneration"> {
  return {
    accountId: RUNTIME_CONTEXT.accountId,
    instanceId: RUNTIME_CONTEXT.instanceId,
    organizationId: RUNTIME_CONTEXT.organizationId,
    organizationOrigin: RUNTIME_CONTEXT.organizationOrigin,
    projectId: RUNTIME_CONTEXT.projectId,
    userUuid: RUNTIME_CONTEXT.userUuid,
    accessToken: RUNTIME_CONTEXT.accessToken,
    refreshToken: RUNTIME_CONTEXT.refreshToken,
    login: "current@example.com",
    profile: {
      uuid: CURRENT_USER_UUID,
      username: "current",
      firstName: "Current",
      lastName: "User",
      email: "current@example.com",
      status: "active",
    },
    ...overrides,
  };
}

function seedWorkspaceAuth(): void {
  useWorkspaceAuthStore.getState().setSession(createSession());
}

function seedWorkspaceUsers(): void {
  useUsersStore.getState().replaceUsers([
    createUser({
      uuid: CURRENT_USER_UUID,
      username: "current",
      firstName: "Current",
      lastName: "User",
      displayName: "Current User",
      email: "current@example.com",
      status: "active",
    }),
    createUser({
      uuid: ALICE_USER_UUID,
      username: "alice",
      firstName: "Alice",
      lastName: "Adams",
      displayName: "Alice Adams",
      email: "alice@example.com",
      status: "active",
    }),
    createUser({
      uuid: BOB_USER_UUID,
      username: "bob",
      firstName: "Bob",
      lastName: "Baker",
      displayName: "Bob Baker",
      email: "bob@example.com",
      status: "idle",
    }),
  ]);
}

describe("RightPanelWorkspaceInfo", () => {
  afterEach(() => {
    runWorkspaceStreamNotificationUpdateMock.mockReset();
    addWorkspaceStreamMembersMock.mockReset();
    removeWorkspaceStreamMemberMock.mockReset();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
  });

  it("shows the selected topic summary and its freshness state", () => {
    const { rerender } = renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: "topic-a",
            topicName: "Roadmap",
            text: "Release scope is approved.",
            hasNewMessages: true,
            enabled: true,
          },
        })}
      />,
    );

    expect(screen.getByText("Topic context")).toBeInTheDocument();
    expect(screen.getByText("(AI ✨)")).toBeInTheDocument();
    expect(screen.getByText("Release scope is approved.")).toBeInTheDocument();
    expect(screen.getByTestId("topic-summary-content")).toHaveClass(
      "max-h-[218px]",
      "overflow-y-auto",
      "border",
      "border-border-subtle",
    );
    expect(
      screen.getByText("New messages appeared. The summary will update automatically."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse topic context" }));
    expect(screen.queryByText("Release scope is approved.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand topic context" }));
    expect(screen.getByText("Release scope is approved.")).toBeInTheDocument();

    rerender(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: "topic-b",
            topicName: "Support",
            text: "Support queue is clear.",
            hasNewMessages: false,
            enabled: true,
          },
        })}
      />,
    );

    expect(screen.queryByText("Release scope is approved.")).not.toBeInTheDocument();
    expect(screen.getByText("Support queue is clear.")).toBeInTheDocument();
  });

  it("starts with an empty topic context collapsed and lets the user expand it", () => {
    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: "topic-without-summary",
            topicName: "Planning",
            text: null,
            hasNewMessages: null,
            enabled: true,
          },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Expand topic context" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.queryByText("The summary will appear after the messages are processed."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand topic context" }));

    expect(
      screen.getByText("The summary will appear after the messages are processed."),
    ).toBeInTheDocument();
  });

  it("shows current notification mode and sends workspace update", async () => {
    runWorkspaceStreamNotificationUpdateMock.mockResolvedValue({ status: "applied" });

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    expect(screen.getByText("Notifications").closest("h3")).toHaveClass(
      "text-text-primary",
      "normal-case",
    );
    expect(screen.getByText("Topics")).toHaveClass("text-text-primary", "normal-case");
    expect(screen.getByText("Members")).toHaveClass("text-text-primary", "normal-case");
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

  it("renders workspace members instead of the unavailable placeholder", () => {
    seedWorkspaceAuth();

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alice Adams" })).not.toBeInTheDocument();
    expect(screen.queryByText("Temporarily unavailable")).not.toBeInTheDocument();
    expect(document.querySelector('img[src="https://cdn.example/alice.png"]')).not.toBeNull();
  });

  it("uses the stream color as the channel avatar background", () => {
    seedWorkspaceAuth();

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    const channelTitle = screen.getByText("#general");
    const channelAvatar = channelTitle.parentElement?.previousElementSibling;
    expect(channelAvatar).toHaveStyle({ backgroundColor: "#336699" });
  });

  it("renders members heading without a leading profile icon and a 24px add button", () => {
    // Figma members block: title + person_add only (24px glyph in 32px hit area), no profile icon.
    seedWorkspaceAuth();

    const { container } = renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    const membersHeading = screen.getByText("Members").closest("h3");
    expect(membersHeading).not.toBeNull();
    expect(membersHeading!.querySelectorAll("svg")).toHaveLength(1);

    const addMembersButton = screen.getByRole("button", { name: "Add members" });
    expect(addMembersButton).toHaveClass("h-8", "w-8");
    const addIcon = addMembersButton.querySelector("svg");
    expect(addIcon).not.toBeNull();
    expect(addIcon).toHaveAttribute("width", "24");
    expect(addIcon).toHaveAttribute("height", "24");
    expect(container.querySelector('h3 svg[width="16"]')).toBeNull();
  });

  it("renders workspace direct private profile without channel-only actions", () => {
    const { container } = renderWithProviders(
      <RightPanelWorkspaceInfo
        info={{
          kind: "directPrivate",
          directUserUuid: ALICE_USER_UUID,
          title: "Alice Adams",
          avatarUrl: "urn:url:https://cdn.example/alice.png",
          status: "do_not_disturb",
          isOwnProfile: false,
          details: [
            {
              id: "email",
              value: "alice@example.com",
              isTemporarilyUnavailable: false,
            },
            {
              id: "phone",
              value: "Temporarily not connected",
              isTemporarilyUnavailable: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText(/do not disturb/i)).toBeInTheDocument();
    expect(container.querySelector('img[src="https://cdn.example/alice.png"]')).not.toBeNull();
    expect(screen.getByText("Temporarily not connected")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-message")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-call")).toHaveTextContent(t("call.call"));
    expect(screen.getByTestId("right-panel-profile-share")).toBeInTheDocument();
    expect(screen.queryByTestId("right-panel-profile-edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Channel info")).not.toBeInTheDocument();
    expect(screen.queryByText("Topics")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add members" })).not.toBeInTheDocument();
  });

  it("renders active topic unread first and passive topic unread in gray", () => {
    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          notificationMode: "muted",
          topics: [
            {
              id: "active-topic",
              name: "Active topic",
              unreadCount: 9,
              activeUnreadCount: 2,
              passiveUnreadCount: 7,
              notificationMode: "follow",
              route: "/active-topic",
            },
            {
              id: "passive-topic",
              name: "Muted topic",
              unreadCount: 5,
              activeUnreadCount: 0,
              passiveUnreadCount: 5,
              notificationMode: "default",
              route: "/passive-topic",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("2")).toHaveClass("bg-accent", "text-on-accent");
    expect(screen.getByText("5")).toHaveClass("bg-notice-disable", "text-badge-text");
    expect(screen.queryByText("7")).not.toBeInTheDocument();
    expect(screen.queryByText("9")).not.toBeInTheDocument();
  });

  it("renders own-profile actions for the signed-in user", () => {
    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={{
          kind: "userProfile",
          userUuid: CURRENT_USER_UUID,
          title: "Current User",
          avatarUrl: null,
          status: "active",
          isOwnProfile: true,
          details: [
            {
              id: "userId",
              value: CURRENT_USER_UUID,
              isTemporarilyUnavailable: false,
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("right-panel-profile-favorites")).toHaveTextContent(
      t("common.favorites"),
    );
    expect(screen.getByTestId("right-panel-profile-edit")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-share")).toBeInTheDocument();
    expect(screen.queryByTestId("right-panel-profile-message")).not.toBeInTheDocument();
  });

  it("renders workspace user profile fallback for a missing user", () => {
    const missingUserUuid = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={{
          kind: "userProfile",
          userUuid: missingUserUuid,
          title: missingUserUuid,
          avatarUrl: null,
          status: null,
          isOwnProfile: false,
          details: [
            {
              id: "email",
              value: "Profile field unavailable",
              isTemporarilyUnavailable: true,
            },
            {
              id: "phone",
              value: "Profile field unavailable",
              isTemporarilyUnavailable: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(missingUserUuid)).toBeInTheDocument();
    expect(screen.getAllByText("Profile field unavailable")).toHaveLength(2);
    expect(screen.queryByText("Channel info")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add members" })).not.toBeInTheDocument();
  });

  it("opens add members dialog and excludes existing members", () => {
    seedWorkspaceAuth();
    seedWorkspaceUsers();

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add members" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Add members")).toBeInTheDocument();
    expect(within(dialog).getByText("#general")).toBeInTheDocument();
    expect(within(dialog).getByText("Bob Baker")).toBeInTheDocument();
    expect(within(dialog).queryByText("Alice Adams")).not.toBeInTheDocument();
  });

  it("submits workspace add members action", async () => {
    seedWorkspaceAuth();
    seedWorkspaceUsers();
    addWorkspaceStreamMembersMock.mockResolvedValue({ status: "applied" });

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add members" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Bob Baker/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(addWorkspaceStreamMembersMock).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeContext: expect.objectContaining({
            accessToken: "access-token",
            organizationOrigin: "https://workspace.example.com",
            projectId: "project",
            userUuid: CURRENT_USER_UUID,
          }),
          getRuntimeContext: expect.any(Function),
          streamUuid: STREAM_UUID,
          userUuids: [BOB_USER_UUID],
        }),
      );
    });
  });

  it("submits workspace remove member action", async () => {
    seedWorkspaceAuth();
    removeWorkspaceStreamMemberMock.mockResolvedValue({ status: "applied" });

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove from channel: Alice Adams" }));

    await waitFor(() => {
      expect(removeWorkspaceStreamMemberMock).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeContext: expect.objectContaining({
            accessToken: "access-token",
            organizationOrigin: "https://workspace.example.com",
            projectId: "project",
            userUuid: CURRENT_USER_UUID,
          }),
          getRuntimeContext: expect.any(Function),
          streamUuid: STREAM_UUID,
          bindingUuid: ALICE_BINDING_UUID,
          userUuid: ALICE_USER_UUID,
        }),
      );
    });
  });

  it("submits workspace remove member action for self member", async () => {
    seedWorkspaceAuth();
    removeWorkspaceStreamMemberMock.mockResolvedValue({ status: "applied" });

    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          members: [
            {
              bindingUuid: SELF_BINDING_UUID,
              userUuid: CURRENT_USER_UUID,
              name: "Current User",
              avatarUrl: null,
              email: "current@example.com",
              status: "active",
              role: "owner",
              isOnline: true,
              isCurrentUser: true,
              canRemove: true,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Current User")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from channel: Current User" }));

    await waitFor(() => {
      expect(removeWorkspaceStreamMemberMock).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeContext: expect.objectContaining({
            userUuid: CURRENT_USER_UUID,
          }),
          getRuntimeContext: expect.any(Function),
          streamUuid: STREAM_UUID,
          bindingUuid: SELF_BINDING_UUID,
          userUuid: CURRENT_USER_UUID,
        }),
      );
    });
  });

  it("does not render remove action when projection denies it", () => {
    seedWorkspaceAuth();

    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          members: [
            {
              bindingUuid: ALICE_BINDING_UUID,
              userUuid: ALICE_USER_UUID,
              name: "Alice Adams",
              avatarUrl: null,
              email: "alice@example.com",
              status: "active",
              role: "member",
              isOnline: true,
              isCurrentUser: false,
              canRemove: false,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove from channel: Alice Adams" }),
    ).not.toBeInTheDocument();
  });

  it("does not render remove action without runtime context", () => {
    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove from channel: Alice Adams" }),
    ).not.toBeInTheDocument();
  });
});
