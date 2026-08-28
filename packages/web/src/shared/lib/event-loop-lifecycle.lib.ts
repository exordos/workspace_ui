/**
 * Network + tab lifecycle subscriptions for the Zulip event loop.
 */
import { onReconnect, onStatusChange } from "~/shared/lib/network";
import { onPowerResume } from "~/shared/lib/power";
import { onTabResume } from "~/shared/lib/visibility";

export interface EventLoopLifecycleCallbacks {
  onTabResume: (hiddenDurationMs: number) => void;
  onReconnect: () => void;
  onOnline: () => void;
  onOffline: () => void;
}

/** Returns teardown for tab resume, machine wake, reconnect, and online/offline listeners. */
export function attachEventLoopLifecycle(callbacks: EventLoopLifecycleCallbacks): () => void {
  const unsubResume = onTabResume(callbacks.onTabResume);
  // Waking from sleep leaves the same stale state as a long-hidden tab, and the
  // socket watchdog would otherwise take a further minute to notice.
  const unsubPowerResume = onPowerResume(() => callbacks.onTabResume(0));
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
    unsubPowerResume();
    unsubReconnect();
    unsubStatus();
  };
}
