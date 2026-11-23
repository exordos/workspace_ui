import { useLayoutEffect } from "react";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { authIdleTimeoutToMs } from "~/features/settings/auth-idle-timeout.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { onPowerResume } from "~/shared/lib/power";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "click"];
const ACTIVITY_LISTENER_OPTIONS = { capture: true, passive: false };
const ACTIVITY_WRITE_INTERVAL_MS = 30_000;

function readLastActivity(key: string): number {
  try {
    const timestamp = Number(window.localStorage.getItem(key));
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  } catch {
    // The timer still works in memory when storage is unavailable.
  }
  return 0;
}

export function useLayoutAuthGuard(): void {
  const selection = useWorkspaceAuthStore((state) => state.sessionSelectionGeneration);

  useLayoutEffect(() => {
    const session = useWorkspaceAuthStore.getState().getCurrentSession();
    if (session == null) return;

    const { accountId } = session;
    const activityKey = `workspace-auth-last-activity-at:${workspaceRuntimeOwnerKey(session)}`;
    let persistedAt = readLastActivity(activityKey);
    let lastActivityAt = Math.max(persistedAt, session.authorizedAtMs ?? 0) || Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const isCurrentSelection = () => {
      const current = useWorkspaceAuthStore.getState();
      return (
        !disposed &&
        current.sessionSelectionGeneration === selection &&
        current.currentAccountId === accountId
      );
    };

    const persistActivity = () => {
      if (lastActivityAt <= persistedAt) return;
      try {
        window.localStorage.setItem(activityKey, String(lastActivityAt));
        persistedAt = lastActivityAt;
      } catch {
        // Keep the in-memory deadline.
      }
    };

    const checkDeadline = (now: number, schedule: boolean): boolean => {
      if (!isCurrentSelection()) return false;
      const timeout = authIdleTimeoutToMs(useSettingsStore.getState().authIdleTimeout);
      if (timeout == null) return false;

      const remaining = lastActivityAt + timeout - now;
      if (remaining <= 0) {
        useWorkspaceAuthStore.getState().requireReauthorization(accountId);
        return true;
      }
      if (schedule) timer = setTimeout(reschedule, remaining);
      return false;
    };

    function reschedule() {
      clearTimeout(timer);
      checkDeadline(Date.now(), true);
    }

    const recordActivity = (event: Event) => {
      if (!event.isTrusted || !isCurrentSelection()) return;
      const now = Date.now();
      if (checkDeadline(now, false)) {
        // A gesture after sleep must not act on the old authorized screen.
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (document.visibilityState === "hidden" || !document.hasFocus()) return;
      lastActivityAt = Math.max(lastActivityAt, now);
      if (lastActivityAt - persistedAt >= ACTIVITY_WRITE_INTERVAL_MS) persistActivity();
    };
    const handleVisibility = () => {
      persistActivity();
      reschedule();
    };

    persistActivity();
    reschedule();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, recordActivity, ACTIVITY_LISTENER_OPTIONS);
    }
    window.addEventListener("focus", reschedule);
    window.addEventListener("pageshow", reschedule);
    window.addEventListener("pagehide", persistActivity);
    document.addEventListener("visibilitychange", handleVisibility);
    const stopResume = onPowerResume(reschedule);
    const stopSettings = useSettingsStore.subscribe((next, previous) => {
      if (next.authIdleTimeout !== previous.authIdleTimeout) reschedule();
    });

    return () => {
      disposed = true;
      clearTimeout(timer);
      persistActivity();
      stopResume();
      stopSettings();
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, recordActivity, true);
      window.removeEventListener("focus", reschedule);
      window.removeEventListener("pageshow", reschedule);
      window.removeEventListener("pagehide", persistActivity);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [selection]);
}
