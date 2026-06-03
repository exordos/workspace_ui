/**
 * Chat info store — unified DM/channel info panel state.
 *
 * Holds the currently displayed chat info data (member list, counts,
 * description, mute status). The `type` field on ChatInfoData
 * distinguishes between DM and stream info.
 */

import { create } from "zustand";
import { useUsersStore } from "~/entities/user/user.model";
import { logStoreAction } from "~/shared/lib/logger";
import {
  invalidateInstance,
  invalidateStream as invalidateStreamCache,
  loadStreamMembers,
  loadStreamMetadata,
} from "./chat-info.api";
import {
  buildDmChatInfoData,
  buildStreamChatInfoData,
  getChatInfoNetworkKey,
  isSameChatInfoData,
} from "./chat-info.lib";
import type { ChatInfoContext, ChatInfoData } from "./chat-info.types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ChatInfoState {
  data: ChatInfoData | null;
  loading: boolean;
  error: string | null;
  // Last active chat-info context (none/dm/stream).
  context: ChatInfoContext;
  // Last server-fetched member ids for stream context.
  streamMemberIds: number[];
  // Request version for stale-response protection.
  requestVersion: number;

  setData: (data: ChatInfoData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setContext: (context: ChatInfoContext) => void;
  hydrate: (context: ChatInfoContext) => Promise<void>;
  syncDerived: (context: ChatInfoContext) => void;
  invalidateStream: (instanceId: string, streamId: number) => void;
  clear: () => void;
}

const NONE_CONTEXT: ChatInfoContext = {
  kind: "none",
  instanceId: null,
};

function resolveUsersById(userIds: number[]) {
  const usersState = useUsersStore.getState();
  return userIds
    .map((id) => usersState.getUser(id))
    .filter((user): user is NonNullable<typeof user> => user != null);
}

function isCurrentHydration(
  state: ChatInfoState,
  version: number,
  context: ChatInfoContext,
): boolean {
  return (
    state.requestVersion === version &&
    getChatInfoNetworkKey(state.context) === getChatInfoNetworkKey(context)
  );
}

export const useChatInfoStore = create<ChatInfoState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  context: NONE_CONTEXT,
  streamMemberIds: [],
  requestVersion: 0,

  setData(data) {
    logStoreAction("chatInfo", "setData", { type: data.type, name: data.name });
    set({ data, loading: false, error: null });
  },

  setLoading(loading) {
    set({ loading });
  },

  setError(error) {
    logStoreAction("chatInfo", "setError", { error });
    set({ error, loading: false });
  },

  setContext(context) {
    const previous = get().context;
    // Invalidate API caches when switching instances.
    if (
      previous.instanceId != null &&
      context.instanceId != null &&
      previous.instanceId !== context.instanceId
    ) {
      invalidateInstance(previous.instanceId);
    }
    set({ context });
  },

  async hydrate(context) {
    get().setContext(context);
    const nextVersion = get().requestVersion + 1;
    logStoreAction("chatInfo", "hydrate:start", {
      context: context.kind,
      instanceId: context.instanceId ?? undefined,
      streamId: context.kind === "stream" ? context.streamId : undefined,
    });
    set({
      requestVersion: nextVersion,
      loading: context.kind === "stream",
      error: null,
    });

    // No active chat.
    if (context.kind === "none") {
      set({
        data: null,
        loading: false,
        error: null,
        streamMemberIds: [],
      });
      return;
    }

    // DM: no network — build from users store.
    if (context.kind === "dm") {
      const members = resolveUsersById(context.participantIds);
      const nextData = buildDmChatInfoData(context.dmName, members, context.participantIds.length);
      const state = get();
      // Context changed mid-hydration — drop result.
      if (!isCurrentHydration(state, nextVersion, context)) return;
      if (isSameChatInfoData(state.data, nextData)) {
        set({ loading: false, error: null, streamMemberIds: [] });
        return;
      }
      set({
        data: nextData,
        loading: false,
        error: null,
        streamMemberIds: [],
      });
      return;
    }

    try {
      // Stream: fetch members and metadata in parallel.
      const [memberIds, metadata] = await Promise.all([
        loadStreamMembers(context.instanceId, context.streamId),
        loadStreamMetadata(context.instanceId, context.streamId),
      ]);
      const state = get();
      // Stale response must not overwrite current context.
      if (!isCurrentHydration(state, nextVersion, context)) return;
      const members = resolveUsersById(memberIds);
      const nextData = buildStreamChatInfoData(
        metadata.name ?? context.streamName,
        memberIds,
        members,
        context.isMuted,
        {
          description: metadata.description,
          topics: context.topics,
        },
      );
      if (isSameChatInfoData(state.data, nextData)) {
        set({ loading: false, error: null, streamMemberIds: memberIds });
        return;
      }
      set({
        data: nextData,
        loading: false,
        error: null,
        streamMemberIds: memberIds,
      });
    } catch {
      const state = get();
      // Show error only for the still-current request.
      if (!isCurrentHydration(state, nextVersion, context)) return;
      set({
        error: "chat-info:hydrate_failed",
        loading: false,
      });
    }
  },

  syncDerived(context) {
    const state = get();
    // Apply derived updates only to the active context.
    if (getChatInfoNetworkKey(state.context) !== getChatInfoNetworkKey(context)) {
      return;
    }

    // Sync reset for empty context — no network.
    if (context.kind === "none") {
      if (state.data == null) return;
      set({ data: null, loading: false, error: null, streamMemberIds: [] });
      return;
    }

    // DM derived refresh from users store only.
    if (context.kind === "dm") {
      const members = resolveUsersById(context.participantIds);
      const nextData = buildDmChatInfoData(context.dmName, members, context.participantIds.length);
      if (isSameChatInfoData(state.data, nextData)) {
        return;
      }
      set({ data: nextData, loading: false, error: null, streamMemberIds: [] });
      return;
    }

    // Skip derived refresh until stream members are loaded.
    if (state.loading && state.streamMemberIds.length === 0) {
      return;
    }

    // Stream derived refresh: topics/mute/presence without another HTTP round-trip.
    const members = resolveUsersById(state.streamMemberIds);
    const description = state.data?.type === "stream" ? state.data.description : null;
    const streamName = state.data?.type === "stream" ? state.data.name : context.streamName;
    const nextData = buildStreamChatInfoData(
      streamName,
      state.streamMemberIds,
      members,
      context.isMuted,
      {
        description,
        topics: context.topics,
      },
    );
    if (isSameChatInfoData(state.data, nextData)) {
      return;
    }
    set({ data: nextData, loading: false, error: null });
  },

  invalidateStream(instanceId, streamId) {
    logStoreAction("chatInfo", "invalidateStream", { instanceId, streamId });
    // Clear stream API cache and instance snapshot.
    invalidateStreamCache(instanceId, streamId);
    const context = get().context;
    // Re-hydrate immediately when invalidating the active stream.
    if (
      context.kind === "stream" &&
      context.instanceId === instanceId &&
      context.streamId === streamId
    ) {
      void get().hydrate(context);
    }
  },

  clear() {
    logStoreAction("chatInfo", "clear");
    set((state) => ({
      data: null,
      loading: false,
      error: null,
      context: NONE_CONTEXT,
      streamMemberIds: [],
      requestVersion: state.requestVersion + 1,
    }));
  },
}));
