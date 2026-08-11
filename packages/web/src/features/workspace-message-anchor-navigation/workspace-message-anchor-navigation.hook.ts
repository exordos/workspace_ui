import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  applyMessengerMessageWindow,
  fetchMessengerMessageWindow,
  resolveMessengerMessageAnchor,
} from "~/entities/messenger/messenger-messages-loader.lib";
import type {
  MessengerMessageAnchorResolveResult,
  MessengerMessageWindowApplyResult,
  MessengerMessageWindowFetchResult,
} from "~/entities/messenger/messenger-messages-loader.lib";
import type { MessengerConversationId } from "~/entities/messenger/messenger.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  isWorkspaceMessageAnchorIntentCurrent,
  supersedeWorkspaceMessageAnchorIntent,
} from "./workspace-message-anchor-navigation.lib";
import type {
  WorkspaceMessageAnchorFocusTarget,
  WorkspaceMessageAnchorNavigationError,
  WorkspaceMessageAnchorNavigationIntent,
  WorkspaceMessageAnchorNavigationOptions,
  WorkspaceMessageAnchorNavigationResult,
  WorkspaceMessageAnchorNavigationSource,
  WorkspaceMessageAnchorRouteRequest,
} from "./workspace-message-anchor-navigation.types";

interface ActiveRequest {
  controller: AbortController;
  intentId: number;
}

interface IntentRuntimeContext {
  intentId: number;
  context: WorkspaceRuntimeContext;
}

interface IntentRuntimeScope {
  intentId: number;
  ownerKey: string;
  runtimeGeneration: number;
}

interface ExpectedRouteEvent {
  intentId: number;
  messageUuid: string;
  path: string;
  ownerKey: string;
  runtimeGeneration: number;
}

interface FetchAndApplyWindowRequest {
  runtimeContext: WorkspaceRuntimeContext;
  anchor: Extract<MessengerMessageAnchorResolveResult, { status: "resolved" }>;
  targetConversationId: MessengerConversationId;
  signal: AbortSignal;
  getRuntimeContext: () => WorkspaceRuntimeContext | null;
  fetchWindow: typeof fetchMessengerMessageWindow;
  applyWindow: typeof applyMessengerMessageWindow;
  isCurrentAttempt: () => boolean;
}

type FetchAndApplyWindowResult =
  | MessengerMessageWindowApplyResult
  | Exclude<MessengerMessageWindowFetchResult, { status: "fetched" }>;

function runtimeMatchesRouteScope(
  context: WorkspaceRuntimeContext | null,
  request: WorkspaceMessageAnchorRouteRequest,
): context is WorkspaceRuntimeContext {
  return (
    context?.organizationId === request.scope.organizationId &&
    context.projectId === request.scope.projectId
  );
}

function runtimeSnapshotsMatch(
  first: WorkspaceRuntimeContext,
  second: WorkspaceRuntimeContext,
): boolean {
  return (
    workspaceRuntimeOwnerKey(first) === workspaceRuntimeOwnerKey(second) &&
    first.runtimeGeneration === second.runtimeGeneration
  );
}

async function fetchAndApplyWindowOnce({
  runtimeContext,
  anchor,
  targetConversationId,
  signal,
  getRuntimeContext,
  fetchWindow,
  applyWindow,
  isCurrentAttempt,
}: FetchAndApplyWindowRequest): Promise<FetchAndApplyWindowResult | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fetched = await fetchWindow({
      runtimeContext,
      anchor,
      targetConversationId,
      signal,
      getRuntimeContext,
    });
    if (!isCurrentAttempt()) return null;
    if (fetched.status !== "fetched") {
      if (fetched.status === "skipped" && fetched.reason === "stale-window" && attempt === 0) {
        continue;
      }
      return fetched;
    }

    const applied = await applyWindow({
      runtimeContext,
      window: fetched.window,
      signal,
      getRuntimeContext,
      isRequestCurrent: isCurrentAttempt,
    });
    if (!isCurrentAttempt()) return null;
    if (applied.status === "skipped" && applied.reason === "stale-window" && attempt === 0) {
      continue;
    }
    return applied;
  }

  return null;
}

export function useWorkspaceMessageAnchorNavigation({
  runtimeContext,
  routeRequest,
  routePath,
  windowBusy,
  getRuntimeContext,
  resolveKnownConversationId,
  isMessageInWindow,
  isMessageWindowReady,
  loader,
  navigate,
  buildDirectRoute,
  buildConversationRoute,
  cancelTail,
  unavailableError,
  domMissingError,
}: WorkspaceMessageAnchorNavigationOptions): WorkspaceMessageAnchorNavigationResult {
  const [intent, setIntent] = useState<WorkspaceMessageAnchorNavigationIntent | null>(null);
  const [navigationError, setNavigationError] =
    useState<WorkspaceMessageAnchorNavigationError | null>(null);
  const intentRef = useRef<WorkspaceMessageAnchorNavigationIntent | null>(null);
  const nextIntentIdRef = useRef(0);
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const intentRuntimeContextRef = useRef<IntentRuntimeContext | null>(null);
  const [intentRuntimeScope, setIntentRuntimeScope] = useState<IntentRuntimeScope | null>(null);
  const expectedRouteEventRef = useRef<ExpectedRouteEvent | null>(null);
  const runtimeScopeKey =
    runtimeContext == null
      ? null
      : `${workspaceRuntimeOwnerKey(runtimeContext)}:${runtimeContext.runtimeGeneration}`;
  const previousRuntimeScopeKeyRef = useRef(runtimeScopeKey);
  const resolveAnchor = loader?.resolveAnchor ?? resolveMessengerMessageAnchor;
  const fetchWindow = loader?.fetchWindow ?? fetchMessengerMessageWindow;
  const applyWindow = loader?.applyWindow ?? applyMessengerMessageWindow;

  const publishIntent = useCallback((next: WorkspaceMessageAnchorNavigationIntent | null): void => {
    intentRef.current = next;
    setIntent(next);
  }, []);

  const publishIntentRuntimeContext = useCallback((next: IntentRuntimeContext | null): void => {
    intentRuntimeContextRef.current = next;
    setIntentRuntimeScope(
      next == null
        ? null
        : {
            intentId: next.intentId,
            ownerKey: workspaceRuntimeOwnerKey(next.context),
            runtimeGeneration: next.context.runtimeGeneration,
          },
    );
  }, []);

  const isCurrent = useCallback(
    (candidate: WorkspaceMessageAnchorNavigationIntent, signal: AbortSignal): boolean =>
      isWorkspaceMessageAnchorIntentCurrent({
        intent: candidate,
        activeIntent: intentRef.current,
        runtimeContext: getRuntimeContext(),
        signal,
      }),
    [getRuntimeContext],
  );

  const isCurrentIntentRuntime = useCallback(
    (candidate: WorkspaceMessageAnchorNavigationIntent): boolean => {
      const currentRuntime = getRuntimeContext();
      return (
        currentRuntime != null &&
        workspaceRuntimeOwnerKey(currentRuntime) === candidate.ownerKey &&
        currentRuntime.runtimeGeneration === candidate.runtimeGeneration
      );
    },
    [getRuntimeContext],
  );

  const failIntent = useCallback(
    (
      candidate: WorkspaceMessageAnchorNavigationIntent,
      kind: WorkspaceMessageAnchorNavigationError["kind"],
      detail: string,
    ): void => {
      const active = intentRef.current;
      if (active?.id !== candidate.id) return;
      const failed = { ...active, phase: "failed" as const, pendingDomRecovery: false };
      publishIntent(failed);
      setNavigationError({
        intentId: failed.id,
        messageUuid: failed.messageUuid,
        kind,
        detail,
        retryable: true,
      });
    },
    [publishIntent],
  );

  const runWindowRequest = useCallback(
    (candidate: WorkspaceMessageAnchorNavigationIntent): void => {
      const requestRuntimeContext = intentRuntimeContextRef.current;
      if (requestRuntimeContext?.intentId !== candidate.id) return;
      activeRequestRef.current?.controller.abort();
      const controller = new AbortController();
      activeRequestRef.current = { controller, intentId: candidate.id };
      const resolvingIntent = {
        ...candidate,
        phase: "resolving" as const,
        transitionRequired: true,
      };
      publishIntent(resolvingIntent);

      const isCurrentAttempt = (): boolean => {
        const current = intentRef.current;
        return (
          isCurrent(resolvingIntent, controller.signal) &&
          current?.id === resolvingIntent.id &&
          current.recoveryAttempt === resolvingIntent.recoveryAttempt
        );
      };

      void (async () => {
        const resolved = await resolveAnchor({
          runtimeContext: requestRuntimeContext.context,
          messageUuid: resolvingIntent.messageUuid,
          signal: controller.signal,
          getRuntimeContext,
        });
        if (!isCurrentAttempt()) return;
        if (resolved.status === "skipped") {
          failIntent(resolvingIntent, "invalid-context", unavailableError);
          return;
        }
        if (resolved.status === "failed") {
          failIntent(resolvingIntent, "network", resolved.error);
          return;
        }

        const current = intentRef.current;
        if (current?.id !== resolvingIntent.id) return;
        const targetConversationId = current.conversationId ?? resolved.conversationId;
        publishIntent({
          ...current,
          conversationId: targetConversationId,
          phase: "loading-window",
        });

        const windowResult = await fetchAndApplyWindowOnce({
          runtimeContext: requestRuntimeContext.context,
          anchor: resolved,
          targetConversationId,
          signal: controller.signal,
          getRuntimeContext,
          fetchWindow,
          applyWindow,
          isCurrentAttempt,
        });
        if (!isCurrentAttempt() || windowResult == null) return;
        if (windowResult.status === "skipped") {
          failIntent(resolvingIntent, "invalid-context", unavailableError);
          return;
        }
        if (windowResult.status === "failed") {
          failIntent(resolvingIntent, "network", windowResult.error);
          return;
        }

        const active = intentRef.current;
        if (active?.id !== resolvingIntent.id) return;
        const awaitingDom = {
          ...active,
          conversationId: windowResult.conversationId,
          messageUuid: windowResult.anchorUuid,
          phase: "awaiting-dom" as const,
        };
        publishIntent(awaitingDom);
        setNavigationError(null);

        const canonicalRoute = buildConversationRoute(
          windowResult.conversationId,
          windowResult.anchorUuid,
        );
        if (canonicalRoute == null) {
          failIntent(awaitingDom, "invalid-context", unavailableError);
          return;
        }
        if (routePath !== canonicalRoute) {
          expectedRouteEventRef.current = {
            intentId: awaitingDom.id,
            messageUuid: windowResult.anchorUuid,
            path: canonicalRoute,
            ownerKey: awaitingDom.ownerKey,
            runtimeGeneration: awaitingDom.runtimeGeneration,
          };
          navigate(canonicalRoute, { replace: true });
        }
      })()
        .catch((error: unknown) => {
          if (!isCurrentAttempt()) return;
          failIntent(
            resolvingIntent,
            "network",
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : unavailableError,
          );
        })
        .finally(() => {
          if (
            activeRequestRef.current?.intentId === resolvingIntent.id &&
            activeRequestRef.current.controller === controller
          ) {
            activeRequestRef.current = null;
          }
        });
    },
    [
      buildConversationRoute,
      applyWindow,
      failIntent,
      fetchWindow,
      getRuntimeContext,
      isCurrent,
      navigate,
      publishIntent,
      resolveAnchor,
      routePath,
      unavailableError,
    ],
  );

  const beginNavigation = useCallback(
    ({
      messageUuid,
      conversationId,
      routeKey,
      source,
      changeRoute,
      useKnownConversation,
    }: {
      messageUuid: WorkspaceMessageAnchorNavigationIntent["messageUuid"];
      conversationId: WorkspaceMessageAnchorNavigationIntent["conversationId"];
      routeKey: string;
      source: WorkspaceMessageAnchorNavigationSource;
      changeRoute: boolean;
      useKnownConversation: boolean;
    }): number | null => {
      if (runtimeContext == null) return null;

      cancelTail();
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      expectedRouteEventRef.current = null;
      const supersededIntent = supersedeWorkspaceMessageAnchorIntent(intentRef.current);
      if (supersededIntent != null) {
        publishIntent(supersededIntent);
      }

      const id = ++nextIntentIdRef.current;
      const resolvedConversationId = resolveKnownConversationId(messageUuid);
      const knownConversationId =
        conversationId ??
        (useKnownConversation ||
        (resolvedConversationId != null && isMessageInWindow(resolvedConversationId, messageUuid))
          ? resolvedConversationId
          : null);
      const currentWindowReady =
        knownConversationId != null &&
        resolvedConversationId === knownConversationId &&
        isMessageInWindow(knownConversationId, messageUuid) &&
        isMessageWindowReady(knownConversationId, messageUuid);
      const requested: WorkspaceMessageAnchorNavigationIntent = {
        id,
        messageUuid,
        conversationId: knownConversationId,
        ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
        runtimeGeneration: runtimeContext.runtimeGeneration,
        routeKey,
        source,
        phase: "requested",
        transitionRequired: !currentWindowReady,
        recoveryAttempt: 0,
        pendingDomRecovery: false,
        focusAttempt: 0,
      };
      publishIntentRuntimeContext({ intentId: id, context: runtimeContext });
      publishIntent(requested);
      setNavigationError(null);

      if (changeRoute) {
        const conversationRoute =
          knownConversationId == null
            ? null
            : buildConversationRoute(knownConversationId, messageUuid);
        const targetRoute = conversationRoute ?? buildDirectRoute(messageUuid);
        expectedRouteEventRef.current = {
          intentId: requested.id,
          messageUuid,
          path: targetRoute,
          ownerKey: requested.ownerKey,
          runtimeGeneration: requested.runtimeGeneration,
        };
        navigate(targetRoute, { replace: routePath === targetRoute });
      }

      if (currentWindowReady) {
        publishIntent({ ...requested, phase: "awaiting-dom" });
        return id;
      }

      runWindowRequest(requested);
      return id;
    },
    [
      buildConversationRoute,
      buildDirectRoute,
      cancelTail,
      isMessageInWindow,
      isMessageWindowReady,
      navigate,
      publishIntent,
      publishIntentRuntimeContext,
      resolveKnownConversationId,
      routePath,
      runWindowRequest,
      runtimeContext,
    ],
  );

  const startMessageNavigation = useCallback(
    (
      messageUuid: WorkspaceMessageAnchorNavigationIntent["messageUuid"],
      source: "local-quote" | "urn" = "local-quote",
    ): number | null =>
      beginNavigation({
        messageUuid,
        conversationId: null,
        routeKey: `action:${nextIntentIdRef.current + 1}`,
        source,
        changeRoute: true,
        useKnownConversation: true,
      }),
    [beginNavigation],
  );

  const publishRouteContextState = useCallback(
    ({
      request,
      context,
      phase,
      force = false,
    }: {
      request: WorkspaceMessageAnchorRouteRequest;
      context: WorkspaceRuntimeContext;
      phase: "resolving" | "failed";
      force?: boolean;
    }): void => {
      const active = intentRef.current;
      if (
        !force &&
        active?.messageUuid === request.messageUuid &&
        active.routeKey === request.routeKey &&
        active.phase === phase
      ) {
        return;
      }

      cancelTail();
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      expectedRouteEventRef.current = null;
      publishIntentRuntimeContext(null);
      const supersededIntent = supersedeWorkspaceMessageAnchorIntent(active);
      if (supersededIntent != null) {
        publishIntent(supersededIntent);
      }

      const next: WorkspaceMessageAnchorNavigationIntent = {
        id: ++nextIntentIdRef.current,
        messageUuid: request.messageUuid,
        conversationId: request.conversationId,
        ownerKey: workspaceRuntimeOwnerKey(context),
        runtimeGeneration: context.runtimeGeneration,
        routeKey: request.routeKey,
        source: request.source,
        phase,
        transitionRequired: true,
        recoveryAttempt: 0,
        pendingDomRecovery: false,
        focusAttempt: 0,
      };
      publishIntent(next);
      setNavigationError(
        phase === "failed"
          ? {
              intentId: next.id,
              messageUuid: next.messageUuid,
              kind: "invalid-context",
              detail: unavailableError,
              retryable: true,
            }
          : null,
      );
    },
    [cancelTail, publishIntent, publishIntentRuntimeContext, unavailableError],
  );

  useEffect(() => {
    if (previousRuntimeScopeKeyRef.current === runtimeScopeKey) return;
    previousRuntimeScopeKeyRef.current = runtimeScopeKey;
    activeRequestRef.current?.controller.abort();
    activeRequestRef.current = null;
    expectedRouteEventRef.current = null;
    publishIntentRuntimeContext(null);
    const current = intentRef.current;
    if (current != null) {
      publishIntent({ ...current, phase: "superseded", pendingDomRecovery: false });
    }
    publishIntent(null);
    setNavigationError(null);
  }, [publishIntent, publishIntentRuntimeContext, runtimeScopeKey]);

  useEffect(() => {
    if (routeRequest == null) {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      // A route without an anchor releases the previous anchor ownership.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      publishIntent(null);
      setNavigationError(null);
      return;
    }

    const currentRuntime = getRuntimeContext();
    if (runtimeContext == null || currentRuntime == null) {
      return;
    }

    const propMatchesRoute = runtimeMatchesRouteScope(runtimeContext, routeRequest);
    const storeMatchesRoute = runtimeMatchesRouteScope(currentRuntime, routeRequest);
    const runtimesMatch = runtimeSnapshotsMatch(runtimeContext, currentRuntime);
    if (!propMatchesRoute || !storeMatchesRoute || !runtimesMatch) {
      publishRouteContextState({
        request: routeRequest,
        context: storeMatchesRoute ? currentRuntime : runtimeContext,
        phase: !propMatchesRoute && !storeMatchesRoute && runtimesMatch ? "failed" : "resolving",
      });
      return;
    }

    const expectedRouteEvent = expectedRouteEventRef.current;
    if (
      routeRequest.source !== "browser-history" &&
      expectedRouteEvent?.path === routePath &&
      expectedRouteEvent.messageUuid === routeRequest.messageUuid &&
      expectedRouteEvent.intentId === intentRef.current?.id &&
      expectedRouteEvent.ownerKey === workspaceRuntimeOwnerKey(currentRuntime) &&
      expectedRouteEvent.runtimeGeneration === currentRuntime.runtimeGeneration
    ) {
      expectedRouteEventRef.current = null;
      return;
    }

    beginNavigation({
      messageUuid: routeRequest.messageUuid,
      conversationId: routeRequest.conversationId,
      routeKey: routeRequest.routeKey,
      source: routeRequest.source,
      changeRoute: false,
      useKnownConversation: routeRequest.conversationId != null,
    });
  }, [
    beginNavigation,
    getRuntimeContext,
    publishIntent,
    publishRouteContextState,
    routePath,
    routeRequest,
    runtimeContext,
  ]);

  useEffect(
    () => () => {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    },
    [],
  );

  const retryMessageNavigation = useCallback(() => {
    const current = intentRef.current;
    if (current == null) return;
    if (routeRequest?.routeKey === current.routeKey) {
      const currentRuntime = getRuntimeContext();
      if (runtimeContext == null || currentRuntime == null) return;
      const propMatchesRoute = runtimeMatchesRouteScope(runtimeContext, routeRequest);
      const storeMatchesRoute = runtimeMatchesRouteScope(currentRuntime, routeRequest);
      const runtimesMatch = runtimeSnapshotsMatch(runtimeContext, currentRuntime);
      if (!propMatchesRoute || !storeMatchesRoute || !runtimesMatch) {
        publishRouteContextState({
          request: routeRequest,
          context: storeMatchesRoute ? currentRuntime : runtimeContext,
          phase: !propMatchesRoute && !storeMatchesRoute && runtimesMatch ? "failed" : "resolving",
          force: true,
        });
        return;
      }
    }
    beginNavigation({
      messageUuid: current.messageUuid,
      conversationId: current.conversationId,
      routeKey: `retry:${nextIntentIdRef.current + 1}`,
      source: "retry",
      changeRoute: true,
      useKnownConversation: true,
    });
  }, [beginNavigation, getRuntimeContext, publishRouteContextState, routeRequest, runtimeContext]);

  const onDomFocusApplied = useCallback(
    (target: WorkspaceMessageAnchorFocusTarget): void => {
      const current = intentRef.current;
      if (
        current?.id !== target.intentId ||
        current.messageUuid !== target.messageUuid ||
        current.focusAttempt !== target.focusAttempt ||
        current.phase !== "awaiting-dom" ||
        !isCurrentIntentRuntime(current)
      )
        return;
      publishIntent({ ...current, phase: "focused", pendingDomRecovery: false });
      setNavigationError(null);
    },
    [isCurrentIntentRuntime, publishIntent],
  );

  const onDomFocusMissing = useCallback(
    (target: WorkspaceMessageAnchorFocusTarget): void => {
      const current = intentRef.current;
      if (
        current?.id !== target.intentId ||
        current.messageUuid !== target.messageUuid ||
        current.focusAttempt !== target.focusAttempt ||
        current.phase !== "awaiting-dom" ||
        !isCurrentIntentRuntime(current)
      )
        return;
      if (current.recoveryAttempt >= 1) {
        failIntent(current, "dom-missing", domMissingError);
        return;
      }
      if (windowBusy) {
        publishIntent({ ...current, transitionRequired: true, pendingDomRecovery: true });
        return;
      }
      runWindowRequest({
        ...current,
        recoveryAttempt: current.recoveryAttempt + 1,
        focusAttempt: current.focusAttempt + 1,
        pendingDomRecovery: false,
      });
    },
    [
      domMissingError,
      failIntent,
      isCurrentIntentRuntime,
      publishIntent,
      runWindowRequest,
      windowBusy,
    ],
  );

  useEffect(() => {
    const current = intentRef.current;
    if (windowBusy || current?.pendingDomRecovery !== true) return;
    if (current.recoveryAttempt >= 1) {
      failIntent(current, "dom-missing", domMissingError);
      return;
    }
    runWindowRequest({
      ...current,
      recoveryAttempt: current.recoveryAttempt + 1,
      focusAttempt: current.focusAttempt + 1,
      pendingDomRecovery: false,
    });
  }, [
    domMissingError,
    failIntent,
    intent?.id,
    intent?.pendingDomRecovery,
    intent?.recoveryAttempt,
    runWindowRequest,
    windowBusy,
  ]);

  const cancelForTail = useCallback(() => {
    activeRequestRef.current?.controller.abort();
    activeRequestRef.current = null;
    expectedRouteEventRef.current = null;
    publishIntentRuntimeContext(null);
    const current = intentRef.current;
    if (current != null) {
      publishIntent({ ...current, phase: "superseded", pendingDomRecovery: false });
    }
    setNavigationError(null);
  }, [publishIntent, publishIntentRuntimeContext]);

  const focusTarget =
    intent == null ||
    (intent.phase !== "awaiting-dom" && intent.phase !== "focused") ||
    !isCurrentIntentRuntime(intent)
      ? null
      : {
          intentId: intent.id,
          messageUuid: intent.messageUuid,
          focusAttempt: intent.focusAttempt,
        };

  const visibleIntent = intent == null || isCurrentIntentRuntime(intent) ? intent : null;
  const visibleNavigationError =
    visibleIntent?.id === navigationError?.intentId ? navigationError : null;
  const previewRuntimeMatches =
    visibleIntent != null &&
    intentRuntimeScope?.intentId === visibleIntent.id &&
    intentRuntimeScope.ownerKey === visibleIntent.ownerKey &&
    intentRuntimeScope.runtimeGeneration === visibleIntent.runtimeGeneration;
  const previewOwnerKey = previewRuntimeMatches ? visibleIntent.ownerKey : null;
  const previewMessageUuid = previewRuntimeMatches ? visibleIntent.messageUuid : null;
  const previewMessage = useWorkspaceMessageStore((state) => {
    if (
      previewOwnerKey == null ||
      previewMessageUuid == null ||
      state.ownerKey !== previewOwnerKey
    ) {
      return null;
    }
    return state.messagesById[previewMessageUuid] ?? null;
  });
  const previewPresentation =
    visibleIntent == null ||
    !visibleIntent.transitionRequired ||
    visibleIntent.phase === "focused" ||
    visibleIntent.phase === "superseded"
      ? null
      : {
          intentId: visibleIntent.id,
          messageUuid: visibleIntent.messageUuid,
          phase:
            visibleIntent.phase === "loading-window" ||
            visibleIntent.phase === "awaiting-dom" ||
            visibleIntent.phase === "failed"
              ? visibleIntent.phase
              : ("staged" as const),
          previewMessage,
        };

  return {
    intent: visibleIntent,
    focusTarget,
    previewPresentation,
    navigationError: visibleNavigationError,
    startMessageNavigation,
    retryMessageNavigation,
    onDomFocusApplied,
    onDomFocusMissing,
    cancelForTail,
  };
}
