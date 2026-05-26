import { useEffect } from "react";
import { fetchDrafts } from "./draft.api";
import { useDraftStore } from "./draft.model";

export function useHydrateDrafts(
  currentInstanceId: string | null,
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked",
): void {
  useEffect(() => {
    if (!currentInstanceId || (currentUserStatus !== "ready" && currentUserStatus !== "degraded")) {
      useDraftStore.getState().clear();
      return;
    }

    let cancelled = false;
    fetchDrafts()
      .then((drafts) => {
        if (!cancelled) {
          useDraftStore.getState().setDrafts(drafts);
        }
      })
      .catch(() => {
        // Preserve the last known drafts on refresh failure.
      });

    return () => {
      cancelled = true;
    };
  }, [currentInstanceId, currentUserStatus]);
}
