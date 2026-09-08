import { create } from "zustand";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { MessengerApiError } from "~/shared/api/messenger-client";
import { setStickerFavorite } from "~/shared/api/messenger-stickers.api";
import type { StickerListQuery } from "~/shared/api/messenger-stickers.api";
import {
  loadWorkspaceStickerPage,
  stickerRequestOptions,
  stickerRuntimeKey,
} from "./sticker-workspace.repository";
import type { Sticker } from "./sticker.types";

interface StickerState {
  ownerKey: string | null;
  items: Sticker[];
  query: StickerListQuery;
  nextPageMarker: string | null;
  loading: boolean;
  error: string | null;
  mutationError: string | null;
  pendingFavorites: readonly string[];
  revision: number;
  loadCatalog: (query?: StickerListQuery) => Promise<void>;
  loadMore: () => Promise<void>;
  toggleFavorite: (sticker: Sticker) => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
  cancelLoad: () => void;
}
let generation = 0;
let controller: AbortController | null = null;
const visitedMarkers = new Set<string>();
const initial = {
  ownerKey: null,
  items: [],
  query: {},
  nextPageMarker: null,
  loading: false,
  error: null,
  mutationError: null,
  pendingFavorites: [],
  revision: 0,
};
export const useStickerStore = create<StickerState>((set, get) => {
  const load = async (query: StickerListQuery, append: boolean) => {
    if (append && (get().loading || !get().nextPageMarker)) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    const version = ++generation;
    const ownerKey = stickerRuntimeKey();
    const marker = append ? get().nextPageMarker : null;
    if (!append) visitedMarkers.clear();
    const current = () =>
      version === generation && ownerKey === stickerRuntimeKey() && !request.signal.aborted;
    set({
      ownerKey,
      query,
      loading: true,
      error: null,
      ...(append ? {} : { items: [], nextPageMarker: null }),
    });
    try {
      const page = await loadWorkspaceStickerPage(
        { ...query, pageMarker: marker ?? undefined },
        request.signal,
      );
      if (!current()) return;
      checkPageMarker(page.nextPageMarker, marker);
      const byId = new Map((append ? get().items : []).map((item) => [item.id, item]));
      for (const item of page.items) byId.set(item.id, item);
      set({ items: [...byId.values()], nextPageMarker: page.nextPageMarker, loading: false });
    } catch (error) {
      if (current())
        set({
          loading: false,
          error: error instanceof Error ? error.message : "Sticker request failed",
          ...(error instanceof MessengerApiError && error.status === 400
            ? { nextPageMarker: null }
            : {}),
        });
    }
  };
  return {
    ...initial,
    loadCatalog: (query = {}) => load(query, false),
    loadMore: () => load(get().query, true),
    cancelLoad() {
      controller?.abort();
      generation += 1;
      set({ items: [], nextPageMarker: null, loading: false, error: null });
    },
    async refresh() {
      set((state) => ({ revision: state.revision + 1 }));
      await load(get().query, false);
    },
    async toggleFavorite(sticker) {
      // Serialize each card by disabling its action until the server confirms it.
      if (get().pendingFavorites.includes(sticker.id)) return;
      const owner = stickerRuntimeKey();
      const favorite = !sticker.isFavorite;
      set((state) => ({
        pendingFavorites: [...state.pendingFavorites, sticker.id],
        mutationError: null,
      }));
      try {
        await setStickerFavorite(stickerRequestOptions(), sticker.id, favorite);
        if (owner !== stickerRuntimeKey()) return;
        set((state) => ({
          items: state.items.flatMap((item) => {
            if (item.id !== sticker.id) return [item];
            return state.query.favorite && !favorite ? [] : [{ ...item, isFavorite: favorite }];
          }),
        }));
        if (get().loading) await load(get().query, false);
      } catch (error) {
        if (owner === stickerRuntimeKey())
          set({
            mutationError: error instanceof Error ? error.message : "Sticker favorite failed",
          });
      } finally {
        if (owner === stickerRuntimeKey())
          set((state) => ({
            pendingFavorites: state.pendingFavorites.filter((id) => id !== sticker.id),
          }));
      }
    },
    clear() {
      controller?.abort();
      generation += 1;
      set(initial);
    },
  };
});
let runtimeKey = stickerRuntimeKey();
useWorkspaceAuthStore.subscribe(() => {
  const next = stickerRuntimeKey();
  if (next !== runtimeKey) {
    runtimeKey = next;
    useStickerStore.getState().clear();
  }
});

function checkPageMarker(next: string | null, previous: string | null): void {
  if (next && (next === previous || visitedMarkers.has(next)))
    throw new Error("Repeated sticker page marker");
  if (previous) visitedMarkers.add(previous);
}
