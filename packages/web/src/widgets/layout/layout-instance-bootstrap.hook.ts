import { useCallback, useEffect, useRef } from "react";
import { ensureStarredLoaded } from "~/entities/activity/activity-starred-loader.lib";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { ZulipSubscription, ZulipUserTopic } from "~/shared/api/zulip.types";

export interface LayoutMuteSnapshot {
  mutedStreamIds: number[];
  mutedTopics: { streamId: number; topic: string }[];
  unmutedTopics: { streamId: number; topic: string }[];
  followedTopics: { streamId: number; topic: string }[];
}

export interface LayoutMuteBootstrapData {
  subscriptions?: ZulipSubscription[];
  userTopics?: ZulipUserTopic[];
}

export function useLayoutInstanceBootstrap(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
}): {
  loadMuteSnapshot: (bootstrap?: LayoutMuteBootstrapData) => Promise<LayoutMuteSnapshot>;
} {
  const { currentInstanceId, currentUserStatus } = options;
  const starredSummaryStale = useActivityStore((s) => s.starredSummary.stale);
  const starredBootstrapInstanceRef = useRef<string | null>(null);

  // Загружает mute-снимок инстанса (muted streams/topics) для консистентной UI-модели.
  const loadMuteSnapshot = useCallback(
    (bootstrap?: LayoutMuteBootstrapData): Promise<LayoutMuteSnapshot> => {
      const subscriptions = bootstrap?.subscriptions ?? [];
      const userTopics = bootstrap?.userTopics ?? [];
      const mutedStreamIds = subscriptions.filter((s) => s.is_muted).map((s) => s.stream_id);
      const mutedTopics: { streamId: number; topic: string }[] = [];
      const unmutedTopics: { streamId: number; topic: string }[] = [];
      const followedTopics: { streamId: number; topic: string }[] = [];
      for (const ut of userTopics) {
        if (ut.visibility_policy === 1) {
          mutedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
        } else if (ut.visibility_policy === 2) {
          unmutedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
        } else if (ut.visibility_policy === 3) {
          followedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
        }
      }
      return Promise.resolve({ mutedStreamIds, mutedTopics, unmutedTopics, followedTopics });
    },
    [],
  );

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
