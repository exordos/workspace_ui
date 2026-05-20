/**
 * Sticker store — manages installed packs, recently used, and favorites.
 *
 * Persists installed pack IDs and recent stickers to localStorage.
 * The actual sticker data comes from the API (when backend is ready)
 * or from local mock data during development.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { RecentSticker, Sticker, StickerPack } from "./sticker.types";

const RECENT_KEY = "sticker_recent";
const FAVORITES_KEY = "sticker_favorites";
const MAX_RECENT = 30;
const MAX_FAVORITES = 50;

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — silently degrade */
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface StickerState {
  /** All available sticker packs (from server + local). */
  packs: StickerPack[];
  /** Recently used stickers (most recent first). */
  recent: RecentSticker[];
  /** Favorite sticker IDs (quick access). */
  favorites: string[];
  /** Currently loading packs from server. */
  loading: boolean;

  // Actions
  setPacks: (packs: StickerPack[]) => void;
  addPack: (pack: StickerPack) => void;
  removePack: (packId: string) => void;
  addRecent: (stickerId: string, packId: string) => void;
  toggleFavorite: (stickerId: string) => void;
  isFavorite: (stickerId: string) => boolean;
  setLoading: (loading: boolean) => void;

  // Queries
  getSticker: (stickerId: string) => Sticker | undefined;
  getPack: (packId: string) => StickerPack | undefined;
  searchByEmoji: (emoji: string) => Sticker[];
  getRecentStickers: () => Sticker[];
  getFavoriteStickers: () => Sticker[];
}

let _cachedRecentRef: RecentSticker[] | null = null;
let _cachedRecentStickers: Sticker[] = [];
let _cachedFavoritesRef: string[] | null = null;
let _cachedFavoriteStickers: Sticker[] = [];
function invalidateStickerListCaches(): void {
  _cachedRecentRef = null;
  _cachedRecentStickers = [];
  _cachedFavoritesRef = null;
  _cachedFavoriteStickers = [];
}

function invalidateStickerLookupCache(): void {
  invalidateStickerListCaches();
}

export const useStickerStore = create<StickerState>((set, get) => ({
  packs: [],
  recent: loadJson<RecentSticker[]>(RECENT_KEY, []),
  favorites: loadJson<string[]>(FAVORITES_KEY, []),
  loading: false,

  setPacks(packs) {
    logStoreAction("sticker", "setPacks", { count: packs.length });
    invalidateStickerLookupCache();
    set({ packs });
  },

  addPack(pack) {
    logStoreAction("sticker", "addPack", { packId: pack.id });
    set((state) => {
      if (state.packs.some((p) => p.id === pack.id)) return state;
      invalidateStickerLookupCache();
      return { packs: [...state.packs, pack] };
    });
  },

  removePack(packId) {
    logStoreAction("sticker", "removePack", { packId });
    set((state) => {
      invalidateStickerLookupCache();
      return {
        packs: state.packs.filter((p) => p.id !== packId),
        recent: state.recent.filter((r) => r.packId !== packId),
      };
    });
  },

  addRecent(stickerId, packId) {
    logStoreAction("sticker", "addRecent", { stickerId, packId });
    set((state) => {
      const filtered = state.recent.filter((r) => r.stickerId !== stickerId);
      const next: RecentSticker[] = [{ stickerId, packId, usedAt: Date.now() }, ...filtered].slice(
        0,
        MAX_RECENT,
      );
      saveJson(RECENT_KEY, next);
      invalidateStickerListCaches();
      return { recent: next };
    });
  },

  toggleFavorite(stickerId) {
    logStoreAction("sticker", "toggleFavorite", { stickerId });
    set((state) => {
      const isFav = state.favorites.includes(stickerId);
      const next = isFav
        ? state.favorites.filter((id) => id !== stickerId)
        : [...state.favorites, stickerId].slice(0, MAX_FAVORITES);
      saveJson(FAVORITES_KEY, next);
      invalidateStickerListCaches();
      return { favorites: next };
    });
  },

  isFavorite(stickerId) {
    return get().favorites.includes(stickerId);
  },

  setLoading(loading) {
    logStoreAction("sticker", "setLoading", { loading });
    set({ loading });
  },

  getSticker(stickerId) {
    for (const pack of get().packs) {
      const found = pack.stickers.find((s) => s.id === stickerId);
      if (found) return found;
    }
    return undefined;
  },

  getPack(packId) {
    return get().packs.find((p) => p.id === packId);
  },

  searchByEmoji(emoji) {
    const results: Sticker[] = [];
    const q = emoji.toLowerCase();
    for (const pack of get().packs) {
      for (const s of pack.stickers) {
        if (s.emoji.includes(q) || s.alt?.toLowerCase().includes(q)) {
          results.push(s);
        }
      }
    }
    return results;
  },

  getRecentStickers() {
    const state = get();
    if (state.recent === _cachedRecentRef && _cachedRecentStickers.length > 0) {
      return _cachedRecentStickers;
    }
    _cachedRecentRef = state.recent;
    _cachedRecentStickers = state.recent
      .map((r) => state.getSticker(r.stickerId))
      .filter((s): s is Sticker => s != null);
    return _cachedRecentStickers;
  },

  getFavoriteStickers() {
    const state = get();
    if (state.favorites === _cachedFavoritesRef) {
      return _cachedFavoriteStickers;
    }
    _cachedFavoritesRef = state.favorites;
    _cachedFavoriteStickers = state.favorites
      .map((id) => state.getSticker(id))
      .filter((s): s is Sticker => s != null);
    return _cachedFavoriteStickers;
  },
}));
