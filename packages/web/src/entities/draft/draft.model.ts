/**
 * Draft store — manages message drafts (auto-saved when leaving a chat).
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { Draft, DraftType } from "./draft.types";

function buildDraftChatKey(type: DraftType, to: number[], topic?: string): string {
  const toKey = [...to].sort((a, b) => a - b).join(",");
  return type === "stream" ? `${type}:${toKey}:${topic ?? ""}` : `${type}:${toKey}`;
}

interface DraftState {
  drafts: Draft[];
  loading: boolean;

  setDrafts: (drafts: Draft[]) => void;
  addDraft: (draft: Draft) => void;
  setLocalDraft: (draft: Draft) => void;
  updateDraft: (id: number, patch: Partial<Pick<Draft, "content" | "topic" | "to">>) => void;
  updateDraftId: (oldId: number, newId: number) => void;
  linkDraftToServerId: (
    type: DraftType,
    to: number[],
    topic: string | undefined,
    newId: number,
  ) => void;
  removeDraft: (id: number) => void;
  /** Removes draft by id (server) or timestamp (local-only). Use when draft.id may be null. */
  removeDraftByIdentifier: (identifier: number) => void;
  removeDraftForChat: (type: DraftType, to: number[], topic?: string) => void;
  getDraftForChat: (type: DraftType, to: number[], topic?: string) => Draft | undefined;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: [],
  loading: false,

  setDrafts(drafts) {
    logStoreAction("draft", "setDrafts", { count: drafts.length });
    set({ drafts });
  },

  addDraft(draft) {
    logStoreAction("draft", "addDraft", { draftId: draft.id });
    set((s) => ({ drafts: [...s.drafts, draft] }));
  },

  setLocalDraft(draft) {
    logStoreAction("draft", "setLocalDraft", { draftType: draft.type });
    const targetKey = buildDraftChatKey(draft.type, draft.to, draft.topic);
    set((s) => ({
      drafts: [
        ...s.drafts.filter(
          (existing) => buildDraftChatKey(existing.type, existing.to, existing.topic) !== targetKey,
        ),
        draft,
      ],
    }));
  },

  updateDraft(id, patch) {
    logStoreAction("draft", "updateDraft", { id });
    set((s) => ({
      drafts: s.drafts.map((d) =>
        d.id === id ? { ...d, ...patch, timestamp: Math.floor(Date.now() / 1000) } : d,
      ),
    }));
  },

  updateDraftId(oldId, newId) {
    logStoreAction("draft", "updateDraftId", { oldId, newId });
    set((s) => ({
      drafts: s.drafts.map((d) => (d.id === oldId ? { ...d, id: newId } : d)),
    }));
  },

  linkDraftToServerId(type, to, topic, newId) {
    logStoreAction("draft", "linkDraftToServerId", { draftType: type, newId });
    const targetKey = buildDraftChatKey(type, to, topic);
    set((s) => ({
      drafts: s.drafts.map((draft) =>
        draft.id == null && buildDraftChatKey(draft.type, draft.to, draft.topic) === targetKey
          ? { ...draft, id: newId }
          : draft,
      ),
    }));
  },

  removeDraft(id) {
    logStoreAction("draft", "removeDraft", { id });
    set((s) => ({
      drafts: s.drafts.filter((d) => d.id !== id),
    }));
  },

  removeDraftByIdentifier(identifier) {
    logStoreAction("draft", "removeDraftByIdentifier", { identifier });
    set((s) => ({
      drafts: s.drafts.filter((d) => (d.id ?? d.timestamp) !== identifier),
    }));
  },

  removeDraftForChat(type, to, topic) {
    logStoreAction("draft", "removeDraftForChat", { draftType: type });
    const targetKey = buildDraftChatKey(type, to, topic);
    set((s) => ({
      drafts: s.drafts.filter(
        (draft) => buildDraftChatKey(draft.type, draft.to, draft.topic) !== targetKey,
      ),
    }));
  },

  getDraftForChat(type, to, topic) {
    const targetKey = buildDraftChatKey(type, to, topic);
    return get().drafts.find(
      (draft) => buildDraftChatKey(draft.type, draft.to, draft.topic) === targetKey,
    );
  },

  setLoading(loading) {
    set({ loading });
  },

  clear() {
    logStoreAction("draft", "clear", {});
    set({ drafts: [], loading: false });
  },
}));
