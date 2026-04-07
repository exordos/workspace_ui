import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { setAuthErrorHandler } from "~/shared/api/client";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push/push.service";

export function useLayoutAuthErrorHandler(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
  navigate: NavigateFunction;
}): void {
  const { currentInstanceId, currentUserStatus, navigate } = options;

  // Auth expiry: auto-logout on protected API 401 responses.
  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") {
      setAuthErrorHandler(null);
      return;
    }
    setAuthErrorHandler(() => {
      void pushService.unregister().catch(() => {});
      void navigate(withCurrentOrgRoute("/login"));
    });
    return () => {
      setAuthErrorHandler(null);
    };
  }, [currentInstanceId, currentUserStatus, navigate]);
}

