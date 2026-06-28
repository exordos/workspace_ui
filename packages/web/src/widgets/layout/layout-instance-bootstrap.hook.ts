import { useCallback } from "react";
import { buildMuteSnapshotFromBootstrap } from "~/features/mute-chat/mute-chat.model";
import type {
  StreamNotificationMode,
  TopicNotificationMode,
} from "~/features/mute-chat/notification-level.lib";
import type { MessengerMeStream, MessengerStreamTopic } from "~/shared/api/messenger.types";

export interface LayoutMuteSnapshot {
  mutedStreamIds: string[];
  streamNotificationModes: { streamId: string; mode: StreamNotificationMode }[];
  topicNotificationModes: { streamId: string; topic: string; mode: TopicNotificationMode }[];
}

export interface LayoutMuteBootstrapData {
  subscriptions?: MessengerMeStream[];
  streamTopics?: MessengerStreamTopic[];
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
          streamTopics: bootstrap?.streamTopics,
        }),
      );
    },
    [],
  );

  return { loadMuteSnapshot };
}
