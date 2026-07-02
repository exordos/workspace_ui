import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectWorkspaceChatHeaderView } from "./messenger-chat-header.lib";
import { selectWorkspaceRightPanelInfoView } from "./messenger-right-panel.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerBootstrapPayload } from "./messenger.types";

const OWNER_KEY = "account-a:org-a:project-a";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_A_UUID = "22222222-2222-4222-8222-222222222222";
const TOPIC_B_UUID = "77777777-7777-4777-8777-777777777777";
const USER_A_UUID = "33333333-3333-4333-8333-333333333333";
const USER_B_UUID = "44444444-4444-4444-8444-444444444444";
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
    users: [
      {
        uuid: USER_A_UUID,
        username: "alice",
        status: "active",
        firstName: "Alice",
        lastName: "Stone",
        email: "alice@example.com",
        lastPingAt: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
      {
        uuid: USER_B_UUID,
        username: "bob",
        status: "offline",
        firstName: "Bob",
        lastName: "Reed",
        email: "bob@example.com",
        lastPingAt: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
  };
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
    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      },
      fallbackTitle: "Messenger",
    });

    expect(view).toEqual({
      streamUuid: STREAM_UUID,
      notificationMode: "all_messages",
      title: "#general",
      description: "Team updates",
      participantsCount: 2,
      onlineCount: 1,
      members: [
        {
          bindingUuid: BINDING_A_UUID,
          userUuid: USER_A_UUID,
          name: "Alice Stone",
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
      fallbackTitle: "Messenger",
    });
    const headerView = selectWorkspaceChatHeaderView(useMessengerStore.getState(), {
      route,
      fallbackTitle: "Messenger",
    });

    expect(view?.title).toBe("#general");
    expect(view?.streamUuid).toBe(STREAM_UUID);
    expect(view?.notificationMode).toBe("all_messages");
    expect(view?.title).toBe(headerView.channelName);
    expect(headerView.topic).toBe("Roadmap");
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
      fallbackTitle: "Messenger",
      currentUserUuid: USER_B_UUID,
    });

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
    const payload = createBootstrapPayload();
    useMessengerStore.getState().replaceBootstrapState(OWNER_KEY, {
      ...payload,
      users: payload.users.filter((user) => user.uuid !== USER_B_UUID),
    });

    const view = selectWorkspaceRightPanelInfoView(useMessengerStore.getState(), {
      route: {
        kind: "stream",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
      },
      fallbackTitle: "Messenger",
      currentUserUuid: USER_A_UUID,
    });

    expect(view?.members[1]).toEqual({
      bindingUuid: BINDING_B_UUID,
      userUuid: USER_B_UUID,
      name: USER_B_UUID,
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
      fallbackTitle: "Messenger",
      currentUserUuid: USER_A_UUID,
    });

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
      fallbackTitle: "Messenger",
      currentUserUuid: USER_B_UUID,
    });

    expect(view?.members.find((member) => member.userUuid === USER_A_UUID)?.canRemove).toBe(false);
    expect(view?.members.find((member) => member.userUuid === USER_B_UUID)?.canRemove).toBe(true);
  });
});
