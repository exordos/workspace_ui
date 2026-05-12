import { afterEach, describe, expect, it } from "vitest";
import { useRightDrawerStore } from "./right-drawer.model";

describe("useRightDrawerStore", () => {
  afterEach(() => {
    useRightDrawerStore.setState({ open: false, mode: "info", userIdOverride: null });
  });

  it("close fully resets the drawer state", () => {
    useRightDrawerStore.setState({ open: true, mode: "settings", userIdOverride: 42 });

    useRightDrawerStore.getState().close();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: false,
      mode: "info",
      userIdOverride: null,
    });
  });

  it("clearUserProfileOverride clears only userIdOverride and keeps drawer open", () => {
    useRightDrawerStore.getState().openUserProfile(42);
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: 42,
    });

    useRightDrawerStore.getState().clearUserProfileOverride();

    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
    });
  });

  it("clearUserProfileOverride is a no-op when override is already null", () => {
    useRightDrawerStore.setState({ open: true, mode: "info", userIdOverride: null });
    useRightDrawerStore.getState().clearUserProfileOverride();
    expect(useRightDrawerStore.getState()).toMatchObject({
      open: true,
      mode: "info",
      userIdOverride: null,
    });
  });
});
