import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  compareUserIds,
  isUserIdentityReady,
  type UserId,
  userIdStorageKey,
} from "~/shared/lib/user-id.lib";
import { toggleUserPickerSelection } from "~/shared/lib/user-picker";
import { addStreamMembers } from "./add-stream-members.api";
import type {
  AddStreamMembersResult,
  AddStreamMembersSubmitOptions,
} from "./add-stream-members.types";

const EMPTY_IDS: UserId[] = [];

interface AddStreamMembersState {
  open: boolean;
  streamId: string | null;
  streamName: string;
  existingMemberIds: UserId[];
  query: string;
  selectedIds: UserId[];
  submitting: boolean;
  error: string | null;
  lastResult: AddStreamMembersResult | null;

  openForStream: (params: {
    streamId: string;
    streamName: string;
    existingMemberIds: UserId[];
  }) => void;
  close: () => void;
  setQuery: (query: string) => void;
  toggleSelected: (userId: UserId) => void;
  setExistingMemberIds: (ids: UserId[]) => void;
  clearSelection: () => void;
  submit: (options: AddStreamMembersSubmitOptions) => Promise<AddStreamMembersResult | null>;
}

function normalizeSelectableUserIds(ids: readonly UserId[]): UserId[] {
  const byKey = new Map<string, UserId>();
  for (const userId of ids) {
    if (!isUserIdentityReady(userId)) continue;
    byKey.set(userIdStorageKey(userId), userId);
  }
  return Array.from(byKey.values()).sort(compareUserIds);
}

function userIdSet(ids: readonly UserId[]): Set<string> {
  return new Set(ids.map((userId) => userIdStorageKey(userId)));
}

export const useAddStreamMembersStore = create<AddStreamMembersState>((set, get) => ({
  open: false,
  streamId: null,
  streamName: "",
  existingMemberIds: EMPTY_IDS,
  query: "",
  selectedIds: EMPTY_IDS,
  submitting: false,
  error: null,
  lastResult: null,

  openForStream({ streamId, streamName, existingMemberIds }) {
    const normalizedExisting = normalizeSelectableUserIds(existingMemberIds);
    logStoreAction("addStreamMembers", "openForStream", {
      streamId,
      existingCount: normalizedExisting.length,
    });
    set({
      open: true,
      streamId,
      streamName: streamName.trim(),
      existingMemberIds: normalizedExisting,
      query: "",
      selectedIds: EMPTY_IDS,
      submitting: false,
      error: null,
      lastResult: null,
    });
  },

  close() {
    logStoreAction("addStreamMembers", "close", {});
    set({
      open: false,
      streamId: null,
      streamName: "",
      existingMemberIds: EMPTY_IDS,
      query: "",
      selectedIds: EMPTY_IDS,
      submitting: false,
      error: null,
    });
  },

  setQuery(query) {
    set({ query });
  },

  toggleSelected(userId) {
    const state = get();
    if (userIdSet(state.existingMemberIds).has(userIdStorageKey(userId))) {
      return;
    }
    const selectedIds = toggleUserPickerSelection(state.selectedIds, userId);
    set({ selectedIds });
  },

  setExistingMemberIds(ids) {
    const nextExisting = normalizeSelectableUserIds(ids);
    const existingSet = userIdSet(nextExisting);
    const selectedIds = get().selectedIds.filter(
      (userId) => !existingSet.has(userIdStorageKey(userId)),
    );
    set({ existingMemberIds: nextExisting, selectedIds });
  },

  clearSelection() {
    set({ selectedIds: EMPTY_IDS });
  },

  async submit(options) {
    const state = get();
    if (state.submitting) {
      return null;
    }
    if (state.streamId == null || state.streamName.trim().length === 0) {
      set({ error: "app.error" });
      return null;
    }

    const selectedIds = normalizeSelectableUserIds(state.selectedIds);
    const existingSet = userIdSet(state.existingMemberIds);
    // Skip already-subscribed members only; Messenger API allows self-add.
    const filteredIds = selectedIds.filter((userId) => !existingSet.has(userIdStorageKey(userId)));

    if (filteredIds.length === 0) {
      set({ error: null });
      return {
        ok: true,
        addedUserIds: [],
        alreadySubscribedUserIds: [],
        unauthorizedStreams: [],
      };
    }

    set({ submitting: true, error: null, lastResult: null });

    const result = await addStreamMembers({
      streamName: state.streamName,
      userIds: filteredIds,
    });

    if (!result.ok) {
      logStoreAction("addStreamMembers", "submit:failure", {
        streamId: state.streamId,
        requestedCount: filteredIds.length,
        errorCode: result.errorCode,
      });
      set({
        submitting: false,
        error: "app.error",
        lastResult: result,
      });
      return result;
    }

    logStoreAction("addStreamMembers", "submit:success", {
      streamId: state.streamId,
      requestedCount: filteredIds.length,
      addedCount: result.addedUserIds.length,
      alreadySubscribedCount: result.alreadySubscribedUserIds.length,
    });

    set({
      submitting: false,
      error: null,
      lastResult: result,
      open: false,
      streamId: null,
      streamName: "",
      existingMemberIds: EMPTY_IDS,
      query: "",
      selectedIds: EMPTY_IDS,
    });

    options.onSuccess?.(state.streamId);
    return result;
  },
}));
