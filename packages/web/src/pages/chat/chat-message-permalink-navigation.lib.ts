import {
  buildMessageFocusSearch,
  buildRouteFromMessengerNarrowPermalink,
  isSameChatAsNarrowPermalink,
  isSameRealmAsPermalink,
  parseMessengerNarrowPermalink,
} from "~/shared/lib/messenger-narrow-permalink.lib";
import {
  buildMessageRedirectRoute,
  buildMessageRedirectRouteFromWorkspacePermalink,
} from "~/shared/lib/push-click";

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

/** Resolves quote permalink click into an in-app navigation target. Returns null when not handled. */
export function resolveQuotePermalinkNavigation(
  params: ResolveQuotePermalinkNavigationParams,
): QuotePermalinkNavigationTarget | null {
  const parsed = parseMessengerNarrowPermalink(params.href);
  if (parsed == null) {
    const redirectRoute = buildMessageRedirectRouteFromWorkspacePermalink(params.href);
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

  const directRoute = buildRouteFromMessengerNarrowPermalink({
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
