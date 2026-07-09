/**
 * Tests for the AI context bridge module (window.__ai__).
 *
 * Verifies that installAiContext() exposes chat context, user info, app state,
 * recent messages, event subscriptions, and a command registry to external AI
 * integrations. This bridge allows AI assistants (copilots, bots) to read app
 * state and receive real-time events without direct store access.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useMessengerStore } from "../entities/messenger/messenger.model";
import { useThemeStore } from "../entities/theme/theme.model";
import { useUsersStore } from "../entities/user/user.model";
import { useWorkspaceAuthStore } from "../entities/workspace-auth/workspace-auth.model";
import {
  installAiContext,
  notifyAiNewMessage,
  notifyAiStateChange,
  type AiContextBridge,
} from "./ai-context";

vi.mock("../entities/messenger/messenger-sidebar.lib", () => ({
  selectMessengerSidebarActivityCounts: vi.fn((state: { inboxCount?: number }) => ({
    inboxCount: state.inboxCount ?? 0,
    mentionsCount: 0,
    reactionsCount: 0,
    starredCount: 0,
  })),
}));
vi.mock("../entities/messenger/messenger.model", () => ({
  useMessengerStore: { getState: vi.fn() },
}));
vi.mock("../entities/user/user.model", () => ({
  useUsersStore: { getState: vi.fn() },
}));
vi.mock("../entities/workspace-auth/workspace-auth.model", () => ({
  useWorkspaceAuthStore: { getState: vi.fn() },
}));
vi.mock("../entities/theme/theme.model", () => ({
  useThemeStore: { getState: vi.fn() },
}));
vi.mock("../i18n/i18n", () => ({
  getLocale: vi.fn(() => "ru"),
}));
vi.mock("../shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function getAi(): AiContextBridge {
  return (window as unknown as Record<string, unknown>).__ai__ as AiContextBridge;
}

function setupDefaultStoreMocks() {
  vi.mocked(useMessengerStore.getState).mockReturnValue({ inboxCount: 0 } as never);
  vi.mocked(useUsersStore.getState).mockReturnValue({
    getUser: vi.fn(() => undefined),
  } as never);
  vi.mocked(useWorkspaceAuthStore.getState).mockReturnValue({
    getCurrentSession: vi.fn(() => null),
  } as never);
  vi.mocked(useThemeStore.getState).mockReturnValue({
    paletteId: "orange-warm",
    mode: "dark",
  } as never);
}

describe("ai-context", () => {
  beforeEach(() => {
    setupDefaultStoreMocks();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__ai__;
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // installAiContext
  // ---------------------------------------------------------------------------

  // Verifies that the global __ai__ bridge is properly installed on the window
  describe("installAiContext", () => {
    // The bridge object must exist for external AI tools to discover it
    it("sets window.__ai__", () => {
      installAiContext();
      expect(getAi()).toBeDefined();
    });

    // Three namespaces provide read, subscribe, and execute capabilities
    it("exposes context, events, and commands namespaces", () => {
      installAiContext();
      const ai = getAi();
      expect(ai.context).toBeDefined();
      expect(ai.events).toBeDefined();
      expect(ai.commands).toBeDefined();
    });

    // AI needs these methods to understand what the user is currently looking at
    it("exposes all context methods", () => {
      installAiContext();
      const { context } = getAi();
      expect(typeof context.getCurrentChat).toBe("function");
      expect(typeof context.getCurrentUser).toBe("function");
      expect(typeof context.getAppState).toBe("function");
      expect(typeof context.getRecentMessages).toBe("function");
    });

    // Events let AI react to new messages and state changes in real time
    it("exposes event subscription methods", () => {
      installAiContext();
      const { events } = getAi();
      expect(typeof events.onNewMessage).toBe("function");
      expect(typeof events.onStateChange).toBe("function");
    });

    // Commands allow AI to register and execute actions within the app
    it("exposes command methods", () => {
      installAiContext();
      const { commands } = getAi();
      expect(typeof commands.register).toBe("function");
      expect(typeof commands.execute).toBe("function");
      expect(typeof commands.list).toBe("function");
    });
  });

  // ---------------------------------------------------------------------------
  // context.getCurrentChat
  // ---------------------------------------------------------------------------

  // Verifies current chat context extraction for AI awareness
  describe("context.getCurrentChat", () => {
    // When no chat is open, AI should know there's nothing to contextualize
    it("returns null type when no chat context is set", () => {
      installAiContext();
      const result = getAi().context.getCurrentChat();
      expect(result).toEqual({ type: null, messageCount: 0 });
    });
  });

  // ---------------------------------------------------------------------------
  // context.getCurrentUser
  // ---------------------------------------------------------------------------

  // Verifies user identity extraction for AI personalization
  describe("context.getCurrentUser", () => {
    // Before login, AI should see a null user — not crash
    it("returns null userId when no user is logged in", () => {
      installAiContext();
      const result = getAi().context.getCurrentUser();
      expect(result.userId).toBeNull();
      expect(result.email).toBeUndefined();
      expect(result.fullName).toBeUndefined();
    });

    // AI uses user info for personalized responses and context
    it("returns user info from workspace stores when logged in", () => {
      vi.mocked(useUsersStore.getState).mockReturnValue({
        getUser: vi.fn((id: string) =>
          id === "user-uuid"
            ? { displayName: "Alice Test", email: "alice@example.com" }
            : undefined,
        ),
      } as never);
      vi.mocked(useWorkspaceAuthStore.getState).mockReturnValue({
        getCurrentSession: vi.fn(() => ({
          userUuid: "user-uuid",
          profile: {
            email: "profile@example.com",
            username: "alice",
            firstName: "Alice",
            lastName: "Test",
          },
        })),
      } as never);

      installAiContext();
      const result = getAi().context.getCurrentUser();
      expect(result.userId).toBeNull();
      expect(result.userUuid).toBe("user-uuid");
      expect(result.email).toBe("alice@example.com");
      expect(result.fullName).toBe("Alice Test");
    });

    // Profile may load async — AI should still get available data
    it("returns partial info when user profile is not loaded yet", () => {
      vi.mocked(useUsersStore.getState).mockReturnValue({
        getUser: vi.fn(() => undefined),
      } as never);
      vi.mocked(useWorkspaceAuthStore.getState).mockReturnValue({
        getCurrentSession: vi.fn(() => ({
          userUuid: "user-uuid",
          profile: {
            email: "user@example.com",
            username: "fallback-user",
            firstName: null,
            lastName: null,
          },
        })),
      } as never);

      installAiContext();
      const result = getAi().context.getCurrentUser();
      expect(result.userId).toBeNull();
      expect(result.userUuid).toBe("user-uuid");
      expect(result.email).toBe("user@example.com");
      expect(result.fullName).toBe("fallback-user");
    });
  });

  // ---------------------------------------------------------------------------
  // context.getAppState
  // ---------------------------------------------------------------------------

  // Verifies global app state snapshot for AI environment awareness
  describe("context.getAppState", () => {
    // AI needs locale, theme, and runtime to adapt its behavior
    it("returns locale, theme, and runtime info", () => {
      installAiContext();
      const result = getAi().context.getAppState();
      expect(result.locale).toBe("ru");
      expect(result.theme).toEqual({ palette: "orange-warm", mode: "dark" });
      expect(result.runtime).toBe("browser");
      expect(result.version).toBeDefined();
    });

    // Unread count helps AI prioritize which conversations to suggest
    it("computes unreadCount from messenger sidebar counts", () => {
      vi.mocked(useMessengerStore.getState).mockReturnValue({ inboxCount: 10 } as never);

      installAiContext();
      const result = getAi().context.getAppState();
      expect(result.unreadCount).toBe(10);
    });

    // Zero unreads should be explicit, not undefined
    it("returns 0 unreadCount when no badges", () => {
      installAiContext();
      const result = getAi().context.getAppState();
      expect(result.unreadCount).toBe(0);
    });

    it("reports online status from navigator", () => {
      installAiContext();
      const result = getAi().context.getAppState();
      expect(typeof result.online).toBe("boolean");
    });
  });

  // ---------------------------------------------------------------------------
  // context.getRecentMessages
  // ---------------------------------------------------------------------------

  // Verifies message history retrieval with limit and field mapping
  describe("context.getRecentMessages", () => {
    it("returns empty array when no messages", () => {
      installAiContext();
      const result = getAi().context.getRecentMessages();
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // events
  // ---------------------------------------------------------------------------

  // Verifies real-time message event delivery to AI subscribers
  describe("events.onNewMessage", () => {
    // AI should receive new messages as they arrive for real-time assistance
    it("subscribes and receives new messages via notifyAiNewMessage", () => {
      installAiContext();
      const received: unknown[] = [];
      const unsub = getAi().events.onNewMessage((msg) => received.push(msg));

      notifyAiNewMessage({ id: 1, content: "hi", sender_id: 10, timestamp: 5000 });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ id: 1, content: "hi", senderId: 10, timestamp: 5000 });

      unsub();
    });

    // Cleanup must stop delivery to prevent memory leaks in AI plugins
    it("unsubscribe stops receiving messages", () => {
      installAiContext();
      const received: unknown[] = [];
      const unsub = getAi().events.onNewMessage((msg) => received.push(msg));

      unsub();
      notifyAiNewMessage({ id: 2, content: "missed", sender_id: 11, timestamp: 6000 });

      expect(received).toHaveLength(0);
    });

    // Multiple AI integrations can subscribe independently
    it("handles multiple subscribers", () => {
      installAiContext();
      let countA = 0;
      let countB = 0;
      const unsubA = getAi().events.onNewMessage(() => countA++);
      const unsubB = getAi().events.onNewMessage(() => countB++);

      notifyAiNewMessage({ id: 3, content: "x", sender_id: 1, timestamp: 1 });

      expect(countA).toBe(1);
      expect(countB).toBe(1);

      unsubA();
      unsubB();
    });

    // One failing AI plugin must not break other subscribers
    it("does not break if callback throws", () => {
      installAiContext();
      const unsub1 = getAi().events.onNewMessage(() => {
        throw new Error("boom");
      });
      let received = false;
      const unsub2 = getAi().events.onNewMessage(() => {
        received = true;
      });

      notifyAiNewMessage({ id: 4, content: "ok", sender_id: 1, timestamp: 1 });

      expect(received).toBe(true);

      unsub1();
      unsub2();
    });
  });

  // Verifies app state change notifications (theme, locale, online status)
  describe("events.onStateChange", () => {
    // AI should know when the app environment changes (e.g. theme switch)
    it("subscribes and receives state changes via notifyAiStateChange", () => {
      installAiContext();
      const states: unknown[] = [];
      const unsub = getAi().events.onStateChange((s) => states.push(s));

      notifyAiStateChange();

      expect(states).toHaveLength(1);
      expect(states[0]).toHaveProperty("locale", "ru");
      expect(states[0]).toHaveProperty("theme");

      unsub();
    });

    // Cleanup must work to prevent stale state notifications
    it("unsubscribe stops receiving state updates", () => {
      installAiContext();
      const states: unknown[] = [];
      const unsub = getAi().events.onStateChange((s) => states.push(s));

      unsub();
      notifyAiStateChange();

      expect(states).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // commands
  // ---------------------------------------------------------------------------

  // Verifies the command registry for AI-invokable actions
  describe("commands", () => {
    // AI plugins can register custom commands discoverable via list()
    it("register adds a command and list returns it", () => {
      installAiContext();
      const handler = vi.fn();
      const unsub = getAi().commands.register({
        id: "test-cmd",
        label: "Test Command",
        description: "A test command",
        handler,
      });

      const cmds = getAi().commands.list();
      expect(cmds).toHaveLength(1);
      expect(cmds[0]!.id).toBe("test-cmd");
      expect(cmds[0]!.label).toBe("Test Command");

      unsub();
    });

    // AI can invoke commands by ID and pass arguments
    it("execute calls the registered handler", () => {
      installAiContext();
      const handler = vi.fn(() => "result");
      const unsub = getAi().commands.register({
        id: "greet",
        label: "Greet",
        description: "Say hello",
        handler,
      });

      const result = getAi().commands.execute("greet", { name: "Alice" });
      expect(handler).toHaveBeenCalledWith({ name: "Alice" });
      expect(result).toBe("result");

      unsub();
    });

    // Graceful handling of unknown commands prevents AI errors
    it("execute returns undefined for unknown command", () => {
      installAiContext();
      const result = getAi().commands.execute("nonexistent");
      expect(result).toBeUndefined();
    });

    // Commands can be cleaned up when an AI plugin disconnects
    it("unregister removes the command", () => {
      installAiContext();
      const unsub = getAi().commands.register({
        id: "temp",
        label: "Temp",
        description: "Temporary",
        handler: vi.fn(),
      });

      unsub();

      expect(getAi().commands.list()).toHaveLength(0);
      expect(getAi().commands.execute("temp")).toBeUndefined();
    });

    // Many AI operations are async (API calls, file processing)
    it("supports async handlers", async () => {
      installAiContext();
      const handler = vi.fn(() => Promise.resolve({ summary: "done" }));
      const unsub = getAi().commands.register({
        id: "async-cmd",
        label: "Async",
        description: "Async handler",
        handler,
      });

      const result = await getAi().commands.execute("async-cmd");
      expect(result).toEqual({ summary: "done" });

      unsub();
    });

    // Before any plugins register, the list should be empty (not null)
    it("list returns empty array initially", () => {
      installAiContext();
      expect(getAi().commands.list()).toEqual([]);
    });
  });
});
