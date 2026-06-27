/**
 * Chat info store — unified DM/channel info panel state.
 *
 * Holds the currently displayed chat info data (member list, counts,
 * description, mute status). The `type` field on ChatInfoData
 * distinguishes between DM and stream info.
 */

import { create } from "zustand";
import { useUsersStore } from "~/entities/user/user.model";
import type { WorkspaceStreamRole } from "~/shared/api/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";
import { userIdStorageKey, type UserId } from "~/shared/lib/user-id.lib";
import {
  invalidateInstance,
  invalidateStream as invalidateStreamCache,
  loadStreamMembersSnapshot,
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

interface StreamMetadataUpdate {
  name?: string;
  description?: string | null;
}

interface ChatInfoState {
  data: ChatInfoData | null;
  loading: boolean;
  error: string | null;
  // Last active chat-info context (none/dm/stream).
  context: ChatInfoContext;
  // Last server-fetched member ids for stream context.
  streamMemberIds: UserId[];
  streamMemberRolesByUserId: Record<string, WorkspaceStreamRole>;
  streamMemberBindingUuidsByUserId: Record<string, string>;
  // Request version for stale-response protection.
  requestVersion: number;

  setData: (data: ChatInfoData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setContext: (context: ChatInfoContext) => void;
  hydrate: (context: ChatInfoContext) => Promise<void>;
  syncDerived: (context: ChatInfoContext) => void;
  applyStreamMetadataUpdate: (
    instanceId: string | null,
    streamUuid: string,
    metadata: StreamMetadataUpdate,
  ) => void;
  applyStreamMemberRoleUpdate: (userId: UserId, role: WorkspaceStreamRole) => void;
  applyStreamMemberRemoval: (userId: UserId) => void;
  invalidateStream: (instanceId: string, streamUuid: string) => void;
  clear: () => void;
}

const NONE_CONTEXT: ChatInfoContext = {
  kind: "none",
  instanceId: null,
};

function resolveUsersById(userIds: UserId[]) {
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

function normalizeStreamUuid(streamUuid: string): string {
  return streamUuid.trim().toLowerCase();
}

function normalizeStreamName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeStreamDescription(description: string | null): string | null {
  const trimmed = description?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : null;
}

export const useChatInfoStore = create<ChatInfoState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  context: NONE_CONTEXT,
  streamMemberIds: [],
  streamMemberRolesByUserId: {},
  streamMemberBindingUuidsByUserId: {},
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
      streamUuid: context.kind === "stream" ? context.streamUuid : undefined,
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
        streamMemberRolesByUserId: {},
        streamMemberBindingUuidsByUserId: {},
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
        set({
          loading: false,
          error: null,
          streamMemberIds: [],
          streamMemberRolesByUserId: {},
          streamMemberBindingUuidsByUserId: {},
        });
        return;
      }
      set({
        data: nextData,
        loading: false,
        error: null,
        streamMemberIds: [],
        streamMemberRolesByUserId: {},
        streamMemberBindingUuidsByUserId: {},
      });
      return;
    }

    try {
      // Stream: fetch members and metadata in parallel.
      const [memberSnapshot, metadata] = await Promise.all([
        loadStreamMembersSnapshot(context.instanceId, context.streamUuid),
        loadStreamMetadata(context.instanceId, context.streamUuid),
      ]);
      const memberIds = memberSnapshot.memberIds;
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
        set({
          loading: false,
          error: null,
          streamMemberIds: memberIds,
          streamMemberRolesByUserId: memberSnapshot.rolesByUserId,
          streamMemberBindingUuidsByUserId: memberSnapshot.bindingUuidsByUserId,
        });
        return;
      }
      set({
        data: nextData,
        loading: false,
        error: null,
        streamMemberIds: memberIds,
        streamMemberRolesByUserId: memberSnapshot.rolesByUserId,
        streamMemberBindingUuidsByUserId: memberSnapshot.bindingUuidsByUserId,
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
      set({
        data: null,
        loading: false,
        error: null,
        streamMemberIds: [],
        streamMemberRolesByUserId: {},
        streamMemberBindingUuidsByUserId: {},
      });
      return;
    }

    // DM derived refresh from users store only.
    if (context.kind === "dm") {
      const members = resolveUsersById(context.participantIds);
      const nextData = buildDmChatInfoData(context.dmName, members, context.participantIds.length);
      if (isSameChatInfoData(state.data, nextData)) {
        set({ streamMemberRolesByUserId: {}, streamMemberBindingUuidsByUserId: {} });
        return;
      }
      set({
        data: nextData,
        loading: false,
        error: null,
        streamMemberIds: [],
        streamMemberRolesByUserId: {},
        streamMemberBindingUuidsByUserId: {},
      });
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

  applyStreamMetadataUpdate(instanceId, streamUuid, metadata) {
    const normalizedStreamUuid = normalizeStreamUuid(streamUuid);
    if (instanceId != null) {
      invalidateStreamCache(instanceId, normalizedStreamUuid);
    }

    const state = get();
    if (
      state.context.kind !== "stream" ||
      normalizeStreamUuid(state.context.streamUuid) !== normalizedStreamUuid ||
      (instanceId != null && state.context.instanceId !== instanceId)
    ) {
      return;
    }

    const nextName = normalizeStreamName(metadata.name, state.context.streamName);
    const nextContext =
      nextName === state.context.streamName
        ? state.context
        : { ...state.context, streamName: nextName };
    if (state.data?.type !== "stream") {
      if (nextContext !== state.context) {
        set({ context: nextContext });
      }
      return;
    }

    const nextDescription =
      metadata.description === undefined
        ? state.data.description
        : normalizeStreamDescription(metadata.description);
    const nextData: ChatInfoData = {
      ...state.data,
      name: nextName,
      description: nextDescription,
    };
    if (isSameChatInfoData(state.data, nextData) && nextContext === state.context) {
      return;
    }

    logStoreAction("chatInfo", "applyStreamMetadataUpdate", {
      instanceId: instanceId ?? undefined,
      streamUuid: normalizedStreamUuid,
    });
    set({ data: nextData, context: nextContext, loading: false, error: null });
  },

  applyStreamMemberRoleUpdate(userId, role) {
    const userKey = userIdStorageKey(userId);
    const state = get();
    if (state.streamMemberRolesByUserId[userKey] === role) {
      return;
    }
    logStoreAction("chatInfo", "applyStreamMemberRoleUpdate", { userKey, role });
    set({
      streamMemberRolesByUserId: {
        ...state.streamMemberRolesByUserId,
        [userKey]: role,
      },
    });
  },

  applyStreamMemberRemoval(userId) {
    const userKey = userIdStorageKey(userId);
    const state = get();
    const nextMemberIds = state.streamMemberIds.filter(
      (memberId) => userIdStorageKey(memberId) !== userKey,
    );
    const nextRoles = { ...state.streamMemberRolesByUserId };
    const nextBindingUuids = { ...state.streamMemberBindingUuidsByUserId };
    delete nextRoles[userKey];
    delete nextBindingUuids[userKey];
    const existingMember =
      state.data?.type === "stream"
        ? state.data.members.find((member) => userIdStorageKey(member.userId) === userKey)
        : undefined;
    const wasKnownMember =
      existingMember != null || nextMemberIds.length !== state.streamMemberIds.length;
    const nextData =
      state.data?.type === "stream"
        ? {
            ...state.data,
            memberCount: wasKnownMember
              ? Math.max(0, state.data.memberCount - 1)
              : state.data.memberCount,
            onlineCount: existingMember?.isOnline
              ? Math.max(0, state.data.onlineCount - 1)
              : state.data.onlineCount,
            members: state.data.members.filter(
              (member) => userIdStorageKey(member.userId) !== userKey,
            ),
          }
        : state.data;
    logStoreAction("chatInfo", "applyStreamMemberRemoval", { userKey });
    set({
      data: nextData,
      streamMemberIds: nextMemberIds,
      streamMemberRolesByUserId: nextRoles,
      streamMemberBindingUuidsByUserId: nextBindingUuids,
    });
  },

  invalidateStream(instanceId, streamUuid) {
    logStoreAction("chatInfo", "invalidateStream", { instanceId, streamUuid });
    // Clear stream API cache and instance snapshot.
    invalidateStreamCache(instanceId, streamUuid);
    const context = get().context;
    // Re-hydrate immediately when invalidating the active stream.
    if (
      context.kind === "stream" &&
      context.instanceId === instanceId &&
      context.streamUuid === streamUuid
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
      streamMemberRolesByUserId: {},
      streamMemberBindingUuidsByUserId: {},
      requestVersion: state.requestVersion + 1,
    }));
  },
}));
