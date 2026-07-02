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
      title: "#general",
      description: "Team updates",
      participantsCount: 2,
      onlineCount: 1,
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
    expect(view?.title).toBe(headerView.channelName);
    expect(headerView.topic).toBe("Roadmap");
    expect(view?.participantsCount).toBe(2);
    expect(view?.onlineCount).toBe(1);
    expect(view?.topics.map((topic) => topic.name)).toEqual(["Roadmap", "Support"]);
  });
});
