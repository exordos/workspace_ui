import { create } from "zustand";

export interface ActivityState {
  staleVersion: number;
  markStale: () => void;
  clear: () => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  staleVersion: 0,
  markStale: () => set((state) => ({ staleVersion: state.staleVersion + 1 })),
  clear: () => set({ staleVersion: 0 }),
}));
