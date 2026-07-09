import { useEffect } from "react";
import { useDraftStore } from "./draft.model";

export function useHydrateDrafts(
  currentInstanceId: string | null,
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked",
): void {
  useEffect(() => {
    if (!currentInstanceId || (currentUserStatus !== "ready" && currentUserStatus !== "degraded")) {
      useDraftStore.getState().clear();
    }
  }, [currentInstanceId, currentUserStatus]);
}
