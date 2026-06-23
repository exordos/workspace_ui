import {
  buildMessageRedirectRoute,
  buildMessageRedirectRouteFromZulipPermalink,
} from "~/shared/lib/push-click";
import {
  buildMessageFocusSearch,
  buildRouteFromZulipNarrowPermalink,
  isSameChatAsNarrowPermalink,
  isSameRealmAsPermalink,
  parseZulipNarrowPermalink,
} from "~/shared/lib/zulip-narrow-permalink.lib";

export type QuotePermalinkNavigationTarget =
  | { kind: "path"; path: string; replace?: boolean }
  | { kind: "inPlace"; pathname: string; search: string };

export interface ResolveQuotePermalinkNavigationParams {
  href: string;
  realmBaseUrl: string;
  locationPathname: string;
  locationSearch: string;
  isDmView: boolean;
  currentUserId: number | null;
  dmRecipientIds: number[];
  resolvedStreamId: number | null;
  topicName: string | undefined;
  streamRouteTopic: string;
  resolveStreamName: (streamId: number) => string | undefined;
}

function resolveInternalMessengerPathNavigation(
  href: string,
): QuotePermalinkNavigationTarget | null {
  const trimmedHref = href.trim();
  if (trimmedHref.length === 0 || !trimmedHref.startsWith("/")) {
    return null;
  }
  const internalRoutePattern =
    /^\/(?:org\/[^/]+\/)?(?:stream\/[^/]+(?:\/topic\/[^/]+)?|dm\/[^/]+|message\/\d+)(?:\?[^#]*)?$/i;
  return internalRoutePattern.test(trimmedHref) ? { kind: "path", path: trimmedHref } : null;
}

/** Resolves quote permalink click into an in-app navigation target. Returns null when not handled. */
export function resolveQuotePermalinkNavigation(
  params: ResolveQuotePermalinkNavigationParams,
): QuotePermalinkNavigationTarget | null {
  const internalTarget = resolveInternalMessengerPathNavigation(params.href);
  if (internalTarget != null) {
    return internalTarget;
  }
  const parsed = parseZulipNarrowPermalink(params.href);
  if (parsed == null) {
    const redirectRoute = buildMessageRedirectRouteFromZulipPermalink(params.href);
    return redirectRoute != null ? { kind: "path", path: redirectRoute } : null;
  }

  if (!isSameRealmAsPermalink(parsed.realmOrigin, params.realmBaseUrl)) {
    return {
      kind: "path",
      path: buildMessageRedirectRoute(parsed.messageId, parsed.realmOrigin),
    };
  }

  if (
    isSameChatAsNarrowPermalink({
      parsed,
      isDmView: params.isDmView,
      currentUserId: params.currentUserId,
      dmRecipientIds: params.dmRecipientIds,
      resolvedStreamId: params.resolvedStreamId,
      topicName: params.topicName,
      streamRouteTopic: params.streamRouteTopic,
    })
  ) {
    return {
      kind: "inPlace",
      pathname: params.locationPathname,
      search: buildMessageFocusSearch(params.locationSearch, parsed.messageId),
    };
  }

  const directRoute = buildRouteFromZulipNarrowPermalink({
    parsed,
    currentUserId: params.currentUserId,
    resolveStreamName: params.resolveStreamName,
  });
  if (directRoute != null) {
    return { kind: "path", path: directRoute };
  }

  const redirectRoute = buildMessageRedirectRoute(parsed.messageId, parsed.realmOrigin);
  return { kind: "path", path: redirectRoute };
}
