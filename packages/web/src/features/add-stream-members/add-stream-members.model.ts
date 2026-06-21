import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  compareUserIds,
  isNumericUserId,
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
const EMPTY_NUMERIC_IDS: number[] = [];

interface AddStreamMembersState {
  open: boolean;
  streamId: string | null;
  streamName: string;
  existingMemberIds: number[];
  query: string;
  selectedIds: UserId[];
  submitting: boolean;
  error: string | null;
  lastResult: AddStreamMembersResult | null;

  openForStream: (params: {
    streamId: string;
    streamName: string;
    existingMemberIds: number[];
  }) => void;
  close: () => void;
  setQuery: (query: string) => void;
  toggleSelected: (userId: UserId) => void;
  setExistingMemberIds: (ids: number[]) => void;
  clearSelection: () => void;
  submit: (options: AddStreamMembersSubmitOptions) => Promise<AddStreamMembersResult | null>;
}

function normalizeNumericUserIds(ids: readonly number[]): number[] {
  return Array.from(new Set(ids.filter((userId) => Number.isInteger(userId) && userId > 0))).sort(
    (a, b) => a - b,
  );
}

function normalizeSelectableUserIds(ids: readonly UserId[]): UserId[] {
  const byKey = new Map<string, UserId>();
  for (const userId of ids) {
    if (!isUserIdentityReady(userId)) continue;
    byKey.set(userIdStorageKey(userId), userId);
  }
  return Array.from(byKey.values()).sort(compareUserIds);
}

export const useAddStreamMembersStore = create<AddStreamMembersState>((set, get) => ({
  open: false,
  streamId: null,
  streamName: "",
  existingMemberIds: EMPTY_NUMERIC_IDS,
  query: "",
  selectedIds: EMPTY_IDS,
  submitting: false,
  error: null,
  lastResult: null,

  openForStream({ streamId, streamName, existingMemberIds }) {
    const normalizedExisting = normalizeNumericUserIds(existingMemberIds);
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
      existingMemberIds: EMPTY_NUMERIC_IDS,
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
    if (isNumericUserId(userId) && state.existingMemberIds.includes(userId)) {
      return;
    }
    const selectedIds = toggleUserPickerSelection(state.selectedIds, userId);
    set({ selectedIds });
  },

  setExistingMemberIds(ids) {
    const nextExisting = normalizeNumericUserIds(ids);
    const existingSet = new Set(nextExisting);
    const selectedIds = get().selectedIds.filter(
      (userId) => !isNumericUserId(userId) || !existingSet.has(userId),
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
    const existingSet = new Set(state.existingMemberIds);
    // Skip already-subscribed members only; Messenger API allows self-add.
    const filteredIds = selectedIds.filter(
      (userId) => !isNumericUserId(userId) || !existingSet.has(userId),
    );

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
      existingMemberIds: EMPTY_NUMERIC_IDS,
      query: "",
      selectedIds: EMPTY_IDS,
    });

    options.onSuccess?.(state.streamId);
    return result;
  },
}));
