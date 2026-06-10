/**
 * Typing indicator store — tracks who is typing in which conversation.
 *
 * Each chat key maps to a set of user IDs currently typing.
 * Typing entries auto-expire after TYPING_EXPIRY_MS (15 s) unless refreshed.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { TypingUser } from "./typing-indicator.types";

export const TYPING_EXPIRY_MS = 15_000;

/** Stable fallback for selectors when no chat key is active (never inline `[]`). */
export const EMPTY_TYPING_USERS: TypingUser[] = [];

const EMPTY_USERS = EMPTY_TYPING_USERS;

interface TypingIndicatorState {
  /** chatKey → list of currently-typing users */
  typingMap: Map<string, TypingUser[]>;
  /** Active expiry timers keyed by `${chatKey}:${userId}` */
  timers: Map<string, ReturnType<typeof setTimeout>>;

  setTyping: (chatKey: string, userId: number, isTyping: boolean) => void;
  getTypingUsers: (chatKey: string) => TypingUser[];
  clearAll: () => void;
}

function timerKey(chatKey: string, userId: number): string {
  return `${chatKey}:${userId}`;
}

export const useTypingIndicatorStore = create<TypingIndicatorState>((set, get) => ({
  typingMap: new Map(),
  timers: new Map(),

  setTyping(chatKey, userId, isTyping) {
    logStoreAction("typing", "setTyping", { chatKey, userId, isTyping });
    const state = get();
    const tk = timerKey(chatKey, userId);

    const existingTimer = state.timers.get(tk);
    if (existingTimer != null) clearTimeout(existingTimer);

    if (!isTyping) {
      const nextTimers = new Map(state.timers);
      nextTimers.delete(tk);

      const current = state.typingMap.get(chatKey) ?? EMPTY_USERS;
      const filtered = current.filter((u) => u.userId !== userId);
      const nextMap = new Map(state.typingMap);
      if (filtered.length === 0) {
        nextMap.delete(chatKey);
      } else {
        nextMap.set(chatKey, filtered);
      }

      set({ typingMap: nextMap, timers: nextTimers });
      return;
    }

    const expiryTimer = setTimeout(() => {
      get().setTyping(chatKey, userId, false);
    }, TYPING_EXPIRY_MS);

    const nextTimers = new Map(state.timers);
    nextTimers.set(tk, expiryTimer);

    const current = state.typingMap.get(chatKey) ?? EMPTY_USERS;
    const existing = current.find((u) => u.userId === userId);
    const nextMap = new Map(state.typingMap);
    if (existing) {
      nextMap.set(
        chatKey,
        current.map((u) => (u.userId === userId ? { ...u, startedAt: Date.now() } : u)),
      );
    } else {
      nextMap.set(chatKey, [...current, { userId, startedAt: Date.now() }]);
    }

    set({ typingMap: nextMap, timers: nextTimers });
  },

  getTypingUsers(chatKey) {
    return get().typingMap.get(chatKey) ?? EMPTY_USERS;
  },

  clearAll() {
    logStoreAction("typing", "clearAll", {});
    const state = get();
    for (const timer of state.timers.values()) {
      clearTimeout(timer);
    }
    set({ typingMap: new Map(), timers: new Map() });
  },
}));
