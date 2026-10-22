import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceIamCapabilitiesStore } from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import * as chatCryptoSessionHook from "~/features/encrypted-chat-info/chat-crypto-session.hook";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { RightDrawer } from "./right-drawer.ui";
import { RightPanelWorkspaceInfo } from "./right-panel-workspace-info.ui";
import type { WorkspaceRightPanelInfoView } from "./right-panel.types";

const writeTextMock = vi.hoisted(() => vi.fn());
vi.mock("~/shared/lib/clipboard", () => ({
  writeText: (...args: unknown[]) => writeTextMock(...args),
}));

const runWorkspaceStreamNotificationUpdateMock = vi.hoisted(() => vi.fn());
const addWorkspaceStreamMembersMock = vi.hoisted(() => vi.fn());
const removeWorkspaceStreamMemberMock = vi.hoisted(() => vi.fn());
const getTopicSummarySettingsMock = vi.hoisted(() => vi.fn());
const getTopicSummaryEndpointsMock = vi.hoisted(() => vi.fn());

vi.mock("~/entities/messenger/messenger-sidebar-actions.lib", () => ({
  runWorkspaceStreamNotificationUpdate: (...args: unknown[]) =>
    runWorkspaceStreamNotificationUpdateMock(...args),
}));

vi.mock("~/entities/messenger/messenger-stream-member-actions.lib", () => ({
  addWorkspaceStreamMembers: (...args: unknown[]) => addWorkspaceStreamMembersMock(...args),
  removeWorkspaceStreamMember: (...args: unknown[]) => removeWorkspaceStreamMemberMock(...args),
}));

vi.mock("~/shared/api/messenger-topic-summary-management.api", async (importOriginal) => ({
  ...(await importOriginal()),
  getTopicSummarySettings: (...args: unknown[]) => getTopicSummarySettingsMock(...args),
  getTopicSummaryEndpoints: (...args: unknown[]) => getTopicSummaryEndpointsMock(...args),
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
    title: "general",
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

function createTopic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: "99999999-9999-4999-8999-999999999999",
    projectId: RUNTIME_CONTEXT.projectId,
    streamUuid: STREAM_UUID,
    userUuid: CURRENT_USER_UUID,
    name: "Roadmap",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    summary: "Release scope is approved.",
    summaryHasNewMessages: false,
    summaryEnabled: true,
    summarySystemPrompt: null,
    summaryReasoningEffort: null,
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

function seedWorkspaceIamPermissions(permissions: readonly string[]): void {
  const runtimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  if (runtimeContext == null) throw new Error("Expected Workspace runtime context");
  const store = useWorkspaceIamCapabilitiesStore.getState();
  const requestGeneration = store.startLoad(OWNER_KEY, runtimeContext.runtimeGeneration);
  store.finishLoad(OWNER_KEY, runtimeContext.runtimeGeneration, requestGeneration, permissions);
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

function seedOwnerChannel(overrides: Partial<MessengerStream> = {}): void {
  useMessengerStore.getState().startBootstrap(OWNER_KEY);
  useMessengerStore.getState().upsertStream(
    OWNER_KEY,
    createStream({
      projectId: RUNTIME_CONTEXT.projectId,
      userUuid: CURRENT_USER_UUID,
      ownerUuid: CURRENT_USER_UUID,
      ...overrides,
    }),
  );
}

describe("RightPanelWorkspaceInfo", () => {
  it("shows real encrypted metadata, unavailable key actions, and closes through the drawer owner", async () => {
    seedWorkspaceAuth();
    act(() => {
      useMessengerStore.getState().startBootstrap(OWNER_KEY);
      useMessengerStore.getState().upsertStream(
        OWNER_KEY,
        createStream({
          projectId: RUNTIME_CONTEXT.projectId,
          name: "Encrypted team",
          encryption: true,
          currentEncryptionKey: {
            keyUuid: "actual-key-uuid",
          },
        }),
      );
    });
    const onClose = vi.fn();
    const { container } = renderWithProviders(
      <RightDrawer title={t("chatInfo.channelInfo")} onClose={onClose}>
        <RightPanelWorkspaceInfo info={createInfo()} onClose={onClose} />
      </RightDrawer>,
    );
    expect(screen.getByText("Encrypted team")).toBeInTheDocument();
    expect(screen.getByText("actual-key-uuid")).toBeInTheDocument();
    expect(screen.queryByText(t("e2ee.requestsTitle", { count: 0 }))).not.toBeInTheDocument();
    expect(await screen.findByText(t("e2ee.cryptoUnavailable"))).toBeInTheDocument();
    expect(container.innerHTML).toContain("actual-key-uuid");
    expect(container.textContent).not.toContain(DATE);
    expect(screen.getAllByRole("heading", { name: t("chatInfo.channelInfo") })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: t("common.close") })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: t("common.close") }));
    expect(onClose).toHaveBeenCalledOnce();
    act(() => useMessengerStore.setState({ ownerKey: "other-owner" }));
    expect(screen.queryByText("actual-key-uuid")).not.toBeInTheDocument();
    expect(screen.queryByText("Encrypted team")).not.toBeInTheDocument();
  });

  it("connects the encrypted sidebar call only to the active chat and runtime", async () => {
    seedWorkspaceAuth();
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().upsertStream(
      OWNER_KEY,
      createStream({
        projectId: RUNTIME_CONTEXT.projectId,
        encryption: true,
        currentEncryptionKey: { keyUuid: "actual-key" },
      }),
    );
    const invoke = vi.fn();
    const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
    if (runtime == null) throw new Error("Expected runtime");
    const call = {
      ownerKey: OWNER_KEY,
      runtimeGeneration: runtime.runtimeGeneration,
      streamUuid: STREAM_UUID,
      invoke,
    };
    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);
    await screen.findByText(t("e2ee.cryptoUnavailable"));
    const button = screen.getByRole("button", { name: t("call.call") });
    expect(button).toBeDisabled();
    act(() => useChatDmCallBridgeStore.getState().setActiveChatCall(call));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(invoke).toHaveBeenCalledOnce();
    for (const mismatch of [
      { ownerKey: "other-owner" },
      { runtimeGeneration: runtime.runtimeGeneration + 1 },
      { streamUuid: SECOND_STREAM_UUID },
    ]) {
      act(() => useChatDmCallBridgeStore.getState().setActiveChatCall({ ...call, ...mismatch }));
      expect(button).toBeDisabled();
    }
  });

  afterEach(() => {
    useChatDmCallBridgeStore.getState().setActiveChatCall(null);
    vi.restoreAllMocks();
    writeTextMock.mockReset();
    runWorkspaceStreamNotificationUpdateMock.mockReset();
    addWorkspaceStreamMembersMock.mockReset();
    removeWorkspaceStreamMemberMock.mockReset();
    getTopicSummarySettingsMock.mockReset();
    getTopicSummaryEndpointsMock.mockReset();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
    useWorkspaceIamCapabilitiesStore.getState().clear();
  });

  it("copies only explicitly and ignores a clipboard failure after runtime ownership changes", async () => {
    seedWorkspaceAuth();
    act(() => {
      useMessengerStore.getState().startBootstrap(OWNER_KEY);
      useMessengerStore.getState().upsertStream(
        OWNER_KEY,
        createStream({
          projectId: RUNTIME_CONTEXT.projectId,
          encryption: true,
          currentEncryptionKey: { keyUuid: "actual-key" },
        }),
      );
    });
    let complete: ((copied: boolean) => void) | undefined;
    writeTextMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        complete = resolve;
      }),
    );
    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);
    expect(writeTextMock).not.toHaveBeenCalled();
    await screen.findByText(t("e2ee.cryptoUnavailable"));
    fireEvent.click(screen.getByRole("button", { name: t("e2ee.copyKey") }));
    expect(writeTextMock).toHaveBeenCalledWith("actual-key");
    await act(async () => {
      useWorkspaceAuthStore.getState().clear();
      complete?.(false);
      await Promise.resolve();
    });
    expect(screen.queryByText(t("e2ee.copyFailed"))).not.toBeInTheDocument();
  });

  it("uses the encrypted info for actual direct chat UUIDs and keeps explicitly opened user profiles", async () => {
    seedWorkspaceAuth();
    act(() => {
      useMessengerStore.getState().startBootstrap(OWNER_KEY);
      useMessengerStore.getState().upsertStream(
        OWNER_KEY,
        createStream({
          projectId: RUNTIME_CONTEXT.projectId,
          encryption: true,
          name: "Encrypted direct",
          audience: "private",
          directUserUuid: ALICE_USER_UUID,
          currentEncryptionKey: { keyUuid: "direct-key" },
        }),
      );
    });
    const { rerender } = renderWithProviders(
      <RightPanelWorkspaceInfo
        info={{
          kind: "directPrivate",
          streamUuid: STREAM_UUID,
          directUserUuid: ALICE_USER_UUID,
          title: "Alice",
          avatarUrl: null,
          status: null,
          isOwnProfile: false,
          details: [],
        }}
      />,
    );
    expect(screen.getByText("direct-key")).toBeInTheDocument();
    await screen.findByText(t("e2ee.cryptoUnavailable"));
    rerender(
      <RightPanelWorkspaceInfo
        info={{
          kind: "userProfile",
          userUuid: ALICE_USER_UUID,
          title: "Alice profile",
          avatarUrl: null,
          status: null,
          isOwnProfile: false,
          details: [],
        }}
      />,
    );
    expect(screen.queryByText("direct-key")).not.toBeInTheDocument();
    expect(screen.getByText("Alice profile")).toBeInTheDocument();
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
      screen.getByText("There are new messages that are not yet included in the summary."),
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

  it("renders a topic summary as sanitized Markdown", () => {
    const { container } = renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: "topic-markdown",
            topicName: "Markdown",
            text: [
              "## Decision",
              "",
              "The **release** is ready.",
              "",
              "- Web",
              "- Desktop",
              "",
              '<script data-summary-script="true">alert("unsafe")</script>',
            ].join("\n"),
            hasNewMessages: false,
            enabled: true,
          },
        })}
      />,
    );

    const summary = screen.getByTestId("topic-summary-content");
    expect(summary.querySelector("h2")).toHaveTextContent("Decision");
    expect(summary.querySelector("strong")).toHaveTextContent("release");
    expect(summary.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[data-summary-script='true']")).toBeNull();
    expect(summary).toHaveTextContent('<script data-summary-script="true">');
  });

  it("opens the combined topic and common summary settings without collapsing the summary", async () => {
    seedWorkspaceAuth();
    seedWorkspaceIamPermissions([
      "workspace.topic_summary_settings.manage",
      "workspace.topic_summary_endpoint.manage",
    ]);
    const currentTopic = createTopic();
    act(() => {
      useMessengerStore.getState().startBootstrap(OWNER_KEY);
      useMessengerStore.getState().upsertStream(
        OWNER_KEY,
        createStream({
          projectId: RUNTIME_CONTEXT.projectId,
          ownerUuid: CURRENT_USER_UUID,
          userUuid: CURRENT_USER_UUID,
          role: "owner",
        }),
      );
      useMessengerStore.getState().upsertTopic(OWNER_KEY, currentTopic);
    });
    getTopicSummarySettingsMock.mockResolvedValue({
      project_id: RUNTIME_CONTEXT.projectId,
      global_enabled: true,
      project_enabled: true,
    });
    getTopicSummaryEndpointsMock.mockResolvedValue([]);

    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: currentTopic.uuid,
            topicName: currentTopic.name,
            text: currentTopic.summary ?? null,
            hasNewMessages: false,
            enabled: true,
          },
        })}
      />,
    );

    const settingsButton = screen.getByRole("button", { name: "Open AI summary settings" });
    const chevronButton = screen.getByRole("button", { name: "Collapse topic context" });
    expect(settingsButton.nextElementSibling).toBe(chevronButton);

    fireEvent.click(settingsButton);

    expect(screen.getByText("Release scope is approved.")).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "AI summary settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "This topic" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Common settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "LLM endpoints" })).toBeInTheDocument();
  });

  it("hides summary settings from a member while IAM capabilities are unavailable", () => {
    seedWorkspaceAuth();
    const currentTopic = createTopic();
    act(() => {
      useMessengerStore.getState().startBootstrap(OWNER_KEY);
      useMessengerStore.getState().upsertStream(
        OWNER_KEY,
        createStream({
          projectId: RUNTIME_CONTEXT.projectId,
          ownerUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          userUuid: CURRENT_USER_UUID,
          role: "member",
        }),
      );
      useMessengerStore.getState().upsertTopic(OWNER_KEY, currentTopic);
    });

    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: currentTopic.uuid,
            topicName: currentTopic.name,
            text: currentTopic.summary ?? null,
            hasNewMessages: false,
            enabled: true,
          },
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Open AI summary settings" }),
    ).not.toBeInTheDocument();
    expect(getTopicSummarySettingsMock).not.toHaveBeenCalled();
    expect(getTopicSummaryEndpointsMock).not.toHaveBeenCalled();
  });

  it("shows administrative summary settings after IAM capabilities load", async () => {
    seedWorkspaceAuth();
    const currentTopic = createTopic();
    act(() => {
      useMessengerStore.getState().startBootstrap(OWNER_KEY);
      useMessengerStore.getState().upsertStream(
        OWNER_KEY,
        createStream({
          projectId: RUNTIME_CONTEXT.projectId,
          ownerUuid: ALICE_USER_UUID,
          userUuid: CURRENT_USER_UUID,
          role: "member",
        }),
      );
      useMessengerStore.getState().upsertTopic(OWNER_KEY, currentTopic);
    });

    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: currentTopic.uuid,
            topicName: currentTopic.name,
            text: currentTopic.summary ?? null,
            hasNewMessages: false,
            enabled: true,
          },
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Open AI summary settings" }),
    ).not.toBeInTheDocument();

    act(() => {
      seedWorkspaceIamPermissions([
        "workspace.topic_summary_settings.manage",
        "workspace.topic_summary_endpoint.manage",
      ]);
    });

    const settingsButton = await screen.findByRole("button", {
      name: "Open AI summary settings",
    });
    fireEvent.click(settingsButton);

    expect(screen.queryByRole("tab", { name: "This topic" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Common settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "LLM endpoints" })).toBeInTheDocument();
  });

  it("does not reopen summary settings after switching away from and back to a topic", async () => {
    seedWorkspaceAuth();
    const firstTopic = createTopic();
    const secondTopic = createTopic({
      uuid: "88888888-8888-4888-8888-888888888888",
      name: "Delivery",
      summary: "Delivery scope is approved.",
    });
    act(() => {
      useMessengerStore.getState().startBootstrap(OWNER_KEY);
      useMessengerStore.getState().upsertStream(
        OWNER_KEY,
        createStream({
          projectId: RUNTIME_CONTEXT.projectId,
          ownerUuid: CURRENT_USER_UUID,
          userUuid: CURRENT_USER_UUID,
          role: "owner",
        }),
      );
      useMessengerStore.getState().upsertTopic(OWNER_KEY, firstTopic);
      useMessengerStore.getState().upsertTopic(OWNER_KEY, secondTopic);
    });
    getTopicSummarySettingsMock.mockResolvedValue({
      project_id: RUNTIME_CONTEXT.projectId,
      global_enabled: true,
      project_enabled: true,
    });
    getTopicSummaryEndpointsMock.mockResolvedValue([]);

    const view = renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: firstTopic.uuid,
            topicName: firstTopic.name,
            text: firstTopic.summary ?? null,
            hasNewMessages: false,
            enabled: true,
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open AI summary settings" }));
    expect(await screen.findByRole("dialog", { name: "AI summary settings" })).toBeInTheDocument();

    view.rerender(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: secondTopic.uuid,
            topicName: secondTopic.name,
            text: secondTopic.summary ?? null,
            hasNewMessages: false,
            enabled: true,
          },
        })}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "AI summary settings" })).not.toBeInTheDocument();
    });

    view.rerender(
      <RightPanelWorkspaceInfo
        info={createInfo({
          topicSummary: {
            topicUuid: firstTopic.uuid,
            topicName: firstTopic.name,
            text: firstTopic.summary ?? null,
            hasNewMessages: false,
            enabled: true,
          },
        })}
      />,
    );
    expect(screen.queryByRole("dialog", { name: "AI summary settings" })).not.toBeInTheDocument();
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
          title: "random",
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

    const channelTitle = screen.getByText("general");
    const channelAvatar = channelTitle.parentElement?.previousElementSibling;
    expect(channelAvatar).toHaveStyle({ backgroundColor: "#336699" });
  });

  it("renders members heading without a leading profile icon and a 24px add button", () => {
    // Figma members block: title + person_add only (24px glyph in 32px hit area), no profile icon.
    seedWorkspaceAuth();
    seedOwnerChannel();

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    const membersHeading = screen.getByText("Members").closest("h3");
    expect(membersHeading).not.toBeNull();
    expect(membersHeading!.querySelectorAll("svg")).toHaveLength(1);

    const addMembersButton = screen.getByRole("button", { name: "Add members" });
    expect(addMembersButton).toHaveClass("h-8", "w-8");
    const addIcon = addMembersButton.querySelector("svg");
    expect(addIcon).not.toBeNull();
    expect(addIcon).toHaveAttribute("width", "24");
    expect(addIcon).toHaveAttribute("height", "24");
    expect(membersHeading!.querySelector('svg[width="16"]')).toBeNull();
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
              streamUuid: STREAM_UUID,
              topicUuid: "active-topic",
              title: "Active topic",
              unreadCount: 9,
              activeUnreadCount: 2,
              passiveUnreadCount: 7,
              hasUnreadPersonalMention: false,
              isDefault: false,
              isDone: false,
              notificationMode: "follow",
              color: null,
              route: "/active-topic",
              preview: null,
              lastMessageCreatedAt: null,
              updatedAt: DATE,
            },
            {
              id: "passive-topic",
              streamUuid: STREAM_UUID,
              topicUuid: "passive-topic",
              title: "Muted topic",
              unreadCount: 5,
              activeUnreadCount: 0,
              passiveUnreadCount: 5,
              hasUnreadPersonalMention: false,
              isDefault: false,
              isDone: false,
              notificationMode: "default",
              color: null,
              route: "/passive-topic",
              preview: null,
              lastMessageCreatedAt: null,
              updatedAt: DATE,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("2")).toHaveClass("bg-sidebar-unread", "text-badge-text");
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
    seedOwnerChannel();
    seedWorkspaceUsers();

    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add members" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Add members")).toBeInTheDocument();
    expect(within(dialog).getByText("general")).toBeInTheDocument();
    expect(within(dialog).getByText("Bob Baker")).toBeInTheDocument();
    expect(within(dialog).queryByText("Alice Adams")).not.toBeInTheDocument();
  });

  it("keeps selections across searches and submits members hidden by the final query", async () => {
    seedWorkspaceAuth();
    seedOwnerChannel();
    seedWorkspaceUsers();
    addWorkspaceStreamMembersMock.mockResolvedValue({ status: "applied" });
    renderWithProviders(
      <RightPanelWorkspaceInfo info={createInfo({ members: [], participantsCount: 0 })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add members" }));
    const dialog = screen.getByRole("dialog");
    const search = within(dialog).getByRole("textbox");

    fireEvent.change(search, { target: { value: "Alice" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Alice Adams/i }));
    fireEvent.change(search, { target: { value: "Bob" } });
    expect(
      within(dialog).queryByRole("checkbox", { name: /Alice Adams/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Bob Baker/i }));
    fireEvent.change(search, { target: { value: "Alice" } });
    expect(within(dialog).getByRole("checkbox", { name: /Alice Adams/i })).toBeChecked();
    fireEvent.change(search, { target: { value: "no matching users" } });
    expect(within(dialog).queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(addWorkspaceStreamMembersMock).toHaveBeenCalledWith(
        expect.objectContaining({ userUuids: [ALICE_USER_UUID, BOB_USER_UUID] }),
      ),
    );
  });

  it("finds members by username while continuing to display their full name", () => {
    seedWorkspaceAuth();
    seedOwnerChannel();
    useUsersStore
      .getState()
      .replaceUsers([
        createUser({ uuid: BOB_USER_UUID, username: "hidden-login", displayName: "Bob Baker" }),
      ]);
    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add members" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: " HIDDEN-LOGIN " } });

    expect(within(dialog).getByRole("checkbox", { name: /Bob Baker/i })).toBeInTheDocument();
    expect(within(dialog).queryByText("hidden-login")).not.toBeInTheDocument();
  });

  it("submits workspace add members action", async () => {
    seedWorkspaceAuth();
    seedOwnerChannel();
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

  it.each([
    { encryption: false, role: "member" as const },
    { encryption: false, role: "administrator" as const },
    { encryption: true, role: "member" as const },
    { encryption: true, role: "administrator" as const },
  ])(
    "hides member addition for a non-owner $role with encryption=$encryption",
    async ({ encryption, role }) => {
      seedWorkspaceAuth();
      seedWorkspaceUsers();
      seedOwnerChannel({ ownerUuid: ALICE_USER_UUID, encryption, role });
      renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

      expect(screen.queryByRole("button", { name: "Add members" })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(addWorkspaceStreamMembersMock).not.toHaveBeenCalled();
      if (encryption) await screen.findByText(t("e2ee.cryptoUnavailable"));
    },
  );

  it.each(["ownership", "catalog-owner", "runtime"] as const)(
    "hides an open member picker when %s changes and blocks its saved submit callback",
    (change) => {
      seedWorkspaceAuth();
      seedOwnerChannel();
      seedWorkspaceUsers();
      renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);
      fireEvent.click(screen.getByRole("button", { name: "Add members" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("checkbox", { name: /Bob Baker/i }));
      const submitButton = within(dialog).getByRole("button", { name: "Add" });

      act(() => {
        if (change === "ownership") {
          useMessengerStore
            .getState()
            .upsertStream(OWNER_KEY, createStream({ ownerUuid: ALICE_USER_UUID }));
        } else if (change === "catalog-owner") {
          useMessengerStore.setState({ ownerKey: "other-owner" });
        } else {
          useWorkspaceAuthStore.getState().clear();
        }
        fireEvent.click(submitButton);
      });

      expect(screen.queryByRole("button", { name: "Add members" })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(addWorkspaceStreamMembersMock).not.toHaveBeenCalled();
    },
  );

  it("reuses the member picker and action for an encrypted channel owner", async () => {
    seedWorkspaceAuth();
    seedWorkspaceUsers();
    seedOwnerChannel({
      encryption: true,
      currentEncryptionKey: { keyUuid: "12345678-1234-4234-8234-123456789abc" },
    });
    addWorkspaceStreamMembersMock.mockResolvedValue({ status: "applied" });
    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    const button = screen.getByRole("button", { name: "Add members" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Alice Adams")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Bob Baker/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(addWorkspaceStreamMembersMock).toHaveBeenCalledWith(
        expect.objectContaining({ streamUuid: STREAM_UUID, userUuids: [BOB_USER_UUID] }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the encrypted channel picker open when backend membership authorization fails", async () => {
    seedWorkspaceAuth();
    seedWorkspaceUsers();
    seedOwnerChannel({
      encryption: true,
      currentEncryptionKey: { keyUuid: "12345678-1234-4234-8234-123456789abc" },
    });
    addWorkspaceStreamMembersMock.mockRejectedValue(new Error("Permission denied"));
    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    const button = screen.getByRole("button", { name: "Add members" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Bob Baker/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    expect(await within(dialog).findByText("Something went wrong")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /Bob Baker/i })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("reuses encrypted removal with the actual binding UUID, pending state, error, and retry", async () => {
    seedWorkspaceAuth();
    seedWorkspaceUsers();
    useUsersStore.setState({ ownerKey: OWNER_KEY });
    seedOwnerChannel({ encryption: true });
    const member = createInfo().members[0]!;
    useMessengerStore.getState().upsertStreamBindings(OWNER_KEY, [
      {
        uuid: member.bindingUuid,
        projectId: RUNTIME_CONTEXT.projectId,
        streamUuid: STREAM_UUID,
        userUuid: member.userUuid,
        whoUuid: CURRENT_USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    // Keep crypto initialization pending to exercise the real encrypted member UI
    // without requiring the crypto provider in this membership-focused test.
    vi.spyOn(chatCryptoSessionHook, "useChatCryptoSession").mockReturnValue({
      session: null,
      state: { access: "missing", pending: false, requestStatus: "idle", error: null },
      sendKeyUuid: null,
      loading: true,
      error: null,
      requestErrors: {},
      reissueKey: vi.fn(() => Promise.resolve(false)),
      removeLocalKey: vi.fn(() => Promise.resolve(false)),
      grantAllKeys: vi.fn(() => Promise.resolve(false)),
      requestKey: vi.fn(() => Promise.resolve(false)),
      grantKey: vi.fn(() => Promise.resolve()),
      rejectKey: vi.fn(() => Promise.resolve()),
    });
    let rejectRemoval: ((reason: Error) => void) | undefined;
    removeWorkspaceStreamMemberMock.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectRemoval = reject;
      }),
    );
    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);
    const removeButton = screen.getByRole("button", { name: "Remove from channel: Alice Adams" });
    fireEvent.click(removeButton);
    expect(removeButton).toBeDisabled();
    expect(removeWorkspaceStreamMemberMock).toHaveBeenCalledWith(
      expect.objectContaining({
        streamUuid: STREAM_UUID,
        bindingUuid: ALICE_BINDING_UUID,
        userUuid: ALICE_USER_UUID,
      }),
    );
    await act(() => {
      rejectRemoval?.(new Error("Membership rejected"));
      return Promise.resolve();
    });
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(removeButton).toBeEnabled();
    removeWorkspaceStreamMemberMock.mockResolvedValueOnce({ status: "applied" });
    fireEvent.click(removeButton);
    await waitFor(() => expect(removeWorkspaceStreamMemberMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument());
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

  it("keeps a member's away badge instead of turning it into offline", () => {
    renderWithProviders(
      <RightPanelWorkspaceInfo
        info={createInfo({
          members: [
            {
              ...createInfo().members[0]!,
              status: "idle",
              isOnline: false,
            },
          ],
        })}
      />,
    );

    expect(screen.getByLabelText(t("presence.away"))).toHaveClass("bg-indicator-orange");
    expect(screen.queryByLabelText(t("presence.offline"))).not.toBeInTheDocument();
  });

  it("does not render remove action without runtime context", () => {
    renderWithProviders(<RightPanelWorkspaceInfo info={createInfo()} />);

    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove from channel: Alice Adams" }),
    ).not.toBeInTheDocument();
  });
});
