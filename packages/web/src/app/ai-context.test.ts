/**
 * Tests for the AI context bridge module (window.__ai__).
 *
 * Verifies that installAiContext() exposes chat context, user info, app state,
 * recent messages, event subscriptions, and a command registry to external AI
 * integrations. This bridge allows AI assistants (copilots, bots) to read app
 * state and receive real-time events without direct store access.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useChatListStore } from "../entities/chat-list/chat-list.model";
import { useInstancesStore } from "../entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "../entities/message/message.model";
import { useThemeStore } from "../entities/theme/theme.model";
import { useUsersStore } from "../entities/user/user.model";
import {
  installAiContext,
  notifyAiNewMessage,
  notifyAiStateChange,
  type AiContextBridge,
} from "./ai-context";

vi.mock("../entities/chat-list/chat-list.model", () => ({
  useChatListStore: { getState: vi.fn() },
}));
vi.mock("../entities/message/message.model", () => ({
  useCurrentChatMessagesStore: { getState: vi.fn() },
}));
vi.mock("../entities/user/user.model", () => ({
  useUsersStore: { getState: vi.fn() },
}));
vi.mock("../entities/instance/instance.model", () => ({
  useInstancesStore: { getState: vi.fn() },
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
  vi.mocked(useCurrentChatMessagesStore.getState).mockReturnValue({
    context: null,
    messages: [],
  } as never);
  vi.mocked(useChatListStore.getState).mockReturnValue({
    currentUserId: null,
    streams: () => [],
    dms: () => [],
  } as never);
  vi.mocked(useUsersStore.getState).mockReturnValue({
    getUser: vi.fn(() => undefined),
  } as never);
  vi.mocked(useInstancesStore.getState).mockReturnValue({
    getCurrentInstance: vi.fn(() => null),
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

    // AI needs stream name, topic, and message count to provide relevant suggestions
    it("returns stream context with message count and last timestamp", () => {
      vi.mocked(useCurrentChatMessagesStore.getState).mockReturnValue({
        context: { type: "stream", streamName: "general", topic: "greetings" },
        messages: [
          { id: 1, timestamp: 1000 },
          { id: 2, timestamp: 2000 },
          { id: 3, timestamp: 3000 },
        ],
      } as never);

      installAiContext();
      const result = getAi().context.getCurrentChat();
      expect(result.type).toBe("stream");
      expect(result.streamName).toBe("general");
      expect(result.topic).toBe("greetings");
      expect(result.messageCount).toBe(3);
      expect(result.lastMessageTimestamp).toBe(3000);
    });

    // DM context includes partner IDs parsed from the comma-separated key
    it("returns dm context with parsed partner IDs", () => {
      vi.mocked(useCurrentChatMessagesStore.getState).mockReturnValue({
        context: { type: "dm", dmKey: "10,20,30" },
        messages: [{ id: 1, timestamp: 500 }],
      } as never);

      installAiContext();
      const result = getAi().context.getCurrentChat();
      expect(result.type).toBe("dm");
      expect(result.dmPartnerIds).toEqual([10, 20, 30]);
      expect(result.messageCount).toBe(1);
      expect(result.lastMessageTimestamp).toBe(500);
    });

    // Empty chat should not produce a bogus timestamp
    it("returns undefined lastMessageTimestamp when no messages", () => {
      vi.mocked(useCurrentChatMessagesStore.getState).mockReturnValue({
        context: { type: "stream", streamName: "dev", topic: "bugs" },
        messages: [],
      } as never);

      installAiContext();
      const result = getAi().context.getCurrentChat();
      expect(result.messageCount).toBe(0);
      expect(result.lastMessageTimestamp).toBeUndefined();
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
    it("returns user info from stores when logged in", () => {
      vi.mocked(useChatListStore.getState).mockReturnValue({
        currentUserId: 42,
        streams: () => [],
        dms: () => [],
      } as never);
      vi.mocked(useUsersStore.getState).mockReturnValue({
        getUser: vi.fn((id: number) => (id === 42 ? { full_name: "Alice Test" } : undefined)),
      } as never);
      vi.mocked(useInstancesStore.getState).mockReturnValue({
        getCurrentInstance: vi.fn(() => ({
          email: "alice@example.com",
          realm: "https://zulip.example.com",
        })),
      } as never);

      installAiContext();
      const result = getAi().context.getCurrentUser();
      expect(result.userId).toBe(42);
      expect(result.email).toBe("alice@example.com");
      expect(result.fullName).toBe("Alice Test");
      expect(result.realm).toBe("https://zulip.example.com");
    });

    // Profile may load async — AI should still get available data
    it("returns partial info when user profile is not loaded yet", () => {
      vi.mocked(useChatListStore.getState).mockReturnValue({
        currentUserId: 99,
        streams: () => [],
        dms: () => [],
      } as never);
      vi.mocked(useUsersStore.getState).mockReturnValue({
        getUser: vi.fn(() => undefined),
      } as never);
      vi.mocked(useInstancesStore.getState).mockReturnValue({
        getCurrentInstance: vi.fn(() => ({
          email: "user@example.com",
          realm: "https://zulip.example.com",
        })),
      } as never);

      installAiContext();
      const result = getAi().context.getCurrentUser();
      expect(result.userId).toBe(99);
      expect(result.email).toBe("user@example.com");
      expect(result.fullName).toBeUndefined();
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
    it("computes unreadCount from streams and dms badges", () => {
      vi.mocked(useChatListStore.getState).mockReturnValue({
        currentUserId: null,
        streams: () => [{ badge: 5 }, { badge: 3 }, { badge: 0 }],
        dms: () => [{ badge: 2 }, { badge: undefined }],
      } as never);

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
    const mockMessages = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      content: `message-${i + 1}`,
      sender_full_name: `User ${i}`,
      timestamp: 1000 + i,
    }));

    // Default limit of 20 keeps the context window manageable for AI
    it("returns last 20 messages by default", () => {
      vi.mocked(useCurrentChatMessagesStore.getState).mockReturnValue({
        context: null,
        messages: mockMessages,
      } as never);

      installAiContext();
      const result = getAi().context.getRecentMessages();
      expect(result).toHaveLength(20);
      expect(result[0]!.id).toBe(11);
      expect(result[19]!.id).toBe(30);
    });

    // AI callers can request fewer messages to reduce token usage
    it("respects custom limit", () => {
      vi.mocked(useCurrentChatMessagesStore.getState).mockReturnValue({
        context: null,
        messages: mockMessages,
      } as never);

      installAiContext();
      const result = getAi().context.getRecentMessages(5);
      expect(result).toHaveLength(5);
      expect(result[0]!.id).toBe(26);
    });

    // Internal field names (sender_full_name) are mapped to clean API names (sender)
    it("maps message fields correctly", () => {
      vi.mocked(useCurrentChatMessagesStore.getState).mockReturnValue({
        context: null,
        messages: [{ id: 42, content: "<p>Hello</p>", sender_full_name: "Bob", timestamp: 9999 }],
      } as never);

      installAiContext();
      const result = getAi().context.getRecentMessages();
      expect(result).toEqual([{ id: 42, content: "<p>Hello</p>", sender: "Bob", timestamp: 9999 }]);
    });

    // Empty chat returns empty array, not null or undefined
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
