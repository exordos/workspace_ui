import { afterEach, describe, expect, it } from "vitest";
import { useRightDrawerStore } from "./right-drawer.model";

const reset = () => useRightDrawerStore.getState().clearAll();

describe("useRightDrawerStore navigation", () => {
  afterEach(reset);

  it("collapses and expands without deleting layer or screen history", () => {
    const store = useRightDrawerStore.getState();
    store.openUserMenu();
    store.openAccountScreen("appearance");
    store.toggleVisibility();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: false,
      accountScreen: "appearance",
    });

    store.toggleVisibility();
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      accountScreen: "appearance",
    });
    expect(useRightDrawerStore.getState().layers[0]?.screens).toHaveLength(2);
  });

  it("X closes the active layer and reveals the previous one", () => {
    const store = useRightDrawerStore.getState();
    store.openInfo();
    store.openAccountScreen("settings");
    store.openInfo();
    store.closeCurrent();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "user-menu",
      accountScreen: "settings",
    });
    expect(useRightDrawerStore.getState().layers.map(({ kind }) => kind)).toEqual([
      "chat-info",
      "account",
    ]);
  });

  it("Back pops only internal screen history", () => {
    const store = useRightDrawerStore.getState();
    store.openUserMenu();
    store.openAccountScreen("settings");
    store.back();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "user-menu",
      accountScreen: "root",
    });
    expect(useRightDrawerStore.getState().layers).toHaveLength(1);
  });

  it("closing the last layer hides the drawer and leaves an empty stack", () => {
    const store = useRightDrawerStore.getState();
    store.openAbout();
    store.closeCurrent();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: false,
      layers: [],
      mode: "info",
      accountScreen: null,
    });
  });

  it("clearAll resets visibility and all history", () => {
    const store = useRightDrawerStore.getState();
    store.openInfo();
    store.openAccountScreen("settings");
    store.clearAll();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: false,
      layers: [],
      mode: "info",
      accountScreen: null,
    });
  });

  it("chat and account toggles collapse only their active layer", () => {
    const store = useRightDrawerStore.getState();
    store.toggleChatInfo();
    store.toggleChatInfo();
    expect(useRightDrawerStore.getState()).toMatchObject({ open: false, mode: "info" });

    store.toggleUserMenu();
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      accountScreen: "root",
    });
    store.openAccountScreen("appearance");
    store.toggleUserMenu();
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: false,
      accountScreen: "appearance",
    });
  });

  it("openInfo resets a nested profile while preserving earlier root layers", () => {
    const store = useRightDrawerStore.getState();
    store.openUserMenu();
    store.openWorkspaceUserProfile("33333333-3333-4333-8333-333333333333");
    store.openInfo();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
    expect(useRightDrawerStore.getState().layers.map(({ kind }) => kind)).toEqual([
      "account",
      "chat-info",
    ]);
  });

  it("keeps profiles inside chat history for Back and supports UUID and legacy ids", () => {
    const store = useRightDrawerStore.getState();
    store.openInfo();
    store.openWorkspaceUserProfile("33333333-3333-4333-8333-333333333333");
    expect(useRightDrawerStore.getState().workspaceUserUuidOverride).toBe(
      "33333333-3333-4333-8333-333333333333",
    );

    store.back();
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      workspaceUserUuidOverride: null,
    });

    store.openUserProfile(42);
    expect(useRightDrawerStore.getState()).toMatchObject({
      userIdOverride: 42,
      workspaceUserUuidOverride: null,
    });
    store.clearUserProfileOverride();
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
  });

  it("does not duplicate the active account screen", () => {
    const store = useRightDrawerStore.getState();
    store.openUserMenu();
    store.openAccountScreen("settings");
    store.openAccountScreen("settings");

    expect(useRightDrawerStore.getState().layers[0]?.screens).toHaveLength(2);
  });
});
