import { useEffect } from "react";
import { fetchDraftsPage } from "./draft.api";
import { useDraftStore } from "./draft.model";

const DRAFT_PAGE_SIZE = 100;

export async function loadNextDraftPage(signal?: AbortSignal): Promise<void> {
  const store = useDraftStore.getState();
  if (!store.hasMore || store.loading) return;
  store.setLoading(true);
  try {
    const page = await fetchDraftsPage(
      { pageLimit: DRAFT_PAGE_SIZE, pageMarker: store.nextPageMarker ?? undefined },
      signal,
    );
    useDraftStore.getState().appendDraftPage(page.drafts, page.nextPageMarker);
  } finally {
    useDraftStore.getState().setLoading(false);
  }
}

export function useHydrateDrafts(
  currentInstanceId: string | null,
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked",
): void {
  useEffect(() => {
    if (!currentInstanceId || (currentUserStatus !== "ready" && currentUserStatus !== "degraded")) {
      useDraftStore.getState().clear();
      return;
    }

    const controller = new AbortController();
    const store = useDraftStore.getState();
    store.setLoading(true);
    fetchDraftsPage({ pageLimit: DRAFT_PAGE_SIZE }, controller.signal)
      .then((page) => {
        useDraftStore.getState().setDrafts(page.drafts, page.nextPageMarker);
      })
      .catch(() => {
        // Preserve the last known drafts on refresh failure.
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          useDraftStore.getState().setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [currentInstanceId, currentUserStatus]);
}
