import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerBootstrapPayload } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { createUser } from "~/test/factories";
import { useLayoutRightPanelShell } from "./layout-right-panel-shell.hook";
import type { UseLayoutRightPanelShellParams } from "./layout-right-panel-shell.hook";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "33333333-3333-4333-8333-333333333333";
const DIRECT_USER_UUID = "44444444-4444-4444-8444-444444444444";
const BINDING_UUID = "55555555-5555-4555-8555-555555555555";
const DIRECT_STREAM_UUID = "66666666-6666-4666-8666-666666666666";
const SESSION: WorkspaceAuthSession = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  projectId: "project-a",
  organizationOrigin: "https://workspace.example.com",
  userUuid: USER_UUID,
  accessToken: "test-token",
  runtimeGeneration: 1,
  login: "alice",
  profile: {
    uuid: USER_UUID,
    username: "alice",
    firstName: "Alice",
    lastName: "Stone",
    email: "alice@example.com",
  },
};
const OWNER_KEY = workspaceRuntimeOwnerKey(SESSION);

function createBootstrapPayload(): MessengerBootstrapPayload {
  return {
    streams: [
      {
        uuid: STREAM_UUID,
        projectId: "project-a",
        ownerUuid: USER_UUID,
        userUuid: USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        name: "general",
        description: "Team updates",
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
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
      {
        uuid: DIRECT_STREAM_UUID,
        projectId: "project-a",
        ownerUuid: USER_UUID,
        userUuid: USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        name: "alice-and-cora",
        description: "",
        unreadCount: 0,
        sourceName: "native",
        source: { kind: "native" },
        audience: "private",
        isPrivate: true,
        inviteOnly: true,
        announce: false,
        isArchived: false,
        directUserUuid: DIRECT_USER_UUID,
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    streamBindings: [
      {
        uuid: BINDING_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_UUID,
        whoUuid: USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    topics: [
      {
        uuid: TOPIC_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_UUID,
        name: "Roadmap",
        unreadCount: 2,
        isDefault: false,
        isDone: false,
        notificationMode: "default",
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    conversations: [],
    folders: [],
  };
}

function buildParams(
  overrides: Partial<UseLayoutRightPanelShellParams> = {},
): UseLayoutRightPanelShellParams {
  return {
    streamsFromStore: [],
    dmsFromStore: [],
    streamsMap: new Map(),
    activeStreamSlug: undefined,
    activeTopic: null,
    dmIdParam: undefined,
    currentUserId: null,
    rightDrawerOpen: true,
    rightDrawerMode: "info",
    rightDrawerUserIdOverride: null,
    rightDrawerWorkspaceUserUuidOverride: null,
    mutedStreamIds: new Set(),
    usersMapForRightDrawer: new Map(),
    workspaceRoute: null,
    ...overrides,
  };
}

describe("useLayoutRightPanelShell", () => {
  beforeEach(() => {
    useWorkspaceAuthStore.setState({ sessions: [SESSION], currentAccountId: SESSION.accountId });
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().replaceBootstrapState(OWNER_KEY, createBootstrapPayload());
    useUsersStore.getState().startOwnerSync(OWNER_KEY);
    useUsersStore.getState().replaceUsers([
      createUser({
        uuid: USER_UUID,
        full_name: "Alice Stone",
        email: "alice@example.com",
        status: "active",
      }),
      createUser({
        uuid: DIRECT_USER_UUID,
        full_name: "Cora Lane",
        email: "cora@example.com",
        status: "idle",
      }),
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
  });

  it("uses Workspace projection on Workspace routes", () => {
    const { result } = renderHook(() =>
      useLayoutRightPanelShell(
        buildParams({
          workspaceRoute: {
            kind: "stream",
            orgId: "org-a",
            projectId: "project-a",
            streamUuid: STREAM_UUID,
          },
        }),
      ),
    );

    expect(result.current.rightDrawerTitle).toBe("Channel info");
    expect(result.current.rightPanelTitleResolved).toBe("#general");
    expect(result.current.participantsCount).toBe(1);
    expect(result.current.onlineCount).toBe(1);
    expect(result.current.workspaceRightPanelInfo?.kind).toBe("channel");
    if (result.current.workspaceRightPanelInfo?.kind !== "channel") {
      throw new Error("Expected channel right-panel view");
    }
    expect(result.current.workspaceRightPanelInfo?.topics).toEqual([
      expect.objectContaining({
        id: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        title: "Roadmap",
        unreadCount: 2,
        activeUnreadCount: 2,
        passiveUnreadCount: 0,
        hasUnreadPersonalMention: false,
        isDone: false,
        notificationMode: "default",
        route: `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      }),
    ]);
  });

  it("returns Workspace direct private panel data without legacy right-panel user", () => {
    const { result } = renderHook(() =>
      useLayoutRightPanelShell(
        buildParams({
          workspaceRoute: {
            kind: "stream",
            orgId: "org-a",
            projectId: "project-a",
            streamUuid: DIRECT_STREAM_UUID,
          },
        }),
      ),
    );

    expect(result.current.rightDrawerTitle).toBe("Information");
    expect(result.current.rightPanelTitleResolved).toBe("Cora Lane");
    expect(result.current.participantsCount).toBe(0);
    expect(result.current.onlineCount).toBe(0);
    expect(result.current.workspaceRightPanelInfo).toEqual(
      expect.objectContaining({
        kind: "directPrivate",
        directUserUuid: DIRECT_USER_UUID,
        title: "Cora Lane",
        status: "idle",
      }),
    );
  });

  it("opens a current-owner profile on Inbox without a conversation", () => {
    const { result } = renderHook(() =>
      useLayoutRightPanelShell(
        buildParams({
          workspaceRoute: { kind: "inbox", orgId: "org-a", projectId: "project-a" },
          rightDrawerWorkspaceUserUuidOverride: DIRECT_USER_UUID,
        }),
      ),
    );

    expect(result.current.workspaceRightPanelInfo).toEqual(
      expect.objectContaining({
        kind: "userProfile",
        userUuid: DIRECT_USER_UUID,
        title: "Cora Lane",
        isOwnProfile: false,
      }),
    );
    expect(result.current.rightDrawerTitle).toBe("Information");
  });

  it.each([
    { orgId: "org-b", projectId: "project-a" },
    { orgId: "org-a", projectId: "project-b" },
  ])("hides profile data on a mismatched route %o", (route) => {
    const { result } = renderHook(() =>
      useLayoutRightPanelShell(
        buildParams({
          workspaceRoute: { kind: "inbox", ...route },
          rightDrawerWorkspaceUserUuidOverride: DIRECT_USER_UUID,
        }),
      ),
    );

    expect(result.current.workspaceRightPanelInfo?.kind).not.toBe("userProfile");
    expect(result.current.rightPanelTitleResolved).not.toBe("Cora Lane");
  });

  it.each(["inbox", "stream"] as const)(
    "hides stale profile data on the %s route during an account switch",
    (kind) => {
      const { result } = renderHook(() =>
        useLayoutRightPanelShell(
          buildParams({
            workspaceRoute: {
              kind,
              orgId: "org-a",
              projectId: "project-a",
              streamUuid: STREAM_UUID,
            },
            rightDrawerWorkspaceUserUuidOverride: DIRECT_USER_UUID,
          }),
        ),
      );
      expect(result.current.workspaceRightPanelInfo?.kind).toBe("userProfile");

      act(() => {
        const nextSession = { ...SESSION, accountId: "account-b", runtimeGeneration: 2 };
        useWorkspaceAuthStore.setState({
          sessions: [SESSION, nextSession],
          currentAccountId: nextSession.accountId,
        });
      });

      expect(useUsersStore.getState().ownerKey).toBe(OWNER_KEY);
      expect(result.current.workspaceRightPanelInfo?.kind).not.toBe("userProfile");
      expect(result.current.rightPanelTitleResolved).not.toBe("Cora Lane");
    },
  );

  it("hides profile data as soon as the current session is removed", () => {
    const { result } = renderHook(() =>
      useLayoutRightPanelShell(
        buildParams({
          workspaceRoute: { kind: "inbox", orgId: "org-a", projectId: "project-a" },
          rightDrawerWorkspaceUserUuidOverride: DIRECT_USER_UUID,
        }),
      ),
    );

    act(() => {
      useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
    });

    expect(result.current.workspaceRightPanelInfo?.kind).not.toBe("userProfile");
    expect(result.current.rightPanelTitleResolved).not.toBe("Cora Lane");
  });

  it("keeps Workspace panel fallback when route data is not projected yet", () => {
    const { result } = renderHook(() =>
      useLayoutRightPanelShell(
        buildParams({
          workspaceRoute: {
            kind: "stream",
            orgId: "org-a",
            projectId: "project-a",
            streamUuid: "77777777-7777-4777-8777-777777777777",
          },
        }),
      ),
    );

    expect(result.current.rightPanelTitleResolved).toBe("#General Chat");
    expect(result.current.participantsCount).toBe(0);
    expect(result.current.onlineCount).toBe(0);
    expect(result.current.workspaceRightPanelInfo).toEqual(
      expect.objectContaining({
        kind: "channel",
        streamUuid: null,
        title: "#General Chat",
      }),
    );
  });
});
