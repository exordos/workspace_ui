import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { User, UsersById } from "~/entities/user/user.types";
import { getLocale, setLocale, t } from "~/i18n/i18n";
import * as messageSummary from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import {
  workspaceMessengerRootRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { MESSENGER_ALL_CHATS_FOLDER_UUID } from "./messenger-folder-system-type.lib";
import {
  selectMessengerSidebarActivityCounts,
  selectMessengerSidebarFolders,
  selectMessengerSidebarStreams,
} from "./messenger-sidebar.lib";
import {
  createMessengerTopicMessagePreview,
  selectMessengerTopicsForStream,
} from "./messenger-topic-list.lib";
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
const STREAM_C = "f1a37d93-38f8-4d47-9be8-22dc63d77a7d";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const TOPIC_B = "ed25f944-8106-4386-b2f9-65e9db32d465";
const TOPIC_C = "a5bde5af-8228-4b88-8e6d-e8dfe59e9b56";
const TOPIC_D = "e92533bc-a4f0-46c6-94fd-0f1e03a0d019";
const TOPIC_E = "70d881da-01f7-4204-9871-2f122d77ec53";
const FOLDER_A = MESSENGER_ALL_CHATS_FOLDER_UUID;
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const FOLDER_ITEM_B = "5f5b9a9d-0e57-4775-849b-c8308f95a809";
const FOLDER_ITEM_C = "e89320c1-e1e8-4382-bef9-df411693b068";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const MESSAGE_B = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";
const MESSAGE_C = "9ac6a4e1-4688-4549-b273-d3946ec2b0a3";
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
    reactionUserUuidsByEmojiName: {},
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
    streamBindingRevisionByStreamId: {},
    ownerKey: "owner",
    isLoading: false,
    error: null,
    lastLoadedAt: 1,
    bootstrapRequestVersion: 1,
    realtimeReadyOwnerKey: null,
    realtimeReadyRuntimeGeneration: null,
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
    startBootstrap: () => 1,
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
    applyMessagePointers: () => undefined,
    clearMessagePointer: () => undefined,
    applyFolderSnapshot: () => undefined,
    removeFolder: () => undefined,
    upsertFolderItem: () => undefined,
    removeFolderItem: () => undefined,
    setRealtimeInitialSyncReady: () => undefined,
    setRealtimeCursor: () => undefined,
    markRealtimeEventSkipped: () => undefined,
    setBootstrapError: () => undefined,
    clear: () => undefined,
    ...overrides,
  };
}

describe("topic catalog indexing", () => {
  function selectTopics(
    state: Pick<MessengerStoreState, "topicIds" | "topicsById">,
    streamUuid: string,
    streamNotificationMode: MessengerStream["notificationMode"] = "all_messages",
  ) {
    return selectMessengerTopicsForStream({
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      state,
      streamUuid,
      streamNotificationMode,
      messagesById: {},
      usersById: {},
      currentUserUuid: null,
      sortMode: "unread_first",
    });
  }

  it("reads each topic once across stream selections and ignores missing catalog IDs", () => {
    const get = vi.fn((target: Record<string, MessengerTopic>, key: string) => target[key]);
    const topicsById = new Proxy(
      {
        [TOPIC_A]: topic(),
        [TOPIC_B]: topic({ uuid: TOPIC_B, streamUuid: STREAM_B }),
      },
      { get },
    );
    const state = { topicIds: [TOPIC_A, TOPIC_B, "missing"], topicsById };
    expect(selectTopics(state, STREAM_A).map((item) => item.topicUuid)).toEqual([TOPIC_A]);
    expect(selectTopics(state, STREAM_B).map((item) => item.topicUuid)).toEqual([TOPIC_B]);
    expect(selectTopics(state, STREAM_C)).toEqual([]);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("rebuilds after membership, ordering or immutable topic changes", () => {
    const first = topic({ unreadCount: 0 });
    const second = topic({ uuid: TOPIC_B, unreadCount: 0 });
    const state = {
      topicIds: [TOPIC_A, TOPIC_B],
      topicsById: { [TOPIC_A]: first, [TOPIC_B]: second },
    };
    expect(selectTopics(state, STREAM_A).map((item) => item.topicUuid)).toEqual([TOPIC_A, TOPIC_B]);
    const reordered = { ...state, topicIds: [TOPIC_B, TOPIC_A] };
    expect(selectTopics(reordered, STREAM_A).map((item) => item.topicUuid)).toEqual([
      TOPIC_B,
      TOPIC_A,
    ]);
    expect(
      selectTopics({ ...state, topicIds: [TOPIC_B] }, STREAM_A).map((item) => item.topicUuid),
    ).toEqual([TOPIC_B]);
    const moved = {
      ...state,
      topicsById: {
        ...state.topicsById,
        [TOPIC_A]: { ...first, streamUuid: STREAM_B, name: "Moved" },
      },
    };
    expect(selectTopics(moved, STREAM_A).map((item) => item.topicUuid)).toEqual([TOPIC_B]);
    expect(selectTopics(moved, STREAM_B)[0]?.title).toBe("Moved");
    const changed = {
      ...state,
      topicsById: { ...state.topicsById, [TOPIC_B]: { ...second, unreadCount: 4 } },
    };
    expect(selectTopics(changed, STREAM_A).map((item) => item.topicUuid)).toEqual([
      TOPIC_B,
      TOPIC_A,
    ]);
  });

  it("applies current stream mute and topic completion rules to indexed topics", () => {
    const state = {
      topicIds: [TOPIC_A, TOPIC_B, TOPIC_C],
      topicsById: {
        [TOPIC_A]: topic({ notificationMode: "default", updatedAt: DATE_B }),
        [TOPIC_B]: topic({ uuid: TOPIC_B, notificationMode: "unmute" }),
        [TOPIC_C]: topic({ uuid: TOPIC_C, isDone: true }),
      },
    };
    expect(selectTopics(state, STREAM_A).map((item) => item.topicUuid)).toEqual([
      TOPIC_A,
      TOPIC_B,
      TOPIC_C,
    ]);
    expect(selectTopics(state, STREAM_A, "muted").map((item) => item.topicUuid)).toEqual([
      TOPIC_B,
      TOPIC_A,
      TOPIC_C,
    ]);
  });
});

describe("messenger preview text cache", () => {
  const initialLocale = getLocale();
  beforeEach(() => useWorkspaceMessageStore.getState().setOwner("preview-owner-a", false));
  afterEach(() => {
    vi.restoreAllMocks();
    setLocale(initialLocale);
    useWorkspaceMessageStore.getState().setOwner(null, false);
  });
  const preview = (item: MessengerMessage, usersById = createUsersById()) =>
    createMessengerTopicMessagePreview({
      messageUuid: item.uuid,
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      messagesById: { [item.uuid]: item },
      usersById,
      currentUserUuid: null,
    });

  it("reuses summary text across read/reaction snapshots while refreshing the sender", () => {
    const summarize = vi.spyOn(messageSummary, "summarizeWorkspaceMessageMarkdown");
    const original = message({ markdown: "**unchanged** preview" });
    expect(preview(original)?.text).toBe("unchanged preview");
    const renamed = createUsersById({ [AUTHOR_UUID]: user({ displayName: "Renamed" }) });
    expect(preview({ ...original, read: false, reactions: { like: 2 } }, renamed)?.senderName).toBe(
      "Renamed",
    );
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(preview({ ...original, payload: { kind: "markdown", content: "edited" } })?.text).toBe(
      "edited",
    );
    expect(summarize).toHaveBeenCalledTimes(2);
  });

  it("invalidates text on locale and runtime owner changes", () => {
    const summarize = vi.spyOn(messageSummary, "summarizeWorkspaceMessageMarkdown");
    const item = message();
    preview(item);
    setLocale(getLocale() === "en" ? "ru" : "en");
    preview(item);
    useWorkspaceMessageStore.getState().setOwner("preview-owner-b", false);
    preview(item);
    useWorkspaceMessageStore.getState().setOwner("preview-owner-a", false);
    preview(item);
    expect(summarize).toHaveBeenCalledTimes(4);
  });

  it("bounds entries and preserves recently used summaries", () => {
    const summarize = vi.spyOn(messageSummary, "summarizeWorkspaceMessageMarkdown");
    const items = Array.from({ length: 513 }, (_, i) => message({ uuid: `preview-${i}` }));
    for (const item of items.slice(0, 512)) preview(item);
    preview(items[0]!);
    preview(items[512]!);
    preview(items[0]!);
    expect(summarize).toHaveBeenCalledTimes(513);
    preview(items[1]!);
    expect(summarize).toHaveBeenCalledTimes(514);
  });

  it("evicts by text size and does not cache oversized Markdown", () => {
    const summarize = vi.spyOn(messageSummary, "summarizeWorkspaceMessageMarkdown");
    const items = Array.from({ length: 3 }, (_, i) =>
      message({ uuid: `large-${i}`, markdown: "x".repeat(200_000) }),
    );
    for (const item of items) preview(item);
    preview(items[0]!);
    expect(summarize).toHaveBeenCalledTimes(4);
    const oversized = message({ markdown: "x".repeat(600_000) });
    preview(oversized);
    preview(oversized);
    expect(summarize).toHaveBeenCalledTimes(6);
  });
});

describe("messenger sidebar selectors", () => {
  afterEach(() => {
    useMessengerStore.getState().clear();
  });

  it("keeps unchanged rows and previews stable when unrelated messages or read state change", () => {
    const catalog = state({
      streamsById: {
        [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
        [STREAM_B]: stream({ uuid: STREAM_B }),
      },
      topicsById: { [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }) },
      topicIds: [TOPIC_A],
    });
    const firstMessage = message();
    const options = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      messagesById: { [MESSAGE_A]: firstMessage },
      usersById: createUsersById(),
    };
    const first = selectMessengerSidebarStreams(catalog, options);
    const unrelated = selectMessengerSidebarStreams(catalog, {
      ...options,
      messagesById: { ...options.messagesById, [MESSAGE_B]: message({ uuid: MESSAGE_B }) },
    });
    expect(unrelated).toBe(first);
    const read = selectMessengerSidebarStreams(catalog, {
      ...options,
      messagesById: { [MESSAGE_A]: { ...firstMessage, read: false } },
    });
    expect(read).toBe(first);
    const edited = selectMessengerSidebarStreams(catalog, {
      ...options,
      messagesById: {
        [MESSAGE_A]: { ...firstMessage, payload: { kind: "markdown", content: "edited preview" } },
      },
    });
    expect(edited.find((row) => row.streamUuid === STREAM_B)).toBe(
      first.find((row) => row.streamUuid === STREAM_B),
    );
    expect(edited.find((row) => row.streamUuid === STREAM_A)?.topics[0]?.preview?.text).toBe(
      "edited preview",
    );
    expect(edited.find((row) => row.streamUuid === STREAM_A)).not.toBe(
      first.find((row) => row.streamUuid === STREAM_A),
    );
    expect(
      selectMessengerSidebarStreams(catalog, { ...options, messagesById: {} }).find(
        (row) => row.streamUuid === STREAM_A,
      )?.preview,
    ).toBeNull();
  });

  it("refreshes only affected sender/presence views and separates runtime owners", () => {
    const catalog = state({
      streamsById: {
        [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
        [STREAM_B]: stream({
          uuid: STREAM_B,
          audience: "private",
          isPrivate: true,
          directUserUuid: "alice",
        }),
      },
    });
    const options = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      messagesById: { [MESSAGE_A]: message() },
      usersById: createUsersById(),
    };
    const first = selectMessengerSidebarStreams({ ...catalog, ownerKey: "a" }, options);
    const renamed = selectMessengerSidebarStreams(
      { ...catalog, ownerKey: "a" },
      {
        ...options,
        usersById: { ...options.usersById, [AUTHOR_UUID]: user({ displayName: "Renamed" }) },
      },
    );
    expect(renamed.find((row) => row.streamUuid === STREAM_B)).toBe(
      first.find((row) => row.streamUuid === STREAM_B),
    );
    expect(renamed.find((row) => row.streamUuid === STREAM_A)?.preview?.senderName).toBe("Renamed");
    const presence = selectMessengerSidebarStreams(
      { ...catalog, ownerKey: "a" },
      {
        ...options,
        usersById: { ...options.usersById, alice: user({ uuid: "alice", status: "idle" }) },
      },
    );
    expect(presence.find((row) => row.streamUuid === STREAM_B)?.presence).toBe("idle");
    const otherOwner = selectMessengerSidebarStreams({ ...catalog, ownerKey: "b" }, options);
    expect(otherOwner).not.toBe(first);
    expect(otherOwner.find((row) => row.streamUuid === STREAM_A)).not.toBe(
      first.find((row) => row.streamUuid === STREAM_A),
    );
  });

  it("invalidates a cached self preview when the language changes", () => {
    const originalLocale = getLocale();
    const catalog = state({
      streamsById: { [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }) },
      streamIds: [STREAM_A],
    });
    const options = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      currentUserUuid: AUTHOR_UUID,
      messagesById: { [MESSAGE_A]: message() },
    };
    try {
      setLocale("en");
      const first = selectMessengerSidebarStreams(catalog, options);
      setLocale("ru");
      const second = selectMessengerSidebarStreams(catalog, options);
      expect(second[0]?.preview?.senderName).toBe(t("common.you"));
      expect(second[0]?.preview?.senderName).not.toBe(first[0]?.preview?.senderName);
    } finally {
      setLocale(originalLocale);
    }
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
      notificationMode: "all_messages",
      unreadCount: 3,
      color: null,
      preview: null,
    });
    expect(rows[0]?.topics[0]).toMatchObject({
      id: `topic:${STREAM_A}:${TOPIC_A}`,
      topicUuid: TOPIC_A,
      unreadCount: 2,
      isDefault: false,
      notificationMode: "default",
      color: null,
      preview: null,
    });
    expect(rows[1]).toMatchObject({
      id: `stream:${STREAM_B}`,
      title: "Alice",
      isPrivate: true,
      uiKind: "directPrivate",
      notificationMode: "all_messages",
      unreadCount: 4,
      presence: "active",
      avatarUrl: "/direct-alice.png",
    });
    expect(rows.some((row) => row.id.startsWith("dm:"))).toBe(false);
  });

  it.each(["stream", "conversation"] as const)(
    "refreshes direct-chat search fields from the user profile for a %s row",
    (source) => {
      const catalog =
        source === "stream"
          ? state()
          : state({
              streamsById: { [STREAM_A]: stream() },
              streamIds: [STREAM_A],
              conversationsById: { [conversation().id]: conversation() },
              conversationIds: [conversation().id],
            });
      const directUser = user({
        uuid: "alice",
        displayName: "Alice",
        firstName: "Alice",
        lastName: "Adams",
        username: "hidden-login",
        email: null,
      });
      const options = {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        selectedFolderUuid: FOLDER_A,
        usersById: createUsersById({ alice: directUser }),
      };
      const first = selectMessengerSidebarStreams(catalog, options);
      const firstDirect = first.find((row) => row.streamUuid === STREAM_B);
      expect(firstDirect?.title).toBe("Alice");
      expect(firstDirect?.directUserSearchText).toBe("Alice\nAlice Adams\nhidden-login");
      expect(
        first.find((row) => row.streamUuid === STREAM_A)?.directUserSearchText,
      ).toBeUndefined();

      const updated = selectMessengerSidebarStreams(catalog, {
        ...options,
        usersById: createUsersById({
          alice: { ...directUser, username: "new-login", email: "alice@example.test" },
        }),
      });
      const updatedDirect = updated.find((row) => row.streamUuid === STREAM_B);
      expect(updatedDirect?.title).toBe("Alice");
      expect(updatedDirect?.directUserSearchText).toBe(
        "Alice\nAlice Adams\nnew-login\nalice@example.test",
      );
      expect(updatedDirect).not.toBe(firstDirect);
      expect(updated.find((row) => row.streamUuid === STREAM_A)).toBe(
        first.find((row) => row.streamUuid === STREAM_A),
      );
    },
  );

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

  it("projects known unread personal mentions to their topic and stream", () => {
    const rows = selectMessengerSidebarStreams(state(), {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      usersById: createUsersById(),
      messagesById: {
        [MESSAGE_A]: message({
          mentioned: true,
          read: false,
          streamUuid: STREAM_A,
          topicUuid: TOPIC_A,
        }),
        [MESSAGE_B]: message({
          uuid: MESSAGE_B,
          projectId: "another-project",
          mentioned: true,
          read: false,
          streamUuid: STREAM_B,
          topicUuid: TOPIC_B,
        }),
      },
    });

    expect(rows.find((row) => row.streamUuid === STREAM_A)?.hasUnreadPersonalMention).toBe(true);
    expect(
      rows.find((row) => row.streamUuid === STREAM_A)?.topics[0]?.hasUnreadPersonalMention,
    ).toBe(true);
    expect(rows.find((row) => row.streamUuid === STREAM_B)?.hasUnreadPersonalMention).toBe(false);
  });

  it("ignores read messages and messages without a personal mention", () => {
    const rows = selectMessengerSidebarStreams(state(), {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      usersById: createUsersById(),
      messagesById: {
        [MESSAGE_A]: message({ mentioned: true, read: true }),
        [MESSAGE_B]: message({
          uuid: MESSAGE_B,
          mentioned: false,
          read: false,
          streamUuid: STREAM_A,
          topicUuid: TOPIC_A,
        }),
      },
    });

    expect(rows.find((row) => row.streamUuid === STREAM_A)?.hasUnreadPersonalMention).toBe(false);
    expect(
      rows.find((row) => row.streamUuid === STREAM_A)?.topics[0]?.hasUnreadPersonalMention,
    ).toBe(false);
  });

  it("keeps a muted pinned stream above unpinned active streams", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ createdAt: DATE_B }),
          [STREAM_B]: stream({
            uuid: STREAM_B,
            name: "Muted",
            notificationMode: "muted",
          }),
        },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        selectedFolderUuid: FOLDER_A,
        usersById: createUsersById(),
      },
    );

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

  it("keeps active streams above muted and archived streams", () => {
    const archivedMessageAt = "2026-06-22T12:10:00Z";
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
          [STREAM_B]: stream({
            uuid: STREAM_B,
            name: "Muted",
            notificationMode: "muted",
            lastMessageUuid: MESSAGE_B,
          }),
          [STREAM_C]: stream({
            uuid: STREAM_C,
            name: "Archived",
            isArchived: true,
            lastMessageUuid: MESSAGE_C,
          }),
        },
        streamIds: [STREAM_C, STREAM_B, STREAM_A],
        foldersById: {
          [FOLDER_A]: folder({
            items: [
              folder().items[0]!,
              { ...folder().items[1]!, pinnedAt: null },
              {
                ...folder().items[0]!,
                uuid: FOLDER_ITEM_C,
                streamUuid: STREAM_C,
                conversationId: `stream:${STREAM_C}`,
                pinnedAt: null,
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
          [MESSAGE_A]: message({ uuid: MESSAGE_A, createdAt: DATE_A }),
          [MESSAGE_B]: message({ uuid: MESSAGE_B, streamUuid: STREAM_B, createdAt: DATE_B }),
          [MESSAGE_C]: message({
            uuid: MESSAGE_C,
            streamUuid: STREAM_C,
            createdAt: archivedMessageAt,
          }),
        },
      },
    );

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B, STREAM_C]);
  });

  it("returns a muted stream with an explicitly active topic to the active group", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({
            name: "Fully muted",
            notificationMode: "muted",
            updatedAt: DATE_B,
          }),
          [STREAM_B]: stream({
            uuid: STREAM_B,
            name: "Muted with active topic",
            notificationMode: "muted",
            updatedAt: DATE_A,
          }),
        },
        streamIds: [STREAM_A, STREAM_B],
        topicsById: {
          [TOPIC_A]: topic({ notificationMode: "default" }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            streamUuid: STREAM_B,
            notificationMode: "unmute",
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B],
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
      },
    );

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
  });

  it("projects raw, active and passive folder item counts into sidebar rows", () => {
    const item = {
      ...folder().items[0]!,
      unreadCount: 9,
      activeUnreadCount: 2,
      passiveUnreadCount: 7,
    };
    const rows = selectMessengerSidebarStreams(
      state({
        foldersById: {
          [FOLDER_A]: folder({ items: [item] }),
        },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        selectedFolderUuid: FOLDER_A,
        usersById: createUsersById(),
      },
    );

    expect(rows[0]).toMatchObject({
      unreadCount: 9,
      activeUnreadCount: 2,
      passiveUnreadCount: 7,
    });
  });

  it("keeps the current user's self chat out of general and folder projections", () => {
    const base = state();
    const commonOptions = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      currentUserUuid: "alice",
      usersById: createUsersById(),
    };

    expect(selectMessengerSidebarStreams(base, commonOptions).map((row) => row.streamUuid)).toEqual(
      [STREAM_A],
    );
    expect(
      selectMessengerSidebarStreams(base, {
        ...commonOptions,
        selectedFolderUuid: FOLDER_A,
      }).map((row) => row.streamUuid),
    ).toEqual([STREAM_A]);
  });

  it.each([null, FOLDER_A, "custom-folder"])(
    "sorts empty streams by creation time alongside message activity in folder %s",
    (selectedFolderUuid) => {
      const rows = selectMessengerSidebarStreams(
        state({
          streamIds: [STREAM_A, STREAM_B, STREAM_C],
          streamsById: {
            [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
            [STREAM_B]: stream({ uuid: STREAM_B, createdAt: DATE_B }),
            [STREAM_C]: stream({
              uuid: STREAM_C,
              createdAt: "2026-06-22T09:10:00Z",
              updatedAt: "2026-06-22T12:10:00Z",
            }),
          },
          foldersById: {
            [FOLDER_A]: folder({ items: [folder().items[0]!] }),
            "custom-folder": folder({
              uuid: "custom-folder",
              systemType: null,
              items: [
                folder().items[0]!,
                { ...folder().items[1]!, pinnedAt: null },
                {
                  ...folder().items[0]!,
                  uuid: FOLDER_ITEM_C,
                  streamUuid: STREAM_C,
                  conversationId: `stream:${STREAM_C}`,
                },
              ],
            }),
          },
          topicIds: [],
          topicsById: {},
        }),
        {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          selectedFolderUuid,
          messagesById: { [MESSAGE_A]: message() },
        },
      );

      expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A, STREAM_C]);
      expect(rows[0]?.lastMessageCreatedAt).toBeNull();
      expect(rows[0]?.preview).toBeNull();
    },
  );

  it("does not use creation time while a known last message is missing", () => {
    const base = state({
      streamsById: {
        [STREAM_A]: stream({ createdAt: DATE_B, lastMessageUuid: MESSAGE_A }),
        [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_B }),
      },
    });
    const options = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      messagesById: { [MESSAGE_B]: message({ uuid: MESSAGE_B, createdAt: DATE_A }) },
    };

    const before = selectMessengerSidebarStreams(base, options);
    expect(before.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
    expect(before[1]?.lastMessageCreatedAt).toBeNull();

    const after = selectMessengerSidebarStreams(base, {
      ...options,
      messagesById: { ...options.messagesById, [MESSAGE_A]: message({ createdAt: DATE_B }) },
    });
    expect(after.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B]);
  });

  it("switches an empty stream to message activity after its first message", () => {
    const firstMessageAt = "2026-06-22T12:10:00Z";
    const base = state({
      streamsById: {
        [STREAM_A]: stream(),
        [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_B }),
      },
    });
    const options = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      messagesById: { [MESSAGE_B]: message({ uuid: MESSAGE_B, createdAt: DATE_B }) },
    };
    expect(selectMessengerSidebarStreams(base, options).map((row) => row.streamUuid)).toEqual([
      STREAM_B,
      STREAM_A,
    ]);

    const after = selectMessengerSidebarStreams(
      {
        ...base,
        streamsById: {
          ...base.streamsById,
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
        },
      },
      {
        ...options,
        messagesById: {
          ...options.messagesById,
          [MESSAGE_A]: message({ createdAt: firstMessageAt }),
        },
      },
    );
    expect(after.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B]);
    expect(after[0]?.lastMessageCreatedAt).toBe(firstMessageAt);
  });

  it.each(["muted", "archived", "unread_first"] as const)(
    "keeps %s priority ahead of a newer empty stream's creation time",
    (priority) => {
      const rows = selectMessengerSidebarStreams(
        state({
          streamsById: {
            [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
            [STREAM_B]: stream({
              uuid: STREAM_B,
              createdAt: DATE_B,
              notificationMode: priority === "muted" ? "muted" : "all_messages",
              isArchived: priority === "archived",
            }),
          },
          topicIds: [TOPIC_A],
          topicsById: {
            [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A, activeUnreadCount: 1 }),
          },
        }),
        {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          sortMode: priority === "unread_first" ? "unread_first" : "last_message",
          messagesById: { [MESSAGE_A]: message() },
        },
      );

      expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B]);
    },
  );

  it("keeps folder order when empty streams have the same creation time", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        streamIds: [STREAM_B, STREAM_A],
        foldersById: {
          [FOLDER_A]: folder({
            items: [{ ...folder().items[1]!, pinnedAt: null }, folder().items[0]!],
          }),
        },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        selectedFolderUuid: FOLDER_A,
      },
    );

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B]);
  });

  it("sorts nonempty folder rows by last message time instead of stream creation or update", () => {
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
            createdAt: newerMessageAt,
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

  it("does not let muted or done topics lift an active stream", () => {
    const activeTopicMessageAt = "2026-06-22T11:10:00Z";
    const mutedTopicMessageAt = "2026-06-22T12:10:00Z";
    const doneTopicMessageAt = "2026-06-22T13:10:00Z";
    const mutedTopicMessageUuid = "4d9b34ca-bf68-414c-b5b1-77e4118471a4";
    const doneTopicMessageUuid = "00d8331b-4d3d-43d1-a0d7-9c4f21b7cd70";
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: mutedTopicMessageUuid }),
        },
        streamIds: [STREAM_A],
        topicsById: {
          [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            lastMessageUuid: MESSAGE_B,
          }),
          [TOPIC_C]: topic({
            uuid: TOPIC_C,
            notificationMode: "mute",
            lastMessageUuid: mutedTopicMessageUuid,
          }),
          [TOPIC_D]: topic({
            uuid: TOPIC_D,
            isDone: true,
            lastMessageUuid: doneTopicMessageUuid,
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D],
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({ uuid: MESSAGE_A, createdAt: DATE_A }),
          [MESSAGE_B]: message({
            uuid: MESSAGE_B,
            topicUuid: TOPIC_B,
            createdAt: activeTopicMessageAt,
          }),
          [mutedTopicMessageUuid]: message({
            uuid: mutedTopicMessageUuid,
            topicUuid: TOPIC_C,
            createdAt: mutedTopicMessageAt,
          }),
          [doneTopicMessageUuid]: message({
            uuid: doneTopicMessageUuid,
            topicUuid: TOPIC_D,
            createdAt: doneTopicMessageAt,
          }),
        },
      },
    );

    expect(rows[0]?.lastMessageCreatedAt).toBe(activeTopicMessageAt);
  });

  it.each(["muted", "done"] as const)(
    "keeps active-topic order while a %s last-message body is hydrated",
    (inactiveKind) => {
      const inactiveMessageAt = "2026-06-22T13:10:00Z";
      const streamState = state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_C }),
          [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_B }),
        },
        topicsById: {
          [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }),
          [TOPIC_C]: topic({
            uuid: TOPIC_C,
            lastMessageUuid: MESSAGE_C,
            notificationMode: inactiveKind === "muted" ? "mute" : "default",
            isDone: inactiveKind === "done",
          }),
        },
        topicIds: [TOPIC_A, TOPIC_C],
      });
      const messagesById = {
        [MESSAGE_A]: message({ uuid: MESSAGE_A, createdAt: DATE_A }),
        [MESSAGE_B]: message({ uuid: MESSAGE_B, streamUuid: STREAM_B, createdAt: DATE_B }),
      };
      const options = {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
      };

      const before = selectMessengerSidebarStreams(streamState, { ...options, messagesById });
      const after = selectMessengerSidebarStreams(streamState, {
        ...options,
        messagesById: {
          ...messagesById,
          [MESSAGE_C]: message({
            uuid: MESSAGE_C,
            topicUuid: TOPIC_C,
            createdAt: inactiveMessageAt,
          }),
        },
      });

      expect(before.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
      expect(after.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
      expect(before[1]?.lastMessageCreatedAt).toBe(DATE_A);
      expect(after[1]?.lastMessageCreatedAt).toBe(DATE_A);
      expect(after[1]?.preview?.messageUuid).toBe(MESSAGE_C);
    },
  );

  it("keeps the stream row stable through cache, topic history, and last-message hydration", () => {
    const topicMessageAt = "2026-06-22T14:10:00Z";
    const streamMessageAt = "2026-06-22T13:10:00Z";
    // Stream and topic catalogs can briefly represent different server snapshots.
    const streamState = state({
      streamsById: {
        [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
        [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_B }),
      },
      topicsById: {
        [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }),
        [TOPIC_C]: topic({ uuid: TOPIC_C, lastMessageUuid: MESSAGE_C }),
      },
      topicIds: [TOPIC_A, TOPIC_C],
    });
    const messagesById = {
      [MESSAGE_B]: message({
        uuid: MESSAGE_B,
        streamUuid: STREAM_B,
        topicUuid: TOPIC_B,
        createdAt: DATE_B,
      }),
    };
    const options = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      usersById: createUsersById(),
    };

    const cached = selectMessengerSidebarStreams(streamState, { ...options, messagesById });
    const afterTopicHistory = {
      ...messagesById,
      [MESSAGE_C]: message({
        uuid: MESSAGE_C,
        topicUuid: TOPIC_C,
        createdAt: topicMessageAt,
        markdown: "Newer topic message",
      }),
    };
    const whileLoadingHistory = selectMessengerSidebarStreams(streamState, {
      ...options,
      messagesById: afterTopicHistory,
    });

    expect(cached.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
    expect(whileLoadingHistory.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
    expect(whileLoadingHistory[1]?.lastMessageCreatedAt).toBeNull();
    expect(whileLoadingHistory[1]?.preview).toBeNull();

    const afterLastMessage = {
      ...afterTopicHistory,
      [MESSAGE_A]: message({ uuid: MESSAGE_A, createdAt: streamMessageAt }),
    };
    const hydrated = selectMessengerSidebarStreams(streamState, {
      ...options,
      messagesById: afterLastMessage,
    });
    expect(hydrated.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B]);
    expect(hydrated[0]?.lastMessageCreatedAt).toBe(streamMessageAt);
    expect(hydrated[0]?.preview?.messageUuid).toBe(MESSAGE_A);
    expect(hydrated[0]?.preview?.text).toBe("Latest workspace message");

    const pointerFromCache = selectMessengerSidebarStreams(streamState, {
      ...options,
      messagesById: { ...messagesById, [MESSAGE_A]: afterLastMessage[MESSAGE_A] },
    });
    expect(pointerFromCache.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B]);
    expect(pointerFromCache[0]?.lastMessageCreatedAt).toBe(hydrated[0]?.lastMessageCreatedAt);
    expect(pointerFromCache[0]?.preview?.text).toBe(hydrated[0]?.preview?.text);

    const freshCatalog = selectMessengerSidebarStreams(
      {
        ...streamState,
        streamsById: {
          ...streamState.streamsById,
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_C, updatedAt: topicMessageAt }),
        },
      },
      { ...options, messagesById: afterLastMessage },
    );
    expect(freshCatalog.map((row) => row.streamUuid)).toEqual([STREAM_A, STREAM_B]);
    expect(freshCatalog[0]?.lastMessageCreatedAt).toBe(topicMessageAt);
    expect(freshCatalog[0]?.preview?.messageUuid).toBe(MESSAGE_C);
    expect(freshCatalog[0]?.preview?.text).toBe("Newer topic message");
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

  it("keeps encrypted last-message metadata for stream and topic previews without projecting content", () => {
    const encrypted = message({
      payload: { kind: "e2ee", keyUuid: STREAM_B, content: "encoded-ciphertext" },
    });
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: { [STREAM_A]: stream({ encryption: true, lastMessageUuid: MESSAGE_A }) },
        topicsById: { [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }) },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
        messagesById: { [MESSAGE_A]: encrypted },
      },
    );
    const row = rows.find((item) => item.streamUuid === STREAM_A);
    const preview = {
      messageUuid: MESSAGE_A,
      route: workspaceMessengerTopicRoute({
        orgId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
      }),
      text: "",
      senderName: "Alice Wonderland",
      encrypted: true,
    };
    expect(row?.preview).toEqual(preview);
    expect(row?.topics[0]?.preview).toEqual(preview);
    expect(row?.lastMessageCreatedAt).toBe(DATE_A);
    expect(encrypted.payload).toEqual({
      kind: "e2ee",
      keyUuid: STREAM_B,
      content: "encoded-ciphertext",
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

  it("puts active unread topics and streams above newer read activity in unread-first mode", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_B }),
          [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_A }),
        },
        topicsById: {
          [TOPIC_A]: topic({
            unreadCount: 0,
            activeUnreadCount: 0,
            lastMessageUuid: MESSAGE_B,
          }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            streamUuid: STREAM_B,
            unreadCount: 2,
            activeUnreadCount: 2,
            lastMessageUuid: MESSAGE_A,
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B],
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        sortMode: "unread_first",
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({
            uuid: MESSAGE_A,
            streamUuid: STREAM_B,
            topicUuid: TOPIC_B,
            createdAt: DATE_A,
          }),
          [MESSAGE_B]: message({ uuid: MESSAGE_B, createdAt: DATE_B }),
        },
      },
    );

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
    expect(rows[0]?.topics.map((item) => item.topicUuid)).toEqual([TOPIC_B]);
  });

  it("does not prioritize passive unread activity above an active unread topic", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        topicsById: {
          [TOPIC_A]: topic({
            unreadCount: 5,
            activeUnreadCount: 0,
            lastMessageUuid: MESSAGE_B,
          }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            unreadCount: 1,
            activeUnreadCount: 1,
            lastMessageUuid: MESSAGE_A,
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B],
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        sortMode: "unread_first",
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({ uuid: MESSAGE_A, topicUuid: TOPIC_B, createdAt: DATE_A }),
          [MESSAGE_B]: message({ uuid: MESSAGE_B, createdAt: DATE_B }),
        },
      },
    );

    expect(rows[0]?.topics.map((item) => item.topicUuid)).toEqual([TOPIC_B, TOPIC_A]);
  });

  it("returns streams to date ordering after their active unread count is cleared", () => {
    const options = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      sortMode: "unread_first" as const,
      usersById: createUsersById(),
      messagesById: {
        [MESSAGE_A]: message({
          uuid: MESSAGE_A,
          streamUuid: STREAM_B,
          topicUuid: TOPIC_B,
          createdAt: DATE_A,
        }),
        [MESSAGE_B]: message({ uuid: MESSAGE_B, createdAt: DATE_B }),
      },
    };
    const unreadState = state({
      streamsById: {
        [STREAM_A]: stream({ lastMessageUuid: MESSAGE_B }),
        [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_A }),
      },
      topicsById: {
        [TOPIC_A]: topic({ unreadCount: 0, activeUnreadCount: 0, lastMessageUuid: MESSAGE_B }),
        [TOPIC_B]: topic({
          uuid: TOPIC_B,
          streamUuid: STREAM_B,
          unreadCount: 1,
          activeUnreadCount: 1,
          lastMessageUuid: MESSAGE_A,
        }),
      },
      topicIds: [TOPIC_A, TOPIC_B],
    });
    const readState = {
      ...unreadState,
      topicsById: {
        ...unreadState.topicsById,
        [TOPIC_B]: topic({
          uuid: TOPIC_B,
          streamUuid: STREAM_B,
          unreadCount: 0,
          activeUnreadCount: 0,
          lastMessageUuid: MESSAGE_A,
        }),
      },
    };

    expect(
      selectMessengerSidebarStreams(unreadState, options).map((row) => row.streamUuid),
    ).toEqual([STREAM_B, STREAM_A]);
    expect(selectMessengerSidebarStreams(readState, options).map((row) => row.streamUuid)).toEqual([
      STREAM_A,
      STREAM_B,
    ]);
  });

  it("recomputes cached sidebar rows when the sort mode changes", () => {
    const base = state({
      streamsById: {
        [STREAM_A]: stream({ lastMessageUuid: MESSAGE_B }),
        [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_A }),
      },
      topicsById: {
        [TOPIC_A]: topic({ unreadCount: 0, activeUnreadCount: 0, lastMessageUuid: MESSAGE_B }),
        [TOPIC_B]: topic({
          uuid: TOPIC_B,
          streamUuid: STREAM_B,
          unreadCount: 1,
          activeUnreadCount: 1,
          lastMessageUuid: MESSAGE_A,
        }),
      },
      topicIds: [TOPIC_A, TOPIC_B],
    });
    const commonOptions = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      usersById: createUsersById(),
      messagesById: {
        [MESSAGE_A]: message({
          uuid: MESSAGE_A,
          streamUuid: STREAM_B,
          topicUuid: TOPIC_B,
          createdAt: DATE_A,
        }),
        [MESSAGE_B]: message({ uuid: MESSAGE_B, createdAt: DATE_B }),
      },
    };

    expect(selectMessengerSidebarStreams(base, commonOptions).map((row) => row.streamUuid)).toEqual(
      [STREAM_A, STREAM_B],
    );
    expect(
      selectMessengerSidebarStreams(base, {
        ...commonOptions,
        sortMode: "unread_first",
      }).map((row) => row.streamUuid),
    ).toEqual([STREAM_B, STREAM_A]);
  });

  it("does not let muted or done unread topics lift their stream", () => {
    const mutedMessageUuid = "4d9b34ca-bf68-414c-b5b1-77e4118471a4";
    const doneMessageUuid = "00d8331b-4d3d-43d1-a0d7-9c4f21b7cd70";
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: mutedMessageUuid }),
          [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_A }),
        },
        topicsById: {
          [TOPIC_A]: topic({ unreadCount: 0, activeUnreadCount: 0, lastMessageUuid: MESSAGE_B }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            notificationMode: "mute",
            unreadCount: 3,
            activeUnreadCount: 3,
            lastMessageUuid: mutedMessageUuid,
          }),
          [TOPIC_C]: topic({
            uuid: TOPIC_C,
            isDone: true,
            unreadCount: 4,
            activeUnreadCount: 4,
            lastMessageUuid: doneMessageUuid,
          }),
          [TOPIC_D]: topic({
            uuid: TOPIC_D,
            streamUuid: STREAM_B,
            unreadCount: 1,
            activeUnreadCount: 1,
            lastMessageUuid: MESSAGE_A,
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D],
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        sortMode: "unread_first",
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({
            uuid: MESSAGE_A,
            streamUuid: STREAM_B,
            topicUuid: TOPIC_D,
            createdAt: DATE_A,
          }),
          [MESSAGE_B]: message({ uuid: MESSAGE_B, createdAt: DATE_B }),
          [mutedMessageUuid]: message({
            uuid: mutedMessageUuid,
            topicUuid: TOPIC_B,
            createdAt: "2026-06-22T13:10:00Z",
          }),
          [doneMessageUuid]: message({
            uuid: doneMessageUuid,
            topicUuid: TOPIC_C,
            createdAt: "2026-06-22T14:10:00Z",
          }),
        },
      },
    );

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
    expect(
      rows.find((row) => row.streamUuid === STREAM_A)?.topics.map((item) => item.topicUuid),
    ).toEqual([TOPIC_A, TOPIC_B, TOPIC_C]);
  });

  it("keeps pinned streams ahead of active unread streams in unread-first mode", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        streamsById: {
          [STREAM_A]: stream({ lastMessageUuid: MESSAGE_A }),
          [STREAM_B]: stream({ uuid: STREAM_B, lastMessageUuid: MESSAGE_B }),
        },
        topicsById: {
          [TOPIC_A]: topic({ unreadCount: 1, activeUnreadCount: 1, lastMessageUuid: MESSAGE_A }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            streamUuid: STREAM_B,
            unreadCount: 0,
            activeUnreadCount: 0,
            lastMessageUuid: MESSAGE_B,
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B],
        foldersById: {
          [FOLDER_A]: folder({
            items: [
              { ...folder().items[0]!, streamUuid: STREAM_A, pinnedAt: null },
              { ...folder().items[1]!, streamUuid: STREAM_B, pinnedAt: DATE_A },
            ],
          }),
        },
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        selectedFolderUuid: FOLDER_A,
        sortMode: "unread_first",
        usersById: createUsersById(),
        messagesById: {
          [MESSAGE_A]: message({ uuid: MESSAGE_A, createdAt: DATE_B }),
          [MESSAGE_B]: message({
            uuid: MESSAGE_B,
            streamUuid: STREAM_B,
            topicUuid: TOPIC_B,
            createdAt: DATE_A,
          }),
        },
      },
    );

    expect(rows.map((row) => row.streamUuid)).toEqual([STREAM_B, STREAM_A]);
  });

  it("keeps done topics at the bottom even when they have newer messages", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        topicsById: {
          [TOPIC_A]: topic({ lastMessageUuid: MESSAGE_A }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            name: "Done but recent",
            isDone: true,
            lastMessageUuid: MESSAGE_B,
          }),
          [TOPIC_C]: topic({
            uuid: TOPIC_C,
            name: "Older active",
            updatedAt: DATE_A,
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
          [MESSAGE_B]: message({
            uuid: MESSAGE_B,
            conversationId: `topic:${STREAM_A}:${TOPIC_B}`,
            topicUuid: TOPIC_B,
            createdAt: DATE_B,
          }),
        },
      },
    );

    // Active topics stay ordered by activity; done topics sink below them.
    expect(rows[0]?.topics.map((item) => item.topicUuid)).toEqual([TOPIC_A, TOPIC_C, TOPIC_B]);
  });

  it("sorts done topics among themselves by last activity", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        topicsById: {
          [TOPIC_A]: topic({
            name: "Done older",
            isDone: true,
            lastMessageUuid: MESSAGE_A,
          }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            name: "Done newer",
            isDone: true,
            lastMessageUuid: MESSAGE_B,
          }),
          [TOPIC_C]: topic({
            uuid: TOPIC_C,
            name: "Active",
            updatedAt: DATE_A,
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
          [MESSAGE_B]: message({
            uuid: MESSAGE_B,
            conversationId: `topic:${STREAM_A}:${TOPIC_B}`,
            topicUuid: TOPIC_B,
            createdAt: DATE_B,
          }),
        },
      },
    );

    expect(rows[0]?.topics.map((item) => item.topicUuid)).toEqual([TOPIC_C, TOPIC_B, TOPIC_A]);
  });

  it("groups topics by effective mute and restores inherited topics when the stream unmutes", () => {
    const followAt = "2026-06-22T08:10:00Z";
    const unmuteAt = "2026-06-22T09:10:00Z";
    const muteAt = "2026-06-22T12:10:00Z";
    const doneAt = "2026-06-22T13:10:00Z";
    const topicsById = {
      [TOPIC_A]: topic({ notificationMode: "default", updatedAt: DATE_B }),
      [TOPIC_B]: topic({
        uuid: TOPIC_B,
        notificationMode: "unmute",
        updatedAt: unmuteAt,
      }),
      [TOPIC_C]: topic({
        uuid: TOPIC_C,
        notificationMode: "follow",
        updatedAt: followAt,
      }),
      [TOPIC_D]: topic({
        uuid: TOPIC_D,
        notificationMode: "mute",
        updatedAt: muteAt,
      }),
      [TOPIC_E]: topic({
        uuid: TOPIC_E,
        notificationMode: "unmute",
        isDone: true,
        updatedAt: doneAt,
      }),
    };
    const topicIds = [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D, TOPIC_E];
    const topicOrder = (streamNotificationMode: MessengerStream["notificationMode"]) => {
      const rows = selectMessengerSidebarStreams(
        state({
          streamsById: {
            [STREAM_A]: stream({ notificationMode: streamNotificationMode }),
          },
          streamIds: [STREAM_A],
          topicsById,
          topicIds,
        }),
        {
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          usersById: createUsersById(),
        },
      );

      return rows[0]?.topics.map((item) => item.topicUuid);
    };

    expect(topicOrder("muted")).toEqual([TOPIC_B, TOPIC_C, TOPIC_D, TOPIC_A, TOPIC_E]);
    expect(topicOrder("mentions_only")).toEqual([TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D, TOPIC_E]);
  });

  it("puts a newly created topic without messages above older topics", () => {
    const rows = selectMessengerSidebarStreams(
      state({
        topicsById: {
          [TOPIC_A]: topic({ updatedAt: DATE_A }),
          [TOPIC_B]: topic({
            uuid: TOPIC_B,
            name: "New topic",
            updatedAt: DATE_B,
          }),
        },
        topicIds: [TOPIC_A, TOPIC_B],
      }),
      {
        organizationId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        usersById: createUsersById(),
        messagesById: {},
      },
    );

    expect(rows[0]?.topics.map((item) => item.topicUuid)).toEqual([TOPIC_B, TOPIC_A]);
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
      notificationMode: "mentions_only",
      unreadCount: 1,
      preview: {
        messageUuid: MESSAGE_A,
        text: "Private preview",
        senderName: "Alice Wonderland",
      },
    });
  });

  it("invalidates selected and All folder projections when only conversations change", () => {
    const customFolderUuid = "folder-conversations";
    const conversationBefore = conversation({
      title: "Before",
      audience: "channel",
      isPrivate: false,
      directUserUuid: null,
    });
    const conversationAfter = { ...conversationBefore, title: "After" };
    const conversationItem = {
      ...folder().items[1]!,
      conversationId: conversationBefore.id,
    };
    const allFolder = folder({
      items: [folder().items[0]!, conversationItem],
    });
    const customFolder = folder({
      uuid: customFolderUuid,
      title: "Conversation folder",
      systemType: "created",
      items: [{ ...conversationItem, folderUuid: customFolderUuid }],
    });
    const base = state({
      streamsById: { [STREAM_A]: stream() },
      streamIds: [STREAM_A],
      conversationsById: { [conversationBefore.id]: conversationBefore },
      conversationIds: [conversationBefore.id],
      foldersById: {
        [FOLDER_A]: allFolder,
        [customFolderUuid]: customFolder,
      },
      folderIds: [FOLDER_A, customFolderUuid],
    });
    const next = {
      ...base,
      conversationsById: { [conversationAfter.id]: conversationAfter },
    };
    const usersById = createUsersById();
    const commonOptions = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      usersById,
    };

    const customBefore = selectMessengerSidebarStreams(base, {
      ...commonOptions,
      selectedFolderUuid: customFolderUuid,
    });
    const allBefore = selectMessengerSidebarStreams(base, {
      ...commonOptions,
      selectedFolderUuid: FOLDER_A,
    });
    const customAfter = selectMessengerSidebarStreams(next, {
      ...commonOptions,
      selectedFolderUuid: customFolderUuid,
    });
    const allAfter = selectMessengerSidebarStreams(next, {
      ...commonOptions,
      selectedFolderUuid: FOLDER_A,
    });

    expect(customBefore[0]?.title).toBe("Before");
    expect(allBefore.some((row) => row.title === "Before")).toBe(true);
    expect(customAfter[0]?.title).toBe("After");
    expect(allAfter.some((row) => row.title === "After")).toBe(true);
    expect(customAfter).not.toBe(customBefore);
    expect(allAfter).not.toBe(allBefore);
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

  it("keeps folder projection references stable across alternating folder selections", () => {
    const customFolderUuid = "folder-custom";
    const customFolder = folder({
      uuid: customFolderUuid,
      title: "Team",
      systemType: "created",
      items: [
        {
          ...folder().items[0]!,
          folderUuid: customFolderUuid,
        },
      ],
    });
    const selectorState = state({
      foldersById: {
        [FOLDER_A]: folder(),
        [customFolderUuid]: customFolder,
      },
      folderIds: [FOLDER_A, customFolderUuid],
    });
    const usersById = createUsersById();
    const commonOptions = {
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      usersById,
    };

    const firstCustom = selectMessengerSidebarStreams(selectorState, {
      ...commonOptions,
      selectedFolderUuid: customFolderUuid,
    });
    selectMessengerSidebarStreams(selectorState, {
      ...commonOptions,
      selectedFolderUuid: FOLDER_A,
    });
    const secondCustom = selectMessengerSidebarStreams(selectorState, {
      ...commonOptions,
      selectedFolderUuid: customFolderUuid,
    });

    expect(secondCustom).toBe(firstCustom);
  });

  it("builds workspace root routes with org and project ids", () => {
    expect(workspaceMessengerRootRoute(ORGANIZATION_ID, PROJECT_ID)).toBe(
      `/org/${ORGANIZATION_ID}/project/${PROJECT_ID}/messenger`,
    );
  });
});

describe("All folder creation visibility", () => {
  const options = {
    organizationId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
    currentUserUuid: "user",
    selectedFolderUuid: FOLDER_A,
  };

  it("shows a newly created encrypted catalog stream before folder refresh and deduplicates later", () => {
    const store = useMessengerStore;
    store.getState().startBootstrap("owner");
    store.getState().applyFolderSnapshot("owner", folder({ items: [] }));
    store.getState().upsertStream("owner", stream({ encryption: true }));
    const before = selectMessengerSidebarStreams(store.getState(), options);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      streamUuid: STREAM_A,
      encryption: true,
      route: `/org/${ORGANIZATION_ID}/project/${PROJECT_ID}/stream/${STREAM_A}`,
    });
    expect(selectMessengerSidebarStreams(store.getState(), options)).toBe(before);
    store.getState().applyFolderSnapshot("owner", folder());
    expect(
      selectMessengerSidebarStreams(store.getState(), options).filter(
        (item) => item.streamUuid === STREAM_A,
      ),
    ).toHaveLength(1);
  });

  it("preserves category and custom membership", () => {
    const customUuid = "custom-folder";
    for (const uuid of [
      customUuid,
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ]) {
      const snapshot = state({ foldersById: { [uuid]: folder({ uuid, items: [] }) } });
      expect(
        selectMessengerSidebarStreams(snapshot, { ...options, selectedFolderUuid: uuid }),
      ).toEqual([]);
    }
  });

  it("does not add archived, deleted, foreign-project or foreign-user catalog entries", () => {
    for (const override of [
      { isArchived: true },
      { projectId: "other-project" },
      { userUuid: "another-user" },
    ]) {
      const snapshot = state({
        foldersById: { [FOLDER_A]: folder({ items: [] }) },
        streamIds: [STREAM_A],
        streamsById: { [STREAM_A]: stream(override) },
      });
      expect(selectMessengerSidebarStreams(snapshot, options)).toEqual([]);
    }
    expect(
      selectMessengerSidebarStreams(
        state({ foldersById: { [FOLDER_A]: folder({ items: [] }) }, streamIds: [] }),
        options,
      ),
    ).toEqual([]);
  });

  it("rejects stale-owner creation and keeps ordinary streams visible", () => {
    useMessengerStore.getState().startBootstrap("current-owner");
    useMessengerStore.getState().applyFolderSnapshot("current-owner", folder({ items: [] }));
    useMessengerStore.getState().upsertStream("stale-owner", stream({ encryption: true }));
    expect(selectMessengerSidebarStreams(useMessengerStore.getState(), options)).toEqual([]);
    useMessengerStore.getState().upsertStream("current-owner", stream());
    expect(
      selectMessengerSidebarStreams(useMessengerStore.getState(), options)[0]?.streamUuid,
    ).toBe(STREAM_A);
  });
});
