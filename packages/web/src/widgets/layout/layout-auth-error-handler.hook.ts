import { useEffect } from "react";
import { setAuthErrorHandler } from "~/shared/api/client";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push/push.service";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { NavigateFunction } from "react-router-dom";

export function useLayoutAuthErrorHandler(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked";
  navigate: NavigateFunction;
}): void {
  const { currentInstanceId, currentUserStatus, navigate } = options;

  // Auth expiry: auto-logout on protected API 401 responses.
  useEffect(() => {
    if (!currentInstanceId || (currentUserStatus !== "ready" && currentUserStatus !== "degraded")) {
      setAuthErrorHandler(null);
      return;
    }
    setAuthErrorHandler(() => {
      void pushService.unregister().catch((err) => reportUnexpectedError("push:unregister", err));
      void navigate(withCurrentOrgRoute("/login"));
    });
    return () => {
      setAuthErrorHandler(null);
    };
  }, [currentInstanceId, currentUserStatus, navigate]);
}
