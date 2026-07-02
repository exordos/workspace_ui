import { t } from "~/i18n/i18n";
import {
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
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
  MessengerUser,
  MessengerUuid,
} from "./messenger.types";

const EMPTY_SIDEBAR_STREAMS: MessengerSidebarStreamItem[] = [];
const EMPTY_SIDEBAR_FOLDERS: MessengerSidebarFolderView[] = [];
const EMPTY_SIDEBAR_TOPICS: MessengerSidebarTopicItem[] = [];
const EMPTY_SIDEBAR_MESSAGES_BY_ID: Record<MessengerUuid, MessengerMessage> = {};
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
  messagesById?: Record<MessengerUuid, MessengerMessage>;
}

interface SidebarStreamsCacheEntry {
  streamIds: MessengerUuid[];
  streamsById: MessengerStoreState["streamsById"];
  topicIds: MessengerUuid[];
  topicsById: MessengerStoreState["topicsById"];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: MessengerStoreState["usersById"];
  currentUserUuid: MessengerUuid | null;
  foldersById: MessengerStoreState["foldersById"];
  organizationId: string;
  projectId: string;
  selectedFolderUuid: string | null;
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

let sidebarStreamsCache: SidebarStreamsCacheEntry | null = null;
let sidebarFoldersCache: SidebarFoldersCacheEntry | null = null;
let sidebarActivityCountsCache: SidebarActivityCountsCacheEntry | null = null;

// The sidebar recalculates often, so keep a simple cache keyed by store references.
// If streams/topics/folders did not change, React receives the same array and avoids redundant rerenders.
function compareNullableStrings(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
}

function compareSidebarStreams(
  a: MessengerSidebarStreamItem,
  b: MessengerSidebarStreamItem,
): number {
  if (a.pinnedAt != null && b.pinnedAt == null) return -1;
  if (a.pinnedAt == null && b.pinnedAt != null) return 1;

  const activityCompare = compareNullableStrings(b.lastMessageCreatedAt, a.lastMessageCreatedAt);
  if (activityCompare !== 0) return activityCompare;

  const orderIndexCompare =
    (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER);
  if (orderIndexCompare !== 0) return orderIndexCompare;

  return 0;
}

function resolveMessengerUserDisplayName(user: MessengerUser | undefined): string | undefined {
  if (user == null) return undefined;

  const fullName = [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();
  if (fullName.length > 0) return fullName;

  const username = user.username.trim();
  return username.length > 0 ? username : undefined;
}

function previewFromMessage(
  messageUuid: MessengerUuid | null,
  messagesById: Record<MessengerUuid, MessengerMessage>,
  usersById: MessengerStoreState["usersById"],
  currentUserUuid: MessengerUuid | null,
): MessengerSidebarMessagePreview | null {
  if (messageUuid == null) return null;

  const message = messagesById[messageUuid];
  if (message == null) return null;

  const senderName =
    message.authorUuid === currentUserUuid
      ? t("common.you")
      : resolveMessengerUserDisplayName(usersById[message.authorUuid]);
  return {
    messageUuid: message.uuid,
    text: message.markdown,
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

function topicItemFromTopic(input: {
  organizationId: string;
  projectId: string;
  topic: MessengerTopic;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: MessengerStoreState["usersById"];
  currentUserUuid: MessengerUuid | null;
}): MessengerSidebarTopicItem {
  // topic:<streamUuid>:<topicUuid> is a temporary frontend key for row selection.
  // The API has no separate "conversation" entity; real ids remain streamUuid and topicUuid.
  return {
    id: `topic:${input.topic.streamUuid}:${input.topic.uuid}`,
    streamUuid: input.topic.streamUuid,
    topicUuid: input.topic.uuid,
    title: input.topic.name,
    unreadCount: input.topic.unreadCount,
    isDone: input.topic.isDone,
    route: workspaceMessengerTopicRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: input.topic.streamUuid,
      topicUuid: input.topic.uuid,
    }),
    preview: previewFromMessage(
      input.topic.lastMessageUuid,
      input.messagesById,
      input.usersById,
      input.currentUserUuid,
    ),
    updatedAt: input.topic.updatedAt,
  };
}

function streamItemFromStream(input: {
  organizationId: string;
  projectId: string;
  stream: MessengerStream;
  topics: MessengerSidebarTopicItem[];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: MessengerStoreState["usersById"];
  currentUserUuid: MessengerUuid | null;
  unreadCount?: number;
  pinnedAt?: string | null;
  orderIndex?: number | null;
}): MessengerSidebarStreamItem {
  // stream:<uuid> is the same kind of key for a stream row in the sidebar.
  // Routes and future requests still use the real backend stream uuid.
  return {
    id: `stream:${input.stream.uuid}`,
    streamUuid: input.stream.uuid,
    title: input.stream.name,
    audience: input.stream.audience,
    isPrivate: input.stream.isPrivate,
    unreadCount: input.unreadCount ?? input.stream.unreadCount,
    pinnedAt: input.pinnedAt ?? null,
    orderIndex: input.orderIndex ?? null,
    route: workspaceMessengerStreamRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: input.stream.uuid,
    }),
    topics: input.topics,
    preview: previewFromMessage(
      input.stream.lastMessageUuid,
      input.messagesById,
      input.usersById,
      input.currentUserUuid,
    ),
    updatedAt: input.stream.updatedAt,
    lastMessageCreatedAt: latestMessageCreatedAt(
      [input.stream.lastMessageUuid, ...input.topics.map((topic) => topic.preview?.messageUuid)],
      input.messagesById,
    ),
  };
}

function streamItemFromConversation(input: {
  organizationId: string;
  projectId: string;
  conversation: MessengerConversation;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: MessengerStoreState["usersById"];
  currentUserUuid: MessengerUuid | null;
  unreadCount?: number;
  pinnedAt?: string | null;
  orderIndex?: number | null;
  updatedAt?: string | null;
}): MessengerSidebarStreamItem {
  return {
    id: input.conversation.id,
    streamUuid: input.conversation.streamUuid,
    title: input.conversation.title,
    audience: input.conversation.audience,
    isPrivate: input.conversation.isPrivate,
    unreadCount: input.unreadCount ?? input.conversation.unreadCount,
    pinnedAt: input.pinnedAt ?? null,
    orderIndex: input.orderIndex ?? null,
    route: workspaceMessengerStreamRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: input.conversation.streamUuid,
    }),
    topics: EMPTY_SIDEBAR_TOPICS,
    preview: previewFromMessage(
      input.conversation.lastMessageUuid ?? null,
      input.messagesById,
      input.usersById,
      input.currentUserUuid,
    ),
    updatedAt: input.updatedAt ?? "",
    lastMessageCreatedAt: messageCreatedAt(input.conversation.lastMessageUuid, input.messagesById),
  };
}

function topicsForStream(input: {
  organizationId: string;
  projectId: string;
  state: MessengerStoreState;
  streamUuid: MessengerUuid;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  currentUserUuid: MessengerUuid | null;
}): MessengerSidebarTopicItem[] {
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
        usersById: input.state.usersById,
        currentUserUuid: input.currentUserUuid,
      }),
    );

  if (topics.length === 0) return EMPTY_SIDEBAR_TOPICS;
  return topics;
}

export function selectMessengerSidebarStreams(
  state: MessengerStoreState,
  options: MessengerSidebarSelectorOptions,
): MessengerSidebarStreamItem[] {
  const selectedFolderUuid = options.selectedFolderUuid ?? null;
  const currentUserUuid = options.currentUserUuid ?? null;
  const messagesById = options.messagesById ?? EMPTY_SIDEBAR_MESSAGES_BY_ID;
  if (
    sidebarStreamsCache?.streamIds === state.streamIds &&
    sidebarStreamsCache.streamsById === state.streamsById &&
    sidebarStreamsCache.topicIds === state.topicIds &&
    sidebarStreamsCache.topicsById === state.topicsById &&
    sidebarStreamsCache.messagesById === messagesById &&
    sidebarStreamsCache.usersById === state.usersById &&
    sidebarStreamsCache.currentUserUuid === currentUserUuid &&
    sidebarStreamsCache.foldersById === state.foldersById &&
    sidebarStreamsCache.organizationId === options.organizationId &&
    sidebarStreamsCache.projectId === options.projectId &&
    sidebarStreamsCache.selectedFolderUuid === selectedFolderUuid
  ) {
    return sidebarStreamsCache.result;
  }

  const selectedFolder = selectedFolderUuid != null ? state.foldersById[selectedFolderUuid] : null;
  // If a folder is selected, order and counters come from folder.items.
  // If no folder is selected, all streams are shown as a general list.
  const streams = selectedFolder
    ? selectedFolder.items
        .map((item) => {
          const stream = state.streamsById[item.streamUuid];
          if (stream != null) {
            return streamItemFromStream({
              organizationId: options.organizationId,
              projectId: options.projectId,
              stream,
              messagesById,
              usersById: state.usersById,
              currentUserUuid,
              unreadCount: item.unreadCount,
              pinnedAt: item.pinnedAt,
              orderIndex: item.orderIndex,
              topics: topicsForStream({
                organizationId: options.organizationId,
                projectId: options.projectId,
                state,
                streamUuid: stream.uuid,
                messagesById,
                currentUserUuid,
              }),
            });
          }

          const conversation = state.conversationsById[item.conversationId];
          if (conversation == null) return null;
          return streamItemFromConversation({
            organizationId: options.organizationId,
            projectId: options.projectId,
            conversation,
            messagesById,
            usersById: state.usersById,
            currentUserUuid,
            unreadCount: item.unreadCount,
            pinnedAt: item.pinnedAt,
            orderIndex: item.orderIndex,
            updatedAt: item.updatedAt,
          });
        })
        .filter((item): item is MessengerSidebarStreamItem => item != null)
        .sort(compareSidebarStreams)
    : state.streamIds
        .map((streamId) => state.streamsById[streamId])
        .filter((stream): stream is MessengerStream => stream != null)
        .map((stream) =>
          streamItemFromStream({
            organizationId: options.organizationId,
            projectId: options.projectId,
            stream,
            messagesById,
            usersById: state.usersById,
            currentUserUuid,
            topics: topicsForStream({
              organizationId: options.organizationId,
              projectId: options.projectId,
              state,
              streamUuid: stream.uuid,
              messagesById,
              currentUserUuid,
            }),
          }),
        );

  const result = streams.length > 0 ? streams : EMPTY_SIDEBAR_STREAMS;
  sidebarStreamsCache = {
    streamIds: state.streamIds,
    streamsById: state.streamsById,
    topicIds: state.topicIds,
    topicsById: state.topicsById,
    messagesById,
    usersById: state.usersById,
    currentUserUuid,
    foldersById: state.foldersById,
    organizationId: options.organizationId,
    projectId: options.projectId,
    selectedFolderUuid,
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
