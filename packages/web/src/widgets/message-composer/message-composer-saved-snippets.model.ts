/**
 * Saved snippets store for the composer: SWR+TTL cache, in-flight dedupe, per-instance data.
 * Refresh errors do not clear an already shown list.
 */
import { create } from "zustand";
import { getCurrentInstance } from "~/shared/api/client";
import { createSavedSnippet, fetchSavedSnippets } from "~/shared/api/zulip-messages";
import type { SavedSnippet } from "~/shared/api/zulip.types";
import { logStoreAction } from "~/shared/lib/logger";

export const SAVED_SNIPPETS_TTL_MS = 60_000;

const FALLBACK_INSTANCE_ID = "__no_instance__";

type SavedSnippetsErrorCode = "load_failed" | "create_failed";

interface SavedSnippetsCacheEntry {
  snippets: SavedSnippet[];
  fetchedAt: number;
}

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

const snippetsCacheByInstance = new Map<string, SavedSnippetsCacheEntry>();
const snippetsInFlightByInstance = new Map<string, Promise<SavedSnippet[]>>();

function resolveInstanceId(): string {
  return getCurrentInstance()?.id ?? FALLBACK_INSTANCE_ID;
}

function cloneSnippets(snippets: readonly SavedSnippet[]): SavedSnippet[] {
  return snippets.map((snippet) => ({ ...snippet }));
}

function sortSnippetsByTitle(snippets: readonly SavedSnippet[]): SavedSnippet[] {
  return [...snippets].sort((left, right) => left.title.localeCompare(right.title));
}

function isCacheFresh(entry: SavedSnippetsCacheEntry | undefined, now: number): boolean {
  return entry != null && now - entry.fetchedAt < SAVED_SNIPPETS_TTL_MS;
}

function mergeSnippet(
  snippets: readonly SavedSnippet[],
  incoming: SavedSnippet,
  options?: { preferIncomingById?: boolean },
): SavedSnippet[] {
  const preferIncomingById = options?.preferIncomingById === true;
  const existingIndex = snippets.findIndex((snippet) =>
    preferIncomingById ? snippet.id === incoming.id : snippet.title === incoming.title,
  );
  if (existingIndex < 0) {
    return sortSnippetsByTitle([...snippets, incoming]);
  }
  const next = [...snippets];
  next[existingIndex] = incoming;
  return sortSnippetsByTitle(next);
}

async function fetchSavedSnippetsDeduped(instanceId: string): Promise<SavedSnippet[]> {
  const inFlight = snippetsInFlightByInstance.get(instanceId);
  if (inFlight != null) {
    return inFlight;
  }
  const request = fetchSavedSnippets()
    .then((snippets) => {
      const normalized = sortSnippetsByTitle(cloneSnippets(snippets));
      snippetsCacheByInstance.set(instanceId, {
        snippets: normalized,
        fetchedAt: Date.now(),
      });
      return normalized;
    })
    .finally(() => {
      if (snippetsInFlightByInstance.get(instanceId) === request) {
        snippetsInFlightByInstance.delete(instanceId);
      }
    });
  snippetsInFlightByInstance.set(instanceId, request);
  return request;
}

export const useComposerSavedSnippetsStore = create<SavedSnippetsModelState>((set, get) => ({
  snippets: [],
  loadingInitial: false,
  refreshing: false,
  error: null,
  hasLoadedOnce: false,
  requestVersion: 0,

  async openSavedSnippets() {
    const instanceId = resolveInstanceId();
    const cached = snippetsCacheByInstance.get(instanceId);
    const now = Date.now();
    const hasCachedData = cached != null && cached.snippets.length > 0;

    logStoreAction("composerSavedSnippets", "openSavedSnippets", {
      hasCachedData,
      cacheFresh: isCacheFresh(cached, now),
    });

    if (cached != null) {
      set({
        snippets: cloneSnippets(cached.snippets),
        hasLoadedOnce: true,
        error: null,
        loadingInitial: false,
        refreshing: false,
      });
    } else {
      set({ error: null, loadingInitial: true, refreshing: false });
    }

    const shouldRefresh = !isCacheFresh(cached, now);
    if (!shouldRefresh) {
      return;
    }
    await get().refreshSavedSnippets({ force: true });
  },

  async refreshSavedSnippets(options) {
    const force = options?.force === true;
    const instanceId = resolveInstanceId();
    const cached = snippetsCacheByInstance.get(instanceId);
    const now = Date.now();

    if (!force && isCacheFresh(cached, now)) {
      return;
    }

    const nextRequestVersion = get().requestVersion + 1;
    const hasCachedData = cached != null && cached.snippets.length > 0;
    set({
      requestVersion: nextRequestVersion,
      error: null,
      loadingInitial: !hasCachedData,
      refreshing: hasCachedData,
    });

    logStoreAction("composerSavedSnippets", "refreshSavedSnippets", {
      force,
      hasCachedData,
    });

    try {
      const snippets = await fetchSavedSnippetsDeduped(instanceId);
      if (get().requestVersion !== nextRequestVersion) return;
      set({
        snippets,
        loadingInitial: false,
        refreshing: false,
        error: null,
        hasLoadedOnce: true,
      });
    } catch {
      if (get().requestVersion !== nextRequestVersion) return;
      set((state) => ({
        loadingInitial: false,
        refreshing: false,
        error: "load_failed",
        hasLoadedOnce: state.hasLoadedOnce || state.snippets.length > 0,
      }));
    }
  },

  async createSavedSnippetAndSync(params) {
    const title = params.title.trim();
    const content = params.content.trim();
    if (title.length === 0 || content.length === 0) {
      return;
    }

    logStoreAction("composerSavedSnippets", "createSavedSnippetAndSync", {
      titleLength: title.length,
      contentLength: content.length,
    });

    const instanceId = resolveInstanceId();
    try {
      const createdSnippetId = await createSavedSnippet({ title, content });
      const optimisticSnippet: SavedSnippet = {
        id: createdSnippetId > 0 ? createdSnippetId : -Date.now(),
        title,
        content,
        date_created: Math.floor(Date.now() / 1000),
      };
      const currentSnippets = get().snippets;
      const merged = mergeSnippet(currentSnippets, optimisticSnippet, { preferIncomingById: true });
      snippetsCacheByInstance.set(instanceId, {
        snippets: merged,
        fetchedAt: Date.now(),
      });
      set({
        snippets: merged,
        hasLoadedOnce: true,
        error: null,
      });
      void get().refreshSavedSnippets({ force: true });
    } catch {
      set({ error: "create_failed" });
    }
  },

  clearSavedSnippetsError() {
    set({ error: null });
  },
}));

export function resetComposerSavedSnippetsModelForTests(): void {
  snippetsCacheByInstance.clear();
  snippetsInFlightByInstance.clear();
  useComposerSavedSnippetsStore.setState({
    snippets: [],
    loadingInitial: false,
    refreshing: false,
    error: null,
    hasLoadedOnce: false,
    requestVersion: 0,
  });
}
