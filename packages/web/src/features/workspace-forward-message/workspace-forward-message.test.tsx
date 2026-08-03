import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { useWorkspaceForwardMessageStore } from "./workspace-forward-message.model";

const mocks = vi.hoisted(() => ({
  getMessagesByUuids: vi.fn(),
  sendMessengerMessage: vi.fn(),
  createWorkspaceDirectStream: vi.fn(),
}));

vi.mock("~/shared/api/messenger-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/messenger-client")>();
  return { ...actual, getMessagesByUuids: mocks.getMessagesByUuids };
});

vi.mock("~/entities/messenger/messenger-message-actions.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/entities/messenger/messenger-message-actions.lib")>();
  return { ...actual, sendMessengerMessage: mocks.sendMessengerMessage };
});

vi.mock("~/entities/messenger/messenger-create-chat-actions.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/entities/messenger/messenger-create-chat-actions.lib")>();
  return { ...actual, createWorkspaceDirectStream: mocks.createWorkspaceDirectStream };
});

const FEATURE_DIR = __dirname;
const UI_MODULE = "./workspace-forward-message.ui";
const MODEL_MODULE = "./workspace-forward-message.model";
const PROJECT_UUID = "00000000-0000-4000-8000-000000000001";
const USER_A_UUID = "00000000-0000-4000-8000-000000000002";
const USER_B_UUID = "00000000-0000-4000-8000-000000000003";
const STREAM_UUID = "00000000-0000-4000-8000-000000000004";
const TOPIC_UUID = "00000000-0000-4000-8000-000000000005";
const DIRECT_STREAM_UUID = "00000000-0000-4000-8000-000000000006";
const DIRECT_TOPIC_UUID = "00000000-0000-4000-8000-000000000007";
const MESSAGE_UUID = "00000000-0000-4000-8000-000000000008";
const CREATED_STREAM_UUID = "00000000-0000-4000-8000-000000000009";
const CREATED_TOPIC_UUID = "00000000-0000-4000-8000-00000000000a";

const blockedTokens = [
  ["zu", "lip"].join(""),
  ["Mock", "Message"].join(""),
  ["Zu", "lip", "Raw", "Message"].join(""),
  ["fetch", "Message", "By", "Id"].join(""),
  ["chat", "-", "forward", ".", "lib"].join(""),
  ["/", "dm", "/"].join(""),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }

    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
      return [];
    }

    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
      return [];
    }

    return [fullPath];
  });
}

function createSession(): WorkspaceAuthSession {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://workspace.example.test",
    projectId: PROJECT_UUID,
    userUuid: USER_A_UUID,
    accessToken: "token-a",
    refreshToken: "refresh-a",
    runtimeGeneration: 1,
    login: "alice",
    profile: {
      uuid: USER_A_UUID,
      username: "alice",
      firstName: "Alice",
      lastName: "Cooper",
      email: "alice@example.test",
    },
  };
}

function createUser(overrides: Partial<User>): User {
  const uuid = overrides.uuid ?? USER_A_UUID;
  return {
    uuid,
    username: overrides.username ?? uuid,
    firstName: overrides.firstName ?? null,
    lastName: overrides.lastName ?? null,
    displayName: overrides.displayName ?? overrides.username ?? uuid,
    email: overrides.email ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
    status: overrides.status ?? "active",
    statusEmoji: overrides.statusEmoji ?? null,
    statusText: overrides.statusText ?? null,
    lastPingAt: overrides.lastPingAt ?? "2026-01-01T00:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: overrides.uuid ?? STREAM_UUID,
    projectId: PROJECT_UUID,
    ownerUuid: USER_A_UUID,
    userUuid: USER_A_UUID,
    role: "owner",
    notificationMode: "all_messages",
    name: overrides.name ?? "General",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: overrides.audience ?? "channel",
    isPrivate: overrides.isPrivate ?? false,
    inviteOnly: false,
    announce: false,
    isArchived: overrides.isArchived ?? false,
    directUserUuid: overrides.directUserUuid ?? null,
    lastMessageUuid: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createTopic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: overrides.uuid ?? TOPIC_UUID,
    projectId: PROJECT_UUID,
    streamUuid: overrides.streamUuid ?? STREAM_UUID,
    userUuid: USER_A_UUID,
    name: overrides.name ?? "General topic",
    unreadCount: 0,
    isDefault: overrides.isDefault ?? false,
    isDone: overrides.isDone ?? false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createMessageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: overrides.uuid ?? MESSAGE_UUID,
    project_id: PROJECT_UUID,
    stream_uuid: overrides.stream_uuid ?? STREAM_UUID,
    topic_uuid: overrides.topic_uuid ?? TOPIC_UUID,
    author_uuid: overrides.author_uuid ?? USER_B_UUID,
    payload: overrides.payload ?? { kind: "markdown", content: "full message text" },
    user_uuid: overrides.user_uuid ?? USER_B_UUID,
    read: overrides.read ?? true,
    pinned: overrides.pinned ?? false,
    starred: overrides.starred ?? false,
    is_own: overrides.is_own ?? false,
    reactions: overrides.reactions ?? {},
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function prepareStores(options: { includeDirect?: boolean } = {}) {
  const session = createSession();
  const ownerKey = workspaceRuntimeOwnerKey(session);
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
  useUsersStore.getState().startOwnerSync(ownerKey);
  useUsersStore.getState().replaceUsers([
    createUser({
      uuid: USER_A_UUID,
      username: "alice",
      displayName: "Alice Cooper",
      email: "alice@example.test",
    }),
    createUser({
      uuid: USER_B_UUID,
      username: "bob",
      displayName: "Bob Reed",
      email: "bob@example.test",
    }),
  ]);
  useMessengerStore.getState().startBootstrap(ownerKey);
  useMessengerStore.getState().replaceBootstrapState(ownerKey, {
    streams: [
      createStream(),
      ...(options.includeDirect === false
        ? []
        : [
            createStream({
              uuid: DIRECT_STREAM_UUID,
              name: "Bob Reed",
              audience: "private",
              isPrivate: true,
              directUserUuid: USER_B_UUID,
            }),
          ]),
    ],
    streamBindings: [],
    topics: [
      createTopic(),
      ...(options.includeDirect === false
        ? []
        : [
            createTopic({
              uuid: DIRECT_TOPIC_UUID,
              streamUuid: DIRECT_STREAM_UUID,
              name: "Direct",
              isDefault: true,
            }),
          ]),
    ],
    conversations: [],
    folders: [],
  });
}

async function waitForForwardMessageInStore(): Promise<void> {
  await waitFor(() => {
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]?.payload.content).toBe(
      "full message text",
    );
  });
}

describe("workspace forward message feature boundaries", () => {
  it("does not introduce legacy forward dependencies in source files", () => {
    const violations = sourceFiles(FEATURE_DIR).flatMap((filePath) => {
      const content = readFileSync(filePath, "utf8");

      return blockedTokens
        .filter((token) => content.toLowerCase().includes(token.toLowerCase()))
        .map((token) => `${filePath}: ${token}`);
    });

    expect(violations).toEqual([]);
  });
});

describe("WorkspaceForwardMessageDialog contract", () => {
  beforeEach(() => {
    cleanup();
    mocks.getMessagesByUuids.mockResolvedValue([createMessageDto()]);
    mocks.sendMessengerMessage.mockResolvedValue({ status: "applied" });
    mocks.createWorkspaceDirectStream.mockResolvedValue({
      status: "applied",
      ownerKey: "owner",
      stream: createStream({
        uuid: CREATED_STREAM_UUID,
        audience: "private",
        isPrivate: true,
        directUserUuid: USER_B_UUID,
      }),
      defaultTopic: createTopic({
        uuid: CREATED_TOPIC_UUID,
        streamUuid: CREATED_STREAM_UUID,
        isDefault: true,
      }),
      streamBindings: [],
    });
    useWorkspaceForwardMessageStore.getState().reset();
    useWorkspaceMessageStore.getState().clear();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
    prepareStores();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("exports WorkspaceForwardMessageDialog", async () => {
    const mod = await import(UI_MODULE);

    expect(mod.WorkspaceForwardMessageDialog).toEqual(expect.any(Function));
  });

  it("loads a missing message through Workspace API and applies it to the store", async () => {
    const { WorkspaceForwardMessageDialog } = await import(UI_MODULE);
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);

    useWorkspaceForwardMessageStore.getState().open({ messageUuids: [MESSAGE_UUID] });
    render(<WorkspaceForwardMessageDialog />);

    await waitForForwardMessageInStore();
    expect(mocks.getMessagesByUuids).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_UUID }),
      [MESSAGE_UUID],
    );
    expect(screen.queryByText(/full message text/)).not.toBeInTheDocument();
  });

  it("sends a topic forward with stream, topic, markdown, and no stream-conversation include", async () => {
    const { WorkspaceForwardMessageDialog } = await import(UI_MODULE);
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);

    useWorkspaceForwardMessageStore.getState().open({ messageUuids: [MESSAGE_UUID] });
    render(<WorkspaceForwardMessageDialog />);

    await waitForForwardMessageInStore();
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: STREAM_UUID } });
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: TOPIC_UUID } });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() => {
      expect(mocks.sendMessengerMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          streamUuid: STREAM_UUID,
          topicUuid: TOPIC_UUID,
          markdown: `[Bob Reed](urn:quote:${MESSAGE_UUID})`,
          includeStreamConversation: false,
        }),
      );
    });
    expect(useWorkspaceForwardMessageStore.getState().isOpen).toBe(false);
  });

  it("calls success callback after successful topic forward", async () => {
    const { WorkspaceForwardMessageDialog } = await import(UI_MODULE);
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);
    const onSuccess = vi.fn();

    useWorkspaceForwardMessageStore.getState().open({
      messageUuids: [MESSAGE_UUID],
      onSuccess,
    });
    render(<WorkspaceForwardMessageDialog />);

    await waitForForwardMessageInStore();
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: STREAM_UUID } });
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: TOPIC_UUID } });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
      isOpen: false,
      onSuccess: undefined,
    });
  });

  it("clears submit flag without applying stale runtime submit result", async () => {
    const { WorkspaceForwardMessageDialog } = await import(UI_MODULE);
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);
    const onSuccess = vi.fn();
    let resolveSend!: (result: { status: "applied" }) => void;
    mocks.sendMessengerMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    useWorkspaceForwardMessageStore.getState().open({
      messageUuids: [MESSAGE_UUID],
      onSuccess,
    });
    render(<WorkspaceForwardMessageDialog />);

    await waitForForwardMessageInStore();
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: STREAM_UUID } });
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: TOPIC_UUID } });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() => {
      expect(mocks.sendMessengerMessage).toHaveBeenCalledTimes(1);
      expect(useWorkspaceForwardMessageStore.getState().isSubmitting).toBe(true);
    });

    const nextSession = { ...createSession(), runtimeGeneration: 2 };
    act(() => {
      useWorkspaceAuthStore.setState({
        sessions: [nextSession],
        currentAccountId: nextSession.accountId,
        runtimeGeneration: nextSession.runtimeGeneration,
      });
      resolveSend({ status: "applied" });
    });

    await waitFor(() => {
      expect(useWorkspaceForwardMessageStore.getState().isSubmitting).toBe(false);
    });
    expect(useWorkspaceForwardMessageStore.getState().isOpen).toBe(true);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("sends a direct forward through an existing private stream default topic", async () => {
    const { WorkspaceForwardMessageDialog } = await import(UI_MODULE);
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);

    useWorkspaceForwardMessageStore.getState().open({ messageUuids: [MESSAGE_UUID] });
    render(<WorkspaceForwardMessageDialog />);

    await waitForForwardMessageInStore();
    fireEvent.click(screen.getByRole("button", { name: "DM" }));
    fireEvent.click(screen.getByRole("button", { name: "Bob Reed" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() => {
      expect(mocks.sendMessengerMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          streamUuid: DIRECT_STREAM_UUID,
          topicUuid: DIRECT_TOPIC_UUID,
          includeStreamConversation: false,
        }),
      );
    });
    expect(mocks.createWorkspaceDirectStream).not.toHaveBeenCalled();
  });

  it("creates a direct stream before sending when no private stream exists", async () => {
    const { WorkspaceForwardMessageDialog } = await import(UI_MODULE);
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);
    prepareStores({ includeDirect: false });

    useWorkspaceForwardMessageStore.getState().open({ messageUuids: [MESSAGE_UUID] });
    render(<WorkspaceForwardMessageDialog />);

    await waitForForwardMessageInStore();
    fireEvent.click(screen.getByRole("button", { name: "DM" }));
    fireEvent.click(screen.getByRole("button", { name: "Bob Reed" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() => {
      expect(mocks.createWorkspaceDirectStream).toHaveBeenCalledWith(
        expect.objectContaining({
          directUserUuid: USER_B_UUID,
          runtimeContext: expect.objectContaining({ projectId: PROJECT_UUID }),
        }),
      );
      expect(mocks.sendMessengerMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          streamUuid: CREATED_STREAM_UUID,
          topicUuid: CREATED_TOPIC_UUID,
        }),
      );
    });
  });

  it("offers Favorites as a self-chat forwarding target", async () => {
    const { WorkspaceForwardMessageDialog } = await import(UI_MODULE);
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);

    useWorkspaceForwardMessageStore.getState().open({ messageUuids: [MESSAGE_UUID] });
    render(<WorkspaceForwardMessageDialog />);

    await waitForForwardMessageInStore();
    fireEvent.click(screen.getByRole("button", { name: "DM" }));
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() => {
      expect(mocks.createWorkspaceDirectStream).toHaveBeenCalledWith(
        expect.objectContaining({
          directUserUuid: USER_A_UUID,
          runtimeContext: expect.objectContaining({ projectId: PROJECT_UUID }),
        }),
      );
      expect(mocks.sendMessengerMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          streamUuid: CREATED_STREAM_UUID,
          topicUuid: CREATED_TOPIC_UUID,
        }),
      );
    });
  });

  it("keeps dialog open and shows error when sending fails", async () => {
    const { WorkspaceForwardMessageDialog } = await import(UI_MODULE);
    const { useWorkspaceForwardMessageStore } = await import(MODEL_MODULE);
    mocks.sendMessengerMessage.mockRejectedValue(new Error("Send failed"));

    useWorkspaceForwardMessageStore.getState().open({ messageUuids: [MESSAGE_UUID] });
    render(<WorkspaceForwardMessageDialog />);

    await waitForForwardMessageInStore();
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: STREAM_UUID } });
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: TOPIC_UUID } });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(await screen.findByText("Send failed")).toBeInTheDocument();
    expect(useWorkspaceForwardMessageStore.getState().isOpen).toBe(true);
  });
});
