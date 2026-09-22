import { create } from "zustand";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";

export type RightDrawerMode = "info" | "settings" | "user-menu" | "about" | "personal-info";
export type RightDrawerLayerKind = "chat-info" | "account" | "about";
export type RightDrawerAccountScreen =
  | "root"
  | "settings"
  | "appearance"
  | "about"
  | "personal-info";
export type RightDrawerProfileOverride =
  | { kind: "legacy-user-id"; userId: number }
  | { kind: "workspace-user-uuid"; userUuid: MessengerUuid };

export interface RightDrawerScreen {
  mode: RightDrawerMode;
  accountScreen?: RightDrawerAccountScreen;
  profileOverride?: RightDrawerProfileOverride;
}

export interface RightDrawerLayer {
  kind: RightDrawerLayerKind;
  screens: RightDrawerScreen[];
}

interface RightDrawerState {
  /** Visibility is independent from navigation history so toggle can collapse without losing it. */
  open: boolean;
  layers: RightDrawerLayer[];
  /** Compatibility projections consumed by the existing layout while the active screen is rendered. */
  mode: RightDrawerMode;
  accountScreen: RightDrawerAccountScreen | null;
  userIdOverride: number | null;
  workspaceUserUuidOverride: MessengerUuid | null;

  setOpen: (open: boolean) => void;
  toggleVisibility: () => void;
  toggleChatInfo: () => void;
  toggleUserMenu: () => void;
  openLayer: (layer: RightDrawerLayer) => void;
  openScreen: (screen: RightDrawerScreen) => void;
  openAccountScreen: (screen: RightDrawerAccountScreen) => void;
  back: () => void;
  closeCurrent: () => void;
  clearAll: () => void;

  /** Compatibility actions for existing entry points. */
  close: () => void;
  openInfo: () => void;
  openSettings: () => void;
  openUserMenu: () => void;
  openAbout: () => void;
  openPersonalInfo: () => void;
  openUserProfile: (userId: number) => void;
  openWorkspaceUserProfile: (userUuid: MessengerUuid) => void;
  clearUserProfileOverride: () => void;
}

const CHAT_INFO_SCREEN: RightDrawerScreen = { mode: "info" };
const ACCOUNT_ROOT_SCREEN: RightDrawerScreen = {
  mode: "user-menu",
  accountScreen: "root",
};

function accountScreen(screen: RightDrawerAccountScreen): RightDrawerScreen {
  return { mode: "user-menu", accountScreen: screen };
}

function project(open: boolean, layers: RightDrawerLayer[]) {
  const screen = layers.at(-1)?.screens.at(-1);
  const profileOverride = screen?.profileOverride;

  return {
    open,
    layers,
    mode: screen?.mode ?? "info",
    accountScreen: screen?.accountScreen ?? null,
    userIdOverride: profileOverride?.kind === "legacy-user-id" ? profileOverride.userId : null,
    workspaceUserUuidOverride:
      profileOverride?.kind === "workspace-user-uuid" ? profileOverride.userUuid : null,
  };
}

function profileScreen(profileOverride: RightDrawerProfileOverride): RightDrawerScreen {
  return { mode: "info", profileOverride };
}

function sameProfileOverride(
  left: RightDrawerProfileOverride | undefined,
  right: RightDrawerProfileOverride | undefined,
): boolean {
  if (left == null || right == null) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === "legacy-user-id") {
    return right.kind === "legacy-user-id" && left.userId === right.userId;
  }
  return right.kind === "workspace-user-uuid" && left.userUuid === right.userUuid;
}

function sameScreen(left: RightDrawerScreen | undefined, right: RightDrawerScreen): boolean {
  return (
    left?.mode === right.mode &&
    left.accountScreen === right.accountScreen &&
    sameProfileOverride(left.profileOverride, right.profileOverride)
  );
}

export const useRightDrawerStore = create<RightDrawerState>((set, get) => ({
  ...project(false, []),
  setOpen(open) {
    logStoreAction("rightDrawer", "setOpen", { open });
    set((state) => {
      if (!open) return { ...state, open: false };
      if (state.layers.length > 0) return { ...state, open: true };
      return project(true, [{ kind: "chat-info", screens: [CHAT_INFO_SCREEN] }]);
    });
  },
  toggleVisibility() {
    logStoreAction("rightDrawer", "toggleVisibility", {});
    set((state) => {
      if (state.layers.length === 0) {
        return project(true, [{ kind: "chat-info", screens: [CHAT_INFO_SCREEN] }]);
      }
      return { ...state, open: !state.open };
    });
  },
  toggleChatInfo() {
    const state = get();
    if (state.layers.at(-1)?.kind === "chat-info") {
      state.toggleVisibility();
      return;
    }
    state.openInfo();
  },
  toggleUserMenu() {
    const state = get();
    if (state.layers.at(-1)?.kind === "account") {
      state.toggleVisibility();
      return;
    }
    state.openUserMenu();
  },
  openLayer(layer) {
    set((state) => {
      const active = state.layers.at(-1);
      const layers =
        active?.kind === layer.kind
          ? [...state.layers.slice(0, -1), layer]
          : [...state.layers, layer];
      return project(true, layers);
    });
  },
  openScreen(screen) {
    set((state) => {
      const layers = [...state.layers];
      const active = layers.at(-1);
      if (active == null) return state;
      if (sameScreen(active.screens.at(-1), screen)) return project(true, layers);

      layers[layers.length - 1] = { ...active, screens: [...active.screens, screen] };
      return project(true, layers);
    });
  },
  openAccountScreen(screen) {
    const state = get();
    if (state.layers.at(-1)?.kind !== "account") {
      state.openLayer({
        kind: "account",
        screens:
          screen === "root" ? [ACCOUNT_ROOT_SCREEN] : [ACCOUNT_ROOT_SCREEN, accountScreen(screen)],
      });
      return;
    }
    state.openScreen(accountScreen(screen));
  },
  back() {
    logStoreAction("rightDrawer", "back", {});
    set((state) => {
      const layers = [...state.layers];
      const active = layers.at(-1);
      if (active == null || active.screens.length <= 1) return state;
      layers[layers.length - 1] = { ...active, screens: active.screens.slice(0, -1) };
      return project(true, layers);
    });
  },
  closeCurrent() {
    logStoreAction("rightDrawer", "closeCurrent", {});
    set((state) => {
      const layers = state.layers.slice(0, -1);
      return project(layers.length > 0, layers);
    });
  },
  clearAll() {
    logStoreAction("rightDrawer", "clearAll", {});
    set(project(false, []));
  },
  close() {
    get().closeCurrent();
  },
  openInfo() {
    logStoreAction("rightDrawer", "openInfo", {});
    get().openLayer({ kind: "chat-info", screens: [CHAT_INFO_SCREEN] });
  },
  openSettings() {
    logStoreAction("rightDrawer", "openSettings", {});
    get().openAccountScreen("settings");
  },
  openUserMenu() {
    logStoreAction("rightDrawer", "openUserMenu", {});
    get().openLayer({ kind: "account", screens: [ACCOUNT_ROOT_SCREEN] });
  },
  openAbout() {
    logStoreAction("rightDrawer", "openAbout", {});
    get().openLayer({ kind: "about", screens: [{ mode: "about" }] });
  },
  openPersonalInfo() {
    logStoreAction("rightDrawer", "openPersonalInfo", {});
    get().openAccountScreen("personal-info");
  },
  openUserProfile(userId) {
    logStoreAction("rightDrawer", "openUserProfile", { userId });
    const state = get();
    const screen = profileScreen({ kind: "legacy-user-id", userId });
    if (state.layers.at(-1)?.kind === "chat-info") state.openScreen(screen);
    else state.openLayer({ kind: "chat-info", screens: [CHAT_INFO_SCREEN, screen] });
  },
  openWorkspaceUserProfile(userUuid) {
    logStoreAction("rightDrawer", "openWorkspaceUserProfile", { userUuid });
    const state = get();
    const screen = profileScreen({ kind: "workspace-user-uuid", userUuid });
    if (state.layers.at(-1)?.kind === "chat-info") state.openScreen(screen);
    else state.openLayer({ kind: "chat-info", screens: [CHAT_INFO_SCREEN, screen] });
  },
  clearUserProfileOverride() {
    logStoreAction("rightDrawer", "clearUserProfileOverride", {});
    const state = get();
    if (state.layers.at(-1)?.screens.at(-1)?.profileOverride != null) state.back();
  },
}));
