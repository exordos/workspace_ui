import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { stickerCatalogRepository } from "./sticker-catalog.api";
import type { RecentSticker, Sticker, StickerPack } from "./sticker.types";

const APPROVED_PACK_ID = "workspace-approved-stickers";
const MAX_RECENT = 30;

interface StickerState {
  packs: StickerPack[];
  recent: RecentSticker[];
  loading: boolean;
  error: string | null;
  searchResults: Sticker[];
  /** Provider results retained only for the current app session. */
  sessionStickers: Sticker[];
  searchLoading: boolean;
  searchError: string | null;
  addRecent: (sticker: Sticker) => void;
  loadCatalog: (signal?: AbortSignal) => Promise<void>;
  searchCatalog: (query: string, signal?: AbortSignal) => Promise<void>;
  clearSearch: () => void;
}

let catalogLoadGeneration = 0;
let catalogSearchGeneration = 0;

function createApprovedPacks(stickers: readonly Sticker[]): StickerPack[] {
  if (stickers.length === 0) return [];
  return [
    {
      id: APPROVED_PACK_ID,
      title: "Workspace",
      coverStickerId: stickers[0]?.id,
      stickers: [...stickers],
    },
  ];
}

export const useStickerStore = create<StickerState>((set) => ({
  packs: [],
  recent: [],
  loading: false,
  error: null,
  searchResults: [],
  sessionStickers: [],
  searchLoading: false,
  searchError: null,

  addRecent(sticker) {
    logStoreAction("sticker", "addRecent", { stickerId: sticker.id });
    set((state) => ({
      recent: [
        { stickerId: sticker.id, usedAt: Date.now() },
        ...state.recent.filter((entry) => entry.stickerId !== sticker.id),
      ].slice(0, MAX_RECENT),
      sessionStickers: [
        sticker,
        ...state.sessionStickers.filter((entry) => entry.id !== sticker.id),
      ].slice(0, MAX_RECENT),
    }));
  },

  async loadCatalog(signal) {
    const generation = ++catalogLoadGeneration;
    set({ loading: true, error: null });
    try {
      const stickers = await stickerCatalogRepository.list(signal);
      if (generation !== catalogLoadGeneration) return;
      if (signal?.aborted === true) {
        set({ loading: false });
        return;
      }
      set({
        packs: createApprovedPacks(stickers),
        loading: false,
        error: null,
      });
    } catch (error) {
      if (generation !== catalogLoadGeneration) return;
      if (signal?.aborted === true) {
        set({ loading: false });
        return;
      }
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load sticker catalog",
      });
    }
  },

  async searchCatalog(query, signal) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) {
      catalogSearchGeneration += 1;
      set({ searchResults: [], searchLoading: false, searchError: null });
      return;
    }

    const generation = ++catalogSearchGeneration;
    set({ searchResults: [], searchLoading: true, searchError: null });
    try {
      const stickers = await stickerCatalogRepository.search(normalizedQuery, signal);
      if (generation !== catalogSearchGeneration) return;
      if (signal?.aborted === true) {
        set({ searchLoading: false });
        return;
      }
      set({ searchResults: [...stickers], searchLoading: false, searchError: null });
    } catch (error) {
      if (generation !== catalogSearchGeneration) return;
      if (signal?.aborted === true) {
        set({ searchLoading: false });
        return;
      }
      set({
        searchResults: [],
        searchLoading: false,
        searchError: error instanceof Error ? error.message : "Failed to search stickers",
      });
    }
  },

  clearSearch() {
    catalogSearchGeneration += 1;
    set({ searchResults: [], searchLoading: false, searchError: null });
  },
}));
