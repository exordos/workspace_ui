/**
 * In-app toast queue — imperative pushes from non-React code, rendered by ToastHost.
 */

import { create } from "zustand";
import {
  TOAST_DEDUP_WINDOW_MS,
  TOAST_ERROR_DISMISS_MS,
  TOAST_MAX_VISIBLE,
  TOAST_SUCCESS_DISMISS_MS,
} from "~/shared/config/constants";
import { logStoreAction } from "~/shared/lib/logger";
import type { ToastEntry, ToastVariant } from "./toast.types";

interface ToastState {
  toasts: ToastEntry[];
  push: (message: string, variant: ToastVariant) => string | null;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
const dedupPruneTimers = new Map<string, ReturnType<typeof setTimeout>>();
const recentMessageKeys = new Set<string>();

function dismissMsForVariant(variant: ToastVariant): number {
  return variant === "error" ? TOAST_ERROR_DISMISS_MS : TOAST_SUCCESS_DISMISS_MS;
}

function scheduleAutoDismiss(
  id: string,
  variant: ToastVariant,
  dismiss: (id: string) => void,
): void {
  const existing = dismissTimers.get(id);
  if (existing != null) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    dismissTimers.delete(id);
    dismiss(id);
  }, dismissMsForVariant(variant));
  dismissTimers.set(id, timer);
}

function clearDismissTimer(id: string): void {
  const timer = dismissTimers.get(id);
  if (timer != null) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
}

function shouldDedupMessage(message: string, variant: ToastVariant): boolean {
  const key = `${variant}:${message}`;
  if (recentMessageKeys.has(key)) {
    return true;
  }
  recentMessageKeys.add(key);
  const existing = dedupPruneTimers.get(key);
  if (existing != null) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    recentMessageKeys.delete(key);
    dedupPruneTimers.delete(key);
  }, TOAST_DEDUP_WINDOW_MS);
  dedupPruneTimers.set(key, timer);
  return false;
}

export function resetToastStateForTests(): void {
  for (const timer of dismissTimers.values()) {
    clearTimeout(timer);
  }
  dismissTimers.clear();
  for (const timer of dedupPruneTimers.values()) {
    clearTimeout(timer);
  }
  dedupPruneTimers.clear();
  recentMessageKeys.clear();
  useToastStore.setState({ toasts: [] });
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push(message, variant) {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (shouldDedupMessage(trimmed, variant)) {
      return null;
    }

    const id = crypto.randomUUID();
    const entry: ToastEntry = {
      id,
      message: trimmed,
      variant,
      createdAt: Date.now(),
    };

    logStoreAction("toast", "push", { variant, messageLength: trimmed.length });

    set((state) => ({
      toasts: [...state.toasts, entry].slice(-TOAST_MAX_VISIBLE),
    }));

    scheduleAutoDismiss(id, variant, (toastId) => {
      get().dismiss(toastId);
    });

    return id;
  },

  dismiss(id) {
    clearDismissTimer(id);
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
    logStoreAction("toast", "dismiss", { id });
  },

  clearAll() {
    for (const id of dismissTimers.keys()) {
      clearDismissTimer(id);
    }
    set({ toasts: [] });
    logStoreAction("toast", "clearAll", {});
  },
}));
