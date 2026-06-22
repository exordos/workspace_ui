/**
 * Mute store — tracks which streams and topics the user has muted.
 *
 * Populated from channel and topic visibility metadata. Updated optimistically when the user
 * toggles mute in the UI.
 */

import { create } from "zustand";
import type { MessengerSubscription } from "~/shared/api/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  deriveStreamNotificationLevel,
  deriveTopicNotificationLevel,
  deriveTopicVisibilityLevel,
  type NotificationLevel,
  type TopicVisibilityLevel,
} from "./notification-level.lib";

export function topicKey(streamId: string, topic: string): string {
  const normalizedTopic = normalizeTopicForIdentity(topic).toLowerCase();
  return `${streamId}:${normalizedTopic}`;
}

function applySubscriptionNotificationOverrides(
  streamDesktopNotifyEnabledIds: Set<string>,
  streamDesktopNotifyDisabledIds: Set<string>,
  streamAudibleNotifyEnabledIds: Set<string>,
  streamAudibleNotifyDisabledIds: Set<string>,
  subscription: MessengerSubscription,
): void {
  const streamId = subscription.stream_uuid;
  if (subscription.desktop_notifications === true) {
    streamDesktopNotifyEnabledIds.add(streamId);
    streamDesktopNotifyDisabledIds.delete(streamId);
  } else if (subscription.desktop_notifications === false) {
    streamDesktopNotifyDisabledIds.add(streamId);
    streamDesktopNotifyEnabledIds.delete(streamId);
  } else {
    streamDesktopNotifyEnabledIds.delete(streamId);
    streamDesktopNotifyDisabledIds.delete(streamId);
  }

  if (subscription.audible_notifications === true) {
    streamAudibleNotifyEnabledIds.add(streamId);
    streamAudibleNotifyDisabledIds.delete(streamId);
  } else if (subscription.audible_notifications === false) {
    streamAudibleNotifyDisabledIds.add(streamId);
    streamAudibleNotifyEnabledIds.delete(streamId);
  } else {
    streamAudibleNotifyEnabledIds.delete(streamId);
    streamAudibleNotifyDisabledIds.delete(streamId);
  }
}

interface MuteStoreState {
  mutedStreamIds: Set<string>;
  mutedTopicKeys: Set<string>;
  unmutedTopicKeys: Set<string>;
  followedTopicKeys: Set<string>;
  streamDesktopNotifyEnabledIds: Set<string>;
  streamDesktopNotifyDisabledIds: Set<string>;
  streamAudibleNotifyEnabledIds: Set<string>;
  streamAudibleNotifyDisabledIds: Set<string>;

  muteStream: (streamId: string) => void;
  unmuteStream: (streamId: string) => void;
  muteTopic: (streamId: string, topic: string) => void;
  unmuteTopic: (streamId: string, topic: string) => void;
  followTopic: (streamId: string, topic: string) => void;
  clearTopicVisibilityOverride: (streamId: string, topic: string) => void;
  setStreamDesktopNotifications: (streamId: string, enabled: boolean) => void;
  clearStreamDesktopNotificationsOverride: (streamId: string) => void;
  setStreamAudibleNotifications: (streamId: string, enabled: boolean) => void;
  clearStreamAudibleNotificationsOverride: (streamId: string) => void;

  isStreamMuted: (streamId: string) => boolean;
  isTopicMuted: (streamId: string, topic: string) => boolean;
  isTopicUnmuted: (streamId: string, topic: string) => boolean;
  isTopicFollowed: (streamId: string, topic: string) => boolean;
  isEffectivelyMuted: (streamId: string, topic: string) => boolean;
  getStreamDesktopNotificationsOverride: (streamId: string) => boolean | null;
  getStreamAudibleNotificationsOverride: (streamId: string) => boolean | null;
  getStreamNotificationLevel: (streamId: string) => NotificationLevel;
  getTopicVisibilityLevel: (streamId: string, topic: string) => TopicVisibilityLevel;
  getTopicNotificationLevel: (streamId: string, topic: string) => NotificationLevel;

  setFromServer: (data: {
    mutedStreamIds: string[];
    mutedTopics: { streamId: string; topic: string }[];
    unmutedTopics: { streamId: string; topic: string }[];
    followedTopics: { streamId: string; topic: string }[];
    streamDesktopNotifyEnabledIds?: string[];
    streamDesktopNotifyDisabledIds?: string[];
    streamAudibleNotifyEnabledIds?: string[];
    streamAudibleNotifyDisabledIds?: string[];
  }) => void;

  clear: () => void;
}

export const useMuteStore = create<MuteStoreState>((set, get) => ({
  mutedStreamIds: new Set(),
  mutedTopicKeys: new Set(),
  unmutedTopicKeys: new Set(),
  followedTopicKeys: new Set(),
  streamDesktopNotifyEnabledIds: new Set(),
  streamDesktopNotifyDisabledIds: new Set(),
  streamAudibleNotifyEnabledIds: new Set(),
  streamAudibleNotifyDisabledIds: new Set(),

  muteStream(streamId) {
    logStoreAction("mute", "muteStream", { streamId });
    set((s) => {
      const next = new Set(s.mutedStreamIds);
      next.add(streamId);
      return { mutedStreamIds: next };
    });
  },

  unmuteStream(streamId) {
    logStoreAction("mute", "unmuteStream", { streamId });
    set((s) => {
      const next = new Set(s.mutedStreamIds);
      next.delete(streamId);
      return { mutedStreamIds: next };
    });
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

  setStreamDesktopNotifications(streamId, enabled) {
    logStoreAction("mute", "setStreamDesktopNotifications", { streamId, enabled });
    set((s) => {
      const nextEnabled = new Set(s.streamDesktopNotifyEnabledIds);
      const nextDisabled = new Set(s.streamDesktopNotifyDisabledIds);
      if (enabled) {
        nextEnabled.add(streamId);
        nextDisabled.delete(streamId);
      } else {
        nextDisabled.add(streamId);
        nextEnabled.delete(streamId);
      }
      return {
        streamDesktopNotifyEnabledIds: nextEnabled,
        streamDesktopNotifyDisabledIds: nextDisabled,
      };
    });
  },

  clearStreamDesktopNotificationsOverride(streamId) {
    logStoreAction("mute", "clearStreamDesktopNotificationsOverride", { streamId });
    set((s) => {
      const nextEnabled = new Set(s.streamDesktopNotifyEnabledIds);
      const nextDisabled = new Set(s.streamDesktopNotifyDisabledIds);
      nextEnabled.delete(streamId);
      nextDisabled.delete(streamId);
      return {
        streamDesktopNotifyEnabledIds: nextEnabled,
        streamDesktopNotifyDisabledIds: nextDisabled,
      };
    });
  },

  setStreamAudibleNotifications(streamId, enabled) {
    logStoreAction("mute", "setStreamAudibleNotifications", { streamId, enabled });
    set((s) => {
      const nextEnabled = new Set(s.streamAudibleNotifyEnabledIds);
      const nextDisabled = new Set(s.streamAudibleNotifyDisabledIds);
      if (enabled) {
        nextEnabled.add(streamId);
        nextDisabled.delete(streamId);
      } else {
        nextDisabled.add(streamId);
        nextEnabled.delete(streamId);
      }
      return {
        streamAudibleNotifyEnabledIds: nextEnabled,
        streamAudibleNotifyDisabledIds: nextDisabled,
      };
    });
  },

  clearStreamAudibleNotificationsOverride(streamId) {
    logStoreAction("mute", "clearStreamAudibleNotificationsOverride", { streamId });
    set((s) => {
      const nextEnabled = new Set(s.streamAudibleNotifyEnabledIds);
      const nextDisabled = new Set(s.streamAudibleNotifyDisabledIds);
      nextEnabled.delete(streamId);
      nextDisabled.delete(streamId);
      return {
        streamAudibleNotifyEnabledIds: nextEnabled,
        streamAudibleNotifyDisabledIds: nextDisabled,
      };
    });
  },

  isStreamMuted(streamId) {
    return get().mutedStreamIds.has(streamId);
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
    if (state.mutedStreamIds.has(streamId)) return true;

    return false;
  },

  getStreamDesktopNotificationsOverride(streamId) {
    const state = get();
    if (state.streamDesktopNotifyEnabledIds.has(streamId)) return true;
    if (state.streamDesktopNotifyDisabledIds.has(streamId)) return false;
    return null;
  },

  getStreamAudibleNotificationsOverride(streamId) {
    const state = get();
    if (state.streamAudibleNotifyEnabledIds.has(streamId)) return true;
    if (state.streamAudibleNotifyDisabledIds.has(streamId)) return false;
    return null;
  },

  getStreamNotificationLevel(streamId) {
    return deriveStreamNotificationLevel(
      get().mutedStreamIds.has(streamId),
      get().getStreamDesktopNotificationsOverride(streamId),
    );
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
    mutedStreamIds,
    mutedTopics,
    unmutedTopics,
    followedTopics,
    streamDesktopNotifyEnabledIds = [],
    streamDesktopNotifyDisabledIds = [],
    streamAudibleNotifyEnabledIds = [],
    streamAudibleNotifyDisabledIds = [],
  }) {
    logStoreAction("mute", "setFromServer", {
      streams: mutedStreamIds.length,
      topics: mutedTopics.length,
      unmuted: unmutedTopics.length,
      followed: followedTopics.length,
      desktopEnabled: streamDesktopNotifyEnabledIds.length,
      desktopDisabled: streamDesktopNotifyDisabledIds.length,
    });
    set({
      mutedStreamIds: new Set(mutedStreamIds),
      mutedTopicKeys: new Set(mutedTopics.map((t) => topicKey(t.streamId, t.topic))),
      unmutedTopicKeys: new Set(unmutedTopics.map((t) => topicKey(t.streamId, t.topic))),
      followedTopicKeys: new Set(followedTopics.map((t) => topicKey(t.streamId, t.topic))),
      streamDesktopNotifyEnabledIds: new Set(streamDesktopNotifyEnabledIds),
      streamDesktopNotifyDisabledIds: new Set(streamDesktopNotifyDisabledIds),
      streamAudibleNotifyEnabledIds: new Set(streamAudibleNotifyEnabledIds),
      streamAudibleNotifyDisabledIds: new Set(streamAudibleNotifyDisabledIds),
    });
  },

  clear() {
    logStoreAction("mute", "clear", {});
    set({
      mutedStreamIds: new Set(),
      mutedTopicKeys: new Set(),
      unmutedTopicKeys: new Set(),
      followedTopicKeys: new Set(),
      streamDesktopNotifyEnabledIds: new Set(),
      streamDesktopNotifyDisabledIds: new Set(),
      streamAudibleNotifyEnabledIds: new Set(),
      streamAudibleNotifyDisabledIds: new Set(),
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
  streamDesktopNotifyEnabledIds: string[];
  streamDesktopNotifyDisabledIds: string[];
  streamAudibleNotifyEnabledIds: string[];
  streamAudibleNotifyDisabledIds: string[];
} {
  const subscriptions = options.subscriptions ?? [];
  const userTopics = options.userTopics ?? [];
  const mutedStreamIds = subscriptions.filter((s) => s.is_muted).map((s) => s.stream_uuid);
  const mutedTopics: { streamId: string; topic: string }[] = [];
  const unmutedTopics: { streamId: string; topic: string }[] = [];
  const followedTopics: { streamId: string; topic: string }[] = [];
  const streamDesktopNotifyEnabledIds: string[] = [];
  const streamDesktopNotifyDisabledIds: string[] = [];
  const streamAudibleNotifyEnabledIds: string[] = [];
  const streamAudibleNotifyDisabledIds: string[] = [];

  const desktopEnabled = new Set<string>();
  const desktopDisabled = new Set<string>();
  const audibleEnabled = new Set<string>();
  const audibleDisabled = new Set<string>();
  for (const subscription of subscriptions) {
    applySubscriptionNotificationOverrides(
      desktopEnabled,
      desktopDisabled,
      audibleEnabled,
      audibleDisabled,
      subscription,
    );
  }
  streamDesktopNotifyEnabledIds.push(...desktopEnabled);
  streamDesktopNotifyDisabledIds.push(...desktopDisabled);
  streamAudibleNotifyEnabledIds.push(...audibleEnabled);
  streamAudibleNotifyDisabledIds.push(...audibleDisabled);

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
    streamDesktopNotifyEnabledIds,
    streamDesktopNotifyDisabledIds,
    streamAudibleNotifyEnabledIds,
    streamAudibleNotifyDisabledIds,
  };
}
