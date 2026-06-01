/**
 * Network + tab lifecycle subscriptions for the Zulip event loop.
 */
import { onReconnect, onStatusChange } from "~/shared/lib/network";
import { onTabResume } from "~/shared/lib/visibility";

export interface EventLoopLifecycleCallbacks {
  onTabResume: (hiddenDurationMs: number) => void;
  onReconnect: () => void;
  onOnline: () => void;
  onOffline: () => void;
}

/** Returns teardown for tab resume, reconnect, and online/offline listeners. */
export function attachEventLoopLifecycle(callbacks: EventLoopLifecycleCallbacks): () => void {
  const unsubResume = onTabResume(callbacks.onTabResume);
  const unsubReconnect = onReconnect(callbacks.onReconnect);
  const unsubStatus = onStatusChange((online) => {
    if (online) {
      callbacks.onOnline();
    } else {
      callbacks.onOffline();
    }
  });
  return () => {
    unsubResume();
    unsubReconnect();
    unsubStatus();
  };
}
