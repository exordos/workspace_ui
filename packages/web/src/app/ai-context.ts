/**
 * AI Agent Context Bridge.
 *
 * Provides a structured interface for AI agents to interact with the app.
 * Designed for MCP (Model Context Protocol) servers, browser extensions,
 * Copilot-style sidepanels, and custom AI integrations.
 *
 * Architecture:
 * - Read-only context: current user, open chat, unread counts, theme
 * - Actions: navigate, send message, search, switch theme
 * - Events: subscribe to app state changes
 * - Command palette: register AI-triggered commands
 *
 * Usage from external AI agent (via window.__ai__):
 *   __ai__.context.getCurrentChat()
 *   __ai__.actions.navigate("/dm/42")
 *   __ai__.actions.sendMessage({ stream: "general", topic: "test", content: "Hello" })
 *   __ai__.events.onNewMessage((msg) => { ... })
 *   __ai__.commands.register("summarize-chat", handler)
 */

import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useUsersStore } from "~/entities/user/user.model";
import { getLocale } from "~/i18n/i18n";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("ai-context");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiChatContext {
  type: "stream" | "dm" | null;
  streamName?: string;
  topic?: string;
  dmPartnerIds?: number[];
  messageCount: number;
  lastMessageTimestamp?: number;
}

export interface AiUserContext {
  userId: number | null;
  email?: string;
  fullName?: string;
  realm?: string;
}

export interface AiAppState {
  locale: string;
  theme: { palette: string; mode: string };
  unreadCount: number;
  online: boolean;
  runtime: string;
  version: string;
}

export interface AiCommand {
  id: string;
  label: string;
  description: string;
  handler: (args?: Record<string, unknown>) => unknown;
}

type MessageCallback = (msg: {
  id: number;
  content: string;
  senderId: number;
  timestamp: number;
}) => void;
type StateCallback = (state: AiAppState) => void;

// ---------------------------------------------------------------------------
// Context (read-only state)
// ---------------------------------------------------------------------------

function getCurrentChat(): AiChatContext {
  const ctx = useCurrentChatMessagesStore.getState().context;
  const msgs = useCurrentChatMessagesStore.getState().messages;

  if (!ctx) return { type: null, messageCount: 0 };

  if (ctx.type === "stream") {
    return {
      type: "stream",
      streamName: ctx.streamName,
      topic: ctx.topic,
      messageCount: msgs.length,
      lastMessageTimestamp: msgs[msgs.length - 1]?.timestamp,
    };
  }

  return {
    type: "dm",
    dmPartnerIds: ctx.dmKey.split(",").map(Number),
    messageCount: msgs.length,
    lastMessageTimestamp: msgs[msgs.length - 1]?.timestamp,
  };
}

function getCurrentUser(): AiUserContext {
  const instance = useInstancesStore.getState().getCurrentInstance();
  const userId = useChatListStore.getState().currentUserId;
  const user = userId ? useUsersStore.getState().getUser(userId) : undefined;

  return {
    userId,
    email: instance?.email,
    fullName: user?.full_name,
    realm: instance?.realm,
  };
}

function getAppState(): AiAppState {
  const theme = useThemeStore.getState();
  const chatList = useChatListStore.getState();
  const streams = chatList.streams();
  const dms = chatList.dms();

  const unreadCount =
    streams.reduce((sum, s) => sum + (s.badge ?? 0), 0) +
    dms.reduce((sum, d) => sum + (d.badge ?? 0), 0);

  return {
    locale: getLocale(),
    theme: { palette: theme.paletteId, mode: theme.mode },
    unreadCount,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    runtime: typeof window !== "undefined" && window.electronAPI ? "electron" : "browser",
    version: import.meta.env.VITE_APP_VERSION ?? "0.0.0",
  };
}

function getRecentMessages(
  limit = 20,
): { id: number; content: string; sender: string; timestamp: number }[] {
  const msgs = useCurrentChatMessagesStore.getState().messages;
  return msgs.slice(-limit).map((m) => ({
    id: m.id,
    content: m.content,
    sender: m.sender_full_name,
    timestamp: m.timestamp,
  }));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const messageCallbacks = new Set<MessageCallback>();
const stateCallbacks = new Set<StateCallback>();

function onNewMessage(callback: MessageCallback): () => void {
  messageCallbacks.add(callback);
  return () => messageCallbacks.delete(callback);
}

function onStateChange(callback: StateCallback): () => void {
  stateCallbacks.add(callback);
  return () => stateCallbacks.delete(callback);
}

/** Call from event loop when new message arrives. */
export function notifyAiNewMessage(msg: {
  id: number;
  content: string;
  sender_id: number;
  timestamp: number;
}): void {
  for (const cb of messageCallbacks) {
    try {
      cb({ id: msg.id, content: msg.content, senderId: msg.sender_id, timestamp: msg.timestamp });
    } catch {
      /* callback must not break app */
    }
  }
}

/** Call when app state changes significantly. */
export function notifyAiStateChange(): void {
  const state = getAppState();
  for (const cb of stateCallbacks) {
    try {
      cb(state);
    } catch {
      /* */
    }
  }
}

// ---------------------------------------------------------------------------
// Commands (AI-registered actions)
// ---------------------------------------------------------------------------

const commands = new Map<string, AiCommand>();

function registerCommand(command: AiCommand): () => void {
  commands.set(command.id, command);
  log.info("AI command registered", { id: command.id });
  return () => commands.delete(command.id);
}

function executeCommand(id: string, args?: Record<string, unknown>): unknown {
  const cmd = commands.get(id);
  if (!cmd) {
    log.warn("AI command not found", { id });
    return undefined;
  }
  log.info("AI command executed", { id });
  return cmd.handler(args);
}

function getCommands(): AiCommand[] {
  return Array.from(commands.values());
}

// ---------------------------------------------------------------------------
// Install on window
// ---------------------------------------------------------------------------

export interface AiContextBridge {
  context: {
    getCurrentChat: typeof getCurrentChat;
    getCurrentUser: typeof getCurrentUser;
    getAppState: typeof getAppState;
    getRecentMessages: typeof getRecentMessages;
  };
  events: {
    onNewMessage: typeof onNewMessage;
    onStateChange: typeof onStateChange;
  };
  commands: {
    register: typeof registerCommand;
    execute: typeof executeCommand;
    list: typeof getCommands;
  };
}

export function installAiContext(): void {
  if (typeof window === "undefined") return;

  const bridge: AiContextBridge = {
    context: {
      getCurrentChat,
      getCurrentUser,
      getAppState,
      getRecentMessages,
    },
    events: {
      onNewMessage,
      onStateChange,
    },
    commands: {
      register: registerCommand,
      execute: executeCommand,
      list: getCommands,
    },
  };

  (window as unknown as { __ai__: AiContextBridge }).__ai__ = bridge;
  log.info("AI context bridge installed");
}
