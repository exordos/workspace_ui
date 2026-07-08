import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runWorkspaceChannelCreate,
  runWorkspaceDirectStreamCreate,
} from "~/entities/messenger/messenger-create-chat-actions.lib";
import { runWorkspaceCreateTopicRequest } from "~/entities/messenger/messenger-sidebar-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useCreateChatDialog } from "./create-chat-dialog.hook";

vi.mock("~/entities/messenger/messenger-create-chat-actions.lib", () => ({
  runWorkspaceChannelCreate: vi.fn(),
  runWorkspaceDirectStreamCreate: vi.fn(),
}));

vi.mock("~/entities/messenger/messenger-sidebar-actions.lib", () => ({
  runWorkspaceCreateTopicRequest: vi.fn(),
}));

function defaultHookOptions(overrides: Partial<Parameters<typeof useCreateChatDialog>[0]> = {}) {
  return {
    open: true,
    onChannelCreated: vi.fn(),
    ...overrides,
  };
}

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

function createStream(overrides: Partial<MessengerStream> & { uuid: string }): MessengerStream {
  return {
    uuid: overrides.uuid,
    projectId: overrides.projectId ?? "project",
    ownerUuid: overrides.ownerUuid ?? "current-user",
    userUuid: overrides.userUuid ?? "current-user",
    role: overrides.role ?? "owner",
    notificationMode: overrides.notificationMode ?? "mentions_only",
    name: overrides.name ?? "engineering",
    description: overrides.description ?? "",
    unreadCount: overrides.unreadCount ?? 0,
    sourceName: overrides.sourceName ?? "native",
    source: overrides.source ?? { kind: "native" },
    audience: overrides.audience ?? "channel",
    isPrivate: overrides.isPrivate ?? false,
    inviteOnly: overrides.inviteOnly ?? false,
    announce: overrides.announce ?? false,
    isArchived: overrides.isArchived ?? false,
    directUserUuid: overrides.directUserUuid ?? null,
    lastMessageUuid: overrides.lastMessageUuid ?? null,
    createdAt: overrides.createdAt ?? "2026-06-30T09:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-30T09:00:00.000Z",
  };
}

function createTopic(overrides: Partial<MessengerTopic> & { uuid: string }): MessengerTopic {
  return {
    uuid: overrides.uuid,
    projectId: overrides.projectId ?? "project",
    streamUuid: overrides.streamUuid ?? "stream-a",
    userUuid: overrides.userUuid ?? "current-user",
    name: overrides.name ?? "General",
    unreadCount: overrides.unreadCount ?? 0,
    isDefault: overrides.isDefault ?? true,
    isDone: overrides.isDone ?? false,
    notificationMode: overrides.notificationMode ?? "default",
    lastMessageUuid: overrides.lastMessageUuid ?? null,
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

function seedUsers(): void {
  useUsersStore.getState().replaceUsers([
    createUser({
      uuid: "current-user",
      username: "current",
      displayName: "Current User",
      email: "me@example.com",
      status: "active",
    }),
    createUser({
      uuid: "alice-user",
      username: "alice",
      displayName: "Alice",
      email: "alice@example.com",
      status: "active",
    }),
    createUser({
      uuid: "bob-user",
      username: "bob",
      displayName: "Bob",
      email: "bob@example.com",
      status: "idle",
    }),
  ]);
}

describe("useCreateChatDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUsersStore.getState().clear();
    useMessengerStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
  });

  afterEach(() => {
    useUsersStore.getState().clear();
    useMessengerStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
  });

  it("keeps the full tab shell while using Workspace-only behavior", () => {
    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    expect(result.current.visibleTabs).toEqual(["dm", "channels", "channel", "topic", "archived"]);
    expect(result.current.browseChannels).toEqual([]);
    expect(result.current.archivedChannels).toEqual([]);
  });

  it("allows callers to limit visible tabs without changing Workspace behavior", () => {
    const { result } = renderHook(() =>
      useCreateChatDialog(defaultHookOptions({ visibleTabs: ["dm", "channel"] })),
    );

    expect(result.current.visibleTabs).toEqual(["dm", "channel"]);

    act(() => {
      result.current.setTab("archived");
    });
    expect(result.current.tab).toBe("dm");

    act(() => {
      result.current.setTab("channel");
    });
    expect(result.current.tab).toBe("channel");
  });

  it("opens a direct chat by creating a Workspace direct stream", async () => {
    seedWorkspaceSession();
    seedUsers();
    const stream = createStream({ uuid: "direct-stream", directUserUuid: "alice-user" });
    vi.mocked(runWorkspaceDirectStreamCreate).mockResolvedValue({
      status: "applied",
      ownerKey: "owner",
      stream,
      defaultTopic: createTopic({ uuid: "topic-a", streamUuid: stream.uuid }),
      streamBindings: [],
    });
    const onNavigateWorkspaceStream = vi.fn();
    const onChannelCreated = vi.fn();

    const { result } = renderHook(() =>
      useCreateChatDialog(defaultHookOptions({ onNavigateWorkspaceStream, onChannelCreated })),
    );

    act(() => {
      result.current.openDirectUser(result.current.filteredUsers[0]!);
    });

    await waitFor(() => {
      expect(runWorkspaceDirectStreamCreate).toHaveBeenCalledWith({
        directUserUuid: "alice-user",
      });
    });
    expect(onNavigateWorkspaceStream).toHaveBeenCalledWith("direct-stream");
    expect(onChannelCreated).toHaveBeenCalledTimes(1);
  });

  it("does not offer the system user as a direct chat candidate", () => {
    seedWorkspaceSession();
    useUsersStore.getState().replaceUsers([
      createUser({
        uuid: "00000000-0000-0000-0000-000000000000",
        username: "system-00000000-0000-0000-0000-000000000000",
        displayName: "system-00000000-0000-0000-0000-000000000000",
      }),
      createUser({
        uuid: "alice-user",
        username: "alice",
        displayName: "Alice",
        email: "alice@example.com",
      }),
    ]);

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    expect(result.current.filteredUsers.map((user) => user.workspaceUserUuid)).toEqual([
      "alice-user",
    ]);
  });

  it("creates a Workspace channel with selected member UUIDs", async () => {
    seedWorkspaceSession();
    seedUsers();
    const stream = createStream({ uuid: "stream-a", name: "engineering" });
    vi.mocked(runWorkspaceChannelCreate).mockResolvedValue({
      status: "applied",
      ownerKey: "owner",
      stream,
      defaultTopic: createTopic({ uuid: "topic-a", streamUuid: stream.uuid }),
      streamBindings: [],
    });

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    act(() => {
      result.current.setChannelName("  engineering  ");
      result.current.toggleChannelUser("alice-user");
    });
    act(() => {
      result.current.createChannel();
    });

    await waitFor(() => {
      expect(runWorkspaceChannelCreate).toHaveBeenCalledWith({
        name: "engineering",
        description: "",
        memberUserUuids: ["alice-user"],
        inviteOnly: false,
        announce: false,
      });
    });
  });

  it("keeps unsupported browse and archive actions inert", async () => {
    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    act(() => {
      result.current.setTab("channels");
      result.current.setChannelsSearch("design");
      result.current.setChannelsSubscriptionFilter("subscribed");
      result.current.setTab("archived");
      result.current.setArchivedSearch("old");
    });
    await act(async () => {
      await result.current.onSubscribeToChannel(1, "design");
      await result.current.onUnsubscribeFromChannel(1, "design");
      await result.current.onUnarchiveArchivedChannel(1);
    });

    expect(result.current.channelsLoading).toBe(false);
    expect(result.current.channelsError).toBe(false);
    expect(result.current.subscribeInlineError).toBeNull();
    expect(result.current.unarchiveInlineError).toBeNull();
  });

  it("creates a Workspace topic for the selected stream", async () => {
    seedWorkspaceSession();
    const stream = createStream({
      uuid: "11111111-1111-4111-8111-111111111111",
      name: "engineering",
    });
    useMessengerStore.getState().startBootstrap("owner");
    useMessengerStore.getState().upsertStream("owner", stream);
    vi.mocked(runWorkspaceCreateTopicRequest).mockResolvedValue({
      status: "applied",
      ownerKey: "owner",
      topic: createTopic({ uuid: "topic-a", streamUuid: stream.uuid, name: "Roadmap" }),
    });

    const { result } = renderHook(() => useCreateChatDialog(defaultHookOptions()));

    act(() => {
      result.current.setWorkspaceTopicName("Roadmap");
    });
    act(() => {
      result.current.createWorkspaceTopic();
    });

    await waitFor(() => {
      expect(runWorkspaceCreateTopicRequest).toHaveBeenCalledWith({
        streamUuid: "11111111-1111-4111-8111-111111111111",
        name: "Roadmap",
      });
    });
  });
});
