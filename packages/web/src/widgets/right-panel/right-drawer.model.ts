import { create } from "zustand";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";

export type RightDrawerMode = "info" | "settings" | "user-menu" | "about" | "personal-info";

interface RightDrawerState {
  open: boolean;
  mode: RightDrawerMode;
  userIdOverride: number | null;
  workspaceUserUuidOverride: MessengerUuid | null;

  setOpen: (open: boolean) => void;
  close: () => void;
  openInfo: () => void;
  openSettings: () => void;
  openUserMenu: () => void;
  openAbout: () => void;
  /** Own profile card opened from the account menu (shell title + back). */
  openPersonalInfo: () => void;
  openUserProfile: (userId: number) => void;
  openWorkspaceUserProfile: (userUuid: MessengerUuid) => void;
  /** Clears nested user profile (from members list / message author) while keeping the drawer open on chat info. */
  clearUserProfileOverride: () => void;
}

export const useRightDrawerStore = create<RightDrawerState>((set) => ({
  open: false,
  mode: "info",
  userIdOverride: null,
  workspaceUserUuidOverride: null,

  setOpen(open) {
    logStoreAction("rightDrawer", "setOpen", { open });
    set((state) =>
      open
        ? { ...state, open }
        : {
            ...state,
            open: false,
            mode: "info",
            userIdOverride: null,
            workspaceUserUuidOverride: null,
          },
    );
  },
  close() {
    logStoreAction("rightDrawer", "close", {});
    set({ open: false, mode: "info", userIdOverride: null, workspaceUserUuidOverride: null });
  },
  openInfo() {
    logStoreAction("rightDrawer", "openInfo", {});
    set({ open: true, mode: "info", userIdOverride: null, workspaceUserUuidOverride: null });
  },
  openSettings() {
    logStoreAction("rightDrawer", "openSettings", {});
    set({ open: true, mode: "settings", userIdOverride: null, workspaceUserUuidOverride: null });
  },
  openUserMenu() {
    logStoreAction("rightDrawer", "openUserMenu", {});
    set({ open: true, mode: "user-menu", userIdOverride: null, workspaceUserUuidOverride: null });
  },
  openAbout() {
    logStoreAction("rightDrawer", "openAbout", {});
    set({ open: true, mode: "about", userIdOverride: null, workspaceUserUuidOverride: null });
  },
  openPersonalInfo() {
    logStoreAction("rightDrawer", "openPersonalInfo", {});
    set({
      open: true,
      mode: "personal-info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
  },
  openUserProfile(userId) {
    logStoreAction("rightDrawer", "openUserProfile", { userId });
    set({ open: true, mode: "info", userIdOverride: userId, workspaceUserUuidOverride: null });
  },
  openWorkspaceUserProfile(userUuid) {
    logStoreAction("rightDrawer", "openWorkspaceUserProfile", { userUuid });
    set({ open: true, mode: "info", userIdOverride: null, workspaceUserUuidOverride: userUuid });
  },
  clearUserProfileOverride() {
    logStoreAction("rightDrawer", "clearUserProfileOverride", {});
    set({ userIdOverride: null, workspaceUserUuidOverride: null });
  },
}));
