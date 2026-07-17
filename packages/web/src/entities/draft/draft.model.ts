/** Draft store keyed by stable client-generated UUID. */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { Draft } from "./draft.types";

function draftUpdatedAtMs(draft: Draft): number {
  const parsed = Date.parse(draft.updated_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortDrafts(drafts: readonly Draft[]): Draft[] {
  return [...drafts].sort((a, b) => {
    const updatedDelta = draftUpdatedAtMs(b) - draftUpdatedAtMs(a);
    return updatedDelta !== 0 ? updatedDelta : b.uuid.localeCompare(a.uuid);
  });
}

function countNonEmptyDrafts(drafts: readonly Draft[]): number {
  return drafts.reduce((count, draft) => count + (draft.payload.content.trim() ? 1 : 0), 0);
}

function sameChat(draft: Draft, streamUuid: string, topicUuid: string): boolean {
  return draft.stream_uuid === streamUuid && draft.topic_uuid === topicUuid;
}

function mergeDrafts(current: readonly Draft[], incoming: readonly Draft[]): Draft[] {
  const byUuid = new Map(current.map((draft) => [draft.uuid, draft]));
  for (const draft of incoming) {
    const local = byUuid.get(draft.uuid);
    if (local?.sync_state === "pending" && local.payload.content !== draft.payload.content) {
      continue;
    }
    byUuid.set(draft.uuid, draft);
  }
  return sortDrafts([...byUuid.values()]);
}

interface DraftState {
  drafts: Draft[];
  nonEmptyDraftCount: number;
  loading: boolean;
  nextPageMarker: string | null;
  hasMore: boolean;

  setDrafts: (drafts: Draft[], nextPageMarker?: string | null) => void;
  appendDraftPage: (drafts: Draft[], nextPageMarker: string | null) => void;
  upsertDraft: (draft: Draft) => void;
  updateDraftPayload: (uuid: string, content: string, syncState?: Draft["sync_state"]) => void;
  markDraftConflict: (uuid: string, current: Draft | null) => void;
  removeDraft: (uuid: string) => void;
  getDraft: (uuid: string) => Draft | undefined;
  getDraftsForChat: (streamUuid: string, topicUuid: string) => Draft[];
  getLatestDraftForChat: (streamUuid: string, topicUuid: string) => Draft | undefined;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

function stateForDrafts(drafts: Draft[]) {
  const sorted = sortDrafts(drafts);
  return { drafts: sorted, nonEmptyDraftCount: countNonEmptyDrafts(sorted) };
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: [],
  nonEmptyDraftCount: 0,
  loading: false,
  nextPageMarker: null,
  hasMore: false,

  setDrafts(drafts, nextPageMarker = null) {
    logStoreAction("draft", "setDrafts", { count: drafts.length });
    set((state) => ({
      ...stateForDrafts(
        mergeDrafts(
          state.drafts.filter((draft) => draft.sync_state === "pending"),
          drafts,
        ),
      ),
      nextPageMarker,
      hasMore: nextPageMarker != null,
    }));
  },

  appendDraftPage(drafts, nextPageMarker) {
    logStoreAction("draft", "appendDraftPage", { count: drafts.length });
    set((state) => ({
      ...stateForDrafts(mergeDrafts(state.drafts, drafts)),
      nextPageMarker,
      hasMore: nextPageMarker != null,
    }));
  },

  upsertDraft(draft) {
    logStoreAction("draft", "upsertDraft", { draftUuid: draft.uuid });
    set((state) => ({
      ...stateForDrafts([
        ...state.drafts.filter((existing) => existing.uuid !== draft.uuid),
        draft,
      ]),
    }));
  },

  updateDraftPayload(uuid, content, syncState = "pending") {
    logStoreAction("draft", "updateDraftPayload", { uuid });
    const updatedAt = new Date().toISOString();
    set((state) => ({
      ...stateForDrafts(
        state.drafts.map((draft) =>
          draft.uuid === uuid
            ? {
                ...draft,
                payload: { ...draft.payload, content },
                updated_at: updatedAt,
                sync_state: syncState,
              }
            : draft,
        ),
      ),
    }));
  },

  markDraftConflict(uuid, current) {
    logStoreAction("draft", "markDraftConflict", { uuid, hasCurrent: current != null });
    set((state) => {
      const local = state.drafts.find((draft) => draft.uuid === uuid);
      if (local == null && current == null) return state;
      const conflict =
        current == null
          ? local == null
            ? null
            : { ...local, sync_state: "conflict" as const }
          : {
              ...current,
              payload:
                local == null
                  ? current.payload
                  : { ...current.payload, local_content: local.payload.content },
              sync_state: "conflict" as const,
            };
      if (conflict == null) return state;
      return {
        ...stateForDrafts([...state.drafts.filter((draft) => draft.uuid !== uuid), conflict]),
      };
    });
  },

  removeDraft(uuid) {
    logStoreAction("draft", "removeDraft", { uuid });
    set((state) => stateForDrafts(state.drafts.filter((draft) => draft.uuid !== uuid)));
  },

  getDraft(uuid) {
    return get().drafts.find((draft) => draft.uuid === uuid);
  },

  getDraftsForChat(streamUuid, topicUuid) {
    return get().drafts.filter((draft) => sameChat(draft, streamUuid, topicUuid));
  },

  getLatestDraftForChat(streamUuid, topicUuid) {
    return get().drafts.find((draft) => sameChat(draft, streamUuid, topicUuid));
  },

  setLoading(loading) {
    set({ loading });
  },

  clear() {
    logStoreAction("draft", "clear", {});
    set({
      drafts: [],
      nonEmptyDraftCount: 0,
      loading: false,
      nextPageMarker: null,
      hasMore: false,
    });
  },
}));
