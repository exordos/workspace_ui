/**
 * Draft store — manages local message drafts.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { Draft, DraftType } from "./draft.types";

function buildDraftChatKey(type: DraftType, to: number[], topic?: string): string {
  const toKey = [...to].sort((a, b) => a - b).join(",");
  return type === "stream" ? `${type}:${toKey}:${topic ?? ""}` : `${type}:${toKey}`;
}

function countNonEmptyDrafts(drafts: readonly Draft[]): number {
  let count = 0;
  for (const draft of drafts) {
    if (draft.content.trim().length > 0) count += 1;
  }
  return count;
}

interface DraftState {
  drafts: Draft[];
  nonEmptyDraftCount: number;

  setDrafts: (drafts: Draft[]) => void;
  addDraft: (draft: Draft) => void;
  setLocalDraft: (draft: Draft) => void;
  updateDraft: (id: number, patch: Partial<Pick<Draft, "content" | "topic" | "to">>) => void;
  removeDraft: (id: number) => void;
  /** Removes draft by local id or timestamp. Use when draft.id may be null. */
  removeDraftByIdentifier: (identifier: number) => void;
  removeDraftForChat: (type: DraftType, to: number[], topic?: string) => void;
  getDraftForChat: (type: DraftType, to: number[], topic?: string) => Draft | undefined;
  clear: () => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: [],
  nonEmptyDraftCount: 0,

  setDrafts(drafts) {
    logStoreAction("draft", "setDrafts", { count: drafts.length });
    set({ drafts, nonEmptyDraftCount: countNonEmptyDrafts(drafts) });
  },

  addDraft(draft) {
    logStoreAction("draft", "addDraft", { draftId: draft.id });
    set((s) => {
      const drafts = [...s.drafts, draft];
      return { drafts, nonEmptyDraftCount: countNonEmptyDrafts(drafts) };
    });
  },

  setLocalDraft(draft) {
    logStoreAction("draft", "setLocalDraft", { draftType: draft.type });
    const targetKey = buildDraftChatKey(draft.type, draft.to, draft.topic);
    set((s) => {
      const drafts = [
        ...s.drafts.filter(
          (existing) => buildDraftChatKey(existing.type, existing.to, existing.topic) !== targetKey,
        ),
        draft,
      ];
      return { drafts, nonEmptyDraftCount: countNonEmptyDrafts(drafts) };
    });
  },

  updateDraft(id, patch) {
    logStoreAction("draft", "updateDraft", { id });
    set((s) => {
      const drafts = s.drafts.map((d) =>
        d.id === id ? { ...d, ...patch, timestamp: Math.floor(Date.now() / 1000) } : d,
      );
      return { drafts, nonEmptyDraftCount: countNonEmptyDrafts(drafts) };
    });
  },

  removeDraft(id) {
    logStoreAction("draft", "removeDraft", { id });
    set((s) => {
      const drafts = s.drafts.filter((d) => d.id !== id);
      return { drafts, nonEmptyDraftCount: countNonEmptyDrafts(drafts) };
    });
  },

  removeDraftByIdentifier(identifier) {
    logStoreAction("draft", "removeDraftByIdentifier", { identifier });
    set((s) => {
      const drafts = s.drafts.filter((d) => (d.id ?? d.timestamp) !== identifier);
      return { drafts, nonEmptyDraftCount: countNonEmptyDrafts(drafts) };
    });
  },

  removeDraftForChat(type, to, topic) {
    logStoreAction("draft", "removeDraftForChat", { draftType: type });
    const targetKey = buildDraftChatKey(type, to, topic);
    set((s) => {
      const drafts = s.drafts.filter(
        (draft) => buildDraftChatKey(draft.type, draft.to, draft.topic) !== targetKey,
      );
      return { drafts, nonEmptyDraftCount: countNonEmptyDrafts(drafts) };
    });
  },

  getDraftForChat(type, to, topic) {
    const targetKey = buildDraftChatKey(type, to, topic);
    return get().drafts.find(
      (draft) => buildDraftChatKey(draft.type, draft.to, draft.topic) === targetKey,
    );
  },

  clear() {
    logStoreAction("draft", "clear", {});
    set({ drafts: [], nonEmptyDraftCount: 0 });
  },
}));
