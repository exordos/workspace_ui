import { useMemo } from "react";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";
import { normalizeMessageId, type MessageId } from "~/shared/lib/message-id.lib";
import { decodeTopicFromRoute } from "~/shared/lib/topic-identity.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import {
  getDmById,
  parseDmSlugToUserIds,
  parseStreamSlug,
  resolveStreamRouteFromSlug,
} from "~/widgets/sidebar/sidebar.lib";
import type { Location } from "react-router-dom";

function parseMessageIdFromSearch(location: Location, key: string): MessageId | null {
  const raw = new URLSearchParams(location.search).get(key);
  return normalizeMessageId(raw);
}

export function useChatRouteContext(options: {
  streamSlug: string | undefined;
  topicName: string | undefined;
  dmIdParam: string | undefined;
  location: Location;
  streamsMap: Map<number, { name: string }>;
  dmsFromStore: unknown[];
  currentUserId: UserId | null;
}): {
  activeTopic: string | undefined;
  streamRouteTopic: string;
  activeStream: string | undefined;
  resolvedStreamName: string;
  canonicalStreamName: string | null;
  resolvedStreamId: number | null;
  dmRecipientIds: UserId[];
  isDmView: boolean;
  dmChat: ReturnType<typeof getDmById> | undefined;
  partnerUserId: UserId | null;
  dmKey: string | null;
  focusedMessageId: MessageId | null;
  forwardMessageId: MessageId | null;
} {
  const { streamSlug, topicName, dmIdParam, location, streamsMap, dmsFromStore, currentUserId } =
    options;

  const activeTopic = topicName != null ? decodeTopicFromRoute(topicName) : undefined;
  const parsedStream = useMemo(
    () => (streamSlug ? parseStreamSlug(streamSlug) : null),
    [streamSlug],
  );

  const { resolvedStreamName, resolvedCanonicalStreamName, resolvedStreamId } = useMemo(
    () => resolveStreamRouteFromSlug(parsedStream, streamsMap),
    [parsedStream, streamsMap],
  );

  const streamRouteTopic = topicName != null ? decodeTopicFromRoute(topicName) : "";
  const activeStream = parsedStream ? resolvedStreamName : undefined;

  const dmChat = useMemo(
    () =>
      dmIdParam != null && dmIdParam !== ""
        ? getDmById(dmIdParam, dmsFromStore as never)
        : undefined,
    [dmIdParam, dmsFromStore],
  );

  const rawDmUserIds = useMemo(() => {
    if (dmIdParam == null || dmIdParam === "") return null;
    return parseDmSlugToUserIds(dmIdParam);
  }, [dmIdParam]);

  const activeDmUserIds = useMemo(() => {
    if (dmChat?.userUuid != null && dmChat.userUuid.trim().length > 0) {
      return [dmChat.userUuid];
    }
    if (dmChat?.userIds != null && dmChat.userIds.length > 0) {
      return dmChat.userIds;
    }
    if (dmChat?.streamUuid != null && dmChat.streamUuid === dmIdParam) {
      return null;
    }
    if (rawDmUserIds != null && rawDmUserIds.length > 0) {
      return normalizeDmRouteUserIds(rawDmUserIds, currentUserId);
    }
    return null;
  }, [
    rawDmUserIds,
    currentUserId,
    dmChat?.streamUuid,
    dmChat?.userIds,
    dmChat?.userUuid,
    dmIdParam,
  ]);

  const dmRecipientIds = activeDmUserIds ?? [];
  const isDmView = dmIdParam != null && dmIdParam !== "";

  const partnerUserId = dmRecipientIds.length > 0 ? (dmRecipientIds[0] ?? null) : null;

  const dmKey = useMemo(() => {
    if (!isDmView) return null;
    if (dmRecipientIds.length === 0) return dmIdParam ?? null;
    if (currentUserId == null) return null;
    return dmRouteKey(dmRecipientIds, currentUserId);
  }, [dmIdParam, dmRecipientIds, isDmView, currentUserId]);

  const focusedMessageId = useMemo(() => parseMessageIdFromSearch(location, "msg"), [location]);
  const forwardMessageId = useMemo(() => parseMessageIdFromSearch(location, "forward"), [location]);

  return {
    activeTopic,
    streamRouteTopic,
    activeStream,
    resolvedStreamName,
    canonicalStreamName: resolvedCanonicalStreamName,
    resolvedStreamId,
    dmRecipientIds,
    isDmView,
    dmChat,
    partnerUserId,
    dmKey,
    focusedMessageId,
    forwardMessageId,
  };
}
