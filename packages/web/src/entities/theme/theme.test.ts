/**
 * Tests for themeStore — manages color palette and light/dark mode.
 *
 * The store controls the active palette (e.g. "orange-warm", "blue-cold"),
 * the mode ("dark"/"light"/"system"), and persists choices to localStorage.
 * Also listens to OS color-scheme changes when mode is "system".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useThemeStore } from "./theme.model";

function resetWorkspaceSessionScope(): void {
  useWorkspaceAuthStore.setState({
    sessions: [],
    currentAccountId: null,
    runtimeGeneration: 0,
  });
}

function createSession(id: "a" | "b"): WorkspaceAuthSession {
  return {
    accountId: `account-${id}`,
    instanceId: `instance-${id}`,
    organizationId: `org-${id}`,
    organizationOrigin: `https://org-${id}.example.com`,
    projectId: `project-${id}`,
    userUuid: `user-${id}`,
    accessToken: `access-token-${id}`,
    refreshToken: `refresh-token-${id}`,
    runtimeGeneration: 1,
    login: `user-${id}@example.com`,
    profile: {
      uuid: `user-${id}`,
      username: `user-${id}`,
      firstName: "User",
      lastName: id.toUpperCase(),
      email: `user-${id}@example.com`,
    },
  };
}

function setWorkspaceSessionScope(currentAccountId: "account-a" | "account-b"): {
  sessionA: WorkspaceAuthSession;
  sessionB: WorkspaceAuthSession;
} {
  const sessionA = createSession("a");
  const sessionB = createSession("b");
  useWorkspaceAuthStore.setState({
    sessions: [sessionA, sessionB],
    currentAccountId,
    runtimeGeneration: 1,
  });
  return { sessionA, sessionB };
}

// Palette/mode switching, toggle, and localStorage persistence.
describe("themeStore", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
    resetWorkspaceSessionScope();
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

  it("persists palette and mode under workspace owner scope", () => {
    const { sessionA } = setWorkspaceSessionScope("account-a");
    const ownerKey = workspaceRuntimeOwnerKey(sessionA);

    useThemeStore.getState().setPalette("blue-cold");
    useThemeStore.getState().setMode("light");

    expect(localStorage.getItem(`workspace-palette:${ownerKey}`)).toBe("blue-cold");
    expect(localStorage.getItem(`workspace-theme-mode:${ownerKey}`)).toBe("light");
    expect(localStorage.getItem("workspace-palette")).toBeNull();
  });

  it("loads owner-specific theme when active workspace account changes", () => {
    const sessionA = createSession("a");
    const sessionB = createSession("b");
    const ownerAKey = workspaceRuntimeOwnerKey(sessionA);
    const ownerBKey = workspaceRuntimeOwnerKey(sessionB);
    localStorage.setItem(`workspace-palette:${ownerAKey}`, "orange-warm");
    localStorage.setItem(`workspace-theme-mode:${ownerAKey}`, "dark");
    localStorage.setItem(`workspace-palette:${ownerBKey}`, "blue-cold");
    localStorage.setItem(`workspace-theme-mode:${ownerBKey}`, "light");

    setWorkspaceSessionScope("account-a");
    expect(useThemeStore.getState().paletteId).toBe("orange-warm");
    expect(useThemeStore.getState().mode).toBe("dark");

    useWorkspaceAuthStore.getState().setCurrentAccountId("account-b");
    expect(useThemeStore.getState().paletteId).toBe("blue-cold");
    expect(useThemeStore.getState().mode).toBe("light");
  });

  it("reads legacy instance-scoped theme without writing back to legacy keys", () => {
    const sessionA = createSession("a");
    localStorage.setItem("workspace-palette:instance-a", "blue-cold");
    localStorage.setItem("workspace-theme-mode:instance-a", "dark");

    setWorkspaceSessionScope("account-a");
    expect(useThemeStore.getState().paletteId).toBe("blue-cold");
    expect(useThemeStore.getState().mode).toBe("dark");

    useThemeStore.getState().setMode("light");

    const ownerKey = workspaceRuntimeOwnerKey(sessionA);
    expect(localStorage.getItem(`workspace-theme-mode:${ownerKey}`)).toBe("light");
    expect(localStorage.getItem("workspace-theme-mode:instance-a")).toBe("dark");
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
    resetWorkspaceSessionScope();
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
