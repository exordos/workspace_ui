/**
 * Mute store — tracks stream notification modes and topic visibility overrides.
 *
 * Streams are populated from Workspace `notification_mode`. Topics are populated from
 * user topic visibility metadata and updated optimistically when the user toggles them.
 */

import { create } from "zustand";
import type { MessengerSubscription } from "~/shared/api/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";
import { WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE } from "~/shared/lib/stream-notification-resolve.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  deriveStreamNotificationLevel,
  deriveTopicNotificationLevel,
  deriveTopicVisibilityLevel,
  parseStreamNotificationMode,
  type NotificationLevel,
  type StreamNotificationMode,
  type TopicVisibilityLevel,
} from "./notification-level.lib";

export function topicKey(streamId: string, topic: string): string {
  const normalizedTopic = normalizeTopicForIdentity(topic).toLowerCase();
  return `${streamId}:${normalizedTopic}`;
}

function buildMutedStreamIdsFromModes(
  streamNotificationModes: ReadonlyMap<string, StreamNotificationMode>,
): Set<string> {
  const mutedStreamIds = new Set<string>();
  for (const [streamId, mode] of streamNotificationModes) {
    if (mode === "muted") {
      mutedStreamIds.add(streamId);
    }
  }
  return mutedStreamIds;
}

function applyStreamNotificationMode(
  state: Pick<MuteStoreState, "streamNotificationModes">,
  streamId: string,
  mode: StreamNotificationMode,
): Pick<MuteStoreState, "mutedStreamIds" | "streamNotificationModes"> {
  const nextModes = new Map(state.streamNotificationModes);
  nextModes.set(streamId, mode);
  return {
    mutedStreamIds: buildMutedStreamIdsFromModes(nextModes),
    streamNotificationModes: nextModes,
  };
}

interface MuteStoreState {
  mutedStreamIds: Set<string>;
  mutedTopicKeys: Set<string>;
  unmutedTopicKeys: Set<string>;
  followedTopicKeys: Set<string>;
  streamNotificationModes: Map<string, StreamNotificationMode>;

  muteStream: (streamId: string) => void;
  unmuteStream: (streamId: string) => void;
  muteTopic: (streamId: string, topic: string) => void;
  unmuteTopic: (streamId: string, topic: string) => void;
  followTopic: (streamId: string, topic: string) => void;
  clearTopicVisibilityOverride: (streamId: string, topic: string) => void;
  setStreamNotificationMode: (streamId: string, mode: StreamNotificationMode) => void;

  isStreamMuted: (streamId: string) => boolean;
  isTopicMuted: (streamId: string, topic: string) => boolean;
  isTopicUnmuted: (streamId: string, topic: string) => boolean;
  isTopicFollowed: (streamId: string, topic: string) => boolean;
  isEffectivelyMuted: (streamId: string, topic: string) => boolean;
  getStreamNotificationMode: (streamId: string) => StreamNotificationMode;
  getStreamNotificationLevel: (streamId: string) => NotificationLevel;
  getTopicVisibilityLevel: (streamId: string, topic: string) => TopicVisibilityLevel;
  getTopicNotificationLevel: (streamId: string, topic: string) => NotificationLevel;

  setFromServer: (data: {
    mutedStreamIds?: string[];
    mutedTopics: { streamId: string; topic: string }[];
    unmutedTopics: { streamId: string; topic: string }[];
    followedTopics: { streamId: string; topic: string }[];
    streamNotificationModes?: { streamId: string; mode: StreamNotificationMode }[];
  }) => void;

  clear: () => void;
}

export const useMuteStore = create<MuteStoreState>((set, get) => ({
  mutedStreamIds: new Set(),
  mutedTopicKeys: new Set(),
  unmutedTopicKeys: new Set(),
  followedTopicKeys: new Set(),
  streamNotificationModes: new Map(),

  muteStream(streamId) {
    logStoreAction("mute", "muteStream", { streamId });
    set((s) => applyStreamNotificationMode(s, streamId, "muted"));
  },

  unmuteStream(streamId) {
    logStoreAction("mute", "unmuteStream", { streamId });
    set((s) => applyStreamNotificationMode(s, streamId, "mentions_only"));
  },

  muteTopic(streamId, topic) {
    logStoreAction("mute", "muteTopic", { streamId, topic });
    set((s) => {
      const key = topicKey(streamId, topic);
      const nextMuted = new Set(s.mutedTopicKeys);
      const nextUnmuted = new Set(s.unmutedTopicKeys);
      const nextFollowed = new Set(s.followedTopicKeys);
      nextMuted.add(key);
      nextUnmuted.delete(key);
      nextFollowed.delete(key);
      return {
        mutedTopicKeys: nextMuted,
        unmutedTopicKeys: nextUnmuted,
        followedTopicKeys: nextFollowed,
      };
    });
  },

  unmuteTopic(streamId, topic) {
    logStoreAction("mute", "unmuteTopic", { streamId, topic });
    set((s) => {
      const key = topicKey(streamId, topic);
      const nextMuted = new Set(s.mutedTopicKeys);
      const nextUnmuted = new Set(s.unmutedTopicKeys);
      const nextFollowed = new Set(s.followedTopicKeys);
      nextMuted.delete(key);
      nextUnmuted.add(key);
      nextFollowed.delete(key);
      return {
        mutedTopicKeys: nextMuted,
        unmutedTopicKeys: nextUnmuted,
        followedTopicKeys: nextFollowed,
      };
    });
  },

  followTopic(streamId, topic) {
    logStoreAction("mute", "followTopic", { streamId, topic });
    set((s) => {
      const key = topicKey(streamId, topic);
      const nextMuted = new Set(s.mutedTopicKeys);
      const nextUnmuted = new Set(s.unmutedTopicKeys);
      const nextFollowed = new Set(s.followedTopicKeys);
      nextMuted.delete(key);
      nextUnmuted.delete(key);
      nextFollowed.add(key);
      return {
        mutedTopicKeys: nextMuted,
        unmutedTopicKeys: nextUnmuted,
        followedTopicKeys: nextFollowed,
      };
    });
  },

  clearTopicVisibilityOverride(streamId, topic) {
    logStoreAction("mute", "clearTopicVisibilityOverride", { streamId, topic });
    set((s) => {
      const key = topicKey(streamId, topic);
      const nextMuted = new Set(s.mutedTopicKeys);
      const nextUnmuted = new Set(s.unmutedTopicKeys);
      const nextFollowed = new Set(s.followedTopicKeys);
      nextMuted.delete(key);
      nextUnmuted.delete(key);
      nextFollowed.delete(key);
      return {
        mutedTopicKeys: nextMuted,
        unmutedTopicKeys: nextUnmuted,
        followedTopicKeys: nextFollowed,
      };
    });
  },

  setStreamNotificationMode(streamId, mode) {
    logStoreAction("mute", "setStreamNotificationMode", { streamId, mode });
    set((s) => applyStreamNotificationMode(s, streamId, mode));
  },

  isStreamMuted(streamId) {
    return get().getStreamNotificationMode(streamId) === "muted";
  },

  isTopicMuted(streamId, topic) {
    return get().mutedTopicKeys.has(topicKey(streamId, topic));
  },

  isTopicUnmuted(streamId, topic) {
    return get().unmutedTopicKeys.has(topicKey(streamId, topic));
  },

  isTopicFollowed(streamId, topic) {
    return get().followedTopicKeys.has(topicKey(streamId, topic));
  },

  isEffectivelyMuted(streamId, topic) {
    const state = get();
    const key = topicKey(streamId, topic);

    if (state.unmutedTopicKeys.has(key)) return false;
    if (state.followedTopicKeys.has(key)) return false;
    if (state.mutedTopicKeys.has(key)) return true;
    if (state.getStreamNotificationMode(streamId) === "muted") return true;

    return false;
  },

  getStreamNotificationMode(streamId) {
    return (
      get().streamNotificationModes.get(streamId) ?? WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE
    );
  },

  getStreamNotificationLevel(streamId) {
    return deriveStreamNotificationLevel(get().getStreamNotificationMode(streamId));
  },

  getTopicVisibilityLevel(streamId, topic) {
    const state = get();
    const key = topicKey(streamId, topic);
    return deriveTopicVisibilityLevel(
      state.followedTopicKeys.has(key),
      state.mutedTopicKeys.has(key),
      state.unmutedTopicKeys.has(key),
    );
  },

  getTopicNotificationLevel(streamId, topic) {
    const state = get();
    const key = topicKey(streamId, topic);
    return deriveTopicNotificationLevel(
      state.followedTopicKeys.has(key),
      state.mutedTopicKeys.has(key),
      state.unmutedTopicKeys.has(key),
      state.isEffectivelyMuted(streamId, topic),
    );
  },

  setFromServer({
    mutedStreamIds = [],
    mutedTopics,
    unmutedTopics,
    followedTopics,
    streamNotificationModes = [],
  }) {
    logStoreAction("mute", "setFromServer", {
      streams: streamNotificationModes.length,
      topics: mutedTopics.length,
      unmuted: unmutedTopics.length,
      followed: followedTopics.length,
    });
    const nextModes = new Map<string, StreamNotificationMode>();
    for (const { streamId, mode } of streamNotificationModes) {
      nextModes.set(streamId, mode);
    }
    for (const streamId of mutedStreamIds) {
      if (!nextModes.has(streamId)) {
        nextModes.set(streamId, "muted");
      }
    }

    set({
      mutedStreamIds: buildMutedStreamIdsFromModes(nextModes),
      mutedTopicKeys: new Set(mutedTopics.map((t) => topicKey(t.streamId, t.topic))),
      unmutedTopicKeys: new Set(unmutedTopics.map((t) => topicKey(t.streamId, t.topic))),
      followedTopicKeys: new Set(followedTopics.map((t) => topicKey(t.streamId, t.topic))),
      streamNotificationModes: nextModes,
    });
  },

  clear() {
    logStoreAction("mute", "clear", {});
    set({
      mutedStreamIds: new Set(),
      mutedTopicKeys: new Set(),
      unmutedTopicKeys: new Set(),
      followedTopicKeys: new Set(),
      streamNotificationModes: new Map(),
    });
  },
}));

/** Builds mute-store snapshot fields from the messenger API subscriptions and user topics. */
export function buildMuteSnapshotFromBootstrap(options: {
  subscriptions?: readonly MessengerSubscription[];
  userTopics?: readonly { stream_uuid: string; topic_name: string; visibility_policy: number }[];
}): {
  mutedStreamIds: string[];
  mutedTopics: { streamId: string; topic: string }[];
  unmutedTopics: { streamId: string; topic: string }[];
  followedTopics: { streamId: string; topic: string }[];
  streamNotificationModes: { streamId: string; mode: StreamNotificationMode }[];
} {
  const subscriptions = options.subscriptions ?? [];
  const userTopics = options.userTopics ?? [];
  const mutedTopics: { streamId: string; topic: string }[] = [];
  const unmutedTopics: { streamId: string; topic: string }[] = [];
  const followedTopics: { streamId: string; topic: string }[] = [];
  const streamNotificationModes: { streamId: string; mode: StreamNotificationMode }[] = [];

  for (const subscription of subscriptions) {
    const mode =
      parseStreamNotificationMode(subscription.notification_mode) ??
      WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE;
    streamNotificationModes.push({ streamId: subscription.stream_uuid, mode });
  }
  const mutedStreamIds = streamNotificationModes
    .filter((row) => row.mode === "muted")
    .map((row) => row.streamId);

  for (const ut of userTopics) {
    if (ut.visibility_policy === 1) {
      mutedTopics.push({ streamId: ut.stream_uuid, topic: ut.topic_name });
    } else if (ut.visibility_policy === 2) {
      unmutedTopics.push({ streamId: ut.stream_uuid, topic: ut.topic_name });
    } else if (ut.visibility_policy === 3) {
      followedTopics.push({ streamId: ut.stream_uuid, topic: ut.topic_name });
    }
  }

  return {
    mutedStreamIds,
    mutedTopics,
    unmutedTopics,
    followedTopics,
    streamNotificationModes,
  };
}
