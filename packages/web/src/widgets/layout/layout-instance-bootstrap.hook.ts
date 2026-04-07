import { useCallback, useEffect, useRef } from "react";
import { ensureStarredLoaded } from "~/entities/activity/activity-starred-loader.lib";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { fetchSubscriptions, fetchUserTopics } from "~/shared/api/zulip";

export interface LayoutMuteSnapshot {
  mutedStreamIds: number[];
  mutedTopics: { streamId: number; topic: string }[];
  unmutedTopics: { streamId: number; topic: string }[];
}

export function useLayoutInstanceBootstrap(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
}): {
  loadMuteSnapshot: () => Promise<LayoutMuteSnapshot>;
} {
  const { currentInstanceId, currentUserStatus } = options;
  const starredSummaryStale = useActivityStore((s) => s.starredSummary.stale);
  const starredBootstrapInstanceRef = useRef<string | null>(null);

  // Загружает mute-снимок инстанса (muted streams/topics) для консистентной UI-модели.
  const loadMuteSnapshot = useCallback(async (): Promise<LayoutMuteSnapshot> => {
    const [subs, userTopics] = await Promise.all([fetchSubscriptions(), fetchUserTopics()]);
    const mutedStreamIds = subs.filter((s) => s.is_muted).map((s) => s.stream_id);
    const mutedTopics: { streamId: number; topic: string }[] = [];
    const unmutedTopics: { streamId: number; topic: string }[] = [];
    for (const ut of userTopics) {
      if (ut.visibility_policy === 1) {
        mutedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
      } else if (ut.visibility_policy === 2) {
        unmutedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
      }
    }
    return { mutedStreamIds, mutedTopics, unmutedTopics };
  }, []);

  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") return;
    let cancelled = false;

    loadMuteSnapshot()
      .then((snapshot) => {
        if (!cancelled) {
          useMuteStore.getState().setFromServer(snapshot);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentInstanceId, currentUserStatus, loadMuteSnapshot]);

  useEffect(() => {
    // Единый bootstrap starred для общего activity-store.
    // Срабатывает на смену инстанса и на явную invalidation (stale=true).
    if (!currentInstanceId || currentUserStatus !== "ready") {
      starredBootstrapInstanceRef.current = null;
      return;
    }

    const instanceChanged = starredBootstrapInstanceRef.current !== currentInstanceId;
    if (!instanceChanged && !starredSummaryStale) return;

    starredBootstrapInstanceRef.current = currentInstanceId;
    const currentUserId = useChatListStore.getState().currentUserId ?? null;
    void ensureStarredLoaded({
      currentInstanceId,
      currentUserId,
      forceRefresh: starredSummaryStale,
    });
  }, [currentInstanceId, currentUserStatus, starredSummaryStale]);

  return { loadMuteSnapshot };
}
