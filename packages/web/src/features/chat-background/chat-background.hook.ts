import { useMemo, useSyncExternalStore } from "react";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/platform/sessions/workspace-runtime.lib";
import {
  chatBackgroundStorageKey,
  parseChatBackgroundPreferences,
  saveChatBackgroundPreferences,
} from "./chat-background.lib";
import type { ChatBackgroundValue } from "./chat-background.lib";

const CHANGED = "workspace-chat-background-changed";
const getRuntime = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
function subscribe(listener: () => void) {
  window.addEventListener(CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
}

/** Appearance is local to one account, organization, project and user. */
export function useChatBackground(conversationId: string | null = null) {
  const owner = useWorkspaceAuthStore((state) => {
    const runtime = selectCurrentWorkspaceRuntimeContext(state);
    return runtime == null ? null : workspaceRuntimeOwnerKey(runtime);
  });
  // Refresh callbacks even when a new live runtime has the same durable owner.
  const runtimeGeneration = useWorkspaceAuthStore((state) => state.runtimeGeneration);
  const request = captureWorkspaceRuntimeRequestContext(getRuntime);
  const key = owner == null ? null : chatBackgroundStorageKey(owner);
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return key == null ? null : localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const preferences = useMemo(() => parseChatBackgroundPreferences(raw), [raw]);
  const background =
    conversationId != null && Object.hasOwn(preferences.chats, conversationId)
      ? (preferences.chats[conversationId] ?? null)
      : preferences.global;
  const isCurrent = () =>
    request != null &&
    workspaceRuntimeOwnerKey(request) === owner &&
    !isWorkspaceRuntimeRequestInvalidated(request, getRuntime);
  const apply = (value: ChatBackgroundValue, scope: "all" | "chat"): boolean => {
    if (key == null || !isCurrent() || (scope === "chat" && conversationId == null)) return false;
    const current = parseChatBackgroundPreferences(localStorage.getItem(key));
    saveChatBackgroundPreferences(
      key,
      scope === "all"
        ? { global: value, chats: {} }
        : { ...current, chats: { ...current.chats, [conversationId!]: value } },
    );
    window.dispatchEvent(new Event(CHANGED));
    return true;
  };
  return { key, runtimeGeneration, background, apply, available: owner != null, isCurrent };
}
