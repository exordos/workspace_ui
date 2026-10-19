import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import type { User, UsersById } from "~/entities/user/user.types";
import { getLocale, t, type Locale } from "~/i18n/i18n";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import { workspaceMessengerTopicRoute } from "~/shared/lib/workspace-messenger-route.lib";
import {
  isWorkspaceTopicEffectivelyMuted,
  resolveWorkspaceActiveUnreadCount,
  resolveWorkspacePassiveUnreadCount,
} from "./messenger-notification-mode.lib";
import type { MessengerStoreState } from "./messenger.model";
import type {
  MessengerMessage,
  MessengerSidebarMessagePreview,
  MessengerStream,
  MessengerTopic,
  MessengerTopicListItem,
  MessengerUuid,
} from "./messenger.types";

const EMPTY_TOPIC_LIST: MessengerTopicListItem[] = [];
type TopicCatalog = Pick<MessengerStoreState, "topicIds" | "topicsById">;
const topicsByStreamCache = new WeakMap<
  TopicCatalog["topicsById"],
  { topicIds: TopicCatalog["topicIds"]; byStream: Map<MessengerUuid, MessengerTopic[]> }
>();

function topicsByStream(state: TopicCatalog): Map<MessengerUuid, MessengerTopic[]> {
  const cached = topicsByStreamCache.get(state.topicsById);
  if (cached?.topicIds === state.topicIds) return cached.byStream;
  const byStream = new Map<MessengerUuid, MessengerTopic[]>();
  for (const id of state.topicIds) {
    const topic = state.topicsById[id];
    if (topic == null) continue;
    const bucket = byStream.get(topic.streamUuid);
    if (bucket != null) bucket.push(topic);
    else byStream.set(topic.streamUuid, [topic]);
  }
  // Weak catalog keys let obsolete snapshots and their topic buckets be collected.
  topicsByStreamCache.set(state.topicsById, { topicIds: state.topicIds, byStream });
  return byStream;
}

const MAX_PREVIEW_TEXT_ENTRIES = 512;
const MAX_PREVIEW_TEXT_BYTES = 1024 * 1024;
const previewTextCache = new Map<
  string,
  { markdown: string; locale: Locale; text: string; bytes: number }
>();
let previewTextBytes = 0;

useWorkspaceMessageStore.subscribe((state, previous) => {
  if (state.ownerKey === previous.ownerKey) return;
  previewTextCache.clear();
  previewTextBytes = 0;
});

function messagePreviewText(message: MessengerMessage, organizationId: string): string {
  if (message.payload.kind !== "markdown") return "";
  const key = JSON.stringify([organizationId, message.projectId, message.userUuid, message.uuid]);
  const markdown = message.payload.content;
  const locale = getLocale();
  const cached = previewTextCache.get(key);
  if (cached?.markdown === markdown && cached.locale === locale) {
    previewTextCache.delete(key);
    previewTextCache.set(key, cached);
    return cached.text;
  }
  if (cached != null) {
    previewTextBytes -= cached.bytes;
    previewTextCache.delete(key);
  }
  const text = summarizeWorkspaceMessageMarkdown(markdown).text;
  const bytes = (key.length + markdown.length + text.length) * 2;
  // Keep only compact summaries and their bounded comparison input, never store snapshots.
  if (bytes > MAX_PREVIEW_TEXT_BYTES) return text;
  while (
    previewTextCache.size >= MAX_PREVIEW_TEXT_ENTRIES ||
    previewTextBytes + bytes > MAX_PREVIEW_TEXT_BYTES
  ) {
    const oldest = previewTextCache.entries().next().value;
    if (oldest == null) break;
    previewTextCache.delete(oldest[0]);
    previewTextBytes -= oldest[1].bytes;
  }
  previewTextCache.set(key, { markdown, locale, text, bytes });
  previewTextBytes += bytes;
  return text;
}

export type MessengerTopicListSortMode = "last_message" | "unread_first";

export interface MessengerTopicUnreadMentionIndex {
  streamUuids: ReadonlySet<MessengerUuid>;
  topicUuids: ReadonlySet<MessengerUuid>;
}

function compareNullableStringsDesc(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b.localeCompare(a);
}

export function messengerTopicListGroupRank(
  topic: MessengerTopicListItem,
  streamNotificationMode: MessengerStream["notificationMode"] | null,
): number {
  if (topic.isDone) return 2;
  return isWorkspaceTopicEffectivelyMuted(topic.notificationMode, streamNotificationMode) ? 1 : 0;
}

export function isMessengerTopicListItemActive(
  topic: MessengerTopicListItem,
  streamNotificationMode: MessengerStream["notificationMode"] | null,
): boolean {
  return messengerTopicListGroupRank(topic, streamNotificationMode) === 0;
}

export function hasMessengerTopicListItemActiveUnread(topic: MessengerTopicListItem): boolean {
  return (topic.activeUnreadCount ?? 0) > 0;
}

function compareTopics(
  a: MessengerTopicListItem,
  b: MessengerTopicListItem,
  streamNotificationMode: MessengerStream["notificationMode"] | null,
  sortMode: MessengerTopicListSortMode,
): number {
  const groupCompare =
    messengerTopicListGroupRank(a, streamNotificationMode) -
    messengerTopicListGroupRank(b, streamNotificationMode);
  if (groupCompare !== 0) return groupCompare;

  if (sortMode === "unread_first" && messengerTopicListGroupRank(a, streamNotificationMode) === 0) {
    const unreadCompare =
      Number(hasMessengerTopicListItemActiveUnread(b)) -
      Number(hasMessengerTopicListItemActiveUnread(a));
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

export function createMessengerTopicMessagePreview(input: {
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
  const text = messagePreviewText(message, input.organizationId);

  return {
    messageUuid: message.uuid,
    route: workspaceMessengerTopicRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: message.streamUuid,
      topicUuid: message.topicUuid,
    }),
    // List previews never render raw markdown or HTML. The summary also hides private file URLs.
    text,
    ...(senderName != null ? { senderName } : {}),
    ...(message.payload.kind !== "markdown" ? { encrypted: true as const } : {}),
  };
}

export function selectMessengerMessageCreatedAt(
  messageUuid: MessengerUuid | null | undefined,
  messagesById: Record<MessengerUuid, MessengerMessage>,
): string | null {
  if (messageUuid == null) return null;
  return messagesById[messageUuid]?.createdAt ?? null;
}

// The messenger does not hydrate every conversation at startup. Keep this projection
// explicitly best-effort: only unread messages currently held by the client participate.
export function createMessengerTopicUnreadMentionIndex(input: {
  projectId: string;
  messagesById: Record<MessengerUuid, MessengerMessage>;
}): MessengerTopicUnreadMentionIndex {
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

export function createMessengerTopicListItem(input: {
  organizationId: string;
  projectId: string;
  topic: MessengerTopic;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
  unreadMentionIndex: MessengerTopicUnreadMentionIndex;
}): MessengerTopicListItem {
  // topic:<streamUuid>:<topicUuid> is a frontend selection key. API calls use the UUID fields.
  return {
    id: `topic:${input.topic.streamUuid}:${input.topic.uuid}`,
    streamUuid: input.topic.streamUuid,
    topicUuid: input.topic.uuid,
    title: input.topic.name,
    unreadCount: input.topic.unreadCount,
    activeUnreadCount: resolveWorkspaceActiveUnreadCount(input.topic),
    passiveUnreadCount: resolveWorkspacePassiveUnreadCount(input.topic),
    hasUnreadPersonalMention: input.unreadMentionIndex.topicUuids.has(input.topic.uuid),
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
    preview: createMessengerTopicMessagePreview({
      messageUuid: input.topic.lastMessageUuid,
      organizationId: input.organizationId,
      projectId: input.projectId,
      messagesById: input.messagesById,
      usersById: input.usersById,
      currentUserUuid: input.currentUserUuid,
    }),
    lastMessageCreatedAt: selectMessengerMessageCreatedAt(
      input.topic.lastMessageUuid,
      input.messagesById,
    ),
    updatedAt: input.topic.updatedAt,
  };
}

export function selectMessengerTopicsForStream(input: {
  organizationId: string;
  projectId: string;
  state: TopicCatalog;
  streamUuid: MessengerUuid;
  streamNotificationMode: MessengerStream["notificationMode"] | null;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  usersById: UsersById;
  currentUserUuid: MessengerUuid | null;
  sortMode?: MessengerTopicListSortMode;
  unreadMentionIndex?: MessengerTopicUnreadMentionIndex;
}): MessengerTopicListItem[] {
  const unreadMentionIndex =
    input.unreadMentionIndex ??
    createMessengerTopicUnreadMentionIndex({
      projectId: input.projectId,
      messagesById: input.messagesById,
    });
  const topics = (topicsByStream(input.state).get(input.streamUuid) ?? []).map((topic) =>
    createMessengerTopicListItem({
      organizationId: input.organizationId,
      projectId: input.projectId,
      topic,
      messagesById: input.messagesById,
      usersById: input.usersById,
      currentUserUuid: input.currentUserUuid,
      unreadMentionIndex,
    }),
  );

  if (topics.length === 0) return EMPTY_TOPIC_LIST;
  return topics.sort((a, b) =>
    compareTopics(a, b, input.streamNotificationMode, input.sortMode ?? "last_message"),
  );
}
