import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { saveRecentDmPartners, loadRecentDmPartners } from "./recent-dms";

const RECENT_DM_KEY = "recent_dm_partners";

describe("recent-dms", () => {
  const store: Record<string, string> = {};
  const mockStorage: Storage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };

  beforeEach(() => {
    vi.stubGlobal("localStorage", mockStorage);
    store[RECENT_DM_KEY] = "";
    delete store[RECENT_DM_KEY];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("saveRecentDmPartners", () => {
    it("saves partner IDs to localStorage", () => {
      saveRecentDmPartners([1, 2, 3]);
      const raw = store[RECENT_DM_KEY];
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toEqual([1, 2, 3]);
    });

    it("limits to 50 partners", () => {
      const ids = Array.from({ length: 60 }, (_, i) => i + 1);
      saveRecentDmPartners(ids);
      const loaded = loadRecentDmPartners();
      expect(loaded).toHaveLength(50);
      expect(loaded).toEqual(ids.slice(0, 50));
    });
  });

  describe("loadRecentDmPartners", () => {
    it("returns empty array when nothing stored", () => {
      expect(loadRecentDmPartners()).toEqual([]);
    });

    it("returns saved partner IDs", () => {
      saveRecentDmPartners([42, 100, 7]);
      expect(loadRecentDmPartners()).toEqual([42, 100, 7]);
    });

    it("filters invalid values", () => {
      store[RECENT_DM_KEY] = JSON.stringify([1, "x", 2, null, 3.5, -1, 0]);
      expect(loadRecentDmPartners()).toEqual([1, 2]);
    });

    it("returns empty array for invalid JSON", () => {
      store[RECENT_DM_KEY] = "not json";
      expect(loadRecentDmPartners()).toEqual([]);
    });
  });
});
