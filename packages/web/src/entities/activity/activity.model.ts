import { create } from "zustand";

export interface ActivityState {
  staleVersion: number;
  unreadMentionsOwnerKey: string | null;
  unreadMentionsCount: number | null;
  markStale: () => void;
  setUnreadMentionsOwner: (ownerKey: string | null) => void;
  setUnreadMentionsCount: (ownerKey: string, count: number) => void;
  clear: () => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  staleVersion: 0,
  unreadMentionsOwnerKey: null,
  unreadMentionsCount: null,
  markStale: () => set((state) => ({ staleVersion: state.staleVersion + 1 })),
  setUnreadMentionsOwner: (ownerKey) =>
    set((state) =>
      state.unreadMentionsOwnerKey === ownerKey
        ? state
        : { unreadMentionsOwnerKey: ownerKey, unreadMentionsCount: null },
    ),
  setUnreadMentionsCount: (ownerKey, count) =>
    set((state) =>
      state.unreadMentionsOwnerKey === ownerKey
        ? { unreadMentionsCount: Math.max(0, count) }
        : state,
    ),
  clear: () => set({ staleVersion: 0, unreadMentionsOwnerKey: null, unreadMentionsCount: null }),
}));
