import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User, UsersById } from "~/entities/user/user.types";
import { selectWorkspaceChatHeaderView } from "./messenger-chat-header.lib";
import {
  createWorkspaceRightPanelUserProfileView,
  selectWorkspaceRightPanelInfoView,
} from "./messenger-right-panel.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerBootstrapPayload } from "./messenger.types";

const OWNER_KEY = "account-a:org-a:project-a";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_A_UUID = "22222222-2222-4222-8222-222222222222";
const TOPIC_B_UUID = "77777777-7777-4777-8777-777777777777";
const USER_A_UUID = "33333333-3333-4333-8333-333333333333";
const USER_B_UUID = "44444444-4444-4444-8444-444444444444";
const DIRECT_USER_UUID = "88888888-8888-4888-8888-888888888888";
const DIRECT_TOPIC_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BINDING_A_UUID = "55555555-5555-4555-8555-555555555555";
const BINDING_B_UUID = "66666666-6666-4666-8666-666666666666";

function createBootstrapPayload(): MessengerBootstrapPayload {
  return {
    streams: [
      {
        uuid: STREAM_UUID,
        projectId: "project-a",
        ownerUuid: USER_A_UUID,
        userUuid: USER_A_UUID,
        role: "member",
        notificationMode: "all_messages",
        name: "general",
        description: "Team updates",
        unreadCount: 4,
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
        uuid: "99999999-9999-4999-8999-999999999999",
        projectId: "project-a",
        ownerUuid: USER_A_UUID,
        userUuid: USER_A_UUID,
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
      {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        projectId: "project-a",
        ownerUuid: USER_A_UUID,
        userUuid: USER_A_UUID,
        role: "member",
        notificationMode: "all_messages",
        name: "private-channel",
        description: "",
        unreadCount: 0,
        sourceName: "native",
        source: { kind: "native" },
        audience: "private",
        isPrivate: true,
        inviteOnly: true,
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
        uuid: BINDING_A_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_A_UUID,
        whoUuid: USER_A_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
      {
        uuid: BINDING_B_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_B_UUID,
        whoUuid: USER_B_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    topics: [
      {
        uuid: TOPIC_A_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_A_UUID,
        name: "Roadmap",
        unreadCount: 3,
        isDefault: false,
        isDone: false,
        notificationMode: "default",
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
      {
        uuid: DIRECT_TOPIC_UUID,
        projectId: "project-a",
        streamUuid: "99999999-9999-4999-8999-999999999999",
        userUuid: USER_A_UUID,
        name: "Direct topic",
        unreadCount: 1,
        isDefault: false,
        isDone: false,
        notificationMode: "default",
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:10:00.000Z",
        updatedAt: "2026-06-30T09:10:00.000Z",
      },
      {
        uuid: TOPIC_B_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_A_UUID,
        name: "Support",
        unreadCount: 0,
        isDefault: false,
        isDone: false,
        notificationMode: "default",
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:05:00.000Z",
        updatedAt: "2026-06-30T09:05:00.000Z",
      },
    ],
    conversations: [],
    folders: [],
  };
}

function createDisplayUser(overrides: Partial<User> & { uuid: string }): User {
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

function createUsersById(overrides: Partial<UsersById> = {}): UsersById {
  return {
    [USER_A_UUID]: createDisplayUser({
      uuid: USER_A_UUID,
      username: "alice",
      displayName: "Alice Stone",
      email: "alice@example.com",
      status: "active",
      avatarUrl: "/alice.png",
    }),
    [USER_B_UUID]: createDisplayUser({
      uuid: USER_B_UUID,
      username: "bob",
      displayName: "Bob Reed",
      email: "bob@example.com",
      status: "offline",
      avatarUrl: "/bob.png",
    }),
    [DIRECT_USER_UUID]: createDisplayUser({
      uuid: DIRECT_USER_UUID,
      username: "cora",
      displayName: "Cora Lane",
      email: "cora@example.com",
      status: "idle",
      avatarUrl: "/cora.png",
    }),
    ...overrides,
  };
}

function createUsersByIdWithout(...userUuids: string[]): UsersById {
  const usersById = createUsersById();
  for (const userUuid of userUuids) {
    delete usersById[userUuid];
  }
  return usersById;
}

describe("selectWorkspaceRightPanelInfoView", () => {
  beforeEach(() => {
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().replaceBootstrapState(OWNER_KEY, createBootstrapPayload());
  });

  afterEach(() => {
    useMessengerStore.getState().clear();
  });

  it("projects stream title, counts, description, and topics from messenger store", () => {
    const route = {
      kind: "stream" as const,
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: STREAM_UUID,
    };
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      temporarilyNotConnectedText: "Temporarily not connected",
    });
    const headerView = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(headerView).toEqual(
      expect.objectContaining({
        kind: "channel",
        channelName: "#general",
        hideTopic: true,
        participantsCount: 2,
        onlineCount: 1,
      }),
    );

    expect(view).toEqual({
      kind: "channel",
      streamUuid: STREAM_UUID,
      notificationMode: "all_messages",
      title: "#general",
      color: null,
      description: "Team updates",
      participantsCount: 2,
      onlineCount: 1,
      members: [
        {
          bindingUuid: BINDING_A_UUID,
          userUuid: USER_A_UUID,
          name: "Alice Stone",
          avatarUrl: "/alice.png",
          email: "alice@example.com",
          status: "active",
          role: "member",
          isOnline: true,
          isCurrentUser: true,
          canRemove: true,
        },
        {
          bindingUuid: BINDING_B_UUID,
          userUuid: USER_B_UUID,
          name: "Bob Reed",
          avatarUrl: "/bob.png",
          email: "bob@example.com",
          status: "offline",
          role: "member",
          isOnline: false,
          isCurrentUser: false,
          canRemove: true,
        },
      ],
      topics: [
        {
          id: TOPIC_A_UUID,
          name: "Roadmap",
          unreadCount: 3,
          route: `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_A_UUID}`,
        },
        {
          id: TOPIC_B_UUID,
          name: "Support",
          unreadCount: 0,
          route: `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_B_UUID}`,
        },
      ],
    });
  });

  it("keeps stream title on topic route because the panel shows channel info", () => {
    const route = {
      kind: "topic" as const,
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_A_UUID,
    };
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      temporarilyNotConnectedText: "Temporarily not connected",
    });
    const headerView = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(view?.kind).toBe("channel");
    if (view?.kind !== "channel") throw new Error("Expected channel right-panel view");
    expect(view?.title).toBe("#general");
    expect(view?.streamUuid).toBe(STREAM_UUID);
    expect(view?.notificationMode).toBe("all_messages");
    expect(headerView.kind).toBe("channel");
    expect(view?.title).toBe(headerView.kind === "channel" ? headerView.channelName : null);
    expect(headerView.kind === "channel" ? headerView.topic : null).toBe("Roadmap");
    expect(view?.participantsCount).toBe(2);
    expect(view?.onlineCount).toBe(1);
    expect(view?.topics.map((topic) => topic.name)).toEqual(["Roadmap", "Support"]);
  });

  it("maps members from stream bindings and keeps binding order", () => {
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      },
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      currentUserUuid: USER_B_UUID,
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(view?.kind).toBe("channel");
    if (view?.kind !== "channel") throw new Error("Expected channel right-panel view");
    expect(view?.members.map((member) => member.bindingUuid)).toEqual([
      BINDING_A_UUID,
      BINDING_B_UUID,
    ]);
    expect(view?.members).toEqual([
      expect.objectContaining({
        bindingUuid: BINDING_A_UUID,
        userUuid: USER_A_UUID,
        name: "Alice Stone",
        email: "alice@example.com",
        status: "active",
        role: "member",
        isOnline: true,
        isCurrentUser: false,
        canRemove: false,
      }),
      expect.objectContaining({
        bindingUuid: BINDING_B_UUID,
        userUuid: USER_B_UUID,
        name: "Bob Reed",
        email: "bob@example.com",
        status: "offline",
        role: "member",
        isOnline: false,
        isCurrentUser: true,
        canRemove: true,
      }),
    ]);
    expect(view?.participantsCount).toBe(view?.members.length);
    expect(view?.onlineCount).toBe(view?.members.filter((member) => member.isOnline).length);
  });

  it("keeps missing users as member rows with stable fallback fields", () => {
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      },
      usersById: createUsersByIdWithout(USER_B_UUID),
      fallbackTitle: "Messenger",
      currentUserUuid: USER_A_UUID,
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(view?.kind).toBe("channel");
    if (view?.kind !== "channel") throw new Error("Expected channel right-panel view");
    expect(view?.members[1]).toEqual({
      bindingUuid: BINDING_B_UUID,
      userUuid: USER_B_UUID,
      name: USER_B_UUID,
      avatarUrl: null,
      email: null,
      status: null,
      role: "member",
      isOnline: false,
      isCurrentUser: false,
      canRemove: true,
    });
    expect(view?.participantsCount).toBe(2);
    expect(view?.onlineCount).toBe(1);
  });

  it("allows the current user to remove self and lets the owner remove other members", () => {
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      },
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      currentUserUuid: USER_A_UUID,
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(view?.kind).toBe("channel");
    if (view?.kind !== "channel") throw new Error("Expected channel right-panel view");
    expect(view?.members.find((member) => member.userUuid === USER_A_UUID)?.canRemove).toBe(true);
    expect(view?.members.find((member) => member.userUuid === USER_B_UUID)?.canRemove).toBe(true);
  });

  it("does not allow a non-owner to remove another member", () => {
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      },
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      currentUserUuid: USER_B_UUID,
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(view?.kind).toBe("channel");
    if (view?.kind !== "channel") throw new Error("Expected channel right-panel view");
    expect(view?.members.find((member) => member.userUuid === USER_A_UUID)?.canRemove).toBe(false);
    expect(view?.members.find((member) => member.userUuid === USER_B_UUID)?.canRemove).toBe(true);
  });

  it("projects a direct private stream as a user profile from usersById", () => {
    const route = {
      kind: "stream" as const,
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: "99999999-9999-4999-8999-999999999999",
    };
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      temporarilyNotConnectedText: "Temporarily not connected",
    });
    const headerView = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(headerView).toEqual({
      kind: "directPrivate",
      directUserUuid: DIRECT_USER_UUID,
      dmPartner: {
        name: "Cora Lane",
        avatarUrl: "/cora.png",
        presenceState: "idle",
      },
    });

    expect(view).toEqual({
      kind: "directPrivate",
      directUserUuid: DIRECT_USER_UUID,
      title: "Cora Lane",
      avatarUrl: "/cora.png",
      status: "idle",
      isOwnProfile: false,
      details: [
        {
          id: "userId",
          value: DIRECT_USER_UUID,
          isTemporarilyUnavailable: false,
        },
        {
          id: "email",
          value: "cora@example.com",
          isTemporarilyUnavailable: false,
        },
        {
          id: "phone",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
        {
          id: "jobTitle",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
        {
          id: "manager",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
        {
          id: "role",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
        {
          id: "accountType",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
        {
          id: "accountStatus",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
        {
          id: "timezone",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
        {
          id: "localTime",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
        {
          id: "joined",
          value: "Jun 30, 2026",
          isTemporarilyUnavailable: false,
        },
        {
          id: "birthday",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
      ],
    });
  });

  it("marks a user profile override as own when UUID matches current user", () => {
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      },
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      currentUserUuid: USER_A_UUID,
      workspaceUserUuidOverride: USER_A_UUID,
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(view).toEqual(
      expect.objectContaining({
        kind: "userProfile",
        userUuid: USER_A_UUID,
        isOwnProfile: true,
        title: "Alice Stone",
      }),
    );
  });

  it("projects a Workspace user profile override by UUID with missing-user fallback", () => {
    const route = {
      kind: "stream" as const,
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: STREAM_UUID,
    };
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route,
      usersById: createUsersByIdWithout(USER_B_UUID),
      fallbackTitle: "Messenger",
      workspaceUserUuidOverride: USER_B_UUID,
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(view).toEqual(
      expect.objectContaining({
        kind: "userProfile",
        userUuid: USER_B_UUID,
        title: USER_B_UUID,
        avatarUrl: null,
        status: null,
        isOwnProfile: false,
      }),
    );
    expect(view?.kind === "userProfile" ? view.details : []).toEqual(
      expect.arrayContaining([
        {
          id: "userId",
          value: USER_B_UUID,
          isTemporarilyUnavailable: false,
        },
        {
          id: "email",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
      ]),
    );
  });

  it("keeps a topic inside direct private stream on personal header and profile branches", () => {
    const route = {
      kind: "topic" as const,
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: "99999999-9999-4999-8999-999999999999",
      topicUuid: DIRECT_TOPIC_UUID,
    };
    const headerView = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(headerView.kind).toBe("directPrivate");
    expect(headerView.kind === "directPrivate" ? headerView.dmPartner.name : null).toBe(
      "Cora Lane",
    );
    expect(view?.kind).toBe("directPrivate");
    expect(view?.kind === "directPrivate" ? view.title : null).toBe("Cora Lane");
    expect(view != null && "topics" in view ? view.topics : null).toBeNull();
  });

  it("keeps a private stream without directUserUuid as channel info", () => {
    const route = {
      kind: "stream" as const,
      orgId: "org-a",
      projectId: "project-a",
      streamUuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const headerView = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route,
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(headerView).toEqual(
      expect.objectContaining({
        kind: "channel",
        channelName: "#private-channel",
        hideTopic: true,
      }),
    );
    expect(view?.kind).toBe("channel");
    if (view?.kind !== "channel") throw new Error("Expected channel right-panel view");
    expect(view?.title).toBe("#private-channel");
  });

  it("uses direct private stream title while user profile fields are still loading", () => {
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: "99999999-9999-4999-8999-999999999999",
      },
      usersById: createUsersByIdWithout(DIRECT_USER_UUID),
      fallbackTitle: "Messenger",
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(view).toEqual(
      expect.objectContaining({
        kind: "directPrivate",
        title: "alice-and-cora",
        status: null,
        isOwnProfile: false,
      }),
    );
    expect(view?.kind === "directPrivate" ? view.details : []).toEqual(
      expect.arrayContaining([
        {
          id: "userId",
          value: DIRECT_USER_UUID,
          isTemporarilyUnavailable: false,
        },
        {
          id: "email",
          value: "Temporarily not connected",
          isTemporarilyUnavailable: true,
        },
      ]),
    );
  });
});

describe("createWorkspaceRightPanelUserProfileView", () => {
  it("builds an own-profile view without a conversation route", () => {
    const usersById = createUsersById();
    const view = createWorkspaceRightPanelUserProfileView({
      userUuid: USER_A_UUID,
      usersById,
      currentUserUuid: USER_A_UUID,
      temporarilyNotConnectedText: "Temporarily not connected",
    });

    expect(view.kind).toBe("userProfile");
    expect(view.isOwnProfile).toBe(true);
    expect(view.title).toBe("Alice Stone");
    expect(view.details[0]).toEqual({
      id: "userId",
      value: USER_A_UUID,
      isTemporarilyUnavailable: false,
    });
  });
});
