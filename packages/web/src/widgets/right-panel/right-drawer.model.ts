import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

export type RightDrawerMode = "info" | "settings" | "user-menu" | "about" | "builds";

interface RightDrawerState {
  open: boolean;
  mode: RightDrawerMode;
  userIdOverride: number | null;

  setOpen: (open: boolean) => void;
  close: () => void;
  openInfo: () => void;
  openSettings: () => void;
  openUserMenu: () => void;
  openAbout: () => void;
  openBuilds: () => void;
  openUserProfile: (userId: number) => void;
  /** Clears nested user profile (from members list / message author) while keeping the drawer open on chat info. */
  clearUserProfileOverride: () => void;
}

export const useRightDrawerStore = create<RightDrawerState>((set) => ({
  open: false,
  mode: "info",
  userIdOverride: null,

  setOpen(open) {
    logStoreAction("rightDrawer", "setOpen", { open });
    set((state) =>
      open ? { ...state, open } : { ...state, open: false, mode: "info", userIdOverride: null },
    );
  },
  close() {
    logStoreAction("rightDrawer", "close", {});
    set({ open: false, mode: "info", userIdOverride: null });
  },
  openInfo() {
    logStoreAction("rightDrawer", "openInfo", {});
    set({ open: true, mode: "info", userIdOverride: null });
  },
  openSettings() {
    logStoreAction("rightDrawer", "openSettings", {});
    set({ open: true, mode: "settings", userIdOverride: null });
  },
  openUserMenu() {
    logStoreAction("rightDrawer", "openUserMenu", {});
    set({ open: true, mode: "user-menu", userIdOverride: null });
  },
  openAbout() {
    logStoreAction("rightDrawer", "openAbout", {});
    set({ open: true, mode: "about", userIdOverride: null });
  },
  openBuilds() {
    logStoreAction("rightDrawer", "openBuilds", {});
    set({ open: true, mode: "builds", userIdOverride: null });
  },
  openUserProfile(userId) {
    logStoreAction("rightDrawer", "openUserProfile", { userId });
    set({ open: true, mode: "info", userIdOverride: userId });
  },
  clearUserProfileOverride() {
    logStoreAction("rightDrawer", "clearUserProfileOverride", {});
    set({ userIdOverride: null });
  },
}));
