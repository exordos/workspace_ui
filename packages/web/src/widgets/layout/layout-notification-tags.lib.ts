import { buildWorkspaceNotificationFallbackTag } from "./layout-notification-tag.lib";
import {
  consumeReadMessagesFromNotificationAggregates,
  drainNotificationAggregateTagsForOwner,
} from "./notification-aggregate-registry.lib";

interface NotificationTagActions {
  closeByTag: (tag: string) => void | Promise<void>;
}

function closeTag(closeByTag: NotificationTagActions["closeByTag"], tag: string): void {
  const closeResult = closeByTag(tag);
  if (closeResult instanceof Promise) {
    void closeResult.catch(() => {});
  }
}

function closeMessageTags(
  closeByTag: NotificationTagActions["closeByTag"],
  messageUuids: string[],
  ownerKey: string,
): void {
  for (const messageUuid of messageUuids) {
    closeTag(closeByTag, buildWorkspaceNotificationFallbackTag(ownerKey, messageUuid));
  }
}

export function closeAllActiveMessageNotifications(
  notifications: NotificationTagActions,
  ownerKey: string,
): void {
  for (const tag of drainNotificationAggregateTagsForOwner(ownerKey)) {
    closeTag(notifications.closeByTag, tag);
  }
}

export function closeReadMessageNotifications(
  notifications: NotificationTagActions,
  messageUuids: string[],
  ownerKey: string,
): void {
  const { closedTags, untrackedMessageUuids } = consumeReadMessagesFromNotificationAggregates(
    messageUuids,
    ownerKey,
  );

  for (const tag of closedTags) {
    closeTag(notifications.closeByTag, tag);
  }

  closeMessageTags(notifications.closeByTag, untrackedMessageUuids, ownerKey);
}
