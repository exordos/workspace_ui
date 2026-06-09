import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { buildNotificationFallbackTag } from "./layout-notification-tag.lib";
import { formatNotificationTitle } from "./layout-notification-title.lib";
import {
  consumeReadMessagesFromNotificationAggregates,
  drainNotificationAggregateTagsForInstance,
} from "./notification-aggregate-registry.lib";

interface NotificationTagActions {
  show: (options: {
    title: string;
    body: string;
    tag: string;
    silent?: boolean;
    clickRoute?: string;
  }) => Promise<void>;
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
  messageIds: number[],
  currentInstanceId: string | null,
): void {
  for (const messageId of messageIds) {
    closeTag(closeByTag, buildNotificationFallbackTag(messageId, currentInstanceId));
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
  currentInstanceId: string | null,
): void {
  for (const tag of drainNotificationAggregateTagsForInstance(currentInstanceId)) {
    closeTag(notifications.closeByTag, tag);
  }
}

export function closeReadMessageNotifications(
  notifications: NotificationTagActions,
  messageIds: number[],
  currentInstanceId: string | null,
): void {
  const { closedTags, updatedSnapshots, untrackedMessageIds } =
    consumeReadMessagesFromNotificationAggregates(messageIds, currentInstanceId);

  for (const tag of closedTags) {
    closeTag(notifications.closeByTag, tag);
  }

  closeMessageTags(notifications.closeByTag, untrackedMessageIds, currentInstanceId);

  for (const snapshot of updatedSnapshots) {
    void showUpdatedAggregateNotification(notifications, snapshot).catch((err) => {
      reportUnexpectedError("layout:notification", err, {
        messageId: snapshot.lastMessageId,
        phase: "update-after-read",
      });
    });
  }
}
