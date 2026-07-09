import { afterEach, describe, expect, it } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { createWorkspacePluginDataProvider } from "./workspace-plugin-data-provider.lib";

const USER_UUID = "a225223c-637c-4afa-918f-5f2798b9305f";

function createSession(overrides: Partial<WorkspaceAuthSession> = {}): WorkspaceAuthSession {
  const userUuid = overrides.userUuid ?? USER_UUID;
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "workspace.example.com",
    organizationOrigin: "https://workspace.example.com",
    projectId: "project-a",
    userUuid,
    login: "alice@example.com",
    accessToken: "access-token",
    runtimeGeneration: 1,
    profile: {
      uuid: userUuid,
      username: "alice",
      firstName: "Alice",
      lastName: "Workspace",
      email: "alice@example.com",
      status: "active",
    },
    ...overrides,
  };
}

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  const now = "2026-07-02T10:00:00Z";
  return {
    uuid: "75309057-419c-4b12-a7c1-3932429ec4a6",
    projectId: "project-a",
    ownerUuid: "owner-a",
    userUuid: USER_UUID,
    role: "member",
    notificationMode: "all_messages",
    name: "General",
    description: "",
    unreadCount: 3,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("createWorkspacePluginDataProvider", () => {
  afterEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  });

  it("exposes current Workspace user UUID and streams from the active owner", () => {
    const session = createSession();
    const stream = createStream();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, {
      streams: [stream],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [],
    });

    const provider = createWorkspacePluginDataProvider();

    expect(provider.getCurrentUserId()).toBe(USER_UUID);
    expect(provider.getStreams()).toEqual([{ id: stream.uuid, name: "General", badge: 3 }]);
  });

  it("does not expose streams from a stale owner", () => {
    const currentSession = createSession();
    const staleSession = createSession({
      accountId: "account-b",
      instanceId: "instance-b",
      projectId: "project-b",
    });
    const staleOwnerKey = workspaceRuntimeOwnerKey(staleSession);
    useWorkspaceAuthStore.setState({
      sessions: [currentSession],
      currentAccountId: currentSession.accountId,
      runtimeGeneration: 1,
    });
    useMessengerStore.getState().startBootstrap(staleOwnerKey);
    useMessengerStore.getState().replaceBootstrapState(staleOwnerKey, {
      streams: [createStream({ projectId: "project-b" })],
      streamBindings: [],
      topics: [],
      conversations: [],
      folders: [],
    });

    expect(createWorkspacePluginDataProvider().getStreams()).toEqual([]);
  });
});
