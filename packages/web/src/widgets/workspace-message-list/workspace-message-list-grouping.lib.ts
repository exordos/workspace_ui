import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import type {
  WorkspaceMessageListItem,
  WorkspaceMessageListOutgoingItem,
  WorkspaceMessageListServerItem,
} from "./workspace-message-list.types";

export interface WorkspaceMessageAuthorGroup {
  authorUuid: MessengerUuid;
  messages: readonly WorkspaceMessageListItem[];
}

export interface WorkspaceMessageDayGroup {
  dateKey: string;
  authorGroups: readonly WorkspaceMessageAuthorGroup[];
}

const UNKNOWN_DATE_KEY = "unknown-date";

interface MutableWorkspaceMessageAuthorGroup {
  authorUuid: MessengerUuid;
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

function compareMessagesByCreatedAtThenKey(
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
    key: message.localId,
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

export function groupWorkspaceMessagesByDayAndAuthor(
  messages: readonly WorkspaceMessageListItem[],
): WorkspaceMessageDayGroup[] {
  const sortedMessages = [...messages].sort(compareMessagesByCreatedAtThenKey);
  const dayGroups: MutableWorkspaceMessageDayGroup[] = [];

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

    if (authorGroup?.authorUuid !== message.authorUuid) {
      authorGroup = {
        authorUuid: message.authorUuid,
        messages: [],
      };
      dayGroup.authorGroups.push(authorGroup);
    }

    // Группируем только соседние сообщения одного автора внутри одного дня.
    // Если другой автор вклинился между двумя сообщениями, ниже появится новая
    // группа того же authorUuid. Это важно для будущих аватаров и хвостиков bubble.
    authorGroup.messages.push(message);
  }

  return dayGroups;
}
