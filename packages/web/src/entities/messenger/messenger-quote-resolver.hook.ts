import { useEffect, useMemo, useState } from "react";
import {
  selectWorkspaceMessageById,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { loadMessengerQuoteMessage } from "./messenger-quote-loader.lib";
import type { MessengerMessage, MessengerUuid } from "./messenger.types";

export interface ResolvedMessengerQuoteMessage {
  status: "loading" | "ready" | "unavailable";
  message: MessengerMessage | null;
}

export function useResolvedMessengerQuoteMessage(
  messageUuid: MessengerUuid,
  enabled = true,
): ResolvedMessengerQuoteMessage {
  const message = useWorkspaceMessageStore((state) =>
    selectWorkspaceMessageById(state, messageUuid),
  );
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const requestKey =
    runtimeContext == null
      ? `missing:${messageUuid}`
      : `${runtimeContext.accountId}:${runtimeContext.instanceId}:${runtimeContext.organizationId}:${runtimeContext.projectId}:${runtimeContext.userUuid}:${runtimeContext.runtimeGeneration}:${messageUuid}`;
  const [unavailableKey, setUnavailableKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || runtimeContext == null || message != null) {
      return;
    }

    void loadMessengerQuoteMessage({
      runtimeContext,
      getRuntimeContext: () =>
        selectCurrentWorkspaceRuntimeContext(useWorkspaceAuthStore.getState()),
      messageUuid,
    }).then((result) => {
      if (result.status === "unavailable") {
        setUnavailableKey(requestKey);
      }
    });
  }, [enabled, message, messageUuid, requestKey, runtimeContext]);

  if (message != null) {
    return { status: "ready", message };
  }
  if (runtimeContext == null || unavailableKey === requestKey) {
    return { status: "unavailable", message: null };
  }
  return { status: "loading", message: null };
}
