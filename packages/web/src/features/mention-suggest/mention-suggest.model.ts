/**
 * Mention Suggest store — manages @mention autocomplete state.
 *
 * The composer sets the query when the user types after "@", the
 * consumer filters users via filterUsers() and pushes results here.
 * Visibility is toggled to show/hide the suggestion dropdown.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { MentionSuggestState, MentionSuggestion } from "./mention-suggest.types";

const EMPTY_RESULTS: MentionSuggestion[] = [];

export const useMentionSuggestStore = create<MentionSuggestState>((set) => ({
  query: "",
  results: EMPTY_RESULTS,
  visible: false,

  setQuery(query: string) {
    logStoreAction("mention-suggest", "setQuery", { query });
    set({ query });
  },

  setResults(results: MentionSuggestion[]) {
    logStoreAction("mention-suggest", "setResults", { count: results.length });
    set({ results });
  },

  show() {
    logStoreAction("mention-suggest", "show", {});
    set({ visible: true });
  },

  hide() {
    logStoreAction("mention-suggest", "hide", {});
    set({ visible: false, query: "", results: EMPTY_RESULTS });
  },

  clear() {
    logStoreAction("mention-suggest", "clear", {});
    set({ query: "", results: EMPTY_RESULTS, visible: false });
  },
}));
