import { useEffect } from "react";
import { setAuthErrorHandler } from "~/shared/api/client";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
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
      void navigate(withCurrentOrgRoute("/login"));
    });
    return () => {
      setAuthErrorHandler(null);
    };
  }, [currentInstanceId, currentUserStatus, navigate]);
}
