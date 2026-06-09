import type { MockMessage } from "~/shared/api/zulip.types";
import { isUnreadMessageFromOthers } from "./message-unread-boundary.lib";

/** True when the message bubble starts at or below the scroll root bottom edge. */
export function isMessageNodeBelowViewport(
  nodeRect: DOMRectReadOnly,
  rootRect: DOMRectReadOnly,
): boolean {
  return nodeRect.top >= rootRect.bottom;
}

/**
 * Counts unread messages from others that sit fully below the scroll viewport.
 * Used for the scroll-to-bottom badge when the user has scrolled up in chat.
 */
export function countUnreadMessagesBelowViewport(
  root: HTMLElement,
  messages: readonly MockMessage[],
  currentUserId: number | null | undefined,
): number {
  const rootRect = root.getBoundingClientRect();
  let count = 0;
  for (const message of messages) {
    if (!isUnreadMessageFromOthers(message, currentUserId)) {
      continue;
    }
    const node = root.querySelector<HTMLElement>(`[data-message-id="${message.id}"]`);
    if (node == null) {
      continue;
    }
    if (isMessageNodeBelowViewport(node.getBoundingClientRect(), rootRect)) {
      count += 1;
    }
  }
  return count;
}
