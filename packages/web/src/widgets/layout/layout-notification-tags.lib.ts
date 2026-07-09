import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { buildWorkspaceNotificationFallbackTag } from "./layout-notification-tag.lib";
import { formatNotificationTitle } from "./layout-notification-title.lib";
import {
  consumeReadMessagesFromNotificationAggregates,
  drainNotificationAggregateTagsForOwner,
} from "./notification-aggregate-registry.lib";

interface NotificationTagActions {
  show: (options: {
    title: string;
    body: string;
    tag: string;
    silent?: boolean;
    clickRoute?: string;
  }) => Promise<unknown>;
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

async function showUpdatedAggregateNotification(
  notifications: NotificationTagActions,
  snapshot: ReturnType<
    typeof consumeReadMessagesFromNotificationAggregates
  >["updatedSnapshots"][number],
): Promise<void> {
  await notifications.show({
    title: formatNotificationTitle(snapshot.titleContext, snapshot.count),
    body: snapshot.latestBody,
    tag: snapshot.tag,
    silent: true,
    ...(snapshot.latestClickRoute != null ? { clickRoute: snapshot.latestClickRoute } : {}),
  });
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
  const { closedTags, updatedSnapshots, untrackedMessageUuids } =
    consumeReadMessagesFromNotificationAggregates(messageUuids, ownerKey);

  for (const tag of closedTags) {
    closeTag(notifications.closeByTag, tag);
  }

  closeMessageTags(notifications.closeByTag, untrackedMessageUuids, ownerKey);

  for (const snapshot of updatedSnapshots) {
    void showUpdatedAggregateNotification(notifications, snapshot).catch((err) => {
      reportUnexpectedError("layout:notification", err, {
        messageUuid: snapshot.lastMessageUuid,
        phase: "update-after-read",
      });
    });
  }
}
