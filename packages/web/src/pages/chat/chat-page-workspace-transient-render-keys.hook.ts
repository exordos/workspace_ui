import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";

interface UseWorkspaceTransientRenderKeysOptions {
  ownerKey: string | null;
  conversationId: MessengerConversationId | null;
  messages: readonly MessengerMessage[];
}

interface WorkspaceTransientRenderKeysScope {
  ownerKey: string | null;
  conversationId: MessengerConversationId | null;
}

interface WorkspaceTransientRenderKeys {
  registerDeliveredOutgoingMessage: (
    outgoingOwnerKey: string,
    outgoingConversationId: MessengerConversationId,
    serverMessageUuid: MessengerUuid,
    localId: string,
  ) => void;
  resolveServerMessageRenderKey: (serverMessageUuid: MessengerUuid) => string | undefined;
  removeServerMessageRenderKey: (
    messageOwnerKey: string,
    messageConversationId: MessengerConversationId,
    serverMessageUuid: MessengerUuid,
  ) => void;
}

function areTransientRenderKeyScopesEqual(
  first: WorkspaceTransientRenderKeysScope,
  second: WorkspaceTransientRenderKeysScope,
): boolean {
  return first.ownerKey === second.ownerKey && first.conversationId === second.conversationId;
}

export function useWorkspaceTransientRenderKeys({
  ownerKey,
  conversationId,
  messages,
}: UseWorkspaceTransientRenderKeysOptions): WorkspaceTransientRenderKeys {
  const renderKeysRef = useRef(new Map<MessengerUuid, string>());
  const renderKeysScopeRef = useRef<WorkspaceTransientRenderKeysScope>({
    ownerKey,
    conversationId,
  });
  const currentScopeRef = useRef<WorkspaceTransientRenderKeysScope>({ ownerKey, conversationId });
  const [, refreshRenderKeys] = useReducer((value: number) => value + 1, 0);
  const currentScope = useMemo(() => ({ ownerKey, conversationId }), [ownerKey, conversationId]);

  useLayoutEffect(() => {
    // Event handlers can finish after the route changes, so they read the current scope from a ref.
    currentScopeRef.current = currentScope;
    if (areTransientRenderKeyScopesEqual(renderKeysScopeRef.current, currentScope)) {
      return;
    }

    renderKeysRef.current.clear();
    renderKeysScopeRef.current = currentScope;
    refreshRenderKeys();
  }, [currentScope]);

  useEffect(() => {
    if (!areTransientRenderKeyScopesEqual(renderKeysScopeRef.current, currentScope)) {
      return;
    }

    const messageUuids = new Set(messages.map((message) => message.uuid));
    let changed = false;
    for (const messageUuid of renderKeysRef.current.keys()) {
      if (messageUuids.has(messageUuid)) {
        continue;
      }

      renderKeysRef.current.delete(messageUuid);
      changed = true;
    }

    if (changed) {
      refreshRenderKeys();
    }
  }, [currentScope, messages]);

  const registerDeliveredOutgoingMessage = useCallback(
    (
      outgoingOwnerKey: string,
      outgoingConversationId: MessengerConversationId,
      serverMessageUuid: MessengerUuid,
      localId: string,
    ) => {
      const outgoingScope = {
        ownerKey: outgoingOwnerKey,
        conversationId: outgoingConversationId,
      };
      if (
        !areTransientRenderKeyScopesEqual(currentScopeRef.current, outgoingScope) ||
        !areTransientRenderKeyScopesEqual(renderKeysScopeRef.current, outgoingScope)
      ) {
        return;
      }

      renderKeysRef.current.set(serverMessageUuid, localId);
      refreshRenderKeys();
    },
    [],
  );

  const resolveServerMessageRenderKey = useCallback(
    (serverMessageUuid: MessengerUuid): string | undefined => {
      if (!areTransientRenderKeyScopesEqual(renderKeysScopeRef.current, currentScopeRef.current)) {
        return undefined;
      }

      return renderKeysRef.current.get(serverMessageUuid);
    },
    [],
  );

  const removeServerMessageRenderKey = useCallback(
    (
      messageOwnerKey: string,
      messageConversationId: MessengerConversationId,
      serverMessageUuid: MessengerUuid,
    ) => {
      const messageScope = {
        ownerKey: messageOwnerKey,
        conversationId: messageConversationId,
      };
      if (
        !areTransientRenderKeyScopesEqual(currentScopeRef.current, messageScope) ||
        !areTransientRenderKeyScopesEqual(renderKeysScopeRef.current, messageScope)
      ) {
        return;
      }

      if (renderKeysRef.current.delete(serverMessageUuid)) {
        refreshRenderKeys();
      }
    },
    [],
  );

  return {
    registerDeliveredOutgoingMessage,
    resolveServerMessageRenderKey,
    removeServerMessageRenderKey,
  };
}
