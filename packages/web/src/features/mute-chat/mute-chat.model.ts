/**
 * Mute store — tracks which streams and topics the user has muted.
 *
 * Populated from subscription data (stream is_muted) and user_topics
 * (topic visibility_policy). Updated via API calls when the user
 * toggles mute in the UI.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

export function topicKey(streamId: number, topic: string): string {
  const normalizedTopic = normalizeTopicForIdentity(topic).toLowerCase();
  return `${streamId}:${normalizedTopic}`;
}

interface MuteStoreState {
  mutedStreamIds: Set<number>;
  mutedTopicKeys: Set<string>;
  unmutedTopicKeys: Set<string>;
  followedTopicKeys: Set<string>;

  muteStream: (streamId: number) => void;
  unmuteStream: (streamId: number) => void;
  muteTopic: (streamId: number, topic: string) => void;
  unmuteTopic: (streamId: number, topic: string) => void;
  followTopic: (streamId: number, topic: string) => void;
  clearTopicVisibilityOverride: (streamId: number, topic: string) => void;

  isStreamMuted: (streamId: number) => boolean;
  isTopicMuted: (streamId: number, topic: string) => boolean;
  isTopicUnmuted: (streamId: number, topic: string) => boolean;
  isTopicFollowed: (streamId: number, topic: string) => boolean;
  isEffectivelyMuted: (streamId: number, topic: string) => boolean;

  setFromServer: (data: {
    mutedStreamIds: number[];
    mutedTopics: { streamId: number; topic: string }[];
    unmutedTopics: { streamId: number; topic: string }[];
    followedTopics: { streamId: number; topic: string }[];
  }) => void;

  clear: () => void;
}

export const useMuteStore = create<MuteStoreState>((set, get) => ({
  mutedStreamIds: new Set(),
  mutedTopicKeys: new Set(),
  unmutedTopicKeys: new Set(),
  followedTopicKeys: new Set(),

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

  setFromServer({ mutedStreamIds, mutedTopics, unmutedTopics, followedTopics }) {
    logStoreAction("mute", "setFromServer", {
      streams: mutedStreamIds.length,
      topics: mutedTopics.length,
      unmuted: unmutedTopics.length,
      followed: followedTopics.length,
    });
    set({
      mutedStreamIds: new Set(mutedStreamIds),
      mutedTopicKeys: new Set(mutedTopics.map((t) => topicKey(t.streamId, t.topic))),
      unmutedTopicKeys: new Set(unmutedTopics.map((t) => topicKey(t.streamId, t.topic))),
      followedTopicKeys: new Set(followedTopics.map((t) => topicKey(t.streamId, t.topic))),
    });
  },

  clear() {
    logStoreAction("mute", "clear", {});
    set({
      mutedStreamIds: new Set(),
      mutedTopicKeys: new Set(),
      unmutedTopicKeys: new Set(),
      followedTopicKeys: new Set(),
    });
  },
}));
