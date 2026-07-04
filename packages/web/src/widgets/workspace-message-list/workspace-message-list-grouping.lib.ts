import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";

export interface WorkspaceMessageAuthorGroup {
  authorUuid: MessengerUuid;
  messages: readonly MessengerMessage[];
}

export interface WorkspaceMessageDayGroup {
  dateKey: string;
  authorGroups: readonly WorkspaceMessageAuthorGroup[];
}

const UNKNOWN_DATE_KEY = "unknown-date";

interface MutableWorkspaceMessageAuthorGroup {
  authorUuid: MessengerUuid;
  messages: MessengerMessage[];
}

interface MutableWorkspaceMessageDayGroup {
  dateKey: string;
  authorGroups: MutableWorkspaceMessageAuthorGroup[];
}

function getMessageTimestamp(message: MessengerMessage): number {
  return Date.parse(message.createdAt);
}

function padDatePart(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function compareMessagesByCreatedAtThenUuid(
  firstMessage: MessengerMessage,
  secondMessage: MessengerMessage,
): number {
  const firstTimestamp = getMessageTimestamp(firstMessage);
  const secondTimestamp = getMessageTimestamp(secondMessage);

  if (Number.isNaN(firstTimestamp) || Number.isNaN(secondTimestamp)) {
    const createdAtCompare = firstMessage.createdAt.localeCompare(secondMessage.createdAt);

    if (createdAtCompare !== 0) {
      return createdAtCompare;
    }

    return firstMessage.uuid.localeCompare(secondMessage.uuid);
  }

  if (firstTimestamp !== secondTimestamp) {
    return firstTimestamp - secondTimestamp;
  }

  return firstMessage.uuid.localeCompare(secondMessage.uuid);
}

export function getWorkspaceMessageDateKey(message: MessengerMessage): string {
  const timestamp = getMessageTimestamp(message);

  if (Number.isNaN(timestamp)) {
    return message.createdAt.slice(0, 10) || UNKNOWN_DATE_KEY;
  }

  return formatLocalDateKey(new Date(timestamp));
}

export function groupWorkspaceMessagesByDayAndAuthor(
  messages: readonly MessengerMessage[],
): WorkspaceMessageDayGroup[] {
  const sortedMessages = [...messages].sort(compareMessagesByCreatedAtThenUuid);
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
