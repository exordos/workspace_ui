import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { formatNotificationTitle } from "./layout-notification-title.lib";
import {
  consumeReadMessagesFromNotificationAggregates,
  drainAllNotificationAggregateTags,
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
): void {
  for (const messageId of messageIds) {
    closeTag(closeByTag, `msg-${messageId}`);
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

export function closeAllActiveMessageNotifications(notifications: NotificationTagActions): void {
  for (const tag of drainAllNotificationAggregateTags()) {
    closeTag(notifications.closeByTag, tag);
  }
}

export function closeReadMessageNotifications(
  notifications: NotificationTagActions,
  messageIds: number[],
): void {
  const { closedTags, updatedSnapshots, untrackedMessageIds } =
    consumeReadMessagesFromNotificationAggregates(messageIds);

  for (const tag of closedTags) {
    closeTag(notifications.closeByTag, tag);
  }

  closeMessageTags(notifications.closeByTag, untrackedMessageIds);

  for (const snapshot of updatedSnapshots) {
    void showUpdatedAggregateNotification(notifications, snapshot).catch((err) => {
      reportUnexpectedError("layout:notification", err, {
        messageId: snapshot.lastMessageId,
        phase: "update-after-read",
      });
    });
  }
}
