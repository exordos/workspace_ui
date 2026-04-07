/**
 * Tests for themeStore — manages color palette and light/dark mode.
 *
 * The store controls the active palette (e.g. "orange-warm", "blue-cold"),
 * the mode ("dark"/"light"/"system"), and persists choices to localStorage.
 * Also listens to OS color-scheme changes when mode is "system".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "./theme.model";

function resetInstanceScope(): void {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    unreadCountsByInstance: {},
  });
}

function setInstanceScope(instanceIds: string[], currentInstanceId: string): void {
  useInstancesStore.setState({
    instances: instanceIds.map((id) => ({
      id,
      realm: `https://${id}.example.com`,
      email: `${id}@example.com`,
      apiKey: `key-${id}`,
    })),
    currentInstanceId,
    unreadCountsByInstance: {},
  });
}

// Palette/mode switching, toggle, and localStorage persistence.
describe("themeStore", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
    resetInstanceScope();
    useThemeStore.setState({ paletteId: "orange-warm", mode: "dark" });
  });

  // Default must be applied for first launch when localStorage is empty.
  it("has blue-mist system as default when no persisted settings", async () => {
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
    vi.resetModules();
    const { useThemeStore: freshStore } = await import("./theme.model");

    const { paletteId, mode } = freshStore.getState();
    expect(paletteId).toBe("blue-mist");
    expect(mode).toBe("system");
  });

  // Palette switch changes all CSS variables app-wide.
  it("switches palette", () => {
    useThemeStore.getState().setPalette("blue-cold");
    expect(useThemeStore.getState().paletteId).toBe("blue-cold");
  });

  // Mode switch toggles between dark and light CSS variable sets.
  it("switches mode", () => {
    useThemeStore.getState().setMode("light");
    expect(useThemeStore.getState().mode).toBe("light");
  });

  // Toggle is the one-click dark↔light switch in the UI.
  it("toggles mode", () => {
    useThemeStore.getState().setMode("dark");
    useThemeStore.getState().toggleMode();
    expect(useThemeStore.getState().mode).toBe("light");
  });

  // Persistence ensures user's theme preference survives page reload.
  it("persists palette and mode to localStorage", () => {
    useThemeStore.getState().setPalette("blue-cold");
    useThemeStore.getState().setMode("light");
    expect(localStorage.getItem("workspace-palette")).toBe("blue-cold");
    expect(localStorage.getItem("workspace-theme-mode")).toBe("light");
  });

  it("persists palette and mode under organization scope", () => {
    setInstanceScope(["org-a"], "org-a");

    useThemeStore.getState().setPalette("blue-cold");
    useThemeStore.getState().setMode("light");

    expect(localStorage.getItem("workspace-palette:org-a")).toBe("blue-cold");
    expect(localStorage.getItem("workspace-theme-mode:org-a")).toBe("light");
  });

  it("loads organization-specific theme when active organization changes", () => {
    localStorage.setItem("workspace-palette:org-a", "orange-warm");
    localStorage.setItem("workspace-theme-mode:org-a", "dark");
    localStorage.setItem("workspace-palette:org-b", "blue-cold");
    localStorage.setItem("workspace-theme-mode:org-b", "light");

    setInstanceScope(["org-a", "org-b"], "org-a");
    expect(useThemeStore.getState().paletteId).toBe("orange-warm");
    expect(useThemeStore.getState().mode).toBe("dark");

    useInstancesStore.getState().setCurrentInstanceId("org-b");
    expect(useThemeStore.getState().paletteId).toBe("blue-cold");
    expect(useThemeStore.getState().mode).toBe("light");
  });

  // Toggle must be bidirectional — light→dark and dark→light.
  it("toggles light to dark", () => {
    useThemeStore.getState().setMode("light");
    useThemeStore.getState().toggleMode();
    expect(useThemeStore.getState().mode).toBe("dark");
  });
});

// When mode is "system", the store listens to OS prefers-color-scheme changes
// via matchMedia. This verifies the listener fires and is correctly gated.
describe("OS color scheme change listener", () => {
  function findChangeHandler(): (() => void) | undefined {
    const mmMock = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
    for (const result of mmMock.mock.results) {
      if (result.type !== "return") continue;
      const mql = result.value;
      const calls = (mql.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
      const found = calls.find((c: unknown[]) => c[0] === "change");
      if (found) return found[1] as () => void;
    }
    return undefined;
  }

  beforeEach(() => {
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
    resetInstanceScope();
    useThemeStore.setState({ paletteId: "orange-warm", mode: "dark" });
  });

  // System mode must react to OS theme changes so CSS variables update.
  it("re-applies theme when mode is system", () => {
    const handler = findChangeHandler();
    expect(handler).toBeDefined();

    useThemeStore.setState({ mode: "system", paletteId: "orange-warm" });
    handler!();

    expect(useThemeStore.getState().mode).toBe("system");
  });

  // Explicit dark/light mode must ignore OS changes to respect user override.
  it("does nothing when mode is not system", () => {
    const handler = findChangeHandler();
    expect(handler).toBeDefined();

    useThemeStore.setState({ mode: "dark", paletteId: "orange-warm" });
    handler!();

    expect(useThemeStore.getState().mode).toBe("dark");
  });
});
