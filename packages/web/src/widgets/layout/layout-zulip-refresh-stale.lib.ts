// Recovery refresh after reconnect/bad queue — sidebar, active chat, presence, unread; no event-loop reset.
/**
 * Reconnect / bad-queue recovery used by `useLayoutZulipEventLoop` without resetting the long-poll loop.
 */
import { scheduleLayoutReconnectRefresh } from "./layout-reconnect-coordinator.lib";

export interface RunLayoutReconnectRefreshOptions {
  cancelled: boolean;
  instanceId: string | null;
  latestMessageIdRef: { current: number | null };
  focusedMessageId?: number | null;
}

/** After reconnect or bad queue: coalesced full reconnect refresh. */
export function runLayoutReconnectRefresh(options: RunLayoutReconnectRefreshOptions): void {
  const { cancelled, instanceId, latestMessageIdRef, focusedMessageId } = options;
  if (cancelled) return;

  scheduleLayoutReconnectRefresh(
    {
      instanceId,
      latestMessageIdRef,
      focusedMessageId: focusedMessageId ?? null,
      isCancelled: () => cancelled,
    },
    "full",
  );
}
