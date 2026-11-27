import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import { buildPushClickUrl } from "~/shared/lib/push-click";
import type { ResolvedStreamByDisplayName } from "~/shared/lib/stream-name.lib";
import type { NavigateFunction } from "react-router-dom";

function buildCanonicalStreamRoute(options: {
  streamId: number;
  streamName: string;
  hasExplicitTopicRoute: boolean;
  topic: string;
  search: string;
}): string {
  const base = buildPushClickUrl({
    type: "stream",
    streamId: options.streamId,
    streamName: options.streamName,
    ...(options.hasExplicitTopicRoute ? { topic: options.topic } : {}),
  });
  return options.search.length > 0 ? `${base}${options.search}` : base;
}

function resolveStreamRouteErrorMessage(kind: "not_found" | "forbidden" | "transient"): string {
  if (kind === "transient") {
    return t("message.channelResolveTransient");
  }
  return t("message.channelResolveUnavailable");
}

export interface UseChatStreamRouteResolutionOptions {
  unresolvedStreamName: string | null;
  unresolvedLocalStreamMatch: ResolvedStreamByDisplayName | null;
  hasExplicitTopicRoute: boolean;
  activeTopic: string | undefined;
  locationSearch: string;
  navigate: NavigateFunction;
}

export interface UseChatStreamRouteResolutionResult {
  routeResolveError: string | null;
  dismissRouteResolveError: () => void;
}

export function useChatStreamRouteResolution(
  options: UseChatStreamRouteResolutionOptions,
): UseChatStreamRouteResolutionResult {
  const {
    unresolvedStreamName,
    unresolvedLocalStreamMatch,
    hasExplicitTopicRoute,
    activeTopic,
    locationSearch,
    navigate,
  } = options;
  const [routeResolveError, setRouteResolveError] = useState<string | null>(null);
  const pendingNavigationPathRef = useRef<string | null>(null);
  const dismissRouteResolveError = useCallback(() => {
    setRouteResolveError(null);
  }, []);

  useEffect(() => {
    if (unresolvedStreamName == null) {
      pendingNavigationPathRef.current = null;
      setRouteResolveError(null);
      return;
    }

    const topic = hasExplicitTopicRoute ? (activeTopic ?? "") : "";
    if (unresolvedLocalStreamMatch != null) {
      const targetPath = buildCanonicalStreamRoute({
        streamId: unresolvedLocalStreamMatch.streamId,
        streamName: unresolvedLocalStreamMatch.streamName,
        hasExplicitTopicRoute,
        topic,
        search: locationSearch,
      });
      if (pendingNavigationPathRef.current === targetPath) {
        return;
      }
      pendingNavigationPathRef.current = targetPath;
      setRouteResolveError(null);
      void navigate(targetPath, { replace: true });
      return;
    }

    pendingNavigationPathRef.current = null;
    setRouteResolveError(resolveStreamRouteErrorMessage("transient"));
  }, [
    activeTopic,
    hasExplicitTopicRoute,
    locationSearch,
    navigate,
    unresolvedLocalStreamMatch,
    unresolvedStreamName,
  ]);

  return { routeResolveError, dismissRouteResolveError };
}
