import { afterEach, describe, expect, it } from "vitest";
import type { User, UsersById } from "~/entities/user/user.types";
import { t } from "~/i18n/i18n";
import {
  workspaceMessengerRootRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import {
  selectMessengerSidebarActivityCounts,
  selectMessengerSidebarFolders,
  selectMessengerSidebarStreams,
} from "./messenger-sidebar.lib";
import { useMessengerStore, type MessengerStoreState } from "./messenger.model";
import type {
  MessengerConversation,
  MessengerFolder,
  MessengerMessage,
  MessengerStream,
  MessengerTopic,
} from "./messenger.types";

const ORGANIZATION_ID = "workspace.example.com";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_B = "37a28696-153d-431e-a5fb-36f0c0209765";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const TOPIC_B = "ed25f944-8106-4386-b2f9-65e9db32d465";
const TOPIC_C = "a5bde5af-8228-4b88-8e6d-e8dfe59e9b56";
const FOLDER_A = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const FOLDER_ITEM_B = "5f5b9a9d-0e57-4775-849b-c8308f95a809";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const MESSAGE_B = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";
const AUTHOR_UUID = "author";
const DATE_A = "2026-06-22T10:10:00Z";
const DATE_B = "2026-06-22T11:10:00Z";

function stream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_A,
    projectId: PROJECT_ID,
    ownerUuid: "owner",
    userUuid: "user",
    role: "owner",
    notificationMode: "all_messages",
    name: "Engineering",
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
    createdAt: DATE_A,
    updatedAt: DATE_A,
    ...overrides,
  };
}

function topic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: TOPIC_A,
    projectId: PROJECT_ID,
    streamUuid: STREAM_A,
    userUuid: "user",
    name: "Releases",
    unreadCount: 2,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: DATE_A,
    updatedAt: DATE_A,
    ...overrides,
  };
}

function folder(overrides: Partial<MessengerFolder> = {}): MessengerFolder {
  return {
    uuid: FOLDER_A,
    title: "All chats",
    backgroundColorValue: null,
    unreadCount: 8,
    systemType: "all",
    items: [
      {
        uuid: FOLDER_ITEM_A,
        projectId: PROJECT_ID,
        folderUuid: FOLDER_A,
        userUuid: "user",
        streamUuid: STREAM_A,
        conversationId: `stream:${STREAM_A}`,
        chatType: "stream",
        orderIndex: 20,
        pinnedAt: null,
        unreadCount: 5,
        createdAt: DATE_A,
        updatedAt: DATE_A,
      },
      {
        uuid: FOLDER_ITEM_B,
        projectId: PROJECT_ID,
        folderUuid: FOLDER_A,
        userUuid: "user",
        streamUuid: STREAM_B,
        conversationId: `stream:${STREAM_B}`,
        chatType: "private",
        orderIndex: 30,
        pinnedAt: DATE_B,
        unreadCount: 1,
        createdAt: DATE_A,
        updatedAt: DATE_A,
      },
    ],
    createdAt: DATE_A,
    updatedAt: DATE_A,
    ...overrides,
  };
}

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown?: string;
  payload?: MessengerMessage["payload"];
};

function message(overrides: MessageOverrides = {}): MessengerMessage {
  const { markdown, payload, ...rest } = overrides;
  return {
    uuid: MESSAGE_A,
    conversationId: `topic:${STREAM_A}:${TOPIC_A}`,
    projectId: PROJECT_ID,
    streamUuid: STREAM_A,
    topicUuid: TOPIC_A,
    authorUuid: AUTHOR_UUID,
    userUuid: "user",
    payload: payload ?? { kind: "markdown", content: markdown ?? "Latest workspace message" },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: DATE_A,
    updatedAt: DATE_A,
    ...rest,
  };
}

function user(overrides: Partial<User> = {}): User {
  return {
    uuid: AUTHOR_UUID,
    username: "alice",
    status: "active",
    firstName: "Alice",
    lastName: "Wonderland",
    displayName: "Alice Wonderland",
    email: "alice@example.com",
    avatarUrl: "/alice.png",
    statusEmoji: null,
    statusText: null,
    lastPingAt: DATE_A,
    createdAt: DATE_A,
    updatedAt: DATE_A,
    ...overrides,
  };
}

function createUsersById(overrides: Partial<UsersById> = {}): UsersById {
  return {
    [AUTHOR_UUID]: user(),
    alice: user({
      uuid: "alice",
      username: "alice",
      displayName: "Alice",
      firstName: "Alice",
      lastName: null,
      status: "active",
      avatarUrl: "/direct-alice.png",
    }),
    ...overrides,
  };
}

function conversation(overrides: Partial<MessengerConversation> = {}): MessengerConversation {
  return {
    id: `stream:${STREAM_B}`,
    streamUuid: STREAM_B,
    title: "Alice",
    audience: "private",
    isPrivate: true,
    unreadCount: 4,
    directUserUuid: "alice",
    lastMessageUuid: MESSAGE_A,
    notificationMode: "mentions_only",
    ...overrides,
  };
}

function state(overrides: Partial<MessengerStoreState> = {}): MessengerStoreState {
  const streamA = stream();
  const streamB = stream({
    uuid: STREAM_B,
    name: "Alice",
    audience: "private",
    isPrivate: true,
    directUserUuid: "alice",
    unreadCount: 4,
    updatedAt: DATE_B,
  });
  const topicA = topic();
  const topicB = topic({
    uuid: TOPIC_B,
    streamUuid: STREAM_B,
    name: "General",
    unreadCount: 6,
    isDone: true,
  });
  const folderA = folder();

  return {
    ownerKey: "owner",
    isLoading: false,
    error: null,
    lastLoadedAt: 1,
    streamsById: { [STREAM_A]: streamA, [STREAM_B]: streamB },
    streamIds: [STREAM_A, STREAM_B],
    streamBindingsById: {},
    streamBindingIds: [],
    streamBindingIdsByStreamId: {},
    streamBindingsLoadedByStreamId: {},
    topicsById: { [TOPIC_A]: topicA, [TOPIC_B]: topicB },
    topicIds: [TOPIC_A, TOPIC_B],
    conversationsById: {},
    conversationIds: [],
    foldersById: { [FOLDER_A]: folderA },
    folderIds: [FOLDER_A],
    lastEpochVersion: null,
    skippedRealtimeEvents: [],
    startBootstrap: () => undefined,
    finishBootstrapSilently: () => undefined,
    replaceBootstrapState: () => undefined,
    replaceFolderSnapshots: () => undefined,
    upsertStream: () => undefined,
    removeStream: () => undefined,
    upsertStreamBindings: () => undefined,
    replaceStreamBindingsForStream: () => undefined,
    markStreamBindingsLoaded: () => undefined,
    removeStreamBinding: () => undefined,
    upsertTopic: () => undefined,
    removeTopic: () => undefined,
    applyMessagePointer: () => undefined,
    clearMessagePointer: () => undefined,
    applyFolderSnapshot: () => undefined,
    removeFolder: () => undefined,
    upsertFolderItem: () => undefined,
    removeFolderItem: () => undefined,
    setRealtimeCursor: () => undefined,
    markRealtimeEventSkipped: () => undefined,
    setBootstrapError: () => undefined,
    clear: () => undefined,
    ...overrides,
  };
}

describe("messenger sidebar selectors", () => {
  afterEach(() => {
    useMessengerStore.getState().clear();
  });

  it("builds nested stream topic rows without DM identities", () => {
    const rows = selectMessengerSidebarStreams(state(), {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      usersById: createUsersById(),
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: `stream:${STREAM_A}`,
      streamUuid: STREAM_A,
      title: "Engineering",
      isPrivate: false,
      uiKind: "channel",
      unreadCount: 3,
      color: null,
      preview: null,
    });
    expect(rows[0]?.topics[0]).toMatchObject({
      id: `topic:${STREAM_A}:${TOPIC_A}`,
      topicUuid: TOPIC_A,
      unreadCount: 2,
      preview: null,
    });
    expect(rows[1]).toMatchObject({
      id: `stream:${STREAM_B}`,
      title: "Alice",
      isPrivate: true,
      uiKind: "directPrivate",
      unreadCount: 4,
      presence: "active",
      avatarUrl: "/direct-alice.png",
    });
    expect(rows.some((row) => row.id.startsWith("dm:"))).toBe(false);
  });

  it("maps direct private do not disturb status to idle presence", () => {
    const rows = selectMessengerSidebarStreams(state(), {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      usersById: createUsersById({
        alice: user({
          uuid: "alice",
          username: "alice",
          displayName: "Alice",
          firstName: "Alice",
          lastName: null,
          status: "do_not_disturb",
          avatarUrl: "/direct-alice.png",
        }),
      }),
    });

    expect(rows.find((row) => row.streamUuid === STREAM_B)).toMatchObject({
      uiKind: "directPrivate",
      presence: "idle",
    });
  });

  it("uses folder item unread and pinned order for selected folders", () => {
    const rows = selectMessengerSidebarStreams(state(), {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      selectedFolderUuid: FOLDER_A,
      usersById: createUsersById(),
    });

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
    expect(rows[0]).toMatchObject({
      streamUuid: STREAM_B,
      pinnedAt: DATE_B,
      orderIndex: 30,
      unreadCount: 1,
    });
    expect(rows[1]).toMatchObject({
      streamUuid: STREAM_A,
      pinnedAt: null,
      orderIndex: 20,
      unreadCount: 5,
    });
  });

  it("sorts folder rows by cached last message time instead of stream updatedAt", () => {
    const newerMessageAt = "2026-06-22T12:10:00Z";
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({
            lastMessageUuid: MESSAGE_A,
            updatedAt: DATE_A,
          }),
          [STREAM_B]: stream({
            uuid: STREAM_B,
            name: "Alice",
            audience: "private",
            isPrivate: true,
            directUserUuid: "alice",
            unreadCount: 4,
            lastMessageUuid: MESSAGE_B,
            updatedAt: newerMessageAt,
          }),
        },
        foldersById: {
          [FOLDER_A]: folder({
            items: [
              {
                uuid: FOLDER_ITEM_A,
                projectId: PROJECT_ID,
                folderUuid: FOLDER_A,
                userUuid: "user",
                streamUuid: STREAM_A,
                conversationId: `stream:${STREAM_A}`,
                chatType: "stream",
                orderIndex: null,
                pinnedAt: null,
                unreadCount: 5,
                createdAt: DATE_A,
                updatedAt: DATE_A,
              },
              {
                uuid: FOLDER_ITEM_B,
                projectId: PROJECT_ID,
                folderUuid: FOLDER_A,
                userUuid: "user",
                streamUuid: STREAM_B,
                conversationId: `stream:${STREAM_B}`,
                chatType: "private",
                orderIndex: null,
                pinnedAt: null,
                unreadCount: 1,
                createdAt: DATE_A,
                updatedAt: newerMessageAt,
              },
            ],
          }),
        },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        selectedFolderUuid: FOLDER_A,
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({
            uuid: MESSAGE_A,
            streamUuid: STREAM_A,
            createdAt: DATE_B,
          }),
          [MESSAGE_B]: message({
            uuid: MESSAGE_B,
            conversationId: `topic:${STREAM_B}:${TOPIC_B}`,
            streamUuid: STREAM_B,
            topicUuid: TOPIC_B,
            createdAt: DATE_A,
          }),
        },
      },
    );

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B]);
    expect(rows[0]?.lastMessageCreatedAt).toBe(DATE_B);
    expect(rows[1]?.updatedAt).toBe(newerMessageAt);
  });

  it("builds previews from loaded last messages", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
          [STREAM_B]: stream({
            uuid: STREAM_B,
            name: "Alice",
            audience: "private",
            isPrivate: true,
            directUserUuid: "alice",
            unreadCount: 4,
            updatedAt: DATE_B,
          }),
        },
        topicsById: {
          [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_B }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            streamUuid: STREAM_B,
            name: "General",
            unreadCount: 6,
            isDone: true,
          }),
        },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({
            uuid: MESSAGE_A,
            topicUuid: TOPIC_B,
            markdown: "Stream preview",
          }),
          [MESSAGE_B]: message({
            uuid: MESSAGE_B,
            topicUuid: TOPIC_A,
            markdown: "Topic preview",
          }),
        },
      },
    );

    expect(rows[0]?.preview).toEqual({
      messageUuid: MESSAGE_A,
      route: workspaceMessengerTopicRoute({
        orgId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_B,
      }),
      text: "Stream preview",
      senderName: "Alice Wonderland",
    });
    expect(rows[0]?.topics[0]?.preview).toEqual({
      messageUuid: MESSAGE_B,
      route: workspaceMessengerTopicRoute({
        orgId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
      }),
      text: "Topic preview",
      senderName: "Alice Wonderland",
    });
  });

  it("sorts topics by last message time and exposes that time on each row", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        topicsById: {
          [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            name: "Later topic",
            lastMessageUuid: MESSAGE_B,
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B],
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({ uuid: MESSAGE_A, createdAt: DATE_A }),
          [MESSAGE_B]: message({
            uuid: MESSAGE_B,
            conversationId: `topic:${STREAM_A}:${TOPIC_B}`,
            topicUuid: TOPIC_B,
            createdAt: DATE_B,
          }),
        },
      },
    );

    expect(rows[0]?.topics.map((item) => item.topicUuid)).toEqual([TOPIC_B, TOPIC_A]);
    expect(rows[0]?.topics[0]?.lastMessageCreatedAt).toBe(DATE_B);
    expect(rows[0]?.topics[1]?.lastMessageCreatedAt).toBe(DATE_A);
  });

  it("keeps topic order predictable when last message bodies are missing", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        topicsById: {
          [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            name: "Topic without body",
            lastMessageUuid: MESSAGE_B,
          }),
          [TOPIC_C]: topic({
            uuid: TOPIC_C,
            name: "Topic without last message",
            lastMessageUuid: null,
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B, TOPIC_C],
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({ uuid: MESSAGE_A, createdAt: DATE_A }),
        },
      },
    );

    expect(rows[0]?.topics.map((item) => item.topicUuid)).toEqual([TOPIC_A, TOPIC_B, TOPIC_C]);
    expect(rows[0]?.topics[0]?.lastMessageCreatedAt).toBe(DATE_A);
    expect(rows[0]?.topics[1]?.lastMessageCreatedAt).toBeNull();
    expect(rows[0]?.topics[2]?.lastMessageCreatedAt).toBeNull();
  });

  it("builds Workspace summary previews without exposing raw file urls", () => {
    const imageFileUuid = "11111111-1111-4111-8111-111111111111";
    const reportFileUuid = "33333333-3333-4333-8333-333333333333";
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
          [STREAM_B]: stream({
            uuid: STREAM_B,
            name: "Alice",
            audience: "private",
            isPrivate: true,
            directUserUuid: "alice",
            unreadCount: 4,
            updatedAt: DATE_B,
          }),
        },
        topicsById: {
          [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_B }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            streamUuid: STREAM_B,
            name: "General",
            unreadCount: 6,
            isDone: true,
          }),
        },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({
            uuid: MESSAGE_A,
            markdown: `![screen.png](urn:image:${imageFileUuid}?name=screen.png) Вот скрин`,
          }),
          [MESSAGE_B]: message({
            uuid: MESSAGE_B,
            markdown: `[report.pdf](urn:file:${reportFileUuid}?name=report.pdf) **Важное** @**Alice Reed**`,
          }),
        },
      },
    );

    expect(rows[0]?.preview?.text).toBe("Изображение: Вот скрин");
    expect(rows[0]?.topics[0]?.preview?.text).toBe("Файл: report.pdf Важное @Alice Reed");
    expect(JSON.stringify(rows)).not.toContain("urn:image:");
    expect(JSON.stringify(rows)).not.toContain("urn:file:");
    expect(JSON.stringify(rows)).not.toContain(imageFileUuid);
    expect(JSON.stringify(rows)).not.toContain(reportFileUuid);
  });

  it("shows a localized self label for messages written by the current user", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
          [STREAM_B]: stream({
            uuid: STREAM_B,
            name: "Alice",
            audience: "private",
            isPrivate: true,
            directUserUuid: "alice",
            unreadCount: 4,
            updatedAt: DATE_B,
          }),
        },
        topicsById: {
          [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            streamUuid: STREAM_B,
            name: "General",
            unreadCount: 6,
            isDone: true,
          }),
        },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        currentUserUuid: AUTHOR_UUID,
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({ uuid: MESSAGE_A, markdown: "Self preview" }),
        },
      },
    );

    expect(rows[0]?.preview).toEqual({
      messageUuid: MESSAGE_A,
      route: workspaceMessengerTopicRoute({
        orgId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
      }),
      text: "Self preview",
      senderName: t("common.you"),
    });
  });

  it("falls back to the conversation snapshot when a folder item stream is missing", () => {
    const base = state({
      streamsById: {
        [STREAM_A]: stream(),
      },
      streamIds: [STREAM_A],
      conversationsById: {
        [conversation().id]: conversation(),
      },
      conversationIds: [conversation().id],
    });

    const rows = selectMessengerSidebarStreams(base, {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      selectedFolderUuid: FOLDER_A,
      usersById: createUsersById(),
      messagesById: {
        [MESSAGE_A]: message({
          uuid: MESSAGE_A,
          conversationId: conversation().id,
          streamUuid: STREAM_B,
          topicUuid: TOPIC_B,
          markdown: "Private preview",
        }),
      },
    });

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
    expect(rows[0]).toMatchObject({
      id: `stream:${STREAM_B}`,
      streamUuid: STREAM_B,
      title: "Alice",
      isPrivate: true,
      uiKind: "directPrivate",
      unreadCount: 1,
      preview: {
        messageUuid: MESSAGE_A,
        text: "Private preview",
        senderName: "Alice Wonderland",
      },
    });
  });

  it("skips folder items when both stream and conversation snapshots are missing", () => {
    const base = state({
      streamsById: {
        [STREAM_A]: stream(),
      },
      streamIds: [STREAM_A],
    });

    const rows = selectMessengerSidebarStreams(base, {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      selectedFolderUuid: FOLDER_A,
      usersById: createUsersById(),
    });

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_A]);
  });

  it("keeps selector result stable while input references stay stable", () => {
    const base = state();
    const options = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      selectedFolderUuid: FOLDER_A,
      usersById: createUsersById(),
    };

    const firstRows = selectMessengerSidebarStreams(base, options);
    const secondRows = selectMessengerSidebarStreams(base, options);
    const firstFolders = selectMessengerSidebarFolders(base);
    const secondFolders = selectMessengerSidebarFolders(base);

    expect(secondRows).toBe(firstRows);
    expect(secondFolders).toBe(firstFolders);
  });

  it("builds folder rail view from backend folder counts", () => {
    const folders = selectMessengerSidebarFolders(state());

    expect(folders).toEqual([
      {
        folderUuid: FOLDER_A,
        title: "All chats",
        backgroundColorValue: null,
        unreadCount: 8,
        systemType: "all",
        items: expect.any(Array),
      },
    ]);
  });

  it("builds workspace activity counts from the backend all folder only", () => {
    const counts = selectMessengerSidebarActivityCounts(
      state({
        foldersById: {
          [FOLDER_A]: folder({
            systemType: "all",
            unreadCount: 11,
          }),
        },
      }),
    );

    expect(counts).toEqual({
      inboxCount: 11,
      mentionsCount: null,
    });
  });

  it("does not synthesize workspace activity counts when the all folder is missing", () => {
    const counts = selectMessengerSidebarActivityCounts(
      state({
        foldersById: {
          [FOLDER_A]: folder({
            systemType: "created",
            unreadCount: 11,
          }),
        },
      }),
    );

    expect(counts).toEqual({
      inboxCount: null,
      mentionsCount: null,
    });
  });

  it("returns a fresh folder badge after a local folder item store update", () => {
    useMessengerStore.getState().startBootstrap("owner:sidebar-selectors");
    useMessengerStore.getState().applyFolderSnapshot("owner:sidebar-selectors", {
      ...folder({
        unreadCount: 0,
        items: [],
      }),
      unreadCount: 0,
      items: [],
    });

    const firstFolders = selectMessengerSidebarFolders(useMessengerStore.getState());
    useMessengerStore.getState().upsertFolderItem("owner:sidebar-selectors", {
      uuid: FOLDER_ITEM_A,
      projectId: PROJECT_ID,
      folderUuid: FOLDER_A,
      userUuid: "user",
      streamUuid: STREAM_A,
      conversationId: `stream:${STREAM_A}`,
      chatType: "stream",
      orderIndex: 20,
      pinnedAt: null,
      unreadCount: 6,
      createdAt: DATE_A,
      updatedAt: DATE_B,
    });
    const secondFolders = selectMessengerSidebarFolders(useMessengerStore.getState());

    expect(firstFolders).toEqual([
      expect.objectContaining({ folderUuid: FOLDER_A, unreadCount: 0 }),
    ]);
    expect(secondFolders).toEqual([
      expect.objectContaining({ folderUuid: FOLDER_A, unreadCount: 6 }),
    ]);
    expect(secondFolders).not.toBe(firstFolders);
  });

  it("builds workspace root routes with org and project ids", () => {
    expect(workspaceMessengerRootRoute(ORGANIZATION_ID, PROJECT_ID)).toBe(
      `/org/${ORGANIZATION_ID}/project/${PROJECT_ID}/messenger`,
    );
  });
});
