import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { SavedSnippet } from "./message-composer-saved-snippets.types";

export const SAVED_SNIPPETS_TTL_MS = 60_000;

type SavedSnippetsErrorCode = "load_failed" | "create_failed" | "unsupported";

interface RefreshOptions {
  force?: boolean;
}

interface SavedSnippetsModelState {
  snippets: SavedSnippet[];
  loadingInitial: boolean;
  refreshing: boolean;
  error: SavedSnippetsErrorCode | null;
  hasLoadedOnce: boolean;
  requestVersion: number;
  openSavedSnippets: () => Promise<void>;
  refreshSavedSnippets: (options?: RefreshOptions) => Promise<void>;
  createSavedSnippetAndSync: (params: { title: string; content: string }) => Promise<void>;
  clearSavedSnippetsError: () => void;
}

export const useComposerSavedSnippetsStore = create<SavedSnippetsModelState>((set, get) => ({
  snippets: [],
  loadingInitial: false,
  refreshing: false,
  error: null,
  hasLoadedOnce: false,
  requestVersion: 0,

  openSavedSnippets() {
    logStoreAction("composerSavedSnippets", "openSavedSnippets", {
      supported: false,
    });

    set({
      snippets: [],
      loadingInitial: false,
      refreshing: false,
      error: null,
      hasLoadedOnce: true,
    });
    return Promise.resolve();
  },

  refreshSavedSnippets(options) {
    logStoreAction("composerSavedSnippets", "refreshSavedSnippets", {
      force: options?.force === true,
      supported: false,
    });

    set({
      snippets: [],
      loadingInitial: false,
      refreshing: false,
      error: null,
      hasLoadedOnce: true,
      requestVersion: get().requestVersion + 1,
    });
    return Promise.resolve();
  },

  createSavedSnippetAndSync(params) {
    const title = params.title.trim();
    const content = params.content.trim();
    if (title.length === 0 || content.length === 0) {
      return Promise.resolve();
    }

    logStoreAction("composerSavedSnippets", "createSavedSnippetAndSync", {
      titleLength: title.length,
      contentLength: content.length,
      supported: false,
    });

    set({
      snippets: [],
      loadingInitial: false,
      refreshing: false,
      error: "unsupported",
      hasLoadedOnce: true,
    });
    return Promise.resolve();
  },

  clearSavedSnippetsError() {
    set({ error: null });
  },
}));

export function resetComposerSavedSnippetsModelForTests(): void {
  useComposerSavedSnippetsStore.setState({
    snippets: [],
    loadingInitial: false,
    refreshing: false,
    error: null,
    hasLoadedOnce: false,
    requestVersion: 0,
  });
}
