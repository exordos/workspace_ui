/**
 * Mute store — tracks stream and topic notification modes.
 *
 * Streams and topics are populated from Workspace `notification_mode` fields and updated
 * optimistically when the user toggles them.
 */

import { create } from "zustand";
import type { MessengerMeStream, MessengerStreamTopic } from "~/shared/api/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";
import { WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE } from "~/shared/lib/stream-notification-resolve.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE } from "~/shared/lib/topic-notification-resolve.lib";
import {
  deriveStreamNotificationLevel,
  deriveTopicNotificationLevel,
  deriveTopicVisibilityLevel,
  parseStreamNotificationMode,
  parseTopicNotificationMode,
  type NotificationLevel,
  type StreamNotificationMode,
  type TopicNotificationMode,
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

function applyTopicNotificationMode(
  state: Pick<MuteStoreState, "topicNotificationModes">,
  streamId: string,
  topic: string,
  mode: TopicNotificationMode,
): Pick<MuteStoreState, "topicNotificationModes"> {
  const key = topicKey(streamId, topic);
  const nextModes = new Map(state.topicNotificationModes);
  if (mode === WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE) {
    nextModes.delete(key);
  } else {
    nextModes.set(key, mode);
  }
  return { topicNotificationModes: nextModes };
}

interface MuteStoreState {
  mutedStreamIds: Set<string>;
  streamNotificationModes: Map<string, StreamNotificationMode>;
  topicNotificationModes: Map<string, TopicNotificationMode>;

  muteStream: (streamId: string) => void;
  unmuteStream: (streamId: string) => void;
  muteTopic: (streamId: string, topic: string) => void;
  unmuteTopic: (streamId: string, topic: string) => void;
  followTopic: (streamId: string, topic: string) => void;
  clearTopicVisibilityOverride: (streamId: string, topic: string) => void;
  setStreamNotificationMode: (streamId: string, mode: StreamNotificationMode) => void;
  setTopicNotificationMode: (streamId: string, topic: string, mode: TopicNotificationMode) => void;

  isStreamMuted: (streamId: string) => boolean;
  isTopicMuted: (streamId: string, topic: string) => boolean;
  isTopicUnmuted: (streamId: string, topic: string) => boolean;
  isTopicFollowed: (streamId: string, topic: string) => boolean;
  isEffectivelyMuted: (streamId: string, topic: string) => boolean;
  getStreamNotificationMode: (streamId: string) => StreamNotificationMode;
  getStreamNotificationLevel: (streamId: string) => NotificationLevel;
  getTopicNotificationMode: (streamId: string, topic: string) => TopicNotificationMode;
  getTopicVisibilityLevel: (streamId: string, topic: string) => TopicVisibilityLevel;
  getTopicNotificationLevel: (streamId: string, topic: string) => NotificationLevel;

  setFromServer: (data: {
    mutedStreamIds?: string[];
    streamNotificationModes?: { streamId: string; mode: StreamNotificationMode }[];
    topicNotificationModes?: { streamId: string; topic: string; mode: TopicNotificationMode }[];
  }) => void;

  clear: () => void;
}

export const useMuteStore = create<MuteStoreState>((set, get) => ({
  mutedStreamIds: new Set(),
  streamNotificationModes: new Map(),
  topicNotificationModes: new Map(),

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
    set((s) => applyTopicNotificationMode(s, streamId, topic, "mute"));
  },

  unmuteTopic(streamId, topic) {
    logStoreAction("mute", "unmuteTopic", { streamId, topic });
    set((s) => applyTopicNotificationMode(s, streamId, topic, "unmute"));
  },

  followTopic(streamId, topic) {
    logStoreAction("mute", "followTopic", { streamId, topic });
    set((s) => applyTopicNotificationMode(s, streamId, topic, "follow"));
  },

  clearTopicVisibilityOverride(streamId, topic) {
    logStoreAction("mute", "clearTopicVisibilityOverride", { streamId, topic });
    set((s) =>
      applyTopicNotificationMode(s, streamId, topic, WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE),
    );
  },

  setStreamNotificationMode(streamId, mode) {
    logStoreAction("mute", "setStreamNotificationMode", { streamId, mode });
    set((s) => applyStreamNotificationMode(s, streamId, mode));
  },

  setTopicNotificationMode(streamId, topic, mode) {
    logStoreAction("mute", "setTopicNotificationMode", { streamId, topic, mode });
    set((s) => applyTopicNotificationMode(s, streamId, topic, mode));
  },

  isStreamMuted(streamId) {
    return get().getStreamNotificationMode(streamId) === "muted";
  },

  isTopicMuted(streamId, topic) {
    return get().getTopicNotificationMode(streamId, topic) === "mute";
  },

  isTopicUnmuted(streamId, topic) {
    return get().getTopicNotificationMode(streamId, topic) === "unmute";
  },

  isTopicFollowed(streamId, topic) {
    return get().getTopicNotificationMode(streamId, topic) === "follow";
  },

  isEffectivelyMuted(streamId, topic) {
    const state = get();
    const mode = state.getTopicNotificationMode(streamId, topic);

    if (mode === "unmute" || mode === "follow") return false;
    if (mode === "mute") return true;
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

  getTopicNotificationMode(streamId, topic) {
    return (
      get().topicNotificationModes.get(topicKey(streamId, topic)) ??
      WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE
    );
  },

  getTopicVisibilityLevel(streamId, topic) {
    return deriveTopicVisibilityLevel(get().getTopicNotificationMode(streamId, topic));
  },

  getTopicNotificationLevel(streamId, topic) {
    const state = get();
    return deriveTopicNotificationLevel(
      state.getTopicNotificationMode(streamId, topic),
      state.isEffectivelyMuted(streamId, topic),
    );
  },

  setFromServer({
    mutedStreamIds = [],
    streamNotificationModes = [],
    topicNotificationModes = [],
  }) {
    logStoreAction("mute", "setFromServer", {
      streams: streamNotificationModes.length,
      topics: topicNotificationModes.length,
    });
    const nextStreamModes = new Map<string, StreamNotificationMode>();
    for (const { streamId, mode } of streamNotificationModes) {
      nextStreamModes.set(streamId, mode);
    }
    for (const streamId of mutedStreamIds) {
      if (!nextStreamModes.has(streamId)) {
        nextStreamModes.set(streamId, "muted");
      }
    }

    const nextTopicModes = new Map<string, TopicNotificationMode>();
    for (const { streamId, topic, mode } of topicNotificationModes) {
      if (mode === WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE) continue;
      nextTopicModes.set(topicKey(streamId, topic), mode);
    }

    set({
      mutedStreamIds: buildMutedStreamIdsFromModes(nextStreamModes),
      streamNotificationModes: nextStreamModes,
      topicNotificationModes: nextTopicModes,
    });
  },

  clear() {
    logStoreAction("mute", "clear", {});
    set({
      mutedStreamIds: new Set(),
      streamNotificationModes: new Map(),
      topicNotificationModes: new Map(),
    });
  },
}));

/** Builds mute-store snapshot fields from the messenger API streams and topics. */
export function buildMuteSnapshotFromBootstrap(options: {
  subscriptions?: readonly MessengerMeStream[];
  streamTopics?: readonly MessengerStreamTopic[];
}): {
  mutedStreamIds: string[];
  streamNotificationModes: { streamId: string; mode: StreamNotificationMode }[];
  topicNotificationModes: { streamId: string; topic: string; mode: TopicNotificationMode }[];
} {
  const subscriptions = options.subscriptions ?? [];
  const streamTopics = options.streamTopics ?? [];
  const streamNotificationModes: { streamId: string; mode: StreamNotificationMode }[] = [];
  const topicNotificationModes: {
    streamId: string;
    topic: string;
    mode: TopicNotificationMode;
  }[] = [];

  for (const subscription of subscriptions) {
    const mode =
      parseStreamNotificationMode(subscription.notification_mode) ??
      WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE;
    streamNotificationModes.push({ streamId: subscription.stream_uuid, mode });
  }
  const mutedStreamIds = streamNotificationModes
    .filter((row) => row.mode === "muted")
    .map((row) => row.streamId);

  for (const topic of streamTopics) {
    const mode =
      parseTopicNotificationMode(topic.notification_mode) ??
      WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE;
    topicNotificationModes.push({ streamId: topic.stream_uuid, topic: topic.uuid, mode });
  }

  return {
    mutedStreamIds,
    streamNotificationModes,
    topicNotificationModes,
  };
}
