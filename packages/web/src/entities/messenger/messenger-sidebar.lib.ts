import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import type { User, UsersById } from "~/entities/user/user.types";
import { t } from "~/i18n/i18n";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import {
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import {
  selectWorkspaceConversationUiKind,
  selectWorkspaceStreamConversationUiKind,
} from "./messenger-conversation-ui-kind.lib";
import {
  isWorkspaceStreamFullyMuted,
  isWorkspaceTopicEffectivelyMuted,
  resolveWorkspaceActiveUnreadCount,
  resolveWorkspacePassiveUnreadCount,
} from "./messenger-notification-mode.lib";
import { isWorkspaceSelfChat } from "./messenger-self-chat.lib";
import type { MessengerStoreState } from "./messenger.model";
import type {
  MessengerFolder,
  MessengerConversation,
  MessengerMessage,
  MessengerSidebarMessagePreview,
  MessengerSidebarFolderView,
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
  MessengerStream,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

const EMPTY_SIDEBAR_STREAMS: MessengerSidebarStreamItem[] = [];
const EMPTY_SIDEBAR_FOLDERS: MessengerSidebarFolderView[] = [];
const EMPTY_SIDEBAR_TOPICS: MessengerSidebarTopicItem[] = [];
const EMPTY_SIDEBAR_MESSAGES_BY_ID: Record<MessengerUuid, MessengerMessage> = {};
const EMPTY_SIDEBAR_USERS_BY_ID: UsersById = {};
const EMPTY_SIDEBAR_ACTIVITY_COUNTS: MessengerSidebarActivityCounts = {
  inboxCount: null,
  mentionsCount: null,
};

// This file does not load anything from the API.
// It reads stored Workspace data from the messenger store and builds the sidebar view.
export interface MessengerSidebarSelectorOptions {
  organizationId: string;
  projectId: string;
  currentUserUuid?: MessengerUuid | null;
  selectedFolderUuid?: string | null;
  sortMode?: MessengerSidebarSortMode;
  messagesById?: Record<MessengerUuid, MessengerMessage>;
  usersById?: UsersById;
}

export type MessengerSidebarSortMode = "last_message" | "unread_first";

export type MessengerSidebarStreamsState = Pick<
  MessengerStoreState,
  "streamIds" | "streamsById" | "topicIds" | "topicsById" | "foldersById" | "conversationsById"
>;

interface SidebarStreamsCacheEntry {
  streamIds: MessengerUuid[];
  streamsById: MessengerStoreState["streamsById"];
  topicIds: MessengerUuid[];
  topicsById: MessengerStoreState["topicsById"];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
  foldersById: MessengerStoreState["foldersById"];
  organizationId: string;
  projectId: string;
  selectedFolderUuid: string | null;
  sortMode: MessengerSidebarSortMode;
  result: MessengerSidebarStreamItem[];
}

interface SidebarFoldersCacheEntry {
  folderIds: MessengerUuid[];
  foldersById: MessengerStoreState["foldersById"];
  result: MessengerSidebarFolderView[];
}

interface SidebarActivityCountsCacheEntry {
  folderIds: MessengerUuid[];
  foldersById: MessengerStoreState["foldersById"];
  result: MessengerSidebarActivityCounts;
}

export interface MessengerSidebarActivityCounts {
  inboxCount: number | null;
  mentionsCount: number | null;
}

export interface MessengerSidebarUnreadMentionIndex {
  streamUuids: ReadonlySet<MessengerUuid>;
  topicUuids: ReadonlySet<MessengerUuid>;
}

let sidebarStreamsCache: SidebarStreamsCacheEntry | null = null;
let sidebarFoldersCache: SidebarFoldersCacheEntry | null = null;
let sidebarActivityCountsCache: SidebarActivityCountsCacheEntry | null = null;

// The sidebar recalculates often, so keep a simple cache keyed by store references.
// If streams/topics/folders did not change, React receives the same array and avoids redundant rerenders.
function compareNullableStringsDesc(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b.localeCompare(a);
}

function compareSidebarStreams(
  a: MessengerSidebarStreamItem,
  b: MessengerSidebarStreamItem,
  sortMode: MessengerSidebarSortMode,
): number {
  if (a.pinnedAt != null && b.pinnedAt == null) return -1;
  if (a.pinnedAt == null && b.pinnedAt != null) return 1;

  const groupCompare = streamGroupRank(a) - streamGroupRank(b);
  if (groupCompare !== 0) return groupCompare;

  if (sortMode === "unread_first" && streamGroupRank(a) === 0) {
    const unreadCompare =
      Number(streamHasActiveUnreadTopics(b)) - Number(streamHasActiveUnreadTopics(a));
    if (unreadCompare !== 0) return unreadCompare;
  }

  const activityCompare = compareNullableStringsDesc(
    a.lastMessageCreatedAt,
    b.lastMessageCreatedAt,
  );
  if (activityCompare !== 0) return activityCompare;

  const orderIndexCompare =
    (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER);
  if (orderIndexCompare !== 0) return orderIndexCompare;

  return 0;
}

function streamGroupRank(stream: MessengerSidebarStreamItem): number {
  if (stream.isArchived) return 2;
  return isWorkspaceStreamFullyMuted(
    stream.notificationMode,
    stream.topics.map((topic) => topic.notificationMode),
  )
    ? 1
    : 0;
}

function topicGroupRank(
  topic: MessengerSidebarTopicItem,
  streamNotificationMode: MessengerSidebarStreamItem["notificationMode"],
): number {
  if (topic.isDone) return 2;
  return isWorkspaceTopicEffectivelyMuted(topic.notificationMode, streamNotificationMode) ? 1 : 0;
}

function isActiveSidebarTopic(
  topic: MessengerSidebarTopicItem,
  streamNotificationMode: MessengerSidebarStreamItem["notificationMode"],
): boolean {
  return topicGroupRank(topic, streamNotificationMode) === 0;
}

function hasActiveUnreadSidebarTopic(topic: MessengerSidebarTopicItem): boolean {
  return (topic.activeUnreadCount ?? 0) > 0;
}

function streamHasActiveUnreadTopics(stream: MessengerSidebarStreamItem): boolean {
  return stream.topics.some(
    (topic) =>
      isActiveSidebarTopic(topic, stream.notificationMode) && hasActiveUnreadSidebarTopic(topic),
  );
}

function compareSidebarTopics(
  a: MessengerSidebarTopicItem,
  b: MessengerSidebarTopicItem,
  streamNotificationMode: MessengerSidebarStreamItem["notificationMode"],
  sortMode: MessengerSidebarSortMode,
): number {
  const groupCompare =
    topicGroupRank(a, streamNotificationMode) - topicGroupRank(b, streamNotificationMode);
  if (groupCompare !== 0) return groupCompare;

  if (sortMode === "unread_first" && topicGroupRank(a, streamNotificationMode) === 0) {
    const unreadCompare =
      Number(hasActiveUnreadSidebarTopic(b)) - Number(hasActiveUnreadSidebarTopic(a));
    if (unreadCompare !== 0) return unreadCompare;
  }

  return compareNullableStringsDesc(
    a.lastMessageCreatedAt ?? a.updatedAt,
    b.lastMessageCreatedAt ?? b.updatedAt,
  );
}

function resolveUserDisplayName(user: User | undefined): string | undefined {
  if (user == null) return undefined;
  return selectUserDisplayName(user);
}

function previewFromMessage(input: {
  messageUuid: MessengerUuid | null;
  organizationId: string;
  projectId: string;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
}): MessengerSidebarMessagePreview | null {
  if (input.messageUuid == null) return null;

  const message = input.messagesById[input.messageUuid];
  if (message == null) return null;

  const senderName =
    message.authorUuid === input.currentUserUuid
      ? t("common.you")
      : resolveUserDisplayName(input.usersById[message.authorUuid]);
  const summary = summarizeWorkspaceMessageMarkdown(message.payload.content);

  return {
    messageUuid: message.uuid,
    route: workspaceMessengerTopicRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: message.streamUuid,
      topicUuid: message.topicUuid,
    }),
    // Сайдбар не рендерит HTML и не показывает исходный markdown: короткая
    // сводка скрывает приватные file URL и одинаково работает для текста,
    // mentions, картинок и вложений.
    text: summary.text,
    ...(senderName != null ? { senderName } : {}),
  };
}

function messageCreatedAt(
  messageUuid: MessengerUuid | null | undefined,
  messagesById: Record<MessengerUuid, MessengerMessage>,
): string | null {
  if (messageUuid == null) return null;
  return messagesById[messageUuid]?.createdAt ?? null;
}

function latestMessageCreatedAt(
  messageUuids: readonly (MessengerUuid | null | undefined)[],
  messagesById: Record<MessengerUuid, MessengerMessage>,
): string | null {
  let latest: string | null = null;
  for (const messageUuid of messageUuids) {
    const createdAt = messageCreatedAt(messageUuid, messagesById);
    if (createdAt == null) continue;
    if (latest == null || createdAt > latest) {
      latest = createdAt;
    }
  }
  return latest;
}

// The messenger does not hydrate every conversation at startup. Keep this projection
// explicitly best-effort: only unread messages currently held by the client participate.
export function createMessengerSidebarUnreadMentionIndex(input: {
  projectId: string;
  messagesById: Record<MessengerUuid, MessengerMessage>;
}): MessengerSidebarUnreadMentionIndex {
  const streamUuids = new Set<MessengerUuid>();
  const topicUuids = new Set<MessengerUuid>();

  for (const message of Object.values(input.messagesById)) {
    if (message.projectId !== input.projectId || message.read || message.mentioned !== true) {
      continue;
    }

    streamUuids.add(message.streamUuid);
    topicUuids.add(message.topicUuid);
  }

  return { streamUuids, topicUuids };
}

function topicItemFromTopic(input: {
  organizationId: string;
  projectId: string;
  topic: MessengerTopic;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
  unreadMentionIndex: MessengerSidebarUnreadMentionIndex;
}): MessengerSidebarTopicItem {
  // topic:<streamUuid>:<topicUuid> is a temporary frontend key for row selection.
  // The API has no separate "conversation" entity; real ids remain streamUuid and topicUuid.
  return {
    id: `topic:${input.topic.streamUuid}:${input.topic.uuid}`,
    streamUuid: input.topic.streamUuid,
    topicUuid: input.topic.uuid,
    title: input.topic.name,
    unreadCount: input.topic.unreadCount,
    activeUnreadCount: resolveWorkspaceActiveUnreadCount(input.topic),
    passiveUnreadCount: resolveWorkspacePassiveUnreadCount(input.topic),
    hasUnreadPersonalMention: input.unreadMentionIndex.topicUuids.has(input.topic.uuid),
    // Default/general is still tracked for other UX; the sidebar strip has no special case.
    isDefault: input.topic.isDefault,
    isDone: input.topic.isDone,
    notificationMode: input.topic.notificationMode,
    color: input.topic.color ?? null,
    route: workspaceMessengerTopicRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: input.topic.streamUuid,
      topicUuid: input.topic.uuid,
    }),
    preview: previewFromMessage({
      messageUuid: input.topic.lastMessageUuid,
      organizationId: input.organizationId,
      projectId: input.projectId,
      messagesById: input.messagesById,
      usersById: input.usersById,
      currentUserUuid: input.currentUserUuid,
    }),
    lastMessageCreatedAt: messageCreatedAt(input.topic.lastMessageUuid, input.messagesById),
    updatedAt: input.topic.updatedAt,
  };
}

function streamItemFromStream(input: {
  organizationId: string;
  projectId: string;
  stream: MessengerStream;
  topics: MessengerSidebarTopicItem[];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
  unreadMentionIndex: MessengerSidebarUnreadMentionIndex;
  unreadCount?: number;
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
  pinnedAt?: string | null;
  orderIndex?: number | null;
}): MessengerSidebarStreamItem {
  // stream:<uuid> is the same kind of key for a stream row in the sidebar.
  // Routes and future requests still use the real backend stream uuid.
  const directUser =
    selectWorkspaceStreamConversationUiKind(input.stream) === "directPrivate" &&
    input.stream.directUserUuid != null
      ? input.usersById[input.stream.directUserUuid]
      : undefined;
  const uiKind = selectWorkspaceStreamConversationUiKind(input.stream);
  const isActiveStream =
    !input.stream.isArchived &&
    !isWorkspaceStreamFullyMuted(
      input.stream.notificationMode,
      input.topics.map((topic) => topic.notificationMode),
    );
  const activeTopics = isActiveStream
    ? input.topics.filter((topic) => isActiveSidebarTopic(topic, input.stream.notificationMode))
    : input.topics;
  const streamLastMessageTopicUuid =
    input.stream.lastMessageUuid != null
      ? input.messagesById[input.stream.lastMessageUuid]?.topicUuid
      : undefined;
  const streamLastMessageTopic = input.topics.find(
    (topic) => topic.topicUuid === streamLastMessageTopicUuid,
  );
  const streamLastMessageUuid =
    isActiveStream &&
    streamLastMessageTopic != null &&
    !isActiveSidebarTopic(streamLastMessageTopic, input.stream.notificationMode)
      ? null
      : input.stream.lastMessageUuid;

  return {
    id: `stream:${input.stream.uuid}`,
    streamUuid: input.stream.uuid,
    directUserUuid: input.stream.directUserUuid,
    title:
      uiKind === "directPrivate" && input.stream.directUserUuid != null
        ? selectUserDisplayName(directUser, input.stream.name)
        : input.stream.name,
    audience: input.stream.audience,
    isPrivate: input.stream.isPrivate,
    isArchived: input.stream.isArchived,
    uiKind,
    notificationMode: input.stream.notificationMode,
    unreadCount: input.unreadCount ?? input.stream.unreadCount,
    activeUnreadCount: input.activeUnreadCount ?? resolveWorkspaceActiveUnreadCount(input.stream),
    passiveUnreadCount:
      input.passiveUnreadCount ?? resolveWorkspacePassiveUnreadCount(input.stream),
    hasUnreadPersonalMention: input.unreadMentionIndex.streamUuids.has(input.stream.uuid),
    pinnedAt: input.pinnedAt ?? null,
    orderIndex: input.orderIndex ?? null,
    route: workspaceMessengerStreamRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: input.stream.uuid,
    }),
    topics: input.topics,
    preview: previewFromMessage({
      messageUuid: input.stream.lastMessageUuid,
      organizationId: input.organizationId,
      projectId: input.projectId,
      messagesById: input.messagesById,
      usersById: input.usersById,
      currentUserUuid: input.currentUserUuid,
    }),
    color: input.stream.color ?? null,
    avatarUrl: uiKind === "directPrivate" ? (directUser?.avatarUrl ?? null) : undefined,
    presence:
      uiKind === "directPrivate" ? resolveUserPresenceVisual(directUser?.status) : undefined,
    statusEmoji: uiKind === "directPrivate" ? (directUser?.statusEmoji ?? null) : undefined,
    statusText: uiKind === "directPrivate" ? (directUser?.statusText ?? null) : undefined,
    updatedAt: input.stream.updatedAt,
    lastMessageCreatedAt: latestMessageCreatedAt(
      [streamLastMessageUuid, ...activeTopics.map((topic) => topic.preview?.messageUuid)],
      input.messagesById,
    ),
  };
}

function streamItemFromConversation(input: {
  organizationId: string;
  projectId: string;
  conversation: MessengerConversation;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
  unreadMentionIndex: MessengerSidebarUnreadMentionIndex;
  unreadCount?: number;
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
  pinnedAt?: string | null;
  orderIndex?: number | null;
  updatedAt?: string | null;
}): MessengerSidebarStreamItem {
  const uiKind = selectWorkspaceConversationUiKind(input.conversation);
  const directUser =
    uiKind === "directPrivate" && input.conversation.directUserUuid != null
      ? input.usersById[input.conversation.directUserUuid]
      : undefined;

  return {
    id: input.conversation.id,
    streamUuid: input.conversation.streamUuid,
    directUserUuid: input.conversation.directUserUuid ?? null,
    title:
      uiKind === "directPrivate" && input.conversation.directUserUuid != null
        ? selectUserDisplayName(directUser, input.conversation.title)
        : input.conversation.title,
    audience: input.conversation.audience,
    isPrivate: input.conversation.isPrivate,
    isArchived: input.conversation.isArchived ?? false,
    uiKind,
    notificationMode:
      input.conversation.notificationMode === "all_messages" ||
      input.conversation.notificationMode === "mentions_only" ||
      input.conversation.notificationMode === "muted"
        ? input.conversation.notificationMode
        : null,
    unreadCount: input.unreadCount ?? input.conversation.unreadCount,
    activeUnreadCount:
      input.activeUnreadCount ?? resolveWorkspaceActiveUnreadCount(input.conversation),
    passiveUnreadCount:
      input.passiveUnreadCount ?? resolveWorkspacePassiveUnreadCount(input.conversation),
    hasUnreadPersonalMention: input.unreadMentionIndex.streamUuids.has(
      input.conversation.streamUuid,
    ),
    pinnedAt: input.pinnedAt ?? null,
    orderIndex: input.orderIndex ?? null,
    route: workspaceMessengerStreamRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: input.conversation.streamUuid,
    }),
    topics: EMPTY_SIDEBAR_TOPICS,
    preview: previewFromMessage({
      messageUuid: input.conversation.lastMessageUuid ?? null,
      organizationId: input.organizationId,
      projectId: input.projectId,
      messagesById: input.messagesById,
      usersById: input.usersById,
      currentUserUuid: input.currentUserUuid,
    }),
    avatarUrl: uiKind === "directPrivate" ? (directUser?.avatarUrl ?? null) : undefined,
    presence:
      uiKind === "directPrivate" ? resolveUserPresenceVisual(directUser?.status) : undefined,
    statusEmoji: uiKind === "directPrivate" ? (directUser?.statusEmoji ?? null) : undefined,
    statusText: uiKind === "directPrivate" ? (directUser?.statusText ?? null) : undefined,
    updatedAt: input.updatedAt ?? "",
    lastMessageCreatedAt: messageCreatedAt(input.conversation.lastMessageUuid, input.messagesById),
  };
}

export function selectMessengerSidebarTopicsForStream(input: {
  organizationId: string;
  projectId: string;
  state: Pick<MessengerSidebarStreamsState, "topicIds" | "topicsById">;
  streamUuid: MessengerUuid;
  streamNotificationMode: MessengerSidebarStreamItem["notificationMode"];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
  sortMode?: MessengerSidebarSortMode;
  unreadMentionIndex?: MessengerSidebarUnreadMentionIndex;
}): MessengerSidebarTopicItem[] {
  const unreadMentionIndex =
    input.unreadMentionIndex ??
    createMessengerSidebarUnreadMentionIndex({
      projectId: input.projectId,
      messagesById: input.messagesById,
    });
  // Topics currently live in a flat store list, so this links them to the relevant stream.
  const topics = input.state.topicIds
    .map((topicId) => input.state.topicsById[topicId])
    .filter((topic): topic is MessengerTopic => topic?.streamUuid === input.streamUuid)
    .map((topic) =>
      topicItemFromTopic({
        organizationId: input.organizationId,
        projectId: input.projectId,
        topic,
        messagesById: input.messagesById,
        usersById: input.usersById,
        currentUserUuid: input.currentUserUuid,
        unreadMentionIndex,
      }),
    );

  if (topics.length === 0) return EMPTY_SIDEBAR_TOPICS;
  return topics.sort((a, b) =>
    compareSidebarTopics(a, b, input.streamNotificationMode, input.sortMode ?? "last_message"),
  );
}

export function selectMessengerSidebarStreams(
  state: MessengerSidebarStreamsState,
  options: MessengerSidebarSelectorOptions,
): MessengerSidebarStreamItem[] {
  const selectedFolderUuid = options.selectedFolderUuid ?? null;
  const sortMode = options.sortMode ?? "last_message";
  const currentUserUuid = options.currentUserUuid ?? null;
  const messagesById = options.messagesById ?? EMPTY_SIDEBAR_MESSAGES_BY_ID;
  const usersById = options.usersById ?? EMPTY_SIDEBAR_USERS_BY_ID;
  if (
    sidebarStreamsCache?.streamIds === state.streamIds &&
    sidebarStreamsCache.streamsById === state.streamsById &&
    sidebarStreamsCache.topicIds === state.topicIds &&
    sidebarStreamsCache.topicsById === state.topicsById &&
    sidebarStreamsCache.messagesById === messagesById &&
    sidebarStreamsCache.usersById === usersById &&
    sidebarStreamsCache.currentUserUuid === currentUserUuid &&
    sidebarStreamsCache.foldersById === state.foldersById &&
    sidebarStreamsCache.organizationId === options.organizationId &&
    sidebarStreamsCache.projectId === options.projectId &&
    sidebarStreamsCache.selectedFolderUuid === selectedFolderUuid &&
    sidebarStreamsCache.sortMode === sortMode
  ) {
    return sidebarStreamsCache.result;
  }

  const unreadMentionIndex = createMessengerSidebarUnreadMentionIndex({
    projectId: options.projectId,
    messagesById,
  });

  const selectedFolder = selectedFolderUuid != null ? state.foldersById[selectedFolderUuid] : null;
  // If a folder is selected, order and counters come from folder.items.
  // If no folder is selected, all streams are shown as a general list.
  const streams = selectedFolder
    ? selectedFolder.items
        .map((item) => {
          const stream = state.streamsById[item.streamUuid];
          if (stream != null) {
            if (isWorkspaceSelfChat(stream, currentUserUuid)) return null;
            return streamItemFromStream({
              organizationId: options.organizationId,
              projectId: options.projectId,
              stream,
              messagesById,
              usersById,
              currentUserUuid,
              unreadMentionIndex,
              unreadCount: item.unreadCount,
              activeUnreadCount: resolveWorkspaceActiveUnreadCount(item),
              passiveUnreadCount: resolveWorkspacePassiveUnreadCount(item),
              pinnedAt: item.pinnedAt,
              orderIndex: item.orderIndex,
              topics: selectMessengerSidebarTopicsForStream({
                organizationId: options.organizationId,
                projectId: options.projectId,
                state,
                streamUuid: stream.uuid,
                streamNotificationMode: stream.notificationMode,
                messagesById,
                usersById,
                currentUserUuid,
                sortMode,
                unreadMentionIndex,
              }),
            });
          }

          const conversation = state.conversationsById[item.conversationId];
          if (conversation == null) return null;
          if (isWorkspaceSelfChat(conversation, currentUserUuid)) return null;
          return streamItemFromConversation({
            organizationId: options.organizationId,
            projectId: options.projectId,
            conversation,
            messagesById,
            usersById,
            currentUserUuid,
            unreadMentionIndex,
            unreadCount: item.unreadCount,
            activeUnreadCount: resolveWorkspaceActiveUnreadCount(item),
            passiveUnreadCount: resolveWorkspacePassiveUnreadCount(item),
            pinnedAt: item.pinnedAt,
            orderIndex: item.orderIndex,
            updatedAt: item.updatedAt,
          });
        })
        .filter((item): item is MessengerSidebarStreamItem => item != null)
        .sort((a, b) => compareSidebarStreams(a, b, sortMode))
    : state.streamIds
        .map((streamId) => state.streamsById[streamId])
        .filter(
          (stream): stream is MessengerStream =>
            stream != null && !isWorkspaceSelfChat(stream, currentUserUuid),
        )
        .map((stream) =>
          streamItemFromStream({
            organizationId: options.organizationId,
            projectId: options.projectId,
            stream,
            messagesById,
            usersById,
            currentUserUuid,
            unreadMentionIndex,
            topics: selectMessengerSidebarTopicsForStream({
              organizationId: options.organizationId,
              projectId: options.projectId,
              state,
              streamUuid: stream.uuid,
              streamNotificationMode: stream.notificationMode,
              messagesById,
              usersById,
              currentUserUuid,
              sortMode,
              unreadMentionIndex,
            }),
          }),
        )
        .sort((a, b) => compareSidebarStreams(a, b, sortMode));

  const result = streams.length > 0 ? streams : EMPTY_SIDEBAR_STREAMS;
  sidebarStreamsCache = {
    streamIds: state.streamIds,
    streamsById: state.streamsById,
    topicIds: state.topicIds,
    topicsById: state.topicsById,
    messagesById,
    usersById,
    currentUserUuid,
    foldersById: state.foldersById,
    organizationId: options.organizationId,
    projectId: options.projectId,
    selectedFolderUuid,
    sortMode,
    result,
  };
  return result;
}

export function selectMessengerSidebarFolders(
  state: MessengerStoreState,
): MessengerSidebarFolderView[] {
  if (
    sidebarFoldersCache?.folderIds === state.folderIds &&
    sidebarFoldersCache.foldersById === state.foldersById
  ) {
    return sidebarFoldersCache.result;
  }

  const folders = state.folderIds
    .map((folderId) => state.foldersById[folderId])
    .filter((folder): folder is MessengerFolder => folder != null)
    .map((folder) => ({
      folderUuid: folder.uuid,
      title: folder.title,
      backgroundColorValue: folder.backgroundColorValue,
      unreadCount: folder.unreadCount,
      systemType: folder.systemType,
      items: folder.items,
    }));

  const result = folders.length > 0 ? folders : EMPTY_SIDEBAR_FOLDERS;
  sidebarFoldersCache = {
    folderIds: state.folderIds,
    foldersById: state.foldersById,
    result,
  };
  return result;
}

export function selectMessengerSidebarActivityCounts(
  state: MessengerStoreState,
): MessengerSidebarActivityCounts {
  if (
    sidebarActivityCountsCache?.folderIds === state.folderIds &&
    sidebarActivityCountsCache.foldersById === state.foldersById
  ) {
    return sidebarActivityCountsCache.result;
  }

  const allFolder = state.folderIds
    .map((folderId) => state.foldersById[folderId])
    .find((folder): folder is MessengerFolder => folder?.systemType === "all");

  const result =
    allFolder != null
      ? {
          inboxCount: allFolder.unreadCount,
          mentionsCount: null,
        }
      : EMPTY_SIDEBAR_ACTIVITY_COUNTS;

  sidebarActivityCountsCache = {
    folderIds: state.folderIds,
    foldersById: state.foldersById,
    result,
  };
  return result;
}
