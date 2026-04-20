import { useEffect } from "react";
import { initAuthGuard } from "~/shared/lib/auth-guard";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push/push.service";
import type { NavigateFunction } from "react-router-dom";

export function useLayoutAuthGuard(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
  navigate: NavigateFunction;
}): void {
  const { currentInstanceId, currentUserStatus, navigate } = options;

  // Session timeout: auto-logout after 24h inactivity when user is authenticated
  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") return;
    const cleanup = initAuthGuard({
      onBeforeSessionExpired: () => {
        void pushService.unregister().catch(() => {});
      },
      onSessionExpired: () => {
        void navigate(withCurrentOrgRoute("/login"));
      },
    });
    return cleanup;
  }, [currentInstanceId, currentUserStatus, navigate]);
}

