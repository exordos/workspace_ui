import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { resolveMessengerTopic } from "~/entities/messenger/messenger-conversation-metadata.lib";
import { readMessengerConversationPosition } from "~/entities/messenger/messenger-conversation-position.lib";
import { loadMessengerConversationMessages } from "~/entities/messenger/messenger-messages-loader.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerTopic, MessengerConversationId } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  workspaceRuntimeOwnerKey,
  isWorkspaceRuntimeRequestInvalidated,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

/** Route recovery and topic clicks share one request owned by the current location. */
export function useWorkspaceTopicResolution({
  runtimeContext,
  topicUuid,
  locationKey,
  onResolved,
}: {
  runtimeContext: WorkspaceRuntimeContext | null;
  topicUuid: string | null;
  locationKey: string;
  onResolved: (topic: MessengerTopic, replace: boolean) => void;
}) {
  const ownerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const knownTopicStreamUuid = useMessengerStore((state) =>
    state.ownerKey === ownerKey && topicUuid != null
      ? state.topicsById[topicUuid]?.streamUuid
      : undefined,
  );
  const requestRef = useRef<{ controller: AbortController; replace: boolean } | null>(null);
  const openTopic = useCallback(
    (requestedTopicUuid: string, replace = false) => {
      requestRef.current?.controller.abort();
      if (runtimeContext == null) return;
      const controller = new AbortController();
      requestRef.current = { controller, replace };
      const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      const applyTopic = (topic: MessengerTopic | null) => {
        if (
          topic == null ||
          isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, controller.signal)
        )
          return;
        const store = useMessengerStore.getState();
        if (store.topicsById[topic.uuid] !== topic)
          store.upsertTopic(workspaceRuntimeOwnerKey(runtimeContext), topic);
        onResolved(topic, replace);
      };
      const store = useMessengerStore.getState();
      const knownTopic = store.ownerKey === ownerKey ? store.topicsById[requestedTopicUuid] : null;
      if (knownTopic != null) {
        applyTopic(knownTopic);
        return;
      }
      void resolveMessengerTopic({
        runtimeContext,
        topicUuid: requestedTopicUuid,
        signal: controller.signal,
        getRuntimeContext,
      })
        .then(applyTopic)
        .catch(() => undefined)
        .finally(() => {
          if (requestRef.current?.controller === controller) requestRef.current = null;
        });
    },
    [onResolved, ownerKey, runtimeContext],
  );

  // Cancel at the location commit, before a late promise can navigate from the old route.
  useLayoutEffect(() => {
    return () => {
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, [locationKey, openTopic]);

  useEffect(() => {
    if (topicUuid == null || requestRef.current?.replace === false) return;
    openTopic(topicUuid, true);
  }, [knownTopicStreamUuid, locationKey, openTopic, topicUuid]);

  return openTopic;
}

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
