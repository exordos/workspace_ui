import { useCallback, useEffect, useReducer, useRef } from "react";
import { readMessengerConversationPosition } from "~/entities/messenger/messenger-conversation-position.lib";
import { loadMessengerConversationMessages } from "~/entities/messenger/messenger-messages-loader.lib";
import type { MessengerConversationId } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

interface OpeningState {
  scope: string;
  phase: "pending" | "ready" | "failed";
  viewport: "automatic" | "restored" | "user";
}
type OpeningAction =
  | { type: "start"; state: OpeningState }
  | { type: "applied" | "failed" | "control"; scope: string };

function reduceOpening(state: OpeningState, action: OpeningAction): OpeningState {
  if (action.type === "start") return action.state;
  if (action.scope !== state.scope) return state;
  if (action.type === "control")
    return state.viewport === "user" ? state : { ...state, viewport: "user" };
  if (state.phase === "ready" && action.type === "failed") return state;
  return { ...state, phase: action.type === "applied" ? "ready" : "failed" };
}

/** One mounted opening owns its request and viewport intent; pagination is independent. */
export function useWorkspaceConversationOpening({
  runtimeContext,
  conversationId,
  enabled,
  retryNonce,
}: {
  runtimeContext: WorkspaceRuntimeContext | null;
  conversationId: MessengerConversationId | null;
  enabled: boolean;
  retryNonce: number;
}) {
  const ownerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const scope = `${ownerKey}:${runtimeContext?.runtimeGeneration}:${conversationId}:${enabled}`;
  const restored =
    conversationId != null && readMessengerConversationPosition(conversationId)?.kind === "anchor";
  const initial: OpeningState = {
    scope,
    phase: "pending",
    viewport: restored ? "restored" : "automatic",
  };
  const [state, dispatch] = useReducer(reduceOpening, initial);
  const current = state.scope === scope ? state : initial;
  // The loader checks intent synchronously immediately before applying its window.
  const intentRef = useRef({ scope, retain: restored });
  const requestRef = useRef<{ scope: string; controller: AbortController } | null>(null);
  const acceptWindow = useCallback(() => {
    if (requestRef.current?.scope === scope) requestRef.current.controller.abort();
    intentRef.current = { scope, retain: true };
    dispatch({ type: "control", scope });
    dispatch({ type: "applied", scope });
  }, [scope]);
  const takeControl = useCallback(() => {
    intentRef.current = { scope, retain: true };
    dispatch({ type: "control", scope });
  }, [scope]);

  useEffect(() => {
    if (!enabled || runtimeContext == null || conversationId == null) return;
    const savedPosition = readMessengerConversationPosition(conversationId);
    const restoredAtStart = savedPosition?.kind === "anchor";
    const retained = intentRef.current.scope === scope ? intentRef.current.retain : restoredAtStart;
    intentRef.current = { scope, retain: retained };
    const retainedViewport = restoredAtStart ? "restored" : "user";
    dispatch({
      type: "start",
      state: {
        scope,
        phase: "pending",
        viewport: retained ? retainedViewport : "automatic",
      },
    });
    const controller = new AbortController();
    requestRef.current = { scope, controller };
    const retainCurrentWindow = () => intentRef.current.scope === scope && intentRef.current.retain;
    void loadMessengerConversationMessages({
      runtimeContext,
      conversationId,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      signal: controller.signal,
      resolveUnreadBoundary: savedPosition == null,
      openingAnchorUuid: savedPosition?.messageKey,
      retainCurrentWindow,
      onServerWindowApplied: () => {
        if (controller.signal.aborted) return;
        dispatch({ type: "applied", scope });
      },
    }).then(
      (result) => {
        if (controller.signal.aborted || result.status === "applied") return;
        intentRef.current = { scope, retain: true };
        dispatch({ type: "failed", scope });
      },
      () => {
        if (controller.signal.aborted) return;
        intentRef.current = { scope, retain: true };
        dispatch({ type: "failed", scope });
      },
    );
    return () => {
      controller.abort();
      if (requestRef.current?.controller === controller) requestRef.current = null;
    };
  }, [conversationId, enabled, retryNonce, runtimeContext, scope]);

  return {
    pending: enabled && current.phase === "pending",
    ready: !enabled || current.phase === "ready",
    cancelled: enabled && (current.viewport === "user" || current.phase === "failed"),
    takeControl,
    acceptWindow,
  };
}
