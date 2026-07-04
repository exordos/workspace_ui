import type {
  MessengerConversation,
  MessengerMessage,
  MessengerTopic,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import type { User, UsersById } from "~/entities/user/user.types";
import { groupWorkspaceReactions } from "~/widgets/message-list/message-bubble-emoji.lib";
import type { MessageListMessage } from "~/widgets/message-list/message-list.types";

export const WORKSPACE_CHAT_VISUAL_CURRENT_USER_ID = 1;

// The old MessageList still accepts numeric ids from the Zulip world.
// Workspace gets stable visual ids only at the page boundary, without writing them to the store.
const VISUAL_ID_MIN = 1_000;
const VISUAL_ID_RANGE = 1_000_000_000;
const UNKNOWN_SENDER_NAME = "Unknown user";

type WorkspaceVisualMessage = MessageListMessage & { authorUuid: MessengerUuid };

export interface WorkspaceChatMessageListInput {
  messages: readonly MessengerMessage[];
  usersById: Readonly<UsersById>;
  conversation: MessengerConversation | null;
  streamName: string | null;
  topicsById?: Readonly<Record<MessengerUuid, MessengerTopic>>;
}

export interface WorkspaceChatMessageListViewModel {
  messages: MessageListMessage[];
  currentUserId: number;
  firstUnreadId: number | undefined;
  unreadCount: number;
}

function stableVisualId(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return VISUAL_ID_MIN + ((hash >>> 0) % VISUAL_ID_RANGE);
}

export function workspaceChatVisualMessageId(messageUuid: MessengerUuid): number {
  return stableVisualId(`message:${messageUuid}`);
}

export function findWorkspaceMessageUuidByVisualId(
  messages: readonly MessengerMessage[],
  visualMessageId: number,
): MessengerUuid | null {
  // Edit/delete come from the old list by visual id, so convert back to backend uuid before requests.
  for (const message of messages) {
    if (workspaceChatVisualMessageId(message.uuid) === visualMessageId) {
      return message.uuid;
    }
  }
  return null;
}

export function workspaceChatVisualSenderId(userUuid: MessengerUuid, isOwn: boolean): number {
  if (isOwn) {
    return WORKSPACE_CHAT_VISUAL_CURRENT_USER_ID;
  }
  const id = stableVisualId(`sender:${userUuid}`);
  return id === WORKSPACE_CHAT_VISUAL_CURRENT_USER_ID ? VISUAL_ID_MIN : id;
}

function resolveSenderName(user: User | undefined): string {
  if (user == null) {
    return UNKNOWN_SENDER_NAME;
  }
  return selectUserDisplayName(user, UNKNOWN_SENDER_NAME);
}

function resolveTopicLabel(
  message: MessengerMessage,
  conversation: MessengerConversation | null,
  topicsById: Readonly<Record<MessengerUuid, MessengerTopic>> | undefined,
): string {
  const topicName = topicsById?.[message.topicUuid]?.name.trim();
  if (topicName != null && topicName.length > 0) {
    return topicName;
  }
  if (conversation?.topicUuid === message.topicUuid && conversation.title.trim().length > 0) {
    return conversation.title;
  }
  return "";
}

function adaptMessageToVisualMessage(
  message: MessengerMessage,
  input: WorkspaceChatMessageListInput,
): WorkspaceVisualMessage {
  // Это временная граница со старым layout. Она не становится новой доменной
  // моделью и не превращает Workspace reactions aggregate в фальшивый Zulip Reaction[].
  const sender = input.usersById[message.authorUuid];
  const subject = resolveTopicLabel(message, input.conversation, input.topicsById);
  const streamName = input.streamName ?? "";
  const workspaceReactionGroups = groupWorkspaceReactions(
    message.reactions,
    message.ownReactionUuidsByEmojiName,
    message.pendingOwnReactionsByEmojiName,
  );

  return {
    id: workspaceChatVisualMessageId(message.uuid),
    authorUuid: message.authorUuid,
    sender_id: workspaceChatVisualSenderId(message.authorUuid, message.isOwn),
    sender_full_name: resolveSenderName(sender),
    stream_id: stableVisualId(`stream:${message.streamUuid}`),
    display_recipient: streamName,
    channel: streamName,
    subject,
    content: message.markdown,
    markdown_source: message.markdown,
    timestamp: Math.floor(Date.parse(message.createdAt) / 1000),
    flags: message.read ? ["read"] : [],
    workspaceReactionGroups,
  };
}

export function buildWorkspaceChatMessageListViewModel(
  input: WorkspaceChatMessageListInput,
): WorkspaceChatMessageListViewModel {
  const visualMessages = input.messages.map((message) =>
    adaptMessageToVisualMessage(message, input),
  );
  const unreadMessages = visualMessages.filter(
    (message) =>
      message.sender_id !== WORKSPACE_CHAT_VISUAL_CURRENT_USER_ID &&
      !message.flags?.includes("read"),
  );

  return {
    messages: visualMessages,
    currentUserId: WORKSPACE_CHAT_VISUAL_CURRENT_USER_ID,
    firstUnreadId: unreadMessages[0]?.id,
    unreadCount: unreadMessages.length,
  };
}
