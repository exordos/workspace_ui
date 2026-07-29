import { afterEach, describe, expect, it } from "vitest";
import { useRightDrawerStore } from "./right-drawer.model";

describe("useRightDrawerStore", () => {
  afterEach(() => {
    useRightDrawerStore.setState({
      open: false,
      mode: "info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
  });

  it("close fully resets the drawer state", () => {
    useRightDrawerStore.setState({
      open: true,
      mode: "settings",
      userIdOverride: 42,
      workspaceUserUuidOverride: "33333333-3333-4333-8333-333333333333",
    });

    useRightDrawerStore.getState().close();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: false,
      mode: "info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
  });

  it("clearUserProfileOverride clears only userIdOverride and keeps drawer open", () => {
    useRightDrawerStore.getState().openUserProfile(42);
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: 42,
      workspaceUserUuidOverride: null,
    });

    useRightDrawerStore.getState().clearUserProfileOverride();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
  });

  it("opens a Workspace user profile by UUID without setting a legacy user id", () => {
    useRightDrawerStore.getState().openWorkspaceUserProfile("33333333-3333-4333-8333-333333333333");

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
      workspaceUserUuidOverride: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("legacy profile opening clears the Workspace UUID override", () => {
    useRightDrawerStore.getState().openWorkspaceUserProfile("33333333-3333-4333-8333-333333333333");

    useRightDrawerStore.getState().openUserProfile(42);

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: 42,
      workspaceUserUuidOverride: null,
    });
  });

  it("openInfo resets nested profile override and keeps drawer open", () => {
    useRightDrawerStore.getState().openWorkspaceUserProfile("33333333-3333-4333-8333-333333333333");

    useRightDrawerStore.getState().openInfo();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
  });

  it("openPersonalInfo opens the nested personal-info mode", () => {
    useRightDrawerStore.getState().openPersonalInfo();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "personal-info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
  });

  it("clearUserProfileOverride is a no-op when override is already null", () => {
    useRightDrawerStore.setState({
      open: true,
      mode: "info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
    useRightDrawerStore.getState().clearUserProfileOverride();
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
      workspaceUserUuidOverride: null,
    });
  });
});
