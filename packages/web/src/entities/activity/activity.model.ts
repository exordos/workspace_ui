import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

interface ActivityState {
  staleVersion: number;
  markStale: () => void;
  clear: () => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  staleVersion: 0,

  markStale() {
    logStoreAction("activity", "markStale", {});
    set((state) => ({ staleVersion: state.staleVersion + 1 }));
  },

  clear() {
    logStoreAction("activity", "clear", {});
    set({ staleVersion: 0 });
  },
}));
