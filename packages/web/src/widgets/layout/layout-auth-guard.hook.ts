import { useEffect } from "react";
import { useSettingsStore } from "~/features/settings/settings.model";
import type { AuthIdleTimeout } from "~/features/settings/settings.types";
import { initAuthGuard } from "~/shared/lib/auth-guard";
import { assertNever } from "~/shared/lib/guards";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push/push.service";
import type { NavigateFunction } from "react-router-dom";

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

export function authIdleTimeoutToMs(timeout: AuthIdleTimeout): number | null {
  switch (timeout) {
    case "6h":
      return 6 * HOURS;
    case "12h":
      return 12 * HOURS;
    case "24h":
      return 24 * HOURS;
    case "3d":
      return 3 * DAYS;
    case "7d":
      return 7 * DAYS;
    case "never":
      return null;
    default:
      return assertNever(timeout);
  }
}

export function useLayoutAuthGuard(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
  navigate: NavigateFunction;
}): void {
  const { currentInstanceId, currentUserStatus, navigate } = options;
  const authIdleTimeout = useSettingsStore((s) => s.authIdleTimeout);

  // Session timeout: auto-logout after configured inactivity period when user is authenticated.
  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") return;
    const timeoutMs = authIdleTimeoutToMs(authIdleTimeout);
    if (timeoutMs == null) return;
    const cleanup = initAuthGuard({
      timeoutMs,
      onBeforeSessionExpired: () => {
        void pushService.unregister().catch(() => {});
      },
      onSessionExpired: () => {
        void navigate(withCurrentOrgRoute("/login"));
      },
    });
    return cleanup;
  }, [authIdleTimeout, currentInstanceId, currentUserStatus, navigate]);
}
