import { useCallback } from "react";
import { buildMuteSnapshotFromBootstrap } from "~/features/mute-chat/mute-chat.model";
import type { StreamNotificationMode } from "~/features/mute-chat/notification-level.lib";
import type { MessengerSubscription, MessengerUserTopic } from "~/shared/api/messenger.types";

export interface LayoutMuteSnapshot {
  mutedStreamIds: string[];
  mutedTopics: { streamId: string; topic: string }[];
  unmutedTopics: { streamId: string; topic: string }[];
  followedTopics: { streamId: string; topic: string }[];
  streamNotificationModes: { streamId: string; mode: StreamNotificationMode }[];
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
