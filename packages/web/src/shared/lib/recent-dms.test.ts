import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { saveRecentDmPartners, loadRecentDmPartners } from "./recent-dms";

const RECENT_DM_KEY = "recent_dm_partners";
const userUuid = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

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
      const ids = [userUuid(1), userUuid(2), userUuid(3)];
      saveRecentDmPartners(ids);
      const raw = store[RECENT_DM_KEY];
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toEqual(ids);
    });

    it("limits to 50 partners", () => {
      const ids = Array.from({ length: 60 }, (_, index) => userUuid(index + 1));
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
      const ids = [userUuid(42), userUuid(100), userUuid(7)];
      saveRecentDmPartners(ids);
      expect(loadRecentDmPartners()).toEqual(ids);
    });

    it("filters invalid values", () => {
      const validIds = [userUuid(1), userUuid(2)];
      store[RECENT_DM_KEY] = JSON.stringify([validIds[0], "x", validIds[1], null, 3.5, -1, 0]);
      expect(loadRecentDmPartners()).toEqual(validIds);
    });

    it("returns empty array for invalid JSON", () => {
      store[RECENT_DM_KEY] = "not json";
      expect(loadRecentDmPartners()).toEqual([]);
    });
  });
});
