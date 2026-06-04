import { useCallback, useEffect, useRef } from "react";
import { ensureStarredLoaded } from "~/entities/activity/activity-starred-loader.lib";
import { useActivityStore } from "~/entities/activity/activity.model";
import { ensureMentionsUnreadSynced } from "~/entities/chat-list/chat-list-mentions-sync.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { buildMuteSnapshotFromBootstrap } from "~/features/mute-chat/mute-chat.model";
import type { ZulipSubscription, ZulipUserTopic } from "~/shared/api/zulip.types";

export interface LayoutMuteSnapshot {
  mutedStreamIds: number[];
  mutedTopics: { streamId: number; topic: string }[];
  unmutedTopics: { streamId: number; topic: string }[];
  followedTopics: { streamId: number; topic: string }[];
  streamDesktopNotifyEnabledIds: number[];
  streamDesktopNotifyDisabledIds: number[];
  streamAudibleNotifyEnabledIds: number[];
  streamAudibleNotifyDisabledIds: number[];
}

export interface LayoutMuteBootstrapData {
  subscriptions?: ZulipSubscription[];
  userTopics?: ZulipUserTopic[];
}

export function useLayoutInstanceBootstrap(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked";
}): {
  loadMuteSnapshot: (bootstrap?: LayoutMuteBootstrapData) => Promise<LayoutMuteSnapshot>;
} {
  const { currentInstanceId, currentUserStatus } = options;
  const starredSummaryStale = useActivityStore((s) => s.starredSummary.stale);
  const starredBootstrapInstanceRef = useRef<string | null>(null);
  const mentionsBootstrapInstanceRef = useRef<string | null>(null);

  // Load instance mute snapshot (muted streams/topics) for consistent UI.
  const loadMuteSnapshot = useCallback(
    (bootstrap?: LayoutMuteBootstrapData): Promise<LayoutMuteSnapshot> => {
      return Promise.resolve(
        buildMuteSnapshotFromBootstrap({
          subscriptions: bootstrap?.subscriptions,
          userTopics: bootstrap?.userTopics,
        }),
      );
    },
    [],
  );

  useEffect(() => {
    // Shared starred bootstrap for activity store — on instance switch or stale invalidation.
    if (!currentInstanceId || (currentUserStatus !== "ready" && currentUserStatus !== "degraded")) {
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

  useEffect(() => {
    if (!currentInstanceId || (currentUserStatus !== "ready" && currentUserStatus !== "degraded")) {
      mentionsBootstrapInstanceRef.current = null;
      return;
    }

    const instanceChanged = mentionsBootstrapInstanceRef.current !== currentInstanceId;
    const needsSync = instanceChanged || !useChatListStore.getState().mentionsUnreadApiSynced;
    if (!needsSync) return;

    mentionsBootstrapInstanceRef.current = currentInstanceId;
    const currentUserId = useChatListStore.getState().currentUserId ?? null;
    void ensureMentionsUnreadSynced({
      currentInstanceId,
      currentUserId,
      forceRefresh: instanceChanged,
    });
  }, [currentInstanceId, currentUserStatus]);

  return { loadMuteSnapshot };
}
