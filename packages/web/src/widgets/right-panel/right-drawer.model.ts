import { create } from "zustand";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import type { EncryptedChatInfoScreen } from "~/features/encrypted-chat-info/encrypted-chat-info.types";
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

export interface RightDrawerChatScope {
  readonly ownerKey: string;
  readonly runtimeGeneration: number;
  readonly streamUuid: MessengerUuid;
}
export interface RightDrawerChatScreen extends RightDrawerChatScope {
  readonly screen: EncryptedChatInfoScreen;
}
export function sameRightDrawerChatScope(
  left: RightDrawerChatScope | null | undefined,
  right: RightDrawerChatScope | null | undefined,
): boolean {
  return (
    left != null &&
    left.ownerKey === right?.ownerKey &&
    left.runtimeGeneration === right.runtimeGeneration &&
    left.streamUuid === right.streamUuid
  );
}

export interface RightDrawerScreen {
  mode: RightDrawerMode;
  accountScreen?: RightDrawerAccountScreen;
  chatScreen?: RightDrawerChatScreen;
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
  chatScreen: RightDrawerChatScreen | null;
  userIdOverride: number | null;
  workspaceUserUuidOverride: MessengerUuid | null;

  setOpen: (open: boolean) => void;
  toggleVisibility: () => void;
  toggleChatInfo: () => void;
  toggleUserMenu: () => void;
  openLayer: (layer: RightDrawerLayer) => void;
  openScreen: (screen: RightDrawerScreen) => void;
  openAccountScreen: (screen: RightDrawerAccountScreen) => void;
  openChatScreen: (screen: RightDrawerChatScreen) => void;
  resetChatScreens: (scope: RightDrawerChatScope | null) => void;
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
    chatScreen: screen?.chatScreen ?? null,
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
    (left.chatScreen === right.chatScreen ||
      (sameRightDrawerChatScope(left.chatScreen, right.chatScreen) &&
        left.chatScreen?.screen === right.chatScreen?.screen)) &&
    sameProfileOverride(left.profileOverride, right.profileOverride)
  );
}

function openUniqueLayer(
  layers: RightDrawerLayer[],
  requestedLayer: RightDrawerLayer,
): RightDrawerLayer[] {
  const existingIndex = layers.findIndex(({ kind }) => kind === requestedLayer.kind);
  if (existingIndex < 0) return [...layers, requestedLayer];
  if (existingIndex === layers.length - 1) {
    return [...layers.slice(0, -1), requestedLayer];
  }

  const existingLayer = layers[existingIndex];
  if (existingLayer == null) return layers;
  return [...layers.slice(0, existingIndex), ...layers.slice(existingIndex + 1), existingLayer];
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
      return project(true, openUniqueLayer(state.layers, layer));
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
        screens: [ACCOUNT_ROOT_SCREEN],
      });
      if (screen !== "root") get().openScreen(accountScreen(screen));
      return;
    }
    state.openScreen(accountScreen(screen));
  },
  openChatScreen(chatScreen) {
    const state = get();
    if (state.layers.at(-1)?.kind !== "chat-info") {
      state.openLayer({ kind: "chat-info", screens: [CHAT_INFO_SCREEN] });
    }
    get().openScreen({ mode: "info", chatScreen });
  },
  resetChatScreens(scope) {
    set((state) => {
      let changed = false;
      const layers = state.layers.map((layer) => {
        const screens = layer.screens.filter(
          (screen) =>
            screen.chatScreen == null || sameRightDrawerChatScope(screen.chatScreen, scope),
        );
        if (screens.length === layer.screens.length) return layer;
        changed = true;
        return { ...layer, screens: screens.length > 0 ? screens : [CHAT_INFO_SCREEN] };
      });
      return changed ? project(state.open, layers) : state;
    });
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
    else {
      state.openLayer({ kind: "chat-info", screens: [CHAT_INFO_SCREEN] });
      get().openScreen(screen);
    }
  },
  openWorkspaceUserProfile(userUuid) {
    logStoreAction("rightDrawer", "openWorkspaceUserProfile", { userUuid });
    const state = get();
    const screen = profileScreen({ kind: "workspace-user-uuid", userUuid });
    if (state.layers.at(-1)?.kind === "chat-info") state.openScreen(screen);
    else {
      state.openLayer({ kind: "chat-info", screens: [CHAT_INFO_SCREEN] });
      get().openScreen(screen);
    }
  },
  clearUserProfileOverride() {
    logStoreAction("rightDrawer", "clearUserProfileOverride", {});
    const state = get();
    if (state.layers.at(-1)?.screens.at(-1)?.profileOverride != null) state.back();
  },
}));
