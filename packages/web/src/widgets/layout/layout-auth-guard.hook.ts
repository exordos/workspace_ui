import { useEffect } from "react";
import { authIdleTimeoutToMs } from "~/features/settings/auth-idle-timeout.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { initAuthGuard } from "~/shared/lib/auth-guard";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push/push.service";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { NavigateFunction } from "react-router-dom";

export function useLayoutAuthGuard(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked";
  navigate: NavigateFunction;
}): void {
  const { currentInstanceId, currentUserStatus, navigate } = options;
  const authIdleTimeout = useSettingsStore((s) => s.authIdleTimeout);

  // Session timeout: auto-logout after configured inactivity period when user is authenticated.
  useEffect(() => {
    if (!currentInstanceId || (currentUserStatus !== "ready" && currentUserStatus !== "degraded")) {
      return;
    }
    const timeoutMs = authIdleTimeoutToMs(authIdleTimeout);
    if (timeoutMs == null) return;
    const cleanup = initAuthGuard({
      timeoutMs,
      onBeforeSessionExpired: () => {
        void pushService.unregister().catch((err) => {
          reportUnexpectedError("push", err, { phase: "session-expired-unregister" });
        });
      },
      onSessionExpired: () => {
        void navigate(withCurrentOrgRoute("/login"));
      },
    });
    return cleanup;
  }, [authIdleTimeout, currentInstanceId, currentUserStatus, navigate]);
}
