import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { LAST_MESSENGER_ROUTE_PERSIST_DEBOUNCE_MS } from "~/shared/config/constants";
import {
  extractPersistableMessengerChatPath,
  saveLastMessengerRoute,
} from "~/shared/lib/last-messenger-route.lib";

/**
 * Persists the last opened stream/DM whenever the user navigates within messenger chats.
 *
 * Writes are debounced + deduped to avoid flooding localStorage when the user
 * scrolls through topics or rapidly switches between chats.
 */
export function useLayoutLastMessengerRoutePersistence(currentInstanceId: string | null): void {
  const location = useLocation();
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentInstanceId == null) return;
    const path = extractPersistableMessengerChatPath(location.pathname);
    if (path == null) return;

    const key = `${currentInstanceId}|${path}`;
    if (lastSavedRef.current === key) return;

    const timer = setTimeout(() => {
      saveLastMessengerRoute(currentInstanceId, path);
      lastSavedRef.current = key;
    }, LAST_MESSENGER_ROUTE_PERSIST_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [currentInstanceId, location.pathname]);
}
