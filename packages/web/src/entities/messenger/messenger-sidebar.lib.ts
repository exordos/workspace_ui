import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import type { User, UsersById } from "~/entities/user/user.types";
import { getLocale, type Locale } from "~/i18n/i18n";
import { workspaceMessengerStreamRoute } from "~/shared/lib/workspace-messenger-route.lib";
import {
  selectWorkspaceConversationUiKind,
  selectWorkspaceStreamConversationUiKind,
} from "./messenger-conversation-ui-kind.lib";
import { MESSENGER_ALL_CHATS_FOLDER_UUID } from "./messenger-folder-system-type.lib";
import {
  isWorkspaceStreamFullyMuted,
  resolveWorkspaceActiveUnreadCount,
  resolveWorkspacePassiveUnreadCount,
} from "./messenger-notification-mode.lib";
import { isWorkspaceSelfChat } from "./messenger-self-chat.lib";
import {
  createMessengerTopicMessagePreview,
  createMessengerTopicUnreadMentionIndex,
  hasMessengerTopicListItemActiveUnread,
  isMessengerTopicListItemActive,
  selectMessengerMessageCreatedAt,
  selectMessengerTopicsForStream,
  type MessengerTopicListSortMode,
  type MessengerTopicUnreadMentionIndex,
} from "./messenger-topic-list.lib";
import { useMessengerStore, type MessengerStoreState } from "./messenger.model";
import type {
  MessengerFolder,
  MessengerConversation,
  MessengerMessage,
  MessengerSidebarFolderView,
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
  MessengerStream,
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

/** Sidebar compatibility name for the shared topic-list ordering mode. */
export type MessengerSidebarSortMode = MessengerTopicListSortMode;

export type MessengerSidebarStreamsState = Pick<
  MessengerStoreState,
  "streamIds" | "streamsById" | "topicIds" | "topicsById" | "foldersById" | "conversationsById"
> &
  Partial<Pick<MessengerStoreState, "ownerKey">>;

interface SidebarStreamsCacheEntry {
  ownerKey: string | null;
  locale: Locale;
  streamIds: MessengerUuid[];
  streamsById: MessengerStoreState["streamsById"];
  topicIds: MessengerUuid[];
  topicsById: MessengerStoreState["topicsById"];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
  foldersById: MessengerStoreState["foldersById"];
  conversationsById: MessengerStoreState["conversationsById"];
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

/** Sidebar compatibility name for the shared unread-mention index. */
export type MessengerSidebarUnreadMentionIndex = MessengerTopicUnreadMentionIndex;

const sidebarStreamsCache = new Map<string | null, SidebarStreamsCacheEntry>();
let sidebarFoldersCache: SidebarFoldersCacheEntry | null = null;
let sidebarActivityCountsCache: SidebarActivityCountsCacheEntry | null = null;

const unsubscribeMessenger = useMessengerStore.subscribe((state, previous) => {
  if (
    state.ownerKey === previous.ownerKey &&
    state.bootstrapRequestVersion === previous.bootstrapRequestVersion
  )
    return;
  sidebarStreamsCache.clear();
  sidebarFoldersCache = null;
  sidebarActivityCountsCache = null;
});

if (import.meta.hot) import.meta.hot.dispose(unsubscribeMessenger);

function reuseProjection<T extends object>(previous: T | undefined, next: T): T {
  if (previous == null) return next;
  const keys = Object.keys(next) as (keyof T)[];
  return keys.length === Object.keys(previous).length &&
    keys.every((key) => previous[key] === next[key])
    ? previous
    : next;
}

function reusePreview(
  previous: MessengerSidebarStreamItem["preview"] | undefined,
  next: MessengerSidebarStreamItem["preview"],
): MessengerSidebarStreamItem["preview"] {
  return next == null ? null : reuseProjection(previous ?? undefined, next);
}

function reuseStreamRows(
  previous: MessengerSidebarStreamItem[],
  next: MessengerSidebarStreamItem[],
): MessengerSidebarStreamItem[] {
  const byId = new Map(previous.map((row) => [row.id, row]));
  const rows = next.map((row) => {
    const old = byId.get(row.id);
    if (old == null) return row;
    const oldTopics = new Map(old.topics.map((item) => [item.id, item]));
    const topics = row.topics.map((topic) => {
      const oldTopic = oldTopics.get(topic.id);
      return reuseProjection(oldTopic, {
        ...topic,
        preview: reusePreview(oldTopic?.preview, topic.preview),
      });
    });
    return reuseProjection(old, {
      ...row,
      preview: reusePreview(old.preview, row.preview),
      topics:
        topics.length === old.topics.length &&
        topics.every((topic, index) => topic === old.topics[index])
          ? old.topics
          : topics,
    });
  });
  return rows.length === previous.length && rows.every((row, index) => row === previous[index])
    ? previous
    : rows;
}

// The sidebar recalculates often, so keep a simple cache keyed by store references.
// If streams/topics/folders did not change, React receives the same array and avoids redundant rerenders.
function compareNullableStringsDesc(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b.localeCompare(a);
}

export interface MessengerSidebarStreamSortActivity {
  lastMessageCreatedAt: string | null;
  hasActiveUnreadTopics: boolean;
}

export function selectMessengerSidebarStreamSortActivity(
  stream: MessengerSidebarStreamItem,
  streamsById: MessengerSidebarStreamsState["streamsById"],
): MessengerSidebarStreamSortActivity {
  return {
    lastMessageCreatedAt: streamSortMessageCreatedAt(stream, streamsById),
    hasActiveUnreadTopics: streamHasActiveUnreadTopics(stream),
  };
}

function streamSortMessageCreatedAt(
  stream: MessengerSidebarStreamItem,
  streamsById: MessengerSidebarStreamsState["streamsById"],
): string | null {
  const source = streamsById[stream.streamUuid];
  // A known last-message UUID may still be waiting for hydration; that stream is not empty.
  return source != null && source.lastMessageUuid == null
    ? source.createdAt
    : stream.lastMessageCreatedAt;
}

/** Apply temporary presentation activity without changing row data or pin/mute priorities. */
export function sortMessengerSidebarStreams(
  streams: MessengerSidebarStreamItem[],
  sortMode: MessengerSidebarSortMode,
  streamsById: MessengerSidebarStreamsState["streamsById"],
  activityOverrides: ReadonlyMap<MessengerUuid, MessengerSidebarStreamSortActivity>,
  previousStreams: readonly MessengerSidebarStreamItem[],
): MessengerSidebarStreamItem[] {
  if (activityOverrides.size === 0) return streams;
  const previousOrder = new Map(previousStreams.map((stream, index) => [stream.id, index]));
  return [...streams].sort((a, b) => {
    const comparison = compareSidebarStreams(a, b, sortMode, streamsById, activityOverrides);
    if (comparison !== 0) return comparison;
    // Canonical activity may already have reversed equal rows before the override is applied.
    return (
      (previousOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (previousOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

function compareSidebarStreams(
  a: MessengerSidebarStreamItem,
  b: MessengerSidebarStreamItem,
  sortMode: MessengerSidebarSortMode,
  streamsById: MessengerSidebarStreamsState["streamsById"],
  activityOverrides?: ReadonlyMap<MessengerUuid, MessengerSidebarStreamSortActivity>,
): number {
  if (a.pinnedAt != null && b.pinnedAt == null) return -1;
  if (a.pinnedAt == null && b.pinnedAt != null) return 1;

  const groupCompare = streamGroupRank(a) - streamGroupRank(b);
  if (groupCompare !== 0) return groupCompare;

  const activityA = activityOverrides?.get(a.streamUuid);
  const activityB = activityOverrides?.get(b.streamUuid);
  if (sortMode === "unread_first" && streamGroupRank(a) === 0) {
    const unreadCompare =
      Number(activityB?.hasActiveUnreadTopics ?? streamHasActiveUnreadTopics(b)) -
      Number(activityA?.hasActiveUnreadTopics ?? streamHasActiveUnreadTopics(a));
    if (unreadCompare !== 0) return unreadCompare;
  }

  const activityCompare = compareNullableStringsDesc(
    activityA === undefined
      ? streamSortMessageCreatedAt(a, streamsById)
      : activityA.lastMessageCreatedAt,
    activityB === undefined
      ? streamSortMessageCreatedAt(b, streamsById)
      : activityB.lastMessageCreatedAt,
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

function streamHasActiveUnreadTopics(stream: MessengerSidebarStreamItem): boolean {
  return stream.topics.some(
    (topic) =>
      isMessengerTopicListItemActive(topic, stream.notificationMode) &&
      hasMessengerTopicListItemActiveUnread(topic),
  );
}

function latestMessageCreatedAt(
  messageUuids: readonly (MessengerUuid | null | undefined)[],
  messagesById: Record<MessengerUuid, MessengerMessage>,
): string | null {
  let latest: string | null = null;
  for (const messageUuid of messageUuids) {
    const createdAt = selectMessengerMessageCreatedAt(messageUuid, messagesById);
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
  return createMessengerTopicUnreadMentionIndex(input);
}

function resolveDirectUserSearchText(user: User | undefined): string | undefined {
  if (user == null) return undefined;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return [user.displayName, fullName, user.username, user.email].filter(Boolean).join("\n");
}

function streamItemFromStream(input: {
  organizationId: string;
  projectId: string;
  stream: MessengerStream;
  topics: MessengerSidebarTopicItem[];
  topicsById: MessengerStoreState["topicsById"];
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
    ? input.topics.filter((topic) =>
        isMessengerTopicListItemActive(topic, input.stream.notificationMode),
      )
    : input.topics;
  const streamLastMessageTopic = input.topics.find(
    (topic) =>
      input.stream.lastMessageUuid != null &&
      input.topicsById[topic.topicUuid]?.lastMessageUuid === input.stream.lastMessageUuid,
  );
  const streamLastMessageIsInactive =
    isActiveStream &&
    streamLastMessageTopic != null &&
    !isMessengerTopicListItemActive(streamLastMessageTopic, input.stream.notificationMode);

  return {
    id: `stream:${input.stream.uuid}`,
    streamUuid: input.stream.uuid,
    directUserUuid: input.stream.directUserUuid,
    directUserSearchText: resolveDirectUserSearchText(directUser),
    title:
      uiKind === "directPrivate" && input.stream.directUserUuid != null
        ? selectUserDisplayName(directUser, input.stream.name)
        : input.stream.name,
    audience: input.stream.audience,
    isPrivate: input.stream.isPrivate,
    encryption: input.stream.encryption ?? false,
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
    preview: createMessengerTopicMessagePreview({
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
    // Inactive topic activity does not lift an otherwise active stream.
    lastMessageCreatedAt: streamLastMessageIsInactive
      ? latestMessageCreatedAt(
          activeTopics.map((topic) => topic.preview?.messageUuid),
          input.messagesById,
        )
      : selectMessengerMessageCreatedAt(input.stream.lastMessageUuid, input.messagesById),
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
    directUserSearchText: resolveDirectUserSearchText(directUser),
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
    preview: createMessengerTopicMessagePreview({
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
    lastMessageCreatedAt: selectMessengerMessageCreatedAt(
      input.conversation.lastMessageUuid,
      input.messagesById,
    ),
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
  return selectMessengerTopicsForStream(input);
}

export function selectMessengerSidebarStreams(
  state: MessengerSidebarStreamsState,
  options: MessengerSidebarSelectorOptions,
): MessengerSidebarStreamItem[] {
  const ownerKey = state.ownerKey ?? null;
  const locale = getLocale();
  const selectedFolderUuid = options.selectedFolderUuid ?? null;
  const sortMode = options.sortMode ?? "last_message";
  const currentUserUuid = options.currentUserUuid ?? null;
  const messagesById = options.messagesById ?? EMPTY_SIDEBAR_MESSAGES_BY_ID;
  const usersById = options.usersById ?? EMPTY_SIDEBAR_USERS_BY_ID;
  const cachedEntry = sidebarStreamsCache.get(selectedFolderUuid);
  if (
    cachedEntry?.ownerKey === ownerKey &&
    cachedEntry.locale === locale &&
    cachedEntry.streamIds === state.streamIds &&
    cachedEntry.streamsById === state.streamsById &&
    cachedEntry.topicIds === state.topicIds &&
    cachedEntry.topicsById === state.topicsById &&
    cachedEntry.messagesById === messagesById &&
    cachedEntry.usersById === usersById &&
    cachedEntry.currentUserUuid === currentUserUuid &&
    cachedEntry.foldersById === state.foldersById &&
    cachedEntry.conversationsById === state.conversationsById &&
    cachedEntry.organizationId === options.organizationId &&
    cachedEntry.projectId === options.projectId &&
    cachedEntry.selectedFolderUuid === selectedFolderUuid &&
    cachedEntry.sortMode === sortMode
  ) {
    return cachedEntry.result;
  }

  const unreadMentionIndex = createMessengerSidebarUnreadMentionIndex({
    projectId: options.projectId,
    messagesById,
  });

  const selectedFolder = selectedFolderUuid != null ? state.foldersById[selectedFolderUuid] : null;
  // If a folder is selected, order and counters come from folder.items.
  // Archived rows stay in the catalog for the Archive tab, even before folder refresh.
  const streams = selectedFolder
    ? selectedFolder.items
        .map((item) => {
          const stream = state.streamsById[item.streamUuid];
          if (stream != null) {
            if (stream.isArchived || isWorkspaceSelfChat(stream, currentUserUuid)) return null;
            return streamItemFromStream({
              organizationId: options.organizationId,
              projectId: options.projectId,
              stream,
              topicsById: state.topicsById,
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
          if (conversation.isArchived || isWorkspaceSelfChat(conversation, currentUserUuid))
            return null;
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
        .sort((a, b) => compareSidebarStreams(a, b, sortMode, state.streamsById))
    : state.streamIds
        .map((streamId) => state.streamsById[streamId])
        .filter(
          (stream): stream is MessengerStream =>
            stream != null && !stream.isArchived && !isWorkspaceSelfChat(stream, currentUserUuid),
        )
        .map((stream) =>
          streamItemFromStream({
            organizationId: options.organizationId,
            projectId: options.projectId,
            stream,
            topicsById: state.topicsById,
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
        .sort((a, b) => compareSidebarStreams(a, b, sortMode, state.streamsById));

  // Newly created catalog entries can arrive before the All folder snapshot.
  // Other folders retain their explicit membership and counters.
  if (selectedFolder?.uuid === MESSENGER_ALL_CHATS_FOLDER_UUID) {
    const listedUuids = new Set(selectedFolder.items.map((item) => item.streamUuid));
    for (const streamUuid of state.streamIds) {
      const stream = state.streamsById[streamUuid];
      if (
        stream == null ||
        listedUuids.has(streamUuid) ||
        stream.projectId !== options.projectId ||
        (currentUserUuid != null && stream.userUuid !== currentUserUuid) ||
        stream.isArchived ||
        isWorkspaceSelfChat(stream, currentUserUuid)
      )
        continue;
      listedUuids.add(streamUuid);
      streams.push(
        streamItemFromStream({
          organizationId: options.organizationId,
          projectId: options.projectId,
          stream,
          topicsById: state.topicsById,
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
      );
    }
    streams.sort((a, b) => compareSidebarStreams(a, b, sortMode, state.streamsById));
  }

  const sameScope =
    cachedEntry?.ownerKey === ownerKey &&
    cachedEntry.locale === locale &&
    cachedEntry.organizationId === options.organizationId &&
    cachedEntry.projectId === options.projectId &&
    cachedEntry.currentUserUuid === currentUserUuid;
  const result =
    streams.length === 0
      ? EMPTY_SIDEBAR_STREAMS
      : sameScope
        ? reuseStreamRows(cachedEntry.result, streams)
        : streams;
  sidebarStreamsCache.set(selectedFolderUuid, {
    ownerKey,
    locale,
    streamIds: state.streamIds,
    streamsById: state.streamsById,
    topicIds: state.topicIds,
    topicsById: state.topicsById,
    messagesById,
    usersById,
    currentUserUuid,
    foldersById: state.foldersById,
    conversationsById: state.conversationsById,
    organizationId: options.organizationId,
    projectId: options.projectId,
    selectedFolderUuid,
    sortMode,
    result,
  });
  // Search renders the selected folder and All together; keep that pair without retaining old folders.
  if (sidebarStreamsCache.size > 2) {
    const oldestFolderUuid = sidebarStreamsCache.keys().next().value;
    if (oldestFolderUuid !== undefined) sidebarStreamsCache.delete(oldestFolderUuid);
  }
  return result;
}

export function selectMessengerSidebarFolders(
  state: Pick<MessengerStoreState, "folderIds" | "foldersById">,
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
  state: Pick<MessengerStoreState, "folderIds" | "foldersById">,
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
