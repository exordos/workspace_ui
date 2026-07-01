/**
 * Parses Workspace web `#narrow/.../near/{id}` permalinks into workspace routes.
 *
 * Used for in-chat quote link navigation without the `/message/:id` redirect hop.
 */
import { dmRouteKey } from "~/shared/lib/dm-key";
import { parseDmRouteParticipantIds } from "~/shared/lib/dm-route-slug.lib";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { encodeTopicForRoute, normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { userIdStorageKey, type UserId } from "~/shared/lib/user-id.lib";

export type MessengerNarrowPermalinkKind = "dm" | "stream";

export interface ParsedMessengerNarrowPermalink {
  messageId: MessageId;
  kind: MessengerNarrowPermalinkKind;
  /** Present for DM permalinks with participant slug. */
  dmParticipantIds?: UserId[];
  /** Present for stream permalinks. */
  streamId?: string;
  topic?: string;
  /** Origin from absolute permalink URLs; omitted for hash-only links. */
  realmOrigin?: string;
}

const MESSENGER_HASH_DECODE_REPLACEMENTS: Readonly<Record<string, string>> = {
  ".21": "!",
  ".27": "'",
  ".28": "(",
  ".29": ")",
  ".2A": "*",
  ".2E": ".",
};

function slugForStreamRoute(streamId: string): string {
  return encodeURIComponent(streamId.trim().toLowerCase());
}

/** Reverses Workspace `encodeHashComponent` for narrow hash operands. */
export function decodeWorkspaceHashComponent(encoded: string): string {
  const messengerDecoded = encoded.replace(
    /\.(?:21|27|28|29|2A|2E)/gi,
    (matched) => MESSENGER_HASH_DECODE_REPLACEMENTS[matched.toLowerCase()] ?? matched,
  );
  const withPercents = messengerDecoded.replace(/\./g, "%");
  try {
    return decodeURIComponent(withPercents);
  } catch {
    return withPercents;
  }
}

function normalizeHashFromHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed.length === 0) return null;
  try {
    const parsed = new URL(trimmed, "https://workspace.local");
    if (parsed.hash.length > 1) {
      return parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    }
    if (trimmed.startsWith("#narrow/")) {
      return trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
    }
    return null;
  } catch {
    if (trimmed.startsWith("#narrow/")) {
      return trimmed.slice(1);
    }
    return null;
  }
}

function parseNearMessageIdFromNarrowHash(normalizedHash: string): MessageId | undefined {
  if (!normalizedHash.startsWith("narrow/")) return undefined;
  const nearMatch = /(?:^|\/)near\/([^/?#]+)/i.exec(normalizedHash);
  if (nearMatch == null) return undefined;
  const rawNear = nearMatch[1];
  if (rawNear == null || rawNear.length === 0) return undefined;
  return normalizeMessageId(decodeWorkspaceHashComponent(rawNear)) ?? undefined;
}

function parseDmNarrowPermalink(
  normalizedHash: string,
  messageId: MessageId,
): ParsedMessengerNarrowPermalink | null {
  const dmMatch = /^narrow\/dm\/([^/]+)\/near\//i.exec(normalizedHash);
  if (dmMatch == null) return null;
  const slug = dmMatch[1];
  if (slug == null || slug.length === 0) return null;
  const participantIds = parseDmRouteParticipantIds(slug);
  if (participantIds.length === 0) return null;
  return {
    messageId,
    kind: "dm",
    dmParticipantIds: participantIds,
  };
}

function parseStreamNarrowPermalink(
  normalizedHash: string,
  messageId: MessageId,
): ParsedMessengerNarrowPermalink | null {
  const streamMatch = /^narrow\/channel\/([^/]+)\/topic\/([^/]+)\/near\//i.exec(normalizedHash);
  if (streamMatch == null) return null;
  const streamSlugEnc = streamMatch[1];
  const topicEnc = streamMatch[2];
  if (streamSlugEnc == null || topicEnc == null) return null;

  const streamId = decodeWorkspaceHashComponent(streamSlugEnc).trim().toLowerCase();
  if (streamId.length === 0) return null;

  const topic = normalizeTopicForIdentity(decodeWorkspaceHashComponent(topicEnc));
  return {
    messageId,
    kind: "stream",
    streamId,
    topic,
  };
}

/** Parses Workspace `#narrow/.../near/{id}` permalinks from absolute URLs or hash-only strings. */
export function parseMessengerNarrowPermalink(href: string): ParsedMessengerNarrowPermalink | null {
  const normalizedHash = normalizeHashFromHref(href);
  if (normalizedHash == null) return null;

  const messageId = parseNearMessageIdFromNarrowHash(normalizedHash);
  if (messageId == null) return null;

  const parsed =
    parseDmNarrowPermalink(normalizedHash, messageId) ??
    parseStreamNarrowPermalink(normalizedHash, messageId);
  if (parsed == null) return null;

  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      parsed.realmOrigin = new URL(trimmed).origin;
    } catch {
      // keep realmOrigin undefined
    }
  }

  return parsed;
}

export function normalizeRealmOriginForComparison(realm: string): string {
  return realm
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "")
    .toLowerCase();
}

export function isSameRealmAsPermalink(
  permalinkRealmOrigin: string | undefined,
  currentRealmBaseUrl: string,
): boolean {
  if (permalinkRealmOrigin == null) return true;
  const current = normalizeRealmOriginForComparison(currentRealmBaseUrl);
  if (current.length === 0) return true;
  try {
    const permalink = normalizeRealmOriginForComparison(new URL(permalinkRealmOrigin).origin);
    return permalink === current;
  } catch {
    return false;
  }
}

export interface SameChatAsNarrowPermalinkParams {
  parsed: ParsedMessengerNarrowPermalink;
  isDmView: boolean;
  currentUserId: UserId | null;
  dmRecipientIds: UserId[];
  resolvedStreamId: string | null;
  topicName: string | undefined;
  streamRouteTopic: string;
}

/** True when the parsed permalink targets the chat currently open in the route. */
export function isSameChatAsNarrowPermalink(params: SameChatAsNarrowPermalinkParams): boolean {
  const {
    parsed,
    isDmView,
    currentUserId,
    dmRecipientIds,
    resolvedStreamId,
    topicName,
    streamRouteTopic,
  } = params;

  if (parsed.kind === "dm") {
    if (!isDmView || parsed.dmParticipantIds == null || parsed.dmParticipantIds.length === 0) {
      return false;
    }
    const permalinkKey = dmRouteKey(parsed.dmParticipantIds, currentUserId);
    const routeKey = dmRouteKey(dmRecipientIds, currentUserId);
    return permalinkKey === routeKey;
  }

  if (isDmView || parsed.streamId == null) return false;
  if (resolvedStreamId == null || parsed.streamId !== resolvedStreamId) return false;
  if (topicName == null) return true;
  return normalizeTopicForIdentity(parsed.topic ?? "") === streamRouteTopic;
}

export interface BuildRouteFromMessengerNarrowPermalinkParams {
  parsed: ParsedMessengerNarrowPermalink;
  currentUserId: UserId | null;
  resolveStreamName: (streamId: string) => string | undefined;
}

/** Builds an internal messenger route with `?msg=` from a parsed narrow permalink. */
export function buildRouteFromMessengerNarrowPermalink(
  params: BuildRouteFromMessengerNarrowPermalinkParams,
): string | null {
  const { parsed, currentUserId, resolveStreamName } = params;
  const withMessageId = (base: string): string => `${base}?msg=${parsed.messageId}`;

  if (parsed.kind === "dm") {
    if (parsed.dmParticipantIds == null || parsed.dmParticipantIds.length === 0) return null;
    const routeKey = dmRouteKey(parsed.dmParticipantIds, currentUserId);
    const routeUserIds = routeKey.split(",").filter((userId) => userId.length > 0);
    if (routeUserIds.length === 0) return null;
    const currentUserKey = currentUserId != null ? userIdStorageKey(currentUserId) : null;
    const others =
      currentUserKey != null
        ? routeUserIds.filter((userId) => userId !== currentUserKey)
        : routeUserIds;
    const dmSlugSegment =
      others.length > 0
        ? others.map((userId) => encodeURIComponent(userId)).join(",")
        : routeUserIds.map((userId) => encodeURIComponent(userId)).join(",");
    return withMessageId(withCurrentOrgRoute(`/dm/${dmSlugSegment}`));
  }

  if (parsed.streamId == null) return null;
  resolveStreamName(parsed.streamId);
  const streamSlug = slugForStreamRoute(parsed.streamId);
  const topic = parsed.topic ?? "";
  return withMessageId(
    withCurrentOrgRoute(
      `/stream/${streamSlug}/topic/${encodeURIComponent(encodeTopicForRoute(topic))}`,
    ),
  );
}

/** Replaces or sets `msg` query param while preserving other search params. */
export function buildMessageFocusSearch(currentSearch: string, messageId: MessageId): string {
  const params = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  );
  params.set("msg", String(messageId));
  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : `?msg=${messageId}`;
}
