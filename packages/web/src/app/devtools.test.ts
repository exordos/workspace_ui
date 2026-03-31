/**
 * Tests for the developer tools module (window.__dev__).
 *
 * Verifies that installDevTools() exposes stores, env, perf, theme controls,
 * i18n helpers, and log inspection on the browser console in dev mode.
 * These tools allow developers to inspect and modify app state from the
 * console without React DevTools — especially useful for debugging in
 * Electron where DevTools access may be limited.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { useThemeStore } from "../entities/theme/theme.model";
import { installDevTools } from "./devtools";

vi.mock("../entities/chat-list/chat-list.model", () => ({
  useChatListStore: { getState: vi.fn(() => ({})) },
}));
vi.mock("../entities/message/message.model", () => ({
  useCurrentChatMessagesStore: { getState: vi.fn(() => ({})) },
}));
vi.mock("../entities/user/user.model", () => ({
  useUsersStore: { getState: vi.fn(() => ({})) },
}));
vi.mock("../entities/instance/instance.model", () => ({
  useInstancesStore: { getState: vi.fn(() => ({})) },
}));
const { mockThemeState } = vi.hoisted(() => ({
  mockThemeState: {
    paletteId: "orange-warm",
    mode: "dark",
    setPalette: vi.fn(),
    setMode: vi.fn(),
    toggleMode: vi.fn(),
  },
}));
vi.mock("../entities/theme/theme.model", () => ({
  useThemeStore: {
    getState: vi.fn(() => mockThemeState),
  },
}));
vi.mock("../widgets/sidebar/sidebar-config.model", () => ({
  useSidebarConfigStore: { getState: vi.fn(() => ({})) },
}));
vi.mock("../entities/call/call.model", () => ({
  useCallParticipantsStore: { getState: vi.fn(() => ({})) },
}));
vi.mock("../i18n/i18n", () => ({
  t: vi.fn((key: string) => key),
  setLocale: vi.fn(),
  getLocale: vi.fn(() => "ru"),
  getSupportedLocales: vi.fn(() => ["ru", "en"]),
}));
vi.mock("../shared/lib/env", () => ({
  env: { DEV: true, PROD: false, MODE: "development" },
}));
vi.mock("../shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getLogHistory: vi.fn(() => [
    { level: "info", message: "test", scope: "app", timestamp: Date.now(), data: {} },
    { level: "error", message: "err", scope: "app", timestamp: Date.now(), data: {} },
  ]),
  clearLogHistory: vi.fn(),
  setMinLevel: vi.fn(),
}));
vi.mock("../shared/lib/perf", () => ({
  perf: { startTimer: vi.fn(), mark: vi.fn(), measure: vi.fn() },
}));

interface DevToolsShape {
  stores: Record<string, unknown>;
  env: Record<string, unknown>;
  perf: Record<string, unknown>;
  theme: {
    setPalette: (id: string) => void;
    setMode: (mode: string) => void;
    toggle: () => void;
    current: () => { palette: string; mode: string };
  };
  i18n: {
    t: (key: string) => string;
    setLocale: (locale: string) => void;
    getLocale: () => string;
    locales: string[];
  };
  logs: (level?: string) => unknown[];
  clearLogs: () => void;
  setLogLevel: (level: string) => void;
  help: () => void;
}

function getDev(): DevToolsShape | undefined {
  return (window as unknown as Record<string, unknown>).__dev__ as DevToolsShape | undefined;
}

describe("devtools", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__dev__;
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // installDevTools
  // ---------------------------------------------------------------------------

  // Verifies that the global __dev__ object is installed/skipped based on environment
  describe("installDevTools", () => {
    // Dev mode must expose debugging tools on the window object
    it("sets window.__dev__ in dev mode", () => {
      installDevTools();
      expect(getDev()).toBeDefined();
    });

    // Production builds must NOT expose internal state for security reasons
    it("does not set window.__dev__ in prod mode", () => {
      const orig = import.meta.env.DEV;
      (import.meta.env as Record<string, unknown>).DEV = false;
      try {
        installDevTools();
        expect(getDev()).toBeUndefined();
      } finally {
        (import.meta.env as Record<string, unknown>).DEV = orig;
      }
    });

    // The ready message tells developers that __dev__ is available
    it("logs a ready message to console", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      installDevTools();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("DevTools ready"),
        expect.any(String),
      );
      consoleSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Exposed namespaces
  // ---------------------------------------------------------------------------

  // Verifies all Zustand stores are accessible for console debugging
  describe("exposed stores", () => {
    // All 7 stores must be exposed so developers can inspect any domain state
    it("includes all 7 store references", () => {
      installDevTools();
      const dev = getDev()!;
      const storeNames = Object.keys(dev.stores);
      expect(storeNames).toContain("chatList");
      expect(storeNames).toContain("messages");
      expect(storeNames).toContain("users");
      expect(storeNames).toContain("instances");
      expect(storeNames).toContain("theme");
      expect(storeNames).toContain("sidebar");
      expect(storeNames).toContain("callParticipants");
    });
  });

  // Verifies env vars are readable from the console for debugging config issues
  describe("env", () => {
    it("exposes environment variables", () => {
      installDevTools();
      const dev = getDev()!;
      expect(dev.env).toBeDefined();
      expect(dev.env.DEV).toBe(true);
    });
  });

  // Verifies perf utilities for manual performance profiling from the console
  describe("perf", () => {
    it("exposes performance utilities", () => {
      installDevTools();
      const dev = getDev()!;
      expect(dev.perf).toBeDefined();
      expect(typeof dev.perf.startTimer).toBe("function");
    });
  });

  // ---------------------------------------------------------------------------
  // theme
  // ---------------------------------------------------------------------------

  // Verifies theme inspection and switching from the console
  describe("theme", () => {
    // Developers can check current theme without React DevTools
    it("current() returns palette and mode", () => {
      installDevTools();
      const result = getDev()!.theme.current();
      expect(result).toEqual({ palette: "orange-warm", mode: "dark" });
    });

    // Allows live palette switching for visual testing
    it("setPalette calls themeStore.setPalette", () => {
      installDevTools();
      getDev()!.theme.setPalette("blue-cold");
      expect(vi.mocked(useThemeStore).getState().setPalette).toHaveBeenCalledWith("blue-cold");
    });

    // Allows switching between light/dark without the settings UI
    it("setMode calls themeStore.setMode", () => {
      installDevTools();
      getDev()!.theme.setMode("light");
      expect(vi.mocked(useThemeStore).getState().setMode).toHaveBeenCalledWith("light");
    });

    // Quick toggle for developers checking both theme modes
    it("toggle calls themeStore.toggleMode", () => {
      installDevTools();
      getDev()!.theme.toggle();
      expect(vi.mocked(useThemeStore).getState().toggleMode).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // i18n
  // ---------------------------------------------------------------------------

  // Verifies i18n tools for testing translations from the console
  describe("i18n", () => {
    // Full i18n API exposure allows testing translations without UI navigation
    it("exposes t, setLocale, getLocale, and locales", () => {
      installDevTools();
      const { i18n } = getDev()!;
      expect(typeof i18n.t).toBe("function");
      expect(typeof i18n.setLocale).toBe("function");
      expect(typeof i18n.getLocale).toBe("function");
      expect(i18n.locales).toEqual(["ru", "en"]);
    });

    // Verifies the console-exposed t() actually calls the real i18n function
    it("t() delegates to the i18n module", () => {
      installDevTools();
      const result = getDev()!.i18n.t("auth.login");
      expect(result).toBe("auth.login");
    });
  });

  // ---------------------------------------------------------------------------
  // logs
  // ---------------------------------------------------------------------------

  // Verifies log inspection for debugging without external tools
  describe("logs", () => {
    // Unfiltered logs return the full ring buffer for diagnosis
    it("returns all log entries without filter", () => {
      installDevTools();
      const entries = getDev()!.logs();
      expect(entries.length).toBeGreaterThan(0);
    });

    // Level filtering isolates errors or warnings quickly
    it("filters log entries by level", () => {
      installDevTools();
      const errors = getDev()!.logs("error");
      expect(errors.length).toBe(1);
      expect((errors[0] as { level: string }).level).toBe("error");
    });

    it("clearLogs is a function", () => {
      installDevTools();
      expect(typeof getDev()!.clearLogs).toBe("function");
    });

    it("setLogLevel is a function", () => {
      installDevTools();
      expect(typeof getDev()!.setLogLevel).toBe("function");
    });
  });

  // ---------------------------------------------------------------------------
  // help
  // ---------------------------------------------------------------------------

  // Help command guides new developers on what __dev__ can do
  describe("help", () => {
    it("prints help to console without throwing", () => {
      installDevTools();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      getDev()!.help();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
