import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import type {
  WorkspaceMessageListItem,
  WorkspaceMessageListOutgoingItem,
  WorkspaceMessageListServerItem,
} from "./workspace-message-list.types";

export interface WorkspaceMessageAuthorGroup {
  authorUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  startsTopicRun: boolean;
  messages: readonly WorkspaceMessageListItem[];
}

export interface WorkspaceMessageDayGroup {
  dateKey: string;
  authorGroups: readonly WorkspaceMessageAuthorGroup[];
}

const UNKNOWN_DATE_KEY = "unknown-date";

interface MutableWorkspaceMessageAuthorGroup {
  authorUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  startsTopicRun: boolean;
  messages: WorkspaceMessageListItem[];
}

interface MutableWorkspaceMessageDayGroup {
  dateKey: string;
  authorGroups: MutableWorkspaceMessageAuthorGroup[];
}

function getMessageTimestamp(message: Pick<WorkspaceMessageListItem, "createdAt">): number {
  return Date.parse(message.createdAt);
}

function padDatePart(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function compareMessagesByCreatedAtThenKey(
  firstMessage: WorkspaceMessageListItem,
  secondMessage: WorkspaceMessageListItem,
): number {
  const firstTimestamp = getMessageTimestamp(firstMessage);
  const secondTimestamp = getMessageTimestamp(secondMessage);

  if (Number.isNaN(firstTimestamp) || Number.isNaN(secondTimestamp)) {
    const createdAtCompare = firstMessage.createdAt.localeCompare(secondMessage.createdAt);

    if (createdAtCompare !== 0) {
      return createdAtCompare;
    }

    return firstMessage.key.localeCompare(secondMessage.key);
  }

  if (firstTimestamp !== secondTimestamp) {
    return firstTimestamp - secondTimestamp;
  }

  return firstMessage.key.localeCompare(secondMessage.key);
}

export function createWorkspaceMessageListServerItem(
  message: MessengerMessage,
  key: string = message.uuid,
): WorkspaceMessageListServerItem {
  return {
    kind: "server",
    key,
    message,
    createdAt: message.createdAt,
    authorUuid: message.authorUuid,
    isOwn: message.isOwn,
    read: message.read,
  };
}

export function createWorkspaceMessageListOutgoingItem(
  message: MessengerOutgoingMessage,
): WorkspaceMessageListOutgoingItem {
  return {
    kind: "outgoing",
    key: message.placementUuid,
    message,
    createdAt: message.createdAt,
    authorUuid: message.authorUuid,
    isOwn: true,
    read: true,
  };
}

export function getWorkspaceMessageDateKey(message: WorkspaceMessageListItem): string {
  const timestamp = getMessageTimestamp(message);

  if (Number.isNaN(timestamp)) {
    return message.createdAt.slice(0, 10) || UNKNOWN_DATE_KEY;
  }

  return formatLocalDateKey(new Date(timestamp));
}

export function isWorkspaceServiceMessage(message: WorkspaceMessageListItem): boolean {
  return (
    message.kind === "server" &&
    message.message.payload.kind !== "markdown" &&
    message.message.payload.kind !== "e2ee"
  );
}

export function groupWorkspaceMessagesByDayAndAuthor(
  messages: readonly WorkspaceMessageListItem[],
): WorkspaceMessageDayGroup[] {
  const sortedMessages = [...messages].sort(compareMessagesByCreatedAtThenKey);
  const dayGroups: MutableWorkspaceMessageDayGroup[] = [];
  let previousTopicUuid: MessengerUuid | undefined;

  for (const message of sortedMessages) {
    const dateKey = getWorkspaceMessageDateKey(message);
    let dayGroup = dayGroups[dayGroups.length - 1];

    if (dayGroup?.dateKey !== dateKey) {
      dayGroup = {
        dateKey,
        authorGroups: [],
      };
      dayGroups.push(dayGroup);
    }

    let authorGroup = dayGroup.authorGroups[dayGroup.authorGroups.length - 1];
    const topicUuid = message.message.topicUuid;
    const startsTopicRun = previousTopicUuid != null && previousTopicUuid !== topicUuid;

    const previousMessage = authorGroup?.messages[authorGroup.messages.length - 1];
    const serviceMessage = isWorkspaceServiceMessage(message);
    const previousServiceMessage =
      previousMessage != null && isWorkspaceServiceMessage(previousMessage);
    if (
      authorGroup?.topicUuid !== topicUuid ||
      previousServiceMessage !== serviceMessage ||
      (!serviceMessage && authorGroup.authorUuid !== message.authorUuid)
    ) {
      authorGroup = {
        authorUuid: message.authorUuid,
        topicUuid,
        startsTopicRun,
        messages: [],
      };
      dayGroup.authorGroups.push(authorGroup);
    }

    // Service runs span authors; ordinary messages keep their author grouping.
    authorGroup.messages.push(message);
    previousTopicUuid = topicUuid;
  }

  return dayGroups;
}
