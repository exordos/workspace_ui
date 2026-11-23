import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { toggleUserPickerSelection, type UserPickerId } from "~/shared/lib/user-picker";
import { addStreamMembers } from "./add-stream-members.api";
import type {
  AddStreamMembersResult,
  AddStreamMembersSubmitOptions,
} from "./add-stream-members.types";

const EMPTY_IDS: UserPickerId[] = [];

interface AddStreamMembersState {
  open: boolean;
  streamId: number | null;
  streamName: string;
  existingMemberIds: UserPickerId[];
  query: string;
  selectedIds: UserPickerId[];
  submitting: boolean;
  error: string | null;
  lastResult: AddStreamMembersResult | null;

  openForStream: (params: {
    streamId: number;
    streamName: string;
    existingMemberIds: UserPickerId[];
  }) => void;
  close: () => void;
  setQuery: (query: string) => void;
  toggleSelected: (userId: UserPickerId) => void;
  setExistingMemberIds: (ids: UserPickerId[]) => void;
  clearSelection: () => void;
  submit: (options: AddStreamMembersSubmitOptions) => Promise<AddStreamMembersResult | null>;
}

function normalizePickerIds(ids: readonly UserPickerId[]): UserPickerId[] {
  return Array.from(
    new Set(
      ids.filter((userId) => {
        if (typeof userId === "number") {
          return Number.isInteger(userId) && userId > 0;
        }
        return userId.trim().length > 0;
      }),
    ),
  ).sort((left, right) => {
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    return String(left).localeCompare(String(right));
  });
}

function numericUserIds(ids: readonly UserPickerId[]): number[] {
  return ids.filter(
    (userId): userId is number =>
      typeof userId === "number" && Number.isInteger(userId) && userId > 0,
  );
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
    const normalizedExisting = normalizePickerIds(existingMemberIds);
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
    if (state.existingMemberIds.includes(userId)) {
      return;
    }
    const selectedIds = toggleUserPickerSelection(state.selectedIds, userId);
    set({ selectedIds });
  },

  setExistingMemberIds(ids) {
    const nextExisting = normalizePickerIds(ids);
    const existingSet = new Set(nextExisting);
    const selectedIds = get().selectedIds.filter((userId) => !existingSet.has(userId));
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

    const selectedIds = numericUserIds(normalizePickerIds(state.selectedIds));
    const existingSet = new Set(state.existingMemberIds);
    // Skip already-subscribed members only; Zulip API allows self-add.
    const filteredIds = selectedIds.filter((userId) => !existingSet.has(userId));

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
