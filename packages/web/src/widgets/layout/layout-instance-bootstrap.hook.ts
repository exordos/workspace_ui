import { useCallback } from "react";
import { buildMuteSnapshotFromBootstrap } from "~/features/mute-chat/mute-chat.model";
import type { MessengerSubscription, MessengerUserTopic } from "~/shared/api/messenger.types";

export interface LayoutMuteSnapshot {
  mutedStreamIds: number[];
  mutedTopics: { streamId: string; topic: string }[];
  unmutedTopics: { streamId: string; topic: string }[];
  followedTopics: { streamId: string; topic: string }[];
  streamDesktopNotifyEnabledIds: number[];
  streamDesktopNotifyDisabledIds: number[];
  streamAudibleNotifyEnabledIds: number[];
  streamAudibleNotifyDisabledIds: number[];
}

export interface LayoutMuteBootstrapData {
  subscriptions?: MessengerSubscription[];
  userTopics?: MessengerUserTopic[];
}

export function useLayoutInstanceBootstrap(_options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked";
}): {
  loadMuteSnapshot: (bootstrap?: LayoutMuteBootstrapData) => Promise<LayoutMuteSnapshot>;
} {
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

  return { loadMuteSnapshot };
}
