import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User, UsersById } from "~/entities/user/user.types";
import { selectWorkspaceChatHeaderView } from "./messenger-chat-header.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerBootstrapPayload } from "./messenger.types";

const OWNER_KEY = "account-a:org-a:project-a";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const DIRECT_STREAM_UUID = "77777777-7777-4777-8777-777777777777";
const PRIVATE_STREAM_UUID = "88888888-8888-4888-8888-888888888888";
const USER_A_UUID = "33333333-3333-4333-8333-333333333333";
const USER_B_UUID = "44444444-4444-4444-8444-444444444444";
const MISSING_USER_UUID = "99999999-9999-4999-8999-999999999999";
const BINDING_A_UUID = "55555555-5555-4555-8555-555555555555";
const BINDING_B_UUID = "66666666-6666-4666-8666-666666666666";

function createStream(
  overrides: Partial<MessengerBootstrapPayload["streams"][number]> = {},
): MessengerBootstrapPayload["streams"][number] {
  return {
    uuid: STREAM_UUID,
    projectId: "project-a",
    ownerUuid: USER_A_UUID,
    userUuid: USER_A_UUID,
    role: "member",
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
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
    ...overrides,
  };
}

function createBootstrapPayload(
  overrides: Partial<Pick<MessengerBootstrapPayload, "streams">> = {},
): MessengerBootstrapPayload {
  return {
    streams: overrides.streams ?? [createStream()],
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
        uuid: TOPIC_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_A_UUID,
        name: "Roadmap",
        unreadCount: 0,
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
    ...overrides,
  };
}

describe("selectWorkspaceChatHeaderView", () => {
  beforeEach(() => {
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().replaceBootstrapState(OWNER_KEY, createBootstrapPayload());
  });

  afterEach(() => {
    useMessengerStore.getState().clear();
  });

  it("projects stream title and stream binding counts from messenger store", () => {
    const view = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      },
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(view).toEqual({
      kind: "channel",
      channelName: "#general",
      hideTopic: true,
      participantsCount: 2,
      onlineCount: 1,
      topic: undefined,
    });
  });

  it("projects topic title while keeping stream binding counts", () => {
    const view = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route: {
        kind: "topic",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      },
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(view).toEqual({
      kind: "channel",
      channelName: "#general",
      hideTopic: false,
      participantsCount: 2,
      onlineCount: 1,
      topic: "Roadmap",
    });
  });

  it("projects direct private stream as dm partner without channel counts", () => {
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().replaceBootstrapState(
      OWNER_KEY,
      createBootstrapPayload({
        streams: [
          createStream({
            uuid: DIRECT_STREAM_UUID,
            name: "Bob",
            audience: "private",
            isPrivate: true,
            directUserUuid: USER_B_UUID,
          }),
        ],
      }),
    );

    const view = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: DIRECT_STREAM_UUID,
      },
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(view).toEqual({
      kind: "directPrivate",
      directUserUuid: USER_B_UUID,
      dmPartner: {
        name: "Bob Reed",
        avatarUrl: "/bob.png",
        presenceState: "offline",
      },
    });
    expect("participantsCount" in view).toBe(false);
    expect("onlineCount" in view).toBe(false);
  });

  it("maps direct private do not disturb status to idle presence", () => {
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().replaceBootstrapState(
      OWNER_KEY,
      createBootstrapPayload({
        streams: [
          createStream({
            uuid: DIRECT_STREAM_UUID,
            name: "Bob",
            audience: "private",
            isPrivate: true,
            directUserUuid: USER_B_UUID,
          }),
        ],
      }),
    );

    const view = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: DIRECT_STREAM_UUID,
      },
      usersById: createUsersById({
        [USER_B_UUID]: createDisplayUser({
          uuid: USER_B_UUID,
          username: "bob",
          displayName: "Bob Reed",
          status: "do_not_disturb",
          avatarUrl: "/bob.png",
        }),
      }),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(view).toMatchObject({
      kind: "directPrivate",
      dmPartner: {
        presenceState: "idle",
      },
    });
  });

  it("keeps private stream without direct user as channel header", () => {
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().replaceBootstrapState(
      OWNER_KEY,
      createBootstrapPayload({
        streams: [
          createStream({
            uuid: PRIVATE_STREAM_UUID,
            name: "private-room",
            audience: "private",
            isPrivate: true,
            directUserUuid: null,
          }),
        ],
      }),
    );

    const view = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: PRIVATE_STREAM_UUID,
      },
      usersById: createUsersById(),
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(view).toEqual({
      kind: "channel",
      channelName: "#private-room",
      hideTopic: true,
      participantsCount: 0,
      onlineCount: 0,
      topic: undefined,
    });
  });

  it("uses direct private stream title while the user profile is still loading", () => {
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
    useMessengerStore.getState().replaceBootstrapState(
      OWNER_KEY,
      createBootstrapPayload({
        streams: [
          createStream({
            uuid: DIRECT_STREAM_UUID,
            name: "missing-user-direct",
            audience: "private",
            isPrivate: true,
            directUserUuid: MISSING_USER_UUID,
          }),
        ],
      }),
    );

    const view = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: DIRECT_STREAM_UUID,
      },
      usersById: {},
      fallbackTitle: "Messenger",
      missingDirectUserTitle: "Временно не подключено",
    });

    expect(view).toEqual({
      kind: "directPrivate",
      directUserUuid: MISSING_USER_UUID,
      dmPartner: {
        name: "missing-user-direct",
        avatarUrl: null,
        presenceState: null,
      },
    });
  });
});
