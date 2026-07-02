import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerBootstrapPayload } from "~/entities/messenger/messenger.types";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { useLayoutRightPanelShell } from "./layout-right-panel-shell.hook";
import type { UseLayoutRightPanelShellParams } from "./layout-right-panel-shell.hook";

const fetchStreamMembersMock = vi.hoisted(() => vi.fn());
const fetchStreamsMock = vi.hoisted(() => vi.fn());
const OWNER_KEY = "account-a:org-a:project-a";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "33333333-3333-4333-8333-333333333333";
const BINDING_UUID = "55555555-5555-4555-8555-555555555555";

vi.mock("~/shared/api/zulip-streams", () => ({
  fetchStreamMembers: fetchStreamMembersMock,
  fetchStreams: fetchStreamsMock,
}));

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
    users: [
      {
        uuid: USER_UUID,
        username: "alice",
        status: "active",
        firstName: "Alice",
        lastName: "Stone",
        email: "alice@example.com",
        lastPingAt: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
  };
}

function buildParams(
  overrides: Partial<UseLayoutRightPanelShellParams> = {},
): UseLayoutRightPanelShellParams {
  return {
    instances: [],
    currentInstanceId: "instance-a",
    currentUserStatus: "ready",
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
    mutedStreamIds: new Set(),
    usersMapForChatInfo: new Map(),
    workspaceRoute: null,
    ...overrides,
  };
}

describe("useLayoutRightPanelShell", () => {
  beforeEach(() => {
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().replaceBootstrapState(OWNER_KEY, createBootstrapPayload());
    useChatInfoStore.getState().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useMessengerStore.getState().clear();
    useChatInfoStore.getState().clear();
  });

  it("uses Workspace projection without hydrating legacy chat info on Workspace routes", () => {
    const chatInfoState = useChatInfoStore.getState();
    const hydrateSpy = vi.spyOn(chatInfoState, "hydrate");
    const syncDerivedSpy = vi.spyOn(chatInfoState, "syncDerived");
    fetchStreamMembersMock.mockResolvedValue([]);
    fetchStreamsMock.mockResolvedValue([]);

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

    expect(result.current.rightPanelTitleResolved).toBe("#general");
    expect(result.current.participantsCount).toBe(1);
    expect(result.current.onlineCount).toBe(1);
    expect(result.current.workspaceRightPanelInfo?.topics).toEqual([
      {
        id: TOPIC_UUID,
        name: "Roadmap",
        unreadCount: 2,
        route: `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      },
    ]);
    expect(hydrateSpy).not.toHaveBeenCalled();
    expect(syncDerivedSpy).not.toHaveBeenCalled();
    expect(fetchStreamMembersMock).not.toHaveBeenCalled();
    expect(fetchStreamsMock).not.toHaveBeenCalled();
  });
});
